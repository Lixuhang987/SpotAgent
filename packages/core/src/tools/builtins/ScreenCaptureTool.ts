import type { AgentTool } from "../AgentTool.ts";
import type {
  PlatformAdapter,
  ScreenCaptureRequest,
  ScreenCaptureResult,
} from "../../platform/PlatformAdapter.ts";

export type ScreenCaptureToolInput = ScreenCaptureRequest;
export type ScreenCaptureToolOutput = ScreenCaptureResult;

export class ScreenCaptureTool implements AgentTool<ScreenCaptureToolInput, ScreenCaptureToolOutput> {
  name = "screen.capture";
  description = "截图当前屏幕或指定目标";
  inputSchema = {
    type: "object",
    properties: {
      target: {
        oneOf: [
          {
            type: "object",
            properties: {
              kind: { const: "screen" },
              screenId: { type: "string" },
            },
            required: ["kind"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              kind: { const: "display" },
              displayId: { type: "string" },
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
            required: ["kind", "windowId"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              kind: { const: "region" },
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
            },
            required: ["kind", "x", "y", "width", "height"],
            additionalProperties: false,
          },
        ],
      },
    },
    additionalProperties: false,
  } as const;

  constructor(private readonly platform: PlatformAdapter) {}

  async call(input: ScreenCaptureToolInput): Promise<ScreenCaptureToolOutput> {
    return this.platform.captureScreen(input);
  }
}
