import SwiftUI

struct SessionWindowView: View {
    @Bindable var viewModel: SessionWindowViewModel
    @Environment(\.appTheme) private var theme
    @State private var draft = ""

    var body: some View {
        HStack(spacing: 0) {
            SessionHistorySidebarView(
                items: viewModel.historyList,
                activeSessionID: viewModel.activeTab?.sessionID,
                openSessionIDs: Set(viewModel.tabs.map(\.sessionID)),
                runningSessionIDs: Set(viewModel.tabs.filter { $0.status == "running" }.map(\.sessionID)),
                onSelect: viewModel.openHistorySession,
                onRequestDelete: viewModel.requestDeleteSession
            )
            .frame(width: 240)

            Divider().overlay(theme.colors.border)

            SessionWorkspaceView(
                tabs: viewModel.tabs,
                activeTabID: viewModel.activeTabID,
                activeTab: viewModel.activeTab,
                draft: $draft,
                onActivateTab: viewModel.activateTab,
                onCloseTab: viewModel.closeTab,
                onStopActiveTab: viewModel.stopActiveTab,
                onSendPrompt: { text in viewModel.sendPrompt(text) }
            )
        }
        .background(theme.colors.background)
        .alert("删除会话？", isPresented: pendingHistoryDeleteBinding) {
            Button("取消", role: .cancel) {
                viewModel.cancelDeleteSession()
            }
            Button("删除", role: .destructive) {
                viewModel.confirmDeleteSession()
            }
        } message: {
            Text("删除后无法恢复本地历史文件。")
        }
    }

    private var pendingHistoryDeleteBinding: Binding<Bool> {
        Binding(
            get: { viewModel.pendingHistoryDeletionID != nil },
            set: { isPresented in
                if !isPresented { viewModel.cancelDeleteSession() }
            }
        )
    }
}
