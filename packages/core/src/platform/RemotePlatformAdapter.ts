import type {
  AccessibilityActionRequest,
  AccessibilityActionResult,
  AccessibilityNodeSnapshot,
  AccessibilitySnapshotTarget,
  AppInfo,
  FrontmostAppInfo,
  OCRRequest,
  OCRResult,
  PlatformAdapter,
  ScreenCaptureRequest,
  ScreenCaptureResult,
  WindowInfo,
} from "./PlatformAdapter.ts";
import type { PlatformBridge } from "./PlatformBridge.ts";

export type RemotePlatformAdapterOptions = {
  bridge: PlatformBridge;
  defaultTimeoutMs?: number;
};

export class RemotePlatformAdapter implements PlatformAdapter {
  private readonly bridge: PlatformBridge;
  private readonly defaultTimeoutMs: number;

  constructor(options: RemotePlatformAdapterOptions) {
    this.bridge = options.bridge;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 15_000;
  }

  listApps(): Promise<AppInfo[]> {
    return this.bridge.call("app.list", {}, this.defaultTimeoutMs);
  }

  currentClipboardText(): Promise<string | null> {
    return this.bridge.call("clipboard.read", {}, this.defaultTimeoutMs);
  }

  frontmostAppInfo(): Promise<FrontmostAppInfo> {
    return this.bridge.call("app.frontmost", {}, this.defaultTimeoutMs);
  }

  frontmostWindowList(): Promise<WindowInfo[]> {
    return this.bridge.call("window.list", {}, this.defaultTimeoutMs);
  }

  captureScreen(request: ScreenCaptureRequest): Promise<ScreenCaptureResult> {
    return this.bridge.call("screen.capture", request, this.defaultTimeoutMs);
  }

  recognizeText(request: OCRRequest): Promise<OCRResult> {
    return this.bridge.call("ocr.read", request, this.defaultTimeoutMs);
  }

  accessibilitySnapshot(
    target: AccessibilitySnapshotTarget,
  ): Promise<AccessibilityNodeSnapshot> {
    return this.bridge.call("accessibility.snapshot", target, this.defaultTimeoutMs);
  }

  performAccessibilityAction(
    request: AccessibilityActionRequest,
  ): Promise<AccessibilityActionResult> {
    return this.bridge.call("accessibility.action", request, this.defaultTimeoutMs);
  }
}
