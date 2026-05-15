export type OpenAIConfigOptions = {
  apiKey?: string;
  baseURL?: string;
};

export const defaultOpenAIBaseURL = "https://api.openai.com/v1";

export function resolveOpenAIApiKey(options: OpenAIConfigOptions): string {
  const apiKey = normalizeOptionalString(options.apiKey);
  if (apiKey) {
    return apiKey;
  }

  throw new Error("Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。");
}

export function resolveOpenAIBaseURL(options: OpenAIConfigOptions): string {
  return normalizeOptionalString(options.baseURL) ?? defaultOpenAIBaseURL;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  return normalized;
}
