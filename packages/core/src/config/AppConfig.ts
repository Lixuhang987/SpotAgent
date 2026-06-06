export type AppConfig = {
  workspaceRoot: string;
  threadStoragePath: string;
  locale: string;
};

export const defaultAppConfig: AppConfig = {
  workspaceRoot: "",
  threadStoragePath: ".handagent",
  locale: "zh-CN"
};
