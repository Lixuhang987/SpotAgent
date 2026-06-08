import { join } from "node:path";

export type AgentServerEntryResolution = {
  nodeChildEntry: "apps/agent-server/src/server/server.ts";
  utilityProcessEntry: string | null;
  utilityProcessBlocker: string | null;
};

type Options = {
  repoRoot: string;
  fileExists?: (path: string) => boolean;
  utilityEntryOverride?: string | null;
};

const nodeChildEntry = "apps/agent-server/src/server/server.ts" as const;
const defaultUtilityEntry = "apps/agent-server/dist/server/server.js";
const missingUtilityEntryBlocker =
  "apps/agent-server/dist/server/server.js 不存在；当前 agent-server 仍依赖 TypeScript 源码入口和 Node --experimental-transform-types";

export function resolveAgentServerEntry(options: Options): AgentServerEntryResolution {
  const fileExists = options.fileExists ?? (() => false);
  const utilityEntry = options.utilityEntryOverride ?? join(options.repoRoot, defaultUtilityEntry);

  if (utilityEntry && fileExists(utilityEntry)) {
    return {
      nodeChildEntry,
      utilityProcessEntry: utilityEntry,
      utilityProcessBlocker: null,
    };
  }

  return {
    nodeChildEntry,
    utilityProcessEntry: null,
    utilityProcessBlocker: missingUtilityEntryBlocker,
  };
}
