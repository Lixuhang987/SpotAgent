import { existsSync } from "node:fs";
import type { AgentServerLogSink, AgentServerSupervisor } from "./agentServerSupervisor.js";
import { resolveAgentServerEntry } from "./agentServerEntry.js";
import {
  NodeAgentServerSupervisor,
  type AgentServerChildProcess,
} from "./nodeAgentServerSupervisor.js";
import {
  UtilityProcessAgentServerSupervisor,
  type UtilityProcessLike,
} from "./utilityProcessAgentServerSupervisor.js";

type ForkUtilityOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdio: "pipe";
  serviceName: string;
};

type SpawnOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
};

type Options = {
  repoRoot: string;
  nodePath: string;
  env: NodeJS.ProcessEnv;
  fileExists?: (path: string) => boolean;
  forkUtilityProcess?: (
    modulePath: string,
    args: string[],
    options: ForkUtilityOptions,
  ) => UtilityProcessLike;
  spawnProcess?: (
    command: string,
    args: string[],
    options: SpawnOptions,
  ) => AgentServerChildProcess;
  waitForReady?: () => Promise<void>;
  logSink?: AgentServerLogSink;
};

export function createAgentServerSupervisor(options: Options): AgentServerSupervisor {
  const entry = resolveAgentServerEntry({
    repoRoot: options.repoRoot,
    fileExists: options.fileExists ?? existsSync,
  });

  if (entry.utilityProcessEntry && options.forkUtilityProcess) {
    return new UtilityProcessAgentServerSupervisor({
      repoRoot: options.repoRoot,
      entry: entry.utilityProcessEntry,
      env: options.env,
      forkUtilityProcess: options.forkUtilityProcess,
      waitForReady: options.waitForReady ?? (() => Promise.resolve()),
      logSink: options.logSink,
    });
  }

  return new NodeAgentServerSupervisor({
    repoRoot: options.repoRoot,
    nodePath: options.nodePath,
    env: options.env,
    spawnProcess: options.spawnProcess,
    waitForReady: options.waitForReady,
    utilityProcessBlocker: entry.utilityProcessBlocker,
    logSink: options.logSink,
  });
}
