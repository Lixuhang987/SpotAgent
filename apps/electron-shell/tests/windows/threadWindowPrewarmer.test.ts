import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { ThreadWindowPrewarmer } from "../../src/main/windows/threadWindowPrewarmer.js";

describe("ThreadWindowPrewarmer", () => {
  it("creates a hidden browser window and waits for load", async () => {
    const window = new FakeBrowserWindow();
    const prewarmer = new ThreadWindowPrewarmer({
      threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
      preloadPath: "/repo/apps/electron-shell/dist/preload/threadWindowPreload.js",
      createWindow: (options) => {
        expect(options.show).toBe(false);
        expect(options.webPreferences?.contextIsolation).toBe(true);
        expect(options.webPreferences?.nodeIntegration).toBe(false);
        return window;
      },
    });

    const prepared = prewarmer.prepare();
    window.webContents.emit("did-finish-load");
    await prepared;

    expect(window.loadedURL).toBe("http://127.0.0.1:4317/thread-window/index.html");
    expect(window.showCount).toBe(0);
    expect(window.focusCount).toBe(0);
  });

  it("delivers initial prompt before showing the prepared window", async () => {
    const window = new FakeBrowserWindow();
    const prewarmer = new ThreadWindowPrewarmer({
      threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
      preloadPath: "/preload.js",
      createWindow: () => window,
    });
    const prepared = prewarmer.prepare();
    window.webContents.emit("did-finish-load");
    await prepared;

    await prewarmer.openInitialPrompt({
      clientRequestId: "prompt-1",
      text: "hello",
      attachments: [],
      actionBinding: null,
    });

    expect(window.executedJavaScript[0]).toContain("window.handAgentReceiveInitialPrompt");
    expect(window.showCount).toBe(1);
    expect(window.focusCount).toBe(1);
  });
});

class FakeBrowserWindow {
  webContents = new EventEmitter() as EventEmitter & {
    executeJavaScript: (source: string) => Promise<void>;
  };
  loadedURL: string | null = null;
  showCount = 0;
  focusCount = 0;
  executedJavaScript: string[] = [];

  constructor() {
    this.webContents.executeJavaScript = async (source: string) => {
      this.executedJavaScript.push(source);
    };
  }

  loadURL(url: string): void {
    this.loadedURL = url;
  }

  show(): void {
    this.showCount += 1;
  }

  focus(): void {
    this.focusCount += 1;
  }

  on(): void {}
}
