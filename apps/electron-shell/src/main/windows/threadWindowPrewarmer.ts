import type { BrowserWindowConstructorOptions } from "electron";

type InitialPromptPayload = {
  clientRequestId: string;
  text: string;
  attachments: unknown[];
  actionBinding: { pluginId: string; promptName: string } | null;
};

type ThreadWindowClosedEvent = {
  wasPrepared: boolean;
  wasVisible: boolean;
};

type BrowserWindowLike = {
  webContents: {
    once(event: "did-finish-load" | "did-fail-load", listener: () => void): unknown;
    executeJavaScript(source: string): Promise<unknown>;
  };
  on(event: "closed", listener: () => void): unknown;
  loadURL(url: string): Promise<unknown> | unknown;
  show(): void;
  focus(): void;
};

type Options = {
  threadWindowURL: string;
  preloadPath: string;
  createWindow: (options: BrowserWindowConstructorOptions) => BrowserWindowLike;
  onClosed?: (event: ThreadWindowClosedEvent) => void;
};

export class ThreadWindowPrewarmer {
  private window: BrowserWindowLike | null = null;
  private prepared = false;
  private visible = false;
  private preparePromise: Promise<void> | null = null;
  private rejectPrepare: ((error: Error) => void) | null = null;

  constructor(private readonly options: Options) {}

  async prepare(): Promise<void> {
    if (this.prepared) {
      return;
    }
    if (this.preparePromise) {
      return this.preparePromise;
    }
    if (!this.window) {
      this.window = this.options.createWindow({
        width: 920,
        height: 640,
        show: false,
        webPreferences: {
          preload: this.options.preloadPath,
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      this.window.on("closed", () => this.handleClosed());
    }

    const window = this.window;
    this.preparePromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        this.prepared = true;
        this.preparePromise = null;
        this.rejectPrepare = null;
        resolve();
      };
      const fail = (error = new Error("thread window failed to load")) => {
        if (settled) {
          return;
        }
        settled = true;
        this.prepared = false;
        this.preparePromise = null;
        this.rejectPrepare = null;
        reject(error);
      };
      this.rejectPrepare = fail;

      window.webContents.once("did-finish-load", finish);
      window.webContents.once("did-fail-load", () => fail());
      const loadResult = window.loadURL(this.options.threadWindowURL);
      if (isPromiseLike(loadResult)) {
        loadResult.then(finish, fail);
      }
    });

    return this.preparePromise;
  }

  async openInitialPrompt(payload: InitialPromptPayload): Promise<void> {
    await this.prepare();
    const window = this.window;
    if (!window || !this.prepared) {
      throw new Error("thread window is not prepared");
    }

    const serialized = JSON.stringify(payload).replace(/</g, "\\u003c");
    await window.webContents.executeJavaScript(`window.handAgentReceiveInitialPrompt(${serialized});`);
    if (this.window !== window || !this.prepared) {
      throw new Error("thread window changed before initial prompt was shown");
    }
    this.showAndFocus(window);
  }

  async openHistory(): Promise<void> {
    await this.prepare();
    const window = this.window;
    if (!window || !this.prepared) {
      throw new Error("thread window is not prepared");
    }
    this.showAndFocus(window);
  }

  focus(): boolean {
    if (!this.window || !this.visible) {
      return false;
    }
    this.window.focus();
    return true;
  }

  private showAndFocus(window: BrowserWindowLike): void {
    if (this.window !== window || !this.prepared) {
      throw new Error("thread window is not prepared");
    }
    window.show();
    window.focus();
    this.visible = true;
  }

  private handleClosed(): void {
    const wasPrepared = this.prepared;
    const wasVisible = this.visible;
    this.window = null;
    this.prepared = false;
    this.visible = false;
    const rejectPrepare = this.rejectPrepare;
    this.preparePromise = null;
    this.rejectPrepare = null;
    rejectPrepare?.(new Error("thread window closed before it was prepared"));
    this.options.onClosed?.({ wasPrepared, wasVisible });
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object"
    && value !== null
    && "then" in value
    && typeof value.then === "function";
}
