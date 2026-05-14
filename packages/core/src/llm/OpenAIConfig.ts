export type OpenAIConfigOptions = {
  apiKey?: string;
  baseURL?: string;
};

export function resolveOpenAIApiKey(options: OpenAIConfigOptions): string {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  if (apiKey) {
    return apiKey;
  }

  throw new Error("Missing OPENAI_API_KEY. Set it before starting HandAgent.");
}

export function resolveOpenAIBaseURL(options: OpenAIConfigOptions): string | undefined {
  return options.baseURL ?? process.env.OPENAI_BASE_URL;
}
