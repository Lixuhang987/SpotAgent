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

  it("reuses an in-flight prepare request", async () => {
    const window = new FakeBrowserWindow();
    const prewarmer = new ThreadWindowPrewarmer({
      threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
      preloadPath: "/preload.js",
      createWindow: () => window,
    });

    const firstPrepare = prewarmer.prepare();
    const secondPrepare = prewarmer.prepare();
    window.webContents.emit("did-finish-load");
    await Promise.all([firstPrepare, secondPrepare]);

    expect(window.loadCount).toBe(1);
  });

  it("rejects failed loads and allows a later retry", async () => {
    const window = new FakeBrowserWindow();
    const prewarmer = new ThreadWindowPrewarmer({
      threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
      preloadPath: "/preload.js",
      createWindow: () => window,
    });

    const failedPrepare = prewarmer.prepare();
    window.webContents.emit("did-fail-load");
    await expect(failedPrepare).rejects.toThrow("thread window failed to load");

    const retriedPrepare = prewarmer.prepare();
    window.webContents.emit("did-finish-load");
    await retriedPrepare;

    expect(window.loadCount).toBe(2);
  });

  it("resets state and notifies when a prepared window closes", async () => {
    const window = new FakeBrowserWindow();
    let closedCount = 0;
    const prewarmer = new ThreadWindowPrewarmer({
      threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
      preloadPath: "/preload.js",
      createWindow: () => window,
      onClosed: () => {
        closedCount += 1;
      },
    });
    const prepared = prewarmer.prepare();
    window.webContents.emit("did-finish-load");
    await prepared;

    window.emit("closed");

    expect(closedCount).toBe(1);
    await expect(prewarmer.openInitialPrompt({
      clientRequestId: "prompt-1",
      text: "hello",
      attachments: [],
      actionBinding: null,
    })).rejects.toThrow("thread window is not prepared");
  });

  it("rejects in-flight prepare when the window closes and allows retry", async () => {
    const windows = [new FakeBrowserWindow(), new FakeBrowserWindow()];
    const prewarmer = new ThreadWindowPrewarmer({
      threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
      preloadPath: "/preload.js",
      createWindow: () => {
        const window = windows.shift();
        if (!window) {
          throw new Error("unexpected createWindow");
        }
        return window;
      },
    });

    const firstWindow = windows[0];
    const failedPrepare = prewarmer.prepare();
    firstWindow?.emit("closed");
    await expect(failedPrepare).rejects.toThrow("thread window closed before it was prepared");

    const secondWindow = windows[0];
    const retriedPrepare = prewarmer.prepare();
    secondWindow?.webContents.emit("did-finish-load");
    await retriedPrepare;
  });
});

class FakeBrowserWindow extends EventEmitter {
  webContents = new EventEmitter() as EventEmitter & {
    executeJavaScript: (source: string) => Promise<void>;
  };
  loadedURL: string | null = null;
  loadCount = 0;
  showCount = 0;
  focusCount = 0;
  executedJavaScript: string[] = [];

  constructor() {
    super();
    this.webContents.executeJavaScript = async (source: string) => {
      this.executedJavaScript.push(source);
    };
  }

  loadURL(url: string): void {
    this.loadedURL = url;
    this.loadCount += 1;
  }

  show(): void {
    this.showCount += 1;
  }

  focus(): void {
    this.focusCount += 1;
  }
}
