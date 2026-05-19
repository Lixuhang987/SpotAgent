export type PlatformBridgeMessage =
  | {
      channel: "platform";
      type: "platform_bridge_hello";
      messageId: string;
      timestamp: string;
      payload: { agent: string };
    }
  | {
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
    }
  | {
      channel: "platform";
      type: "platform_response";
      messageId: string;
      timestamp: string;
      payload: PlatformResponsePayload;
    };

export type PlatformResponsePayload =
  | {
      requestId: string;
      status: "ok";
      result: unknown;
    }
  | {
      requestId: string;
      status: "error";
      message: string;
      code?: string;
    };
