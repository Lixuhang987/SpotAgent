import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { ActivityWindowController } from "../../src/main/windows/activityWindowController.js";

describe("ActivityWindowController", () => {
  it("creates a frameless transparent activity window and shows it inactive", async () => {
    const window = new FakeBrowserWindow();
    const controller = new ActivityWindowController({
      activityWindowHTMLPath: "/dist/activity-window/index.html",
      preloadPath: "/dist/preload/activityWindowPreload.js",
      createWindow: (options) => {
        expect(options).toMatchObject({
          width: 272,
          height: 76,
          show: false,
          frame: false,
          transparent: true,
          alwaysOnTop: true,
          skipTaskbar: true,
          focusable: false,
          acceptFirstMouse: true,
          resizable: false,
          webPreferences: {
            preload: "/dist/preload/activityWindowPreload.js",
            contextIsolation: true,
            nodeIntegration: false,
          },
        });
        return window;
      },
      screenProvider: {
        getPrimaryWorkArea: () => ({ x: 0, y: 0, width: 1440, height: 900 }),
      },
    });

    await controller.show();

    expect(window.bounds).toEqual({ x: 1144, y: 800, width: 272, height: 76 });
    expect(window.loadedFile).toBe("/dist/activity-window/index.html");
    expect(window.showInactiveCount).toBe(1);
  });

  it("reuses a live activity window", async () => {
    const window = new FakeBrowserWindow();
    const createWindow = vi.fn(() => window);
    const controller = new ActivityWindowController({
      activityWindowHTMLPath: "/dist/activity-window/index.html",
      preloadPath: "/dist/preload/activityWindowPreload.js",
      createWindow,
      screenProvider: {
        getPrimaryWorkArea: () => ({ x: 20, y: 10, width: 1440, height: 900 }),
      },
    });

    await controller.show();
    await controller.show();

    expect(createWindow).toHaveBeenCalledTimes(1);
    expect(window.loadFileCount).toBe(1);
    expect(window.showInactiveCount).toBe(2);
    expect(window.bounds).toEqual({ x: 1164, y: 810, width: 272, height: 76 });
  });

  it("resets the live window after close", async () => {
    const firstWindow = new FakeBrowserWindow();
    const secondWindow = new FakeBrowserWindow();
    const windows = [firstWindow, secondWindow];
    const createWindow = vi.fn(() => {
      const window = windows.shift();
      if (!window) {
        throw new Error("unexpected createWindow");
      }
      return window;
    });
    const controller = new ActivityWindowController({
      activityWindowHTMLPath: "/dist/activity-window/index.html",
      preloadPath: "/dist/preload/activityWindowPreload.js",
      createWindow,
      screenProvider: {
        getPrimaryWorkArea: () => ({ x: 0, y: 0, width: 1440, height: 900 }),
      },
    });

    await controller.show();
    firstWindow.emit("closed");
    await controller.show();

    expect(createWindow).toHaveBeenCalledTimes(2);
  });

  it("emits renderer crashed callback for non-clean render exits", async () => {
    const window = new FakeBrowserWindow();
    const onRendererCrashed = vi.fn();
    const controller = new ActivityWindowController({
      activityWindowHTMLPath: "/dist/activity-window/index.html",
      preloadPath: "/dist/preload/activityWindowPreload.js",
      createWindow: () => window,
      screenProvider: {
        getPrimaryWorkArea: () => ({ x: 0, y: 0, width: 1440, height: 900 }),
      },
      onRendererCrashed,
    });

    await controller.show();
    window.webContents.emit("render-process-gone", {}, { reason: "clean-exit" });
    window.webContents.emit("render-process-gone", {}, { reason: "crashed" });

    expect(onRendererCrashed).toHaveBeenCalledTimes(1);
    expect(onRendererCrashed).toHaveBeenCalledWith("crashed");
  });
});

class FakeBrowserWindow extends EventEmitter {
  webContents = new EventEmitter();
  bounds: { x: number; y: number; width: number; height: number } | null = null;
  loadedFile: string | null = null;
  loadFileCount = 0;
  showInactiveCount = 0;

  setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    this.bounds = bounds;
  }

  loadFile(filePath: string): Promise<void> {
    this.loadedFile = filePath;
    this.loadFileCount += 1;
    return Promise.resolve();
  }

  showInactive(): void {
    this.showInactiveCount += 1;
  }
}
