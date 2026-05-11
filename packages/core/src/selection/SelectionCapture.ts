export type SelectionCaptureResult =
  | { kind: "selected"; text: string }
  | { kind: "empty" }
  | { kind: "error"; message?: string };

export interface SelectionCapture {
  captureSelectedText(): Promise<SelectionCaptureResult>;
}

export function normalizeSelectedText(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value.replace(/\r\n/g, "\n");
  return normalized.trim().length === 0 ? null : normalized;
}

export function selectionResultFromText(value: string | null | undefined): SelectionCaptureResult {
  const normalized = normalizeSelectedText(value);

  if (normalized == null) {
    return { kind: "empty" };
  }

  return { kind: "selected", text: normalized };
}
