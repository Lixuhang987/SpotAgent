import { z } from "zod";
import { defineTool } from "../defineTool.ts";
import type { OCRResult, PlatformAdapter } from "../../platform/PlatformAdapter.ts";

const InputSchema = z.object({
  imageBase64: z.string(),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]).optional(),
  language: z.string().optional(),
});

export const OCRTool = defineTool<z.infer<typeof InputSchema>, OCRResult, PlatformAdapter>({
  name: "ocr.read",
  description: "对图片执行 OCR 识别",
  inputSchema: InputSchema,
  run: async (input, platform) => platform.recognizeText(input),
});
