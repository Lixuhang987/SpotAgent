import {
  normalizeSelectedText,
  type SelectionCaptureResult,
} from "../selection/SelectionCapture.ts";

export type AgentSessionInput = {
  prompt: string;
  selection?: SelectionCaptureResult | null;
};

export class AgentSession {
  public readonly prompt: string;
  public readonly selectedText: string | null;

  private constructor(prompt: string, selectedText: string | null) {
    this.prompt = prompt;
    this.selectedText = selectedText;
  }

  static async open(input: AgentSessionInput): Promise<AgentSession> {
    const selectedText = selectionTextFromResult(input.selection);
    return new AgentSession(input.prompt, selectedText);
  }

  buildInitialUserMessage(): string {
    if (!this.selectedText) {
      return this.prompt;
    }

    return `选区文本：\n${this.selectedText}\n\n用户请求：\n${this.prompt}`;
  }
}

function selectionTextFromResult(selection: SelectionCaptureResult | null | undefined): string | null {
  if (!selection || selection.kind !== "selected") {
    return null;
  }

  return normalizeSelectedText(selection.text);
}
