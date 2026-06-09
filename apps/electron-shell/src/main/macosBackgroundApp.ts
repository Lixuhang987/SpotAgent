type MacOSBackgroundElectronApp = {
  setActivationPolicy(policy: "regular" | "accessory" | "prohibited"): void;
  dock?: {
    hide(): void;
  };
};

export function configureMacOSBackgroundApp(
  app: MacOSBackgroundElectronApp,
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform !== "darwin") {
    return;
  }

  app.setActivationPolicy("accessory");
  app.dock?.hide();
}
