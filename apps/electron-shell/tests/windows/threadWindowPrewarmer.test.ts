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

  it("passes the current theme to newly created windows", async () => {
    const window = new FakeBrowserWindow();
    const prewarmer = new ThreadWindowPrewarmer({
      threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
      preloadPath: "/repo/apps/electron-shell/dist/preload/threadWindowPreload.js",
      createWindow: (options) => {
        expect(options.webPreferences?.additionalArguments).toContain(
          `--handagent-theme=${encodeURIComponent(JSON.stringify({ preference: "system", resolved: "dark" }))}`,
        );
        return window;
      },
    });

    await prewarmer.updateTheme({ preference: "system", resolved: "dark" });
    const prepared = prewarmer.prepare();
    window.webContents.emit("did-finish-load");
    await prepared;
  });

  it("broadcasts theme changes to a prepared window", async () => {
    const window = new FakeBrowserWindow();
    const prewarmer = new ThreadWindowPrewarmer({
      threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
      preloadPath: "/preload.js",
      createWindow: () => window,
    });

    const prepared = prewarmer.prepare();
    window.webContents.emit("did-finish-load");
    await prepared;
    await prewarmer.updateTheme({ preference: "dark", resolved: "dark" });

    expect(window.sentMessages).toEqual([
      ["handagent:theme-changed", { preference: "dark", resolved: "dark" }],
    ]);
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
      userInput: {
        items: [{ type: "text", id: "text-1", text: "hello" }],
      },
      actionBinding: null,
    });

    expect(window.executedJavaScript[0]).toContain("window.handAgentReceiveInitialPrompt");
    expect(window.showCount).toBe(1);
    expect(window.focusCount).toBe(1);
  });

  it("prepares on demand before opening an initial prompt", async () => {
    const window = new FakeBrowserWindow();
    const host = new ThreadWindowPrewarmer({
      threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
      preloadPath: "/preload.js",
      createWindow: () => window,
    });

    const opened = host.openInitialPrompt({
      clientRequestId: "prompt-1",
      userInput: {
        items: [{ type: "text", id: "text-1", text: "hello" }],
      },
      actionBinding: null,
    });
    window.webContents.emit("did-finish-load");
    await opened;

    expect(window.loadCount).toBe(1);
    expect(window.executedJavaScript[0]).toContain("window.handAgentReceiveInitialPrompt");
    expect(window.showCount).toBe(1);
    expect(window.focusCount).toBe(1);
  });

  it("does not show a replacement window after the initial prompt window closes during delivery", async () => {
    const firstWindow = new FakeBrowserWindow();
    const secondWindow = new FakeBrowserWindow();
    const injected = createDeferred<void>();
    firstWindow.webContents.executeJavaScript = async (source: string) => {
      firstWindow.executedJavaScript.push(source);
      await injected.promise;
    };
    const windows = [firstWindow, secondWindow];
    let createCount = 0;
    const host = new ThreadWindowPrewarmer({
      threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
      preloadPath: "/preload.js",
      createWindow: () => {
        createCount += 1;
        const window = windows.shift();
        if (!window) {
          throw new Error("unexpected createWindow");
        }
        return window;
      },
    });

    const openingInitialPrompt = host.openInitialPrompt({
      clientRequestId: "prompt-1",
      userInput: {
        items: [{ type: "text", id: "text-1", text: "hello" }],
      },
      actionBinding: null,
    });
    firstWindow.webContents.emit("did-finish-load");
    await flushMicrotasks();

    expect(firstWindow.executedJavaScript[0]).toContain("window.handAgentReceiveInitialPrompt");
    firstWindow.emit("closed");

    const openingHistory = host.openHistory();
    secondWindow.webContents.emit("did-finish-load");
    await openingHistory;

    injected.resolve();
    await expect(openingInitialPrompt).rejects.toThrow("thread window changed before initial prompt was shown");
    expect(firstWindow.showCount).toBe(0);
    expect(firstWindow.focusCount).toBe(0);
    expect(secondWindow.showCount).toBe(1);
    expect(secondWindow.focusCount).toBe(1);
    expect(createCount).toBe(2);
  });

  it("opens history without delivering an initial prompt", async () => {
    const window = new FakeBrowserWindow();
    const host = new ThreadWindowPrewarmer({
      threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
      preloadPath: "/preload.js",
      createWindow: () => window,
    });

    const opened = host.openHistory();
    window.webContents.emit("did-finish-load");
    await opened;

    expect(window.executedJavaScript).toEqual([]);
    expect(window.showCount).toBe(1);
    expect(window.focusCount).toBe(1);
  });

  it("focuses only after the window has been shown", async () => {
    const window = new FakeBrowserWindow();
    const host = new ThreadWindowPrewarmer({
      threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
      preloadPath: "/preload.js",
      createWindow: () => window,
    });

    expect(host.focus()).toBe(false);
    const opened = host.openHistory();
    window.webContents.emit("did-finish-load");
    await opened;

    expect(host.focus()).toBe(true);
    expect(window.focusCount).toBe(2);
  });

  it("reports whether a closed thread window had been visible", async () => {
    const window = new FakeBrowserWindow();
    const closes: boolean[] = [];
    const host = new ThreadWindowPrewarmer({
      threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
      preloadPath: "/preload.js",
      createWindow: () => window,
      onClosed: (event) => closes.push(event.wasVisible),
    });

    const opened = host.openHistory();
    window.webContents.emit("did-finish-load");
    await opened;
    window.emit("closed");

    expect(closes).toEqual([true]);
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
    const firstWindow = new FakeBrowserWindow();
    const secondWindow = new FakeBrowserWindow();
    const windows = [firstWindow, secondWindow];
    let createCount = 0;
    let closedCount = 0;
    const prewarmer = new ThreadWindowPrewarmer({
      threadWindowURL: "http://127.0.0.1:4317/thread-window/index.html",
      preloadPath: "/preload.js",
      createWindow: () => {
        createCount += 1;
        const window = windows.shift();
        if (!window) {
          throw new Error("unexpected createWindow");
        }
        return window;
      },
      onClosed: () => {
        closedCount += 1;
      },
    });
    const prepared = prewarmer.prepare();
    firstWindow.webContents.emit("did-finish-load");
    await prepared;

    firstWindow.emit("closed");

    expect(closedCount).toBe(1);
    const reopened = prewarmer.openInitialPrompt({
      clientRequestId: "prompt-1",
      userInput: {
        items: [{ type: "text", id: "text-1", text: "hello" }],
      },
      actionBinding: null,
    });
    secondWindow.webContents.emit("did-finish-load");
    await reopened;

    expect(firstWindow.loadCount).toBe(1);
    expect(firstWindow.showCount).toBe(0);
    expect(firstWindow.focusCount).toBe(0);
    expect(secondWindow.loadCount).toBe(1);
    expect(secondWindow.showCount).toBe(1);
    expect(secondWindow.focusCount).toBe(1);
    expect(createCount).toBe(2);
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
    send: (channel: string, payload: unknown) => void;
  };
  loadedURL: string | null = null;
  loadCount = 0;
  showCount = 0;
  focusCount = 0;
  executedJavaScript: string[] = [];
  sentMessages: [string, unknown][] = [];

  constructor() {
    super();
    this.webContents.executeJavaScript = async (source: string) => {
      this.executedJavaScript.push(source);
    };
    this.webContents.send = (channel: string, payload: unknown) => {
      this.sentMessages.push([channel, payload]);
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

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}
