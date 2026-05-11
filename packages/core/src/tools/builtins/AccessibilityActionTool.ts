import type { AgentTool } from "../AgentTool";
import type {
  AccessibilityActionRequest,
  AccessibilityActionResult,
  PlatformAdapter,
} from "../../platform/PlatformAdapter";

export type AccessibilityActionToolInput = AccessibilityActionRequest;
export type AccessibilityActionToolOutput = AccessibilityActionResult;

export class AccessibilityActionTool
  implements AgentTool<AccessibilityActionToolInput, AccessibilityActionToolOutput>
{
  name = "accessibility.action";
  description = "执行无障碍交互动作";
  inputSchema = {
    type: "object",
    properties: {
      target: {
        oneOf: [
          {
            type: "object",
            properties: {
              kind: { const: "frontmost_app" },
            },
            required: ["kind"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              kind: { const: "window" },
              windowId: { type: "number" },
            },
            required: ["kind"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              kind: { const: "element" },
              elementId: { type: "string" },
            },
            required: ["kind", "elementId"],
            additionalProperties: false,
          },
        ],
      },
      action: {
        oneOf: [
          {
            type: "object",
            properties: {
              kind: { const: "press" },
            },
            required: ["kind"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              kind: { const: "click" },
            },
            required: ["kind"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              kind: { const: "set_value" },
              value: { type: "string" },
            },
            required: ["kind", "value"],
            additionalProperties: false,
          },
        ],
      },
    },
    required: ["target", "action"],
    additionalProperties: false,
  } as const;

  constructor(private readonly platform: PlatformAdapter) {}

  async call(input: AccessibilityActionToolInput): Promise<AccessibilityActionToolOutput> {
    return this.platform.performAccessibilityAction(input);
  }
}
