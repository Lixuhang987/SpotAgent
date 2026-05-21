export type PlatformBridgeMethod =
  | "clipboard.read"
  | "app.list"
  | "app.frontmost"
  | "window.list"
  | "screen.capture"
  | "ocr.read"
  | "accessibility.snapshot"
  | "accessibility.action";

export interface PlatformBridge {
  call<T>(method: PlatformBridgeMethod, args: unknown, timeoutMs?: number): Promise<T>;
  isAvailable(): boolean;
}

export class PlatformBridgeOfflineError extends Error {
  constructor(method: string) {
    super(`Platform bridge is not connected (method: ${method})`);
    this.name = "PlatformBridgeOfflineError";
  }
}

export class PlatformBridgeTimeoutError extends Error {
  constructor(method: string, timeoutMs: number) {
    super(`Platform bridge call timed out after ${timeoutMs}ms (method: ${method})`);
    this.name = "PlatformBridgeTimeoutError";
  }
}

export class PlatformBridgeRemoteError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = "PlatformBridgeRemoteError";
    this.code = code;
  }
}
