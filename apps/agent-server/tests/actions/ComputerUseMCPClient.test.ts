import { describe, expect, it } from "vitest";
import type {
  AccessibilityActionRequest,
  AccessibilityActionResult,
  AccessibilityNodeSnapshot,
  AccessibilitySnapshotTarget,
  AppInfo,
  FrontmostAppInfo,
  OCRRequest,
  OCRResult,
  PlatformAdapter,
  ScreenCaptureRequest,
  ScreenCaptureResult,
  WindowInfo,
} from "@handagent/core/platform/PlatformAdapter.ts";
import { ComputerUseMCPClient } from "../../src/ComputerUseMCPClient.ts";

class FakePlatformAdapter implements PlatformAdapter {
  async listApps(): Promise<AppInfo[]> {
    return [
      {
        name: "Finder",
        bundleId: "com.apple.finder",
        pid: 101,
        isActive: false,
        resolution: "best_effort",
      },
      {
        name: "HandAgent",
        bundleId: "com.yourname.HandAgentDesktop",
        pid: 202,
        isActive: true,
        resolution: "best_effort",
      },
    ];
  }

  async currentClipboardText(): Promise<string | null> {
    return null;
  }

  async frontmostAppInfo(): Promise<FrontmostAppInfo> {
    return {
      name: "HandAgent",
      bundleId: "com.yourname.HandAgentDesktop",
      pid: 202,
      resolution: "best_effort",
    };
  }

  async frontmostWindowList(): Promise<WindowInfo[]> {
    return [
      {
        id: 5001,
        title: "Downloads",
        appName: "Finder",
      },
    ];
  }

  async captureScreen(request: ScreenCaptureRequest): Promise<ScreenCaptureResult> {
    return {
      imageBase64: "ZmFrZS1maW5kZXItcG5n",
      mimeType: "image/png",
      width: 320,
      height: 200,
      target: request.target,
      resolution: "best_effort",
    };
  }

  async recognizeText(_request: OCRRequest): Promise<OCRResult> {
    return {
      text: "",
      lines: [],
      resolution: "best_effort",
    };
  }

  async accessibilitySnapshot(
    target: AccessibilitySnapshotTarget,
  ): Promise<AccessibilityNodeSnapshot> {
    return {
      role: "application",
      label: "Finder",
      target,
      children: [
        {
          role: "window",
          label: "Downloads",
          children: [],
          resolution: "best_effort",
        },
      ],
      resolution: "best_effort",
    };
  }

  async performAccessibilityAction(
    request: AccessibilityActionRequest,
  ): Promise<AccessibilityActionResult> {
    return {
      ok: true,
      target: request.target,
      action: request.action,
      resolution: "best_effort",
    };
  }
}

class LocalizedFinderPlatformAdapter extends FakePlatformAdapter {
  override async listApps(): Promise<AppInfo[]> {
    return [
      {
        name: "Keka Finder Integration",
        bundleId: "com.aone.keka.KekaFinderIntegration",
        pid: 301,
        isActive: false,
        activationPolicy: "prohibited",
        resolution: "best_effort",
      },
      {
        name: "访达",
        bundleId: "com.apple.finder",
        pid: 101,
        isActive: false,
        activationPolicy: "regular",
        resolution: "best_effort",
      },
    ];
  }

  override async accessibilitySnapshot(
    target: AccessibilitySnapshotTarget,
  ): Promise<AccessibilityNodeSnapshot> {
    return {
      role: "application",
      label: target.bundleId ?? null,
      target,
      children: [],
      resolution: "best_effort",
    };
  }
}

describe("ComputerUseMCPClient", () => {
  it("exposes list_apps through the HandAgent platform bridge", async () => {
    const client = new ComputerUseMCPClient({
      serverId: "computer_use",
      platform: new FakePlatformAdapter(),
    });

    await expect(client.initialize()).resolves.toMatchObject({
      name: "Computer Use",
      capabilities: { tools: { listChanged: false } },
    });
    await expect(client.listTools()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "list_apps" }),
        expect.objectContaining({ name: "get_app_state" }),
      ]),
    );

    const result = await client.callTool("list_apps", {});
    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      apps: [
        { name: "Finder", bundleId: "com.apple.finder" },
        { name: "HandAgent", bundleId: "com.yourname.HandAgentDesktop" },
      ],
    });
  });

  it("returns screenshot and accessibility tree for get_app_state", async () => {
    const client = new ComputerUseMCPClient({
      serverId: "computer_use",
      platform: new FakePlatformAdapter(),
    });

    const result = await client.callTool("get_app_state", { app: "Finder" });

    expect(result.isError).toBe(false);
    expect(result.content).toEqual(
      expect.arrayContaining([
        { type: "image", data: "ZmFrZS1maW5kZXItcG5n", mimeType: "image/png" },
      ]),
    );
    expect(result.structuredContent).toMatchObject({
      app: { name: "Finder", bundleId: "com.apple.finder", pid: 101 },
      screenshot: {
        width: 320,
        height: 200,
        target: { kind: "window", windowId: 5001 },
      },
      accessibilityTree: {
        role: "application",
        label: "Finder",
        children: [{ role: "window", label: "Downloads" }],
      },
    });
  });

  it("prefers Finder bundle id over helper apps whose names contain Finder", async () => {
    const client = new ComputerUseMCPClient({
      serverId: "computer_use",
      platform: new LocalizedFinderPlatformAdapter(),
    });

    const result = await client.callTool("get_app_state", { app: "Finder" });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      app: { name: "访达", bundleId: "com.apple.finder", pid: 101 },
      accessibilityTree: {
        target: { bundleId: "com.apple.finder", pid: 101 },
      },
    });
  });
});
