export type StubCacheScope = "turn" | "persist";

export type StubRecord = {
  id: string;
  kind: string;
  size: number;
  path: string;
  cached?: StubCacheScope;
  summarized?: boolean;
  body?: string;
};

export function renderStub(stub: StubRecord): string {
  const attrs = [
    `id=${stub.id}`,
    `kind=${stub.kind}`,
    stub.cached ? `cached=${stub.cached}` : undefined,
    stub.summarized ? "summarized=true" : undefined,
    `size=${stub.size}`,
    `path="${escapeAttribute(stub.path)}"`,
  ].filter((value): value is string => Boolean(value));

  const body = stub.body ?? "";
  if (body.length === 0) {
    return `[STUB ${attrs.join(" ")}]\n[/STUB]`;
  }
  return `[STUB ${attrs.join(" ")}]\n${body}\n[/STUB]`;
}

export function parseStub(value: string): StubRecord & { body: string } {
  const match = /^\[STUB ([^\]]*)\]\n([\s\S]*?)\n?\[\/STUB\]$/.exec(value);
  if (!match) {
    throw new Error("Invalid stub text");
  }

  const attrs = parseAttributes(match[1]);
  const size = Number(attrs.size);
  if (!attrs.id || !attrs.kind || !attrs.path || !Number.isFinite(size)) {
    throw new Error("Invalid stub attributes");
  }

  return {
    id: attrs.id,
    kind: attrs.kind,
    cached: parseCached(attrs.cached),
    summarized: attrs.summarized === "true" ? true : undefined,
    size,
    path: attrs.path,
    body: match[2],
  };
}

function parseCached(value: string | undefined): StubCacheScope | undefined {
  if (value === "turn" || value === "persist") return value;
  return undefined;
}

function parseAttributes(value: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /(\w+)=("[^"]*"|[^\s]+)/g;
  for (const match of value.matchAll(pattern)) {
    const raw = match[2];
    attrs[match[1]] = raw.startsWith("\"")
      ? raw.slice(1, -1).replace(/\\"/g, "\"").replace(/\\\\/g, "\\")
      : raw;
  }
  return attrs;
}

function escapeAttribute(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}
