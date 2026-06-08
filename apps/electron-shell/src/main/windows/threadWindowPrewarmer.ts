import type { BrowserWindowConstructorOptions } from "electron";

type InitialPromptPayload = {
  clientRequestId: string;
  text: string;
  attachments: unknown[];
  actionBinding: { pluginId: string; promptName: string } | null;
};

type BrowserWindowLike = {
  webContents: {
    once(event: "did-finish-load", listener: () => void): unknown;
    executeJavaScript(source: string): Promise<unknown>;
  };
  loadURL(url: string): unknown;
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

  constructor(private readonly options: Options) {}

  async prepare(): Promise<void> {
    if (this.prepared) {
      return;
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
    await new Promise<void>((resolve) => {
      window.webContents.once("did-finish-load", resolve);
      window.loadURL(this.options.threadWindowURL);
    });
    this.prepared = true;
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
