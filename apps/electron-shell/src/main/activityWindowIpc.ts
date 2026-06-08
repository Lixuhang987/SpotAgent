type ActivityWindowIpcEvent = {
  sender: unknown;
};

type ActivityWindowIpcRuntime = {
  handleActivityWindowFocusRequest(threadId: string | null): void;
};

type ActivityWindowIpcOptions = {
  activityWebContents: () => unknown;
  runtime: ActivityWindowIpcRuntime;
};

export function handleActivityWindowFocusThreadIpc(
  event: ActivityWindowIpcEvent,
  threadId: unknown,
  options: ActivityWindowIpcOptions,
): void {
  if (event.sender !== options.activityWebContents()) {
    return;
  }
  if (threadId !== null && typeof threadId !== "string") {
    return;
  }

  options.runtime.handleActivityWindowFocusRequest(threadId);
}
