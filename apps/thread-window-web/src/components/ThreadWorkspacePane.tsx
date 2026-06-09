import { Composer } from "./Composer.tsx";
import { MessageList } from "./MessageList.tsx";
import { RequestPanels } from "./RequestPanels.tsx";
import { createThreadWindowStore, type ConnectionState } from "../store/threadWindowStore.ts";

type ThreadWorkspacePaneProps = {
  threadId: string | null;
  connectionState: ConnectionState;
  windowErrorMessage: string | null;
  onSubmit(threadId: string, text: string): void;
  onStop(threadId: string): void;
  onRemoveQueuedInput(threadId: string, index: number): void;
  onAnswerPermission(requestId: string, decision: "allow" | "deny"): void;
  onAnswerWorkspace(requestId: string, workspaceId: string | null): void;
};

export function ThreadWorkspacePane({
  threadId,
  connectionState,
  windowErrorMessage,
  onSubmit,
  onStop,
  onRemoveQueuedInput,
  onAnswerPermission,
  onAnswerWorkspace,
}: ThreadWorkspacePaneProps) {
  const state = createThreadWindowStore();
  const liveState = createThreadWindowStore.getState();
  const thread = threadId
    ? state.threadsById[threadId] ?? liveState.threadsById[threadId] ?? null
    : null;

  return (
    <section
      className="grid h-screen min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-app-canvas text-app-text-primary shadow-product-inner"
      aria-label="Thread workspace"
    >
      <div className="min-h-0 min-w-0 overflow-hidden" data-thread-window-error-slot="true">
        {windowErrorMessage ? (
          <div className="mx-sm mt-xs rounded-md border border-app-error/30 bg-app-error/10 px-sm py-xs text-sm text-app-error">
            {windowErrorMessage}
          </div>
        ) : null}
      </div>

      {thread ? (
        <>
          <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
            <MessageList
              messages={thread.messages}
              errorMessage={thread.errorMessage}
              isRunning={thread.status === "running"}
            />
            <RequestPanels
              permissionRequests={thread.permissionRequests}
              workspaceRequests={thread.workspaceRequests}
              onAnswerPermission={onAnswerPermission}
              onAnswerWorkspace={onAnswerWorkspace}
            />
          </div>
          <Composer
            disabled={connectionState !== "connected"}
            stopDisabled={connectionState !== "connected" || thread.status !== "running"}
            queuedInputs={thread.queuedComposerInputs}
            onSubmit={(text) => onSubmit(thread.threadId, text)}
            onRemoveQueuedInput={(index) => onRemoveQueuedInput(thread.threadId, index)}
            onStop={() => onStop(thread.threadId)}
          />
        </>
      ) : (
        <div className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden text-sm text-app-text-muted">
          <div className="rounded-lg border border-app-hairline bg-app-surface-elevated px-lg py-md">
            准备开始
          </div>
        </div>
      )}
    </section>
  );
}
