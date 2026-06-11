export type PlatformBridgeHelloMessage = {
  channel: "platform";
  type: "platform_bridge_hello";
  messageId: string;
  timestamp: string;
  payload: { agent: string };
};

export type PlatformRequestMessage = {
  channel: "platform";
  type: "platform_request";
  messageId: string;
  timestamp: string;
  payload: {
    requestId: string;
    method: string;
    args: unknown;
    timeoutMs?: number;
  };
};

export type PlatformResponseMessage = {
  channel: "platform";
  type: "platform_response";
  messageId: string;
  timestamp: string;
  payload: PlatformResponsePayload;
};

export type PlatformBridgeMessage =
  | PlatformBridgeHelloMessage
  | PlatformRequestMessage
  | PlatformResponseMessage;

export type PlatformResponseOkPayload = {
  requestId: string;
  status: "ok";
  result: unknown;
};

export type PlatformResponseErrorPayload = {
  requestId: string;
  status: "error";
  message: string;
  code?: string;
};

export type PlatformResponsePayload =
  | PlatformResponseOkPayload
  | PlatformResponseErrorPayload;
