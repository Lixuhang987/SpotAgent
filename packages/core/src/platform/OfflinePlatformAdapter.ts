import type {
  AccessibilityActionRequest,
  AccessibilityActionResult,
  AccessibilityNodeSnapshot,
  AccessibilitySnapshotTarget,
  FrontmostAppInfo,
  OCRRequest,
  OCRResult,
  PlatformAdapter,
  ScreenCaptureRequest,
  ScreenCaptureResult,
  WindowInfo,
} from "./PlatformAdapter.ts";

export type OfflinePlatformAdapterOptions = {
  reason?: string;
};

export class OfflinePlatformAdapter implements PlatformAdapter {
  private readonly reason: string;

  constructor(options: OfflinePlatformAdapterOptions = {}) {
    this.reason = options.reason ?? "Platform bridge is not connected";
  }

  async currentClipboardText(): Promise<string | null> {
    throw this.error("clipboard.read");
  }

  async frontmostAppInfo(): Promise<FrontmostAppInfo> {
    throw this.error("app.frontmost");
  }

  async frontmostWindowList(): Promise<WindowInfo[]> {
    throw this.error("window.list");
  }

  async captureScreen(_request: ScreenCaptureRequest): Promise<ScreenCaptureResult> {
    throw this.error("screen.capture");
  }

  async recognizeText(_request: OCRRequest): Promise<OCRResult> {
    throw this.error("ocr.read");
  }

  async accessibilitySnapshot(
    _target: AccessibilitySnapshotTarget,
  ): Promise<AccessibilityNodeSnapshot> {
    throw this.error("accessibility.snapshot");
  }

  async performAccessibilityAction(
    _request: AccessibilityActionRequest,
  ): Promise<AccessibilityActionResult> {
    throw this.error("accessibility.action");
  }

  private error(tool: string): Error {
    return new Error(`${this.reason} (tool: ${tool})`);
  }
}
