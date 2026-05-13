import type { AgentTool } from "../AgentTool.ts";
import type {
  AccessibilityNodeSnapshot,
  AccessibilitySnapshotTarget,
  PlatformAdapter,
} from "../../platform/PlatformAdapter.ts";

export type AccessibilitySnapshotToolInput = AccessibilitySnapshotTarget;
export type AccessibilitySnapshotToolOutput = AccessibilityNodeSnapshot;

export class AccessibilitySnapshotTool
  implements AgentTool<AccessibilitySnapshotToolInput, AccessibilitySnapshotToolOutput>
{
  name = "accessibility.snapshot";
  description = "读取无障碍树快照";
  inputSchema = {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["frontmost_app", "app", "window", "element"],
      },
      bundleId: { type: "string" },
      pid: { type: "number" },
      windowId: { type: "number" },
      elementId: { type: "string" },
    },
    required: ["kind"],
    additionalProperties: false,
  } as const;

  constructor(private readonly platform: PlatformAdapter) {}

  async call(input: AccessibilitySnapshotToolInput): Promise<AccessibilitySnapshotToolOutput> {
    return this.platform.accessibilitySnapshot(input);
  }
}
