export type SelectedCaptureResult = { kind: "selected"; text: string };
export type EmptyCaptureResult = { kind: "empty" };
export type ErrorCaptureResult = { kind: "error"; message?: string };

export type SelectionCaptureResult =
  | SelectedCaptureResult
  | EmptyCaptureResult
  | ErrorCaptureResult;

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
