import { useEffect, useRef, useState } from "react";
import { Composer } from "./components/Composer.tsx";
import { HistorySidebar } from "./components/HistorySidebar.tsx";
import { MessageList } from "./components/MessageList.tsx";
import { RequestPanels } from "./components/RequestPanels.tsx";
import { TabBar } from "./components/TabBar.tsx";
import { getThreadWebSocketURL, installInitialPromptReceiver } from "./native/nativeConfig.ts";
import {
  encodePermissionAnswer,
  encodeThreadDelete,
  encodeThreadStart,
  encodeTurnInterrupt,
  encodeWorkspaceAnswer,
} from "./protocol/threadProtocol.ts";
import { createThreadWindowStore } from "./store/threadWindowStore.ts";
import { ThreadSocketClient, type ConnectionState } from "./thread/threadSocketClient.ts";
import { getThreadWindowSidebarLayout } from "./utils/sidebarLayout.ts";

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function App() {
  const state = createThreadWindowStore();
  const tabs = Object.values(state.tabs);
  const activeTab = state.activeTabId ? state.tabs[state.activeTabId] : null;
  const clientRef = useRef<ThreadSocketClient | null>(null);
  const [deleteTargetThreadId, setDeleteTargetThreadId] = useState<string | null>(null);
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  const sidebarLayout = getThreadWindowSidebarLayout(windowWidth);

  useEffect(() => {
    const socket = new ThreadSocketClient({
      url: getThreadWebSocketURL(),
      onConnectionState: (connectionState) => createThreadWindowStore.getState().setConnectionState(connectionState),
      onNotification: (notification) => createThreadWindowStore.getState().handleNotification(notification),
      onRequest: (request) => createThreadWindowStore.getState().handleRequest(request),
      getOpenThreadIds: () => Object.keys(createThreadWindowStore.getState().tabs),
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
      className="grid w-screen min-h-screen overflow-hidden bg-canvas text-ink font-body"
      style={{ gridTemplateColumns: sidebarLayout.gridTemplateColumns }}
    >
      {sidebarLayout.isSidebarVisible ? (
        <HistorySidebar
          history={state.history}
          activeTabId={state.activeTabId}
          onOpenThread={(threadId) => {
            createThreadWindowStore.getState().openHistoryThread(threadId);
            clientRef.current?.resumeThread(threadId);
          }}
          onDeleteThread={(threadId) => {
            setDeleteTargetThreadId(threadId);
          }}
          onNewThread={handleNewThread}
        />
      ) : null}
      <section className="grid grid-rows-[auto_auto_1fr_auto] min-w-0 min-h-screen overflow-hidden bg-surface-dark text-on-dark shadow-product-inner" aria-label="Thread workspace">
        <header className="flex items-center gap-3 min-h-[52px] border-b border-white/10 bg-surface-dark-soft px-sm py-xs">
          <TabBar
            tabs={tabs}
            activeTabId={state.activeTabId}
            onActivate={(threadId) => createThreadWindowStore.setState({ activeTabId: threadId })}
            onClose={(threadId) => createThreadWindowStore.getState().closeTab(threadId)}
          />
        </header>

        {state.windowErrorMessage ? (
          <div className="mx-sm mt-xs rounded-md border border-error/30 bg-error/10 px-sm py-xs text-sm text-error">
            {state.windowErrorMessage}
          </div>
        ) : null}

        {activeTab ? (
          <>
            <div className="grid grid-rows-[1fr_auto] min-w-0 min-h-0 overflow-hidden">
              <MessageList
                messages={activeTab.messages}
                errorMessage={activeTab.errorMessage}
                isRunning={activeTab.status === 'running'}
              />
              <RequestPanels
                permissionRequests={activeTab.permissionRequests}
                workspaceRequests={activeTab.workspaceRequests}
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
            </div>
            <Composer
              disabled={state.connectionState !== "connected" || activeTab.status === "running"}
              stopDisabled={state.connectionState !== "connected" || activeTab.status !== "running"}
              onSubmit={(text) => clientRef.current?.startTurn(activeTab.threadId, text)}
              onStop={() => {
                if (state.connectionState !== "connected" || activeTab.status !== "running") {
                  return;
                }
                clientRef.current?.sendRaw(encodeTurnInterrupt({
                  threadId: activeTab.threadId,
                  commandId: id("interrupt"),
                  timestamp: now(),
                }));
              }}
            />
          </>
        ) : (
          <div className="flex items-center justify-center text-sm text-on-dark-soft">
            <div className="rounded-lg border border-white/10 bg-surface-dark-elevated px-lg py-md">
              准备开始
            </div>
          </div>
        )}
        {deleteTargetThreadId ? (
          <div className="delete-confirmation" role="dialog" aria-modal="true" aria-label="Delete thread">
            <div className="delete-confirmation-body">
              <strong>删除这个 thread？</strong>
              <p>历史记录会从本地持久化中移除。</p>
              <div className="request-actions">
                <button
                  type="button"
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
                <button type="button" onClick={() => setDeleteTargetThreadId(null)}>
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
