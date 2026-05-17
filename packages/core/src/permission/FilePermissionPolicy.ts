import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import type {
  PermissionDecision,
  PermissionPolicy,
  PermissionRequest,
  PermissionResolution,
  PermissionScope,
} from "./PermissionPolicy.ts";

type PersistedRule = {
  toolName: string;
  argHash: string;
  decision: "allow" | "deny";
  createdAt: string;
};

type PersistedFile = {
  version: 1;
  rules: PersistedRule[];
};

export type AskResolver = (
  request: PermissionRequest,
) => Promise<PermissionResolution>;

export type FilePermissionPolicyOptions = {
  filePath: string;
  askResolver?: AskResolver;
  now?: () => string;
};

export class FilePermissionPolicy implements PermissionPolicy {
  private readonly filePath: string;
  private readonly askResolver: AskResolver;
  private readonly now: () => string;

  private cache: PersistedRule[] | null = null;
  private readonly sessionRules = new Map<string, "allow" | "deny">();

  constructor(options: FilePermissionPolicyOptions) {
    this.filePath = options.filePath;
    this.now = options.now ?? (() => new Date().toISOString());
    this.askResolver =
      options.askResolver ?? (async () => ({ decision: "ask" as never }));
  }

  async check(request: PermissionRequest): Promise<PermissionDecision> {
    const key = this.keyFor(request);
    const sessionRule = this.sessionRules.get(key);
    if (sessionRule) return sessionRule;

    const persisted = this.loadSync().find((r) => r.argHash === key);
    if (persisted) return persisted.decision;

    return "ask";
  }

  async resolveAsk(request: PermissionRequest): Promise<PermissionResolution> {
    return this.askResolver(request);
  }

  async remember(
    request: PermissionRequest,
    resolution: PermissionResolution,
  ): Promise<void> {
    if (resolution.decision === "ask") return;
    if (!resolution.remember || resolution.remember === "once") return;

    const key = this.keyFor(request);
    if (resolution.remember === "session") {
      this.sessionRules.set(key, resolution.decision);
      return;
    }

    const rules = this.loadSync().filter((r) => r.argHash !== key);
    rules.push({
      toolName: request.toolName,
      argHash: key,
      decision: resolution.decision,
      createdAt: this.now(),
    });
    await this.persist(rules);
  }

  listPersistedRules(): PersistedRule[] {
    return this.loadSync().map((r) => ({ ...r }));
  }

  async revoke(argHash: string): Promise<void> {
    const rules = this.loadSync().filter((r) => r.argHash !== argHash);
    await this.persist(rules);
  }

  private keyFor(request: PermissionRequest): string {
    const stable = stableStringify(request.arguments);
    const hash = createHash("sha256")
      .update(`${request.toolName}::${stable}`)
      .digest("hex");
    return hash;
  }

  private loadSync(): PersistedRule[] {
    if (this.cache) return this.cache;
    if (!existsSync(this.filePath)) {
      this.cache = [];
      return this.cache;
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as PersistedFile;
      this.cache = Array.isArray(parsed.rules) ? parsed.rules : [];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private async persist(rules: PersistedRule[]): Promise<void> {
    this.cache = rules;
    await mkdir(dirname(this.filePath), { recursive: true });
    const data: PersistedFile = { version: 1, rules };
    await writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  return (
    "{" +
    entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",") +
    "}"
  );
}

export type { PersistedRule };
