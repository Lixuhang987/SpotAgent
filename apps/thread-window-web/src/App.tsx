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

function now() {
  return new Date().toISOString();
}

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function connectionLabel(connectionState: ConnectionState) {
  switch (connectionState) {
    case "connected":
      return "connected";
    case "connecting":
      return "connecting";
    case "reconnecting":
      return "reconnecting";
    case "disconnected":
      return "disconnected";
  }
}

export function App() {
  const state = createThreadWindowStore();
  const tabs = Object.values(state.tabs);
  const activeTab = state.activeTabId ? state.tabs[state.activeTabId] : null;
  const clientRef = useRef<ThreadSocketClient | null>(null);
  const [deleteTargetThreadId, setDeleteTargetThreadId] = useState<string | null>(null);

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
    <main className="thread-window-shell">
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
      <section className="thread-workspace" aria-label="Thread workspace">
        <header className="thread-toolbar">
          <TabBar
            tabs={tabs}
            activeTabId={state.activeTabId}
            onActivate={(threadId) => createThreadWindowStore.setState({ activeTabId: threadId })}
            onClose={(threadId) => createThreadWindowStore.getState().closeTab(threadId)}
          />
          <div className="connection-pill" data-state={state.connectionState}>
            {connectionLabel(state.connectionState)}
          </div>
        </header>

        {state.windowErrorMessage ? <div className="window-error">{state.windowErrorMessage}</div> : null}

        {activeTab ? (
          <>
            <div className="thread-main-region">
              <MessageList messages={activeTab.messages} errorMessage={activeTab.errorMessage} />
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
          <div className="thread-empty-state">准备开始</div>
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
