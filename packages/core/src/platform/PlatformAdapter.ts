export type FrontmostAppInfo = {
  name: string | null;
  bundleId?: string;
  pid?: number;
  resolution: "best_effort";
};

export type WindowInfo = {
  id?: number;
  title: string | null;
  appName: string | null;
};

export type ScreenCaptureTarget =
  | {
      kind: "screen";
      screenId?: string;
    }
  | {
      kind: "display";
      displayId?: string;
    }
  | {
      kind: "window";
      windowId: number;
    }
  | {
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

export type AccessibilitySnapshotTarget =
  | {
      kind: "frontmost_app";
    }
  | {
      kind: "app";
      bundleId?: string;
      pid?: number;
    }
  | {
      kind: "window";
      windowId?: number;
    }
  | {
      kind: "element";
      elementId?: string;
    };

export type AccessibilityNodeSnapshot = {
  role: string;
  label: string | null;
  value?: string | null;
  target?: AccessibilitySnapshotTarget;
  children: AccessibilityNodeSnapshot[];
  resolution: "best_effort";
};

export type AccessibilityActionTarget =
  | {
      kind: "frontmost_app";
    }
  | {
      kind: "window";
      windowId?: number;
    }
  | {
      kind: "element";
      elementId: string;
    };

export type AccessibilityActionRequest =
  | {
      target: AccessibilityActionTarget;
      action:
        | {
            kind: "press";
          }
        | {
            kind: "click";
          }
        | {
            kind: "set_value";
            value: string;
          };
    };

export type AccessibilityActionResult = {
  ok: boolean;
  target: AccessibilityActionTarget;
  action: AccessibilityActionRequest["action"];
  resolution: "best_effort";
};

export interface PlatformAdapter {
  currentClipboardText(): Promise<string | null>;
  frontmostAppInfo(): Promise<FrontmostAppInfo>;
  frontmostWindowList(): Promise<WindowInfo[]>;
  captureScreen(request: ScreenCaptureRequest): Promise<ScreenCaptureResult>;
  recognizeText(request: OCRRequest): Promise<OCRResult>;
  accessibilitySnapshot(target: AccessibilitySnapshotTarget): Promise<AccessibilityNodeSnapshot>;
  performAccessibilityAction(request: AccessibilityActionRequest): Promise<AccessibilityActionResult>;
}
