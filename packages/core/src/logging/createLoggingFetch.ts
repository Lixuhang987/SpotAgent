import type { NetworkLogEntry, NetworkLogger } from "./NetworkLogger.ts";

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
    logNetworkEntry(options.logger, {
      timestamp: now().toISOString(),
      direction: "request",
      url,
      method,
      body: tryParseBody(requestBody),
    });

    const response = await baseFetch(input, init);
    if (isStreamingResponse(response)) {
      logNetworkEntry(options.logger, {
        timestamp: now().toISOString(),
        direction: "response",
        url,
        method,
        status: response.status,
        body: `[streaming response: ${response.headers.get("content-type")?.split(";")[0].trim() ?? "unknown"}]`,
      });
      return response;
    }

    const cloned = response.clone();
    let parsed: unknown;
    try {
      const text = await cloned.text();
      parsed = tryParseJson(text);
    } catch {
      parsed = null;
    }
    logNetworkEntry(options.logger, {
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

function logNetworkEntry(logger: NetworkLogger, entry: NetworkLogEntry): void {
  try {
    void logger.log(entry).catch(() => {});
  } catch {
    // Logging must not affect request handling.
  }
}

function isStreamingResponse(response: Response): boolean {
  return response.headers.get("content-type")?.toLowerCase().split(";")[0].trim() === "text/event-stream";
}

function tryParseBody(body: unknown): unknown {
  if (body === undefined || body === null) return null;
  if (typeof body === "string") return redactImagePayloads(tryParseJson(body));
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

function redactImagePayloads(value: unknown): unknown {
  if (typeof value === "string") {
    return value.startsWith("data:image/") ? "[redacted image data URI]" : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactImagePayloads(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).map(([key, entry]) => {
      if (record.type === "image" && key === "image") {
        return [key, "[redacted image payload]"];
      }
      return [key, redactImagePayloads(entry)];
    }),
  );
}
