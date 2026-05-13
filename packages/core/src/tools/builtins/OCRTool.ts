import type { AgentTool } from "../AgentTool.ts";
import type { OCRRequest, OCRResult, PlatformAdapter } from "../../platform/PlatformAdapter.ts";

export type OCRToolInput = OCRRequest;
export type OCRToolOutput = OCRResult;

export class OCRTool implements AgentTool<OCRToolInput, OCRToolOutput> {
  name = "ocr.read";
  description = "对图片执行 OCR 识别";
  inputSchema = {
    type: "object",
    properties: {
      imageBase64: { type: "string" },
      mimeType: {
        type: "string",
        enum: ["image/png", "image/jpeg", "image/webp"],
      },
      language: { type: "string" },
    },
    required: ["imageBase64"],
    additionalProperties: false,
  } as const;

  constructor(private readonly platform: PlatformAdapter) {}

  async call(input: OCRToolInput): Promise<OCRToolOutput> {
    return this.platform.recognizeText(input);
  }
}
