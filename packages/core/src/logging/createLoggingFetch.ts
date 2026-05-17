import type { NetworkLogger } from "./NetworkLogger.ts";

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

export type LoggingFetchOptions = {
  logger: NetworkLogger;
  baseFetch?: typeof fetch;
  now?: () => Date;
};

export function createLoggingFetch(options: LoggingFetchOptions): typeof fetch {
  const baseFetch = options.baseFetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());

  return async function loggingFetch(input: FetchInput, init?: FetchInit) {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

    const requestBody = init?.body !== undefined ? init.body : undefined;
    void options.logger.log({
      timestamp: now().toISOString(),
      direction: "request",
      url,
      method,
      body: tryParseBody(requestBody),
    });

    const response = await baseFetch(input, init);
    const cloned = response.clone();
    let parsed: unknown;
    try {
      const text = await cloned.text();
      parsed = tryParseJson(text);
    } catch {
      parsed = null;
    }
    void options.logger.log({
      timestamp: now().toISOString(),
      direction: "response",
      url,
      method,
      status: response.status,
      body: parsed,
    });
    return response;
  };
}

function tryParseBody(body: unknown): unknown {
  if (body === undefined || body === null) return null;
  if (typeof body === "string") return tryParseJson(body);
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    return `[binary ${"byteLength" in body ? body.byteLength : "?"} bytes]`;
  }
  return `[unsupported body type: ${Object.prototype.toString.call(body)}]`;
}

function tryParseJson(text: string): unknown {
  if (!text) return "";
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
