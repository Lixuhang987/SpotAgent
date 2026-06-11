export type FrontmostAppInfo = {
  name: string | null;
  bundleId?: string;
  pid?: number;
  resolution: "best_effort";
};

export type AppInfo = {
  name: string | null;
  bundleId?: string;
  pid?: number;
  isActive?: boolean;
  activationPolicy?: string;
  resolution: "best_effort";
};

export type WindowInfo = {
  id?: number;
  title: string | null;
  appName: string | null;
};

export type ScreenCaptureTarget =
  | ScreenCaptureScreenTarget
  | ScreenCaptureDisplayTarget
  | ScreenCaptureWindowTarget
  | ScreenCaptureRegionTarget;

export type ScreenCaptureScreenTarget = {
  kind: "screen";
  screenId?: string;
};

export type ScreenCaptureDisplayTarget = {
  kind: "display";
  displayId?: string;
};

export type ScreenCaptureWindowTarget = {
  kind: "window";
  windowId: number;
};

export type ScreenCaptureRegionTarget = {
  kind: "region";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ScreenCaptureRequest = {
  target?: ScreenCaptureTarget;
};

export type ScreenCaptureResult = {
  imageBase64: string;
  mimeType: "image/png";
  width?: number;
  height?: number;
  target?: ScreenCaptureTarget;
  resolution: "best_effort";
};

export type OCRRequest = {
  imageBase64: string;
  mimeType?: "image/png" | "image/jpeg" | "image/webp";
  language?: string;
};

export type OCRLine = {
  text: string;
  confidence?: number;
};

export type OCRResult = {
  text: string;
  lines?: OCRLine[];
  resolution: "best_effort";
};

export type FrontmostAppSnapshotTarget = {
  kind: "frontmost_app";
};

export type AppSnapshotTarget = {
  kind: "app";
  bundleId?: string;
  pid?: number;
};

export type WindowSnapshotTarget = {
  kind: "window";
  windowId?: number;
};

export type ElementSnapshotTarget = {
  kind: "element";
  elementId?: string;
};

export type AccessibilitySnapshotTarget =
  | FrontmostAppSnapshotTarget
  | AppSnapshotTarget
  | WindowSnapshotTarget
  | ElementSnapshotTarget;

export type AccessibilityNodeSnapshot = {
  role: string;
  label: string | null;
  value?: string | null;
  target?: AccessibilitySnapshotTarget;
  children: AccessibilityNodeSnapshot[];
  resolution: "best_effort";
};

export type FrontmostAppActionTarget = {
  kind: "frontmost_app";
};

export type WindowActionTarget = {
  kind: "window";
  windowId?: number;
};

export type ElementActionTarget = {
  kind: "element";
  elementId: string;
};

export type AccessibilityActionTarget =
  | FrontmostAppActionTarget
  | WindowActionTarget
  | ElementActionTarget;

export type PressAccessibilityAction = {
  kind: "press";
};

export type ClickAccessibilityAction = {
  kind: "click";
};

export type SetValueAccessibilityAction = {
  kind: "set_value";
  value: string;
};

export type AccessibilityAction =
  | PressAccessibilityAction
  | ClickAccessibilityAction
  | SetValueAccessibilityAction;

export type AccessibilityActionRequest = {
  target: AccessibilityActionTarget;
  action: AccessibilityAction;
};

export type AccessibilityActionResult = {
  ok: boolean;
  target: AccessibilityActionTarget;
  action: AccessibilityAction;
  resolution: "best_effort";
};

export interface PlatformAdapter {
  listApps(): Promise<AppInfo[]>;
  currentClipboardText(): Promise<string | null>;
  frontmostAppInfo(): Promise<FrontmostAppInfo>;
  frontmostWindowList(): Promise<WindowInfo[]>;
  captureScreen(request: ScreenCaptureRequest): Promise<ScreenCaptureResult>;
  recognizeText(request: OCRRequest): Promise<OCRResult>;
  accessibilitySnapshot(target: AccessibilitySnapshotTarget): Promise<AccessibilityNodeSnapshot>;
  performAccessibilityAction(request: AccessibilityActionRequest): Promise<AccessibilityActionResult>;
}
