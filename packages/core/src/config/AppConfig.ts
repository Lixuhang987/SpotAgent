export type AppConfig = {
  workspaceRoot: string;
  sessionStoragePath: string;
  locale: string;
};

export const defaultAppConfig: AppConfig = {
  workspaceRoot: "",
  sessionStoragePath: ".handagent",
  locale: "zh-CN"
};
