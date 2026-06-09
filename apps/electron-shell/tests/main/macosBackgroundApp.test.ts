import { describe, expect, it, vi } from "vitest";
import { configureMacOSBackgroundApp } from "../../src/main/macosBackgroundApp.js";

describe("configureMacOSBackgroundApp", () => {
  it("uses accessory activation policy and hides the Dock icon on macOS", () => {
    const app = {
      setActivationPolicy: vi.fn(),
      dock: { hide: vi.fn() },
    };

    configureMacOSBackgroundApp(app, "darwin");

    expect(app.setActivationPolicy).toHaveBeenCalledWith("accessory");
    expect(app.dock.hide).toHaveBeenCalledTimes(1);
  });

  it("does not touch activation policy on non-macOS platforms", () => {
    const app = {
      setActivationPolicy: vi.fn(),
      dock: { hide: vi.fn() },
    };

    configureMacOSBackgroundApp(app, "linux");

    expect(app.setActivationPolicy).not.toHaveBeenCalled();
    expect(app.dock.hide).not.toHaveBeenCalled();
  });
});
