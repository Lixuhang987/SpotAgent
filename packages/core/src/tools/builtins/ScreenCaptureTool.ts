import { z } from "zod";
import { defineTool } from "../defineTool.ts";
import type {
  PlatformAdapter,
  ScreenCaptureRequest,
  ScreenCaptureResult,
} from "../../platform/PlatformAdapter.ts";

const ScreenTarget = z.union([
  z.object({ kind: z.literal("screen"), screenId: z.string().optional() }).strict(),
  z.object({ kind: z.literal("display"), displayId: z.string().optional() }).strict(),
  z.object({ kind: z.literal("window"), windowId: z.number() }).strict(),
  z.object({
    kind: z.literal("region"),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }).strict(),
]);

const InputSchema = z.object({ target: ScreenTarget.optional() });

export const ScreenCaptureTool = defineTool<z.infer<typeof InputSchema>, ScreenCaptureResult, PlatformAdapter>({
  name: "screen.capture",
  description: "截图当前屏幕或指定目标",
  inputSchema: InputSchema,
  run: async (input, platform) => platform.captureScreen(input as ScreenCaptureRequest),
});
