import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { AgentTool, AgentToolCallContext } from "../AgentTool.ts";
import type { WorkspaceRegistry } from "../../workspace/Workspace.ts";
import {
  normalizeWorkspaceRelativePath,
  resolveReadPathWithinWorkspace,
  resolveWorkspace,
  resolveWritePathWithinWorkspace,
} from "../builtins/workspace-path.ts";
import type { PluginToolManifest } from "./PluginManifest.ts";

export type PluginToolOptions = {
  pluginId: string;
  pluginDir: string;
  manifest: PluginToolManifest;
  workspaceRegistry?: WorkspaceRegistry;
};

type PluginCallRequest = {
  input: unknown;
  context: AgentToolCallContext & {
    pluginId: string;
    toolName: string;
  };
  workspace?: {
    workspaceId: string;
    relativePath: string;
    workspaceRoot: string;
    absolutePath: string;
    access: "read" | "write";
  };
};

export class PluginTool implements AgentTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  private readonly timeoutMs: number;

  constructor(private readonly options: PluginToolOptions) {
    this.name = options.manifest.name;
    this.description = buildDescription(options.pluginId, options.manifest);
    this.inputSchema = options.manifest.inputSchema;
    this.timeoutMs = options.manifest.timeoutMs ?? 10_000;
  }

  async call(input: unknown, context: AgentToolCallContext = {}): Promise<unknown> {
    const request: PluginCallRequest = {
      input,
      context: {
        ...context,
        pluginId: this.options.pluginId,
        toolName: this.name,
      },
    };

    const workspaceAccess = this.options.manifest.permissions?.workspace;
    if (workspaceAccess) {
      request.workspace = await this.resolveWorkspaceInput(input, workspaceAccess);
    }

    return runPluginCommand({
      commandPath: await resolvePluginCommand(this.options.pluginDir, this.options.manifest.command),
      cwd: this.options.pluginDir,
      request,
      timeoutMs: this.timeoutMs,
      toolName: this.name,
    });
  }

  private async resolveWorkspaceInput(
    input: unknown,
    access: "read" | "write",
  ): Promise<NonNullable<PluginCallRequest["workspace"]>> {
    if (!this.options.workspaceRegistry) {
      throw new Error(`workspace registry not provided for plugin tool: ${this.name}`);
    }
    if (!isRecord(input)) {
      throw new Error(`plugin tool ${this.name} requires object input for workspace access`);
    }
    const workspaceId = input.workspaceId;
    const relativePath = input.relativePath;
    if (typeof workspaceId !== "string" || workspaceId.trim() === "") {
      throw new Error(`plugin tool ${this.name} requires workspaceId`);
    }
    if (typeof relativePath !== "string" || relativePath.trim() === "") {
      throw new Error(`plugin tool ${this.name} requires relativePath`);
    }

    const workspace = await resolveWorkspace(this.options.workspaceRegistry, workspaceId);
    const workspaceRoot = await realpath(workspace.rootPath).catch(() =>
      resolve(workspace.rootPath),
    );
    const absolutePath =
      access === "write"
        ? await resolveWritePathWithinWorkspace(workspace.rootPath, relativePath)
        : await resolveReadPathWithinWorkspace(workspace.rootPath, relativePath);

    return {
      workspaceId: workspace.id,
      relativePath: await normalizeWorkspaceRelativePath(workspace.rootPath, absolutePath),
      workspaceRoot,
      absolutePath,
      access,
    };
  }
}

async function resolvePluginCommand(pluginDir: string, command: string): Promise<string> {
  if (isAbsolute(command)) {
    throw new Error(`plugin command must be relative to plugin directory: ${command}`);
  }
  const root = resolve(pluginDir);
  const commandPath = resolve(root, command);
  const relativeToPlugin = relative(root, commandPath);
  if (
    relativeToPlugin === "" ||
    relativeToPlugin.split(sep).some((segment) => segment === "..")
  ) {
    throw new Error(`plugin command escapes plugin directory: ${command}`);
  }
  const realRoot = await realpath(root);
  const realCommand = await realpath(commandPath);
  const realRelative = relative(realRoot, realCommand);
  if (
    realRelative === "" ||
    realRelative.split(sep).some((segment) => segment === "..")
  ) {
    throw new Error(`plugin command escapes plugin directory: ${command}`);
  }
  return realCommand;
}

const MAX_PLUGIN_OUTPUT_BYTES = 1024 * 1024;

async function runPluginCommand({
  commandPath,
  cwd,
  request,
  timeoutMs,
  toolName,
}: {
  commandPath: string;
  cwd: string;
  request: PluginCallRequest;
  timeoutMs: number;
  toolName: string;
}): Promise<unknown> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(commandPath, [], {
      cwd: dirname(commandPath) || cwd,
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
      settleReject(
        new Error(`plugin tool ${toolName} timed out after ${timeoutMs}ms`),
        true,
      );
    }, timeoutMs);

    function settleReject(error: Error, kill = false): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (kill) {
        killPluginProcess(child);
      }
      reject(error);
    }

    function appendOutput(streamName: "stdout" | "stderr", chunk: unknown): void {
      const buffer = Buffer.from(chunk as Buffer);
      if (streamName === "stdout") {
        stdoutBytes += buffer.byteLength;
        if (stdoutBytes > MAX_PLUGIN_OUTPUT_BYTES) {
          settleReject(
            new Error(`plugin tool ${toolName} exceeded output limit (${MAX_PLUGIN_OUTPUT_BYTES} bytes)`),
            true,
          );
          return;
        }
        stdout.push(buffer);
        return;
      }

      stderrBytes += buffer.byteLength;
      if (stderrBytes > MAX_PLUGIN_OUTPUT_BYTES) {
        settleReject(
          new Error(`plugin tool ${toolName} exceeded output limit (${MAX_PLUGIN_OUTPUT_BYTES} bytes)`),
          true,
        );
        return;
      }
      stderr.push(buffer);
    }

    child.stdout.on("data", (chunk) => appendOutput("stdout", chunk));
    child.stderr.on("data", (chunk) => appendOutput("stderr", chunk));
    child.on("error", (error) => {
      settleReject(error);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        const stderrText = Buffer.concat(stderr).toString("utf8").trim();
        reject(
          new Error(
            `plugin tool ${toolName} exited with code ${code ?? "null"}${signal ? ` signal ${signal}` : ""}${stderrText ? `: ${stderrText}` : ""}`,
          ),
        );
        return;
      }
      const output = Buffer.concat(stdout).toString("utf8").trim();
      try {
        resolvePromise(output ? JSON.parse(output) : null);
      } catch {
        reject(new Error(`plugin tool ${toolName} returned invalid JSON`));
      }
    });

    child.stdin.end(JSON.stringify(request));
  });
}

function killPluginProcess(child: ReturnType<typeof spawn>): void {
  if (child.pid) {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // Fall back to the direct child below.
    }
  }
  child.kill("SIGKILL");
}

function buildDescription(pluginId: string, manifest: PluginToolManifest): string {
  const permissions = manifest.permissions
    ? ` permissions=${JSON.stringify(manifest.permissions)}`
    : "";
  return `[plugin:${pluginId}] ${manifest.description}${permissions}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
