import SwiftUI

struct ThreadWindowView: View {
    @Bindable var viewModel: ThreadWindowViewModel
    @Environment(\.appTheme) private var theme
    @State private var draft = ""
    @State private var workspaceVM = WorkspaceSettingsViewModel()

    var body: some View {
        HStack(spacing: 0) {
            ThreadHistorySidebarView(
                items: viewModel.historyList,
                workspaces: workspaceVM.workspaces,
                activeThreadID: viewModel.activeTab?.threadID,
                onSelect: viewModel.openHistoryThread,
                onRequestDelete: viewModel.requestDeleteThread,
                onNewThread: { viewModel.createNewThread() },
                onNewThreadInWorkspace: { wsId in viewModel.createNewThread(workspaceId: wsId) }
            )
            .frame(width: 240)

            ThreadWorkspaceView(
                tabs: viewModel.tabs,
                activeTabID: viewModel.activeTabID,
                activeTab: viewModel.activeTab,
                draft: $draft,
                onActivateTab: viewModel.activateTab,
                onCloseTab: viewModel.closeTab,
                onNewTab: { viewModel.createNewThread() },
                onStopActiveTab: viewModel.stopActiveTab,
                onSendPrompt: { text in
                    viewModel.sendPrompt(text, attachments: [])
                }
            )
        }
        .background(theme.colors.background)
        .onAppear { workspaceVM.reload() }
        .alert("删除thread？", isPresented: pendingHistoryDeleteBinding) {
            Button("取消", role: .cancel) {
                viewModel.cancelDeleteThread()
            }
            Button("删除", role: .destructive) {
                viewModel.confirmDeleteThread()
            }
        } message: {
            Text("删除后无法恢复本地历史文件。")
        }
    }

    private var pendingHistoryDeleteBinding: Binding<Bool> {
        Binding(
            get: { viewModel.pendingHistoryDeletionID != nil },
            set: { isPresented in
                if !isPresented { viewModel.cancelDeleteThread() }
            }
        )
    }
}
