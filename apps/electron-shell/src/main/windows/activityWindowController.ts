import type { BrowserWindowConstructorOptions, Rectangle } from "electron";
import type { HostTheme } from "../protocol/electronShellProtocol.js";

export type BrowserWindowLike = {
  webContents: {
    on(event: "render-process-gone", listener: (event: unknown, details: { reason: string }) => void): unknown;
    on(event: "before-mouse-event", listener: (event: { preventDefault(): void }, mouse: { type: string; button?: string }) => void): unknown;
    send(channel: "handagent:theme-changed", theme: HostTheme): void;
  };
  on(event: "closed" | "focus", listener: () => void): unknown;
  loadFile(filePath: string): Promise<unknown> | unknown;
  setBounds(bounds: Rectangle): void;
  showInactive(): void;
  destroy(): void;
};

type ScreenProvider = {
  getPrimaryWorkArea(): Rectangle;
};

type Options = {
  activityWindowHTMLPath: string;
  preloadPath: string;
  createWindow: (options: BrowserWindowConstructorOptions) => BrowserWindowLike;
  screenProvider: ScreenProvider;
  onRendererCrashed?: (reason: string) => void;
  onNativeFocus?: () => void;
  onNativeMouseDown?: () => void;
};

const ACTIVITY_WINDOW_WIDTH = 272;
const ACTIVITY_WINDOW_HEIGHT = 76;
const ACTIVITY_WINDOW_MARGIN = 24;

export class ActivityWindowController {
  private window: BrowserWindowLike | null = null;
  private hasLoaded = false;
  private theme: HostTheme = { preference: "system", resolved: "light" };

  constructor(private readonly options: Options) {}

  async show(): Promise<void> {
    const window = this.ensureWindow();
    window.setBounds(this.boundsForPrimaryWorkArea());

    if (!this.hasLoaded) {
      const loadResult = window.loadFile(this.options.activityWindowHTMLPath);
      if (isPromiseLike(loadResult)) {
        await loadResult;
      }
      if (this.window !== window) {
        throw new Error("activity window closed before it was shown");
      }
      this.hasLoaded = true;
    }

    window.showInactive();
  }

  currentWebContents(): BrowserWindowLike["webContents"] | null {
    return this.window?.webContents ?? null;
  }

  releaseNativeFocusForNextClick(): void {
    const window = this.window;
    if (!window) {
      return;
    }

    this.window = null;
    this.hasLoaded = false;
    window.destroy();
    void this.show().catch(() => {
      // The close path is best-effort: a later explicit activity_window.show command
      // still reports load failures through its command ack.
    });
  }

  async updateTheme(theme: HostTheme): Promise<void> {
    this.theme = theme;
    if (this.window && this.hasLoaded) {
      this.window.webContents.send("handagent:theme-changed", theme);
    }
  }

  private ensureWindow(): BrowserWindowLike {
    if (this.window) {
      return this.window;
    }

    const window = this.options.createWindow({
      width: ACTIVITY_WINDOW_WIDTH,
      height: ACTIVITY_WINDOW_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: true,
      acceptFirstMouse: true,
      resizable: false,
      webPreferences: {
        preload: this.options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        additionalArguments: [`--handagent-theme=${encodeURIComponent(JSON.stringify(this.theme))}`],
      },
    });

    window.on("closed", () => {
      if (this.window === window) {
        this.window = null;
        this.hasLoaded = false;
      }
    });
    window.on("focus", () => {
      if (this.window === window) {
        this.options.onNativeFocus?.();
      }
    });
    window.webContents.on("render-process-gone", (_event, details) => {
      if (details.reason === "clean-exit") {
        return;
      }
      this.options.onRendererCrashed?.(details.reason);
    });
    window.webContents.on("before-mouse-event", (event, mouse) => {
      if (
        mouse.type !== "mouseDown" ||
        (mouse.button !== undefined && mouse.button !== "left")
      ) {
        return;
      }

      event.preventDefault();
      this.options.onNativeMouseDown?.();
    });

    this.window = window;
    return window;
  }

  private boundsForPrimaryWorkArea(): Rectangle {
    const workArea = this.options.screenProvider.getPrimaryWorkArea();
    return {
      x: workArea.x + workArea.width - ACTIVITY_WINDOW_WIDTH - ACTIVITY_WINDOW_MARGIN,
      y: workArea.y + workArea.height - ACTIVITY_WINDOW_HEIGHT - ACTIVITY_WINDOW_MARGIN,
      width: ACTIVITY_WINDOW_WIDTH,
      height: ACTIVITY_WINDOW_HEIGHT,
    };
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object"
    && value !== null
    && "then" in value
    && typeof value.then === "function";
}
