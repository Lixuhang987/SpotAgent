import type { BrowserWindowConstructorOptions } from "electron";

type InitialPromptPayload = {
  clientRequestId: string;
  text: string;
  attachments: unknown[];
  actionBinding: { pluginId: string; promptName: string } | null;
};

type BrowserWindowLike = {
  webContents: {
    once(event: "did-finish-load" | "did-fail-load", listener: () => void): unknown;
    executeJavaScript(source: string): Promise<unknown>;
  };
  loadURL(url: string): Promise<unknown> | unknown;
  show(): void;
  focus(): void;
};

type Options = {
  threadWindowURL: string;
  preloadPath: string;
  createWindow: (options: BrowserWindowConstructorOptions) => BrowserWindowLike;
};

export class ThreadWindowPrewarmer {
  private window: BrowserWindowLike | null = null;
  private prepared = false;
  private preparePromise: Promise<void> | null = null;

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
        resolve();
      };
      const fail = () => {
        if (settled) {
          return;
        }
        settled = true;
        this.prepared = false;
        this.preparePromise = null;
        reject(new Error("thread window failed to load"));
      };

      window.webContents.once("did-finish-load", finish);
      window.webContents.once("did-fail-load", fail);
      const loadResult = window.loadURL(this.options.threadWindowURL);
      if (isPromiseLike(loadResult)) {
        loadResult.then(finish, fail);
      }
    });

    return this.preparePromise;
  }

  async openInitialPrompt(payload: InitialPromptPayload): Promise<void> {
    if (!this.window || !this.prepared) {
      throw new Error("thread window is not prepared");
    }

    const serialized = JSON.stringify(payload).replace(/</g, "\\u003c");
    await this.window.webContents.executeJavaScript(`window.handAgentReceiveInitialPrompt(${serialized});`);
    this.window.show();
    this.window.focus();
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object"
    && value !== null
    && "then" in value
    && typeof value.then === "function";
}
