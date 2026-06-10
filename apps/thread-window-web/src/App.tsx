import { useEffect, useRef, useState } from "react";
import { HistorySidebar } from "./components/HistorySidebar.tsx";
import { ThreadWorkspacePane } from "./components/ThreadWorkspacePane.tsx";
import { getThreadWebSocketURL, installInitialPromptReceiver } from "./native/nativeConfig.ts";
import { applyThemeToDocument, getInitialTheme, installThemeSubscription } from "./native/themeConfig.ts";
import {
  encodePermissionAnswer,
  encodeThreadDelete,
  encodeThreadStart,
  encodeWorkspaceAnswer,
  createUserInputFromText,
} from "./protocol/threadProtocol.ts";
import { createThreadWindowStore } from "./store/threadWindowStore.ts";
import { ThreadSocketClient } from "./thread/threadSocketClient.ts";
import { getThreadWindowSidebarLayout } from "./utils/sidebarLayout.ts";

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function App() {
  const state = createThreadWindowStore();
  const threads = Object.values(state.threadsById);
  const clientRef = useRef<ThreadSocketClient | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [deleteTargetThreadId, setDeleteTargetThreadId] = useState<string | null>(null);
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  const sidebarLayout = getThreadWindowSidebarLayout(windowWidth);
  const queuedDispatchKey = threads
    .map((thread) => [
      thread.threadId,
      thread.status,
      thread.queuedComposerInputs.length,
      thread.queuedInputDispatchPending ? "pending" : "ready",
    ].join(":"))
    .join("|");

  useEffect(() => {
    applyThemeToDocument(getInitialTheme());
    return installThemeSubscription((theme) => {
      applyThemeToDocument(theme);
    });
  }, []);

  useEffect(() => {
    const socket = new ThreadSocketClient({
      url: getThreadWebSocketURL(),
      onConnectionState: (connectionState) => createThreadWindowStore.getState().setConnectionState(connectionState),
      onNotification: (notification) => {
        createThreadWindowStore.getState().handleNotification(notification);
        if (notification.type === "thread.started") {
          setActiveThreadId(notification.threadId);
        }
      },
      onRequest: (request) => createThreadWindowStore.getState().handleRequest(request),
    });
    clientRef.current = socket;
    socket.connect();
    const disposeInitialPromptReceiver = installInitialPromptReceiver((payload) => {
      createThreadWindowStore.getState().enqueueInitialPrompt(payload);
      clientRef.current?.startInitialPrompt(payload);
    });

    return () => {
      disposeInitialPromptReceiver();
      socket.disconnect();
      if (clientRef.current === socket) {
        clientRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (state.connectionState !== "connected") {
      return;
    }
    const store = createThreadWindowStore.getState();
    for (const thread of Object.values(store.threadsById)) {
      const nextInput = store.takeNextQueuedInputForDispatch(thread.threadId);
      if (nextInput) {
        clientRef.current?.submitOp(thread.threadId, nextInput.op);
      }
    }
  }, [state.connectionState, queuedDispatchKey]);

  const handleNewThread = () => {
    const commandId = id('start');
    const timestamp = now();

    // 发送创建空白 thread 的命令
    clientRef.current?.sendRaw(
      encodeThreadStart({
        commandId,
        timestamp,
        workspaceId: null,  // 默认 workspace
        actionBinding: null,
      })
    );
  };

  return (
    <main
      className="grid h-screen w-full max-w-full overflow-hidden bg-app-canvas text-app-text-primary font-body [background-image:radial-gradient(circle_at_78%_-12%,var(--thread-window-glow-warm),transparent_34%),radial-gradient(circle_at_18%_104%,var(--thread-window-glow-cool),transparent_30%)]"
      style={{ gridTemplateColumns: sidebarLayout.gridTemplateColumns }}
    >
      {sidebarLayout.isSidebarVisible ? (
        <HistorySidebar
          history={state.history}
          activeThreadId={activeThreadId}
          onOpenThread={(threadId) => {
            createThreadWindowStore.getState().ensureThreadState(threadId);
            setActiveThreadId(threadId);
            clientRef.current?.resumeThread(threadId);
          }}
          onDeleteThread={(threadId) => {
            setDeleteTargetThreadId(threadId);
          }}
          onNewThread={handleNewThread}
        />
      ) : null}
      <section className="relative min-h-0 min-w-0 overflow-hidden">
        <ThreadWorkspacePane
          threadId={activeThreadId}
          connectionState={state.connectionState}
          windowErrorMessage={state.windowErrorMessage}
          onSubmit={(threadId, text) => {
            const latestThread = createThreadWindowStore.getState().threadsById[threadId];
            if (!latestThread) {
              return;
            }
            const shouldQueue =
              latestThread.status === "running"
              || latestThread.queuedInputDispatchPending
              || latestThread.queuedComposerInputs.length > 0;
            if (shouldQueue) {
              createThreadWindowStore.getState().queueComposerInput(threadId, {
                type: "user_input",
                opId: id("op"),
                timestamp: now(),
                payload: createUserInputFromText(text),
              });
              return;
            }
            createThreadWindowStore.getState().markComposerInputDispatchPending(threadId);
            clientRef.current?.submitOp(threadId, {
              type: "user_input",
              opId: id("op"),
              timestamp: now(),
              payload: createUserInputFromText(text),
            });
          }}
          onRemoveQueuedInput={(threadId, index) => {
            createThreadWindowStore.getState().removeQueuedComposerInput(threadId, index);
          }}
          onStop={(threadId) => {
            const latestThread = createThreadWindowStore.getState().threadsById[threadId];
            if (state.connectionState !== "connected" || latestThread?.status !== "running") {
              return;
            }
            clientRef.current?.submitOp(threadId, {
              type: "interrupt",
              opId: id("interrupt"),
              timestamp: now(),
              payload: { reason: "user" },
            });
          }}
          onAnswerPermission={(requestId, decision) => {
            clientRef.current?.sendRaw(encodePermissionAnswer({
              requestId,
              timestamp: now(),
              decision,
              scope: "thread",
            }));
            createThreadWindowStore.getState().resolvePermissionRequest(requestId);
          }}
          onAnswerWorkspace={(requestId, workspaceId) => {
            clientRef.current?.sendRaw(encodeWorkspaceAnswer({
              requestId,
              timestamp: now(),
              ...(workspaceId ? { workspaceId } : { cancelled: true }),
            }));
            createThreadWindowStore.getState().resolveWorkspaceRequest(requestId);
          }}
        />
        {deleteTargetThreadId ? (
          <div
            className="absolute inset-0 z-20 grid place-items-center bg-app-canvas/55 px-lg backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Delete thread"
          >
            <div className="w-full max-w-[360px] rounded-xl border border-app-hairline bg-app-surface-elevated p-lg text-app-text-primary shadow-[var(--thread-window-floating-shadow)]">
              <strong className="block text-base font-semibold">删除这个 thread？</strong>
              <p className="mt-xs text-sm leading-6 text-app-text-secondary">历史记录会从本地持久化中移除。</p>
              <div className="mt-md flex justify-end gap-xs">
                <button
                  type="button"
                  className="h-9 rounded-md bg-app-error px-sm text-sm font-medium text-app-on-accent transition-colors hover:bg-app-error/90 focus:outline-none focus:ring-4 focus:ring-app-accent-ring"
                  onClick={() => {
                    clientRef.current?.sendRaw(encodeThreadDelete({
                      commandId: id("delete"),
                      timestamp: now(),
                      targetThreadId: deleteTargetThreadId,
                    }));
                    setDeleteTargetThreadId(null);
                  }}
                >
                  删除
                </button>
                <button
                  type="button"
                  className="h-9 rounded-md border border-app-hairline bg-app-surface px-sm text-sm font-medium text-app-text-primary transition-colors hover:bg-app-surface-soft focus:outline-none focus:ring-4 focus:ring-app-accent-ring"
                  onClick={() => setDeleteTargetThreadId(null)}
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
