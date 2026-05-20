import SwiftUI

struct SessionWindowView: View {
    @Bindable var viewModel: SessionWindowViewModel
    @Environment(\.appTheme) private var theme
    @State private var draft = ""

    var body: some View {
        HStack(spacing: 0) {
            historySidebar
                .frame(width: 240)
            Divider().overlay(theme.colors.border)
            VStack(spacing: 0) {
                statusHeader
                tabBar
                Divider().overlay(theme.colors.border)
                if let connectionMessage = activeTab?.connectionMessage {
                    connectionBanner(connectionMessage)
                }
                if let activeTab {
                    messageList(activeTab)
                    if let error = activeTab.error {
                        errorBanner(error)
                    }
                    ForEach(activeTab.pendingPermissionRequests) { request in
                        permissionBubble(request, tab: activeTab)
                    }
                    if let request = activeTab.visibleWorkspaceAskRequest {
                        workspaceAskBubble(request, tab: activeTab)
                    }
                } else {
                    emptyState
                }
                Divider().overlay(theme.colors.border)
                inputField
            }
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

    private var activeTab: SessionTabViewModel? { viewModel.activeTab }

    private var historySidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("最近会话")
                    .font(theme.typography.captionFont)
                    .foregroundStyle(theme.colors.textSecondary)
                Spacer()
                Button {
                    viewModel.refreshHistory()
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 11))
                        .foregroundStyle(theme.colors.textSecondary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, theme.spacing.md)
            .padding(.vertical, theme.spacing.sm)

            Divider().overlay(theme.colors.border)

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(viewModel.historyList) { item in
                        historyRow(item)
                            .contextMenu {
                                Button("删除", role: .destructive) {
                                    viewModel.requestDeleteSession(item.id)
                                }
                            }
                    }
                }
            }
        }
        .background(theme.colors.surface.opacity(0.4))
    }

    private func historyRow(_ item: SessionListItem) -> some View {
        let isOpen = viewModel.tabs.contains { $0.sessionID == item.id }
        let isActive = activeTab?.sessionID == item.id
        let running = viewModel.tabs.first { $0.sessionID == item.id }?.status == "running"
        return Button {
            viewModel.openHistorySession(item.id)
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: theme.spacing.sm) {
                    if running {
                        Circle()
                            .fill(theme.colors.accent)
                            .frame(width: 6, height: 6)
                    }
                    Text(item.title ?? "未命名会话")
                        .font(theme.typography.bodyFont)
                        .foregroundStyle(isActive ? theme.colors.accent : theme.colors.textPrimary)
                        .lineLimit(1)
                    Spacer()
                    if isOpen {
                        Image(systemName: "rectangle.on.rectangle")
                            .font(.system(size: 10))
                            .foregroundStyle(theme.colors.textSecondary)
                    }
                }
                Text("\(item.messageCount) 条")
                    .font(theme.typography.captionFont)
                    .foregroundStyle(theme.colors.textSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, theme.spacing.md)
            .padding(.vertical, theme.spacing.sm)
            .background(isActive ? theme.colors.accentSubtle : Color.clear)
        }
        .buttonStyle(.plain)
    }

    private var statusHeader: some View {
        HStack(spacing: theme.spacing.sm) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)
            Text(statusLabel)
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.textSecondary)
            Spacer()
            if activeTab?.status == "running" {
                Button {
                    viewModel.stopActiveTab()
                } label: {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 11))
                        .foregroundStyle(theme.colors.error)
                }
                .buttonStyle(.plain)
                .help("停止当前 run")
            }
        }
        .padding(.horizontal, theme.spacing.xl)
        .padding(.vertical, theme.spacing.md)
    }

    private var tabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: theme.spacing.xs) {
                ForEach(viewModel.tabs) { tab in
                    Button {
                        viewModel.activateTab(tab.tabID)
                    } label: {
                        HStack(spacing: theme.spacing.xs) {
                            if tab.status == "running" {
                                Circle().fill(theme.colors.accent).frame(width: 6, height: 6)
                            }
                            Text(tab.messages.first?.text ?? tab.sessionID)
                                .lineLimit(1)
                            Image(systemName: "xmark")
                                .font(.system(size: 10))
                        }
                        .font(theme.typography.captionFont)
                        .padding(.horizontal, theme.spacing.sm)
                        .padding(.vertical, theme.spacing.xs)
                        .background(
                            tab.tabID == viewModel.activeTabID
                            ? theme.colors.accentSubtle
                            : theme.colors.surface.opacity(0.45)
                        )
                    }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button("关闭") { viewModel.closeTab(tab.tabID) }
                    }
                }
            }
            .padding(.horizontal, theme.spacing.md)
            .padding(.vertical, theme.spacing.xs)
        }
    }

    private var statusColor: Color {
        guard let activeTab else {
            return theme.colors.textSecondary.opacity(0.4)
        }
        switch activeTab.connectionState {
        case .connected:
            return activeTab.status == "running" ? theme.colors.accent : theme.colors.textSecondary.opacity(0.4)
        case .connecting, .reconnecting:
            return theme.colors.accent
        case .disconnected:
            return theme.colors.error
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

    private var statusLabel: String {
        guard let activeTab else { return "idle" }
        switch activeTab.connectionState {
        case .connected:
            return activeTab.status
        case .connecting:
            return "connecting"
        case .reconnecting:
            return "reconnecting"
        case .disconnected:
            return "disconnected"
        }
    }

    private func messageList(_ tab: SessionTabViewModel) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: theme.spacing.md) {
                ForEach(tab.messages) { message in
                    messageBubble(message)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .padding(theme.spacing.xl)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var emptyState: some View {
        VStack(spacing: theme.spacing.sm) {
            Text("选择左侧会话继续")
                .font(theme.typography.titleFont)
                .foregroundStyle(theme.colors.textPrimary)
            Text("也可以直接发送消息创建新会话。")
                .font(theme.typography.bodyFont)
                .foregroundStyle(theme.colors.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func messageBubble(_ message: SessionBubble) -> some View {
        VStack(alignment: .leading, spacing: theme.spacing.sm) {
            Text(message.text)
                .frame(maxWidth: .infinity, alignment: .leading)

            if let attachmentSummaryText = message.attachmentSummaryText {
                Text(attachmentSummaryText)
                    .font(theme.typography.captionFont)
                    .foregroundStyle(theme.colors.textSecondary)

                ForEach(message.attachments) { attachment in
                    attachmentRow(attachment)
                }
            }
        }
        .messageBubble(role: message.role)
    }

    private func attachmentRow(_ attachment: SessionAttachmentSummary) -> some View {
        HStack(alignment: .top, spacing: theme.spacing.sm) {
            Image(systemName: attachment.kind == "image" ? "photo" : "text.quote")
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.accent)
                .frame(width: theme.spacing.lg)
            VStack(alignment: .leading, spacing: theme.spacing.xs) {
                HStack(spacing: theme.spacing.sm) {
                    Text(attachment.title)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textPrimary)
                    Text(attachment.kind)
                        .font(theme.typography.captionFont.monospaced())
                        .foregroundStyle(theme.colors.textSecondary)
                }
                if let detail = attachment.detail, !detail.isEmpty {
                    Text(detail)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textSecondary)
                        .lineLimit(2)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func connectionBanner(_ message: String) -> some View {
        HStack(spacing: theme.spacing.sm) {
            Image(systemName: "wifi.exclamationmark")
                .foregroundStyle(theme.colors.accent)
                .font(.system(size: 12))
            Text(message)
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.textSecondary)
        }
        .padding(.horizontal, theme.spacing.xl)
        .padding(.vertical, theme.spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.colors.accentSubtle)
    }

    private func errorBanner(_ error: String) -> some View {
        HStack(spacing: theme.spacing.sm) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(theme.colors.error)
                .font(.system(size: 12))
            Text(error)
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.error)
        }
        .padding(.horizontal, theme.spacing.xl)
        .padding(.vertical, theme.spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.colors.error.opacity(0.08))
    }

    private func permissionBubble(_ request: SessionPermissionRequest, tab: SessionTabViewModel) -> some View {
        VStack(alignment: .leading, spacing: theme.spacing.sm) {
            HStack(spacing: theme.spacing.sm) {
                Image(systemName: "lock.shield")
                    .foregroundStyle(theme.colors.accent)
                    .font(.system(size: 14, weight: .medium))
                Text("授权调用 \(request.toolName)")
                    .font(theme.typography.bodyFont)
                    .foregroundStyle(theme.colors.textPrimary)
                Spacer()
            }
            if request.argumentsJSON != "{}" {
                Text(request.argumentsJSON)
                    .font(theme.typography.captionFont.monospaced())
                    .foregroundStyle(theme.colors.textSecondary)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            HStack(spacing: theme.spacing.sm) {
                permissionButton("拒绝", role: "deny", scope: nil, requestId: request.id, accent: false, tab: tab)
                permissionButton("仅本次", role: "allow", scope: "once", requestId: request.id, accent: true, tab: tab)
                permissionButton("本会话", role: "allow", scope: "session", requestId: request.id, accent: true, tab: tab)
                permissionButton("始终允许", role: "allow", scope: "always", requestId: request.id, accent: true, tab: tab)
            }
        }
        .padding(.horizontal, theme.spacing.xl)
        .padding(.vertical, theme.spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.colors.accentSubtle)
    }

    private func permissionButton(
        _ label: String,
        role: String,
        scope: String?,
        requestId: String,
        accent: Bool,
        tab: SessionTabViewModel
    ) -> some View {
        Button {
            tab.resolvePermission(requestId: requestId, decision: role, scope: scope)
        } label: {
            Text(label)
                .font(theme.typography.captionFont)
                .foregroundStyle(accent ? theme.colors.accent : theme.colors.textSecondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    RoundedRectangle(cornerRadius: theme.radius.sm)
                        .fill(theme.colors.surface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: theme.radius.sm)
                        .strokeBorder(theme.colors.border, lineWidth: 0.5)
                )
        }
        .buttonStyle(.plain)
    }

    private func workspaceAskBubble(_ request: SessionWorkspaceAskRequest, tab: SessionTabViewModel) -> some View {
        VStack(alignment: .leading, spacing: theme.spacing.sm) {
            HStack(spacing: theme.spacing.sm) {
                Image(systemName: "folder.badge.questionmark")
                    .foregroundStyle(theme.colors.accent)
                    .font(.system(size: 14, weight: .medium))
                Text(request.prompt)
                    .font(theme.typography.bodyFont)
                    .foregroundStyle(theme.colors.textPrimary)
                Spacer()
            }
            VStack(alignment: .leading, spacing: theme.spacing.xs) {
                ForEach(request.candidates) { candidate in
                    Button {
                        tab.resolveWorkspaceAsk(requestId: request.id, workspaceId: candidate.id)
                    } label: {
                        HStack(alignment: .top, spacing: theme.spacing.sm) {
                            Image(systemName: candidate.isDefault ? "folder.fill.badge.gearshape" : "folder")
                                .font(.system(size: 13))
                                .foregroundStyle(theme.colors.accent)
                                .frame(width: theme.spacing.lg)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(candidate.name)
                                    .font(theme.typography.bodyFont)
                                    .foregroundStyle(theme.colors.textPrimary)
                                Text(candidate.description)
                                    .font(theme.typography.captionFont)
                                    .foregroundStyle(theme.colors.textSecondary)
                                    .lineLimit(2)
                            }
                            Spacer()
                        }
                        .padding(.horizontal, theme.spacing.sm)
                        .padding(.vertical, theme.spacing.sm)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(theme.colors.surface)
                        .overlay(
                            RoundedRectangle(cornerRadius: theme.radius.sm)
                                .strokeBorder(theme.colors.border, lineWidth: 0.5)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            Button {
                tab.resolveWorkspaceAsk(requestId: request.id, workspaceId: nil)
            } label: {
                Text("取消")
                    .font(theme.typography.captionFont)
                    .foregroundStyle(theme.colors.textSecondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(
                        RoundedRectangle(cornerRadius: theme.radius.sm)
                            .fill(theme.colors.surface)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: theme.radius.sm)
                            .strokeBorder(theme.colors.border, lineWidth: 0.5)
                    )
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, theme.spacing.xl)
        .padding(.vertical, theme.spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.colors.accentSubtle)
    }

    private var inputField: some View {
        HStack(spacing: theme.spacing.md) {
            TextField("继续追问", text: $draft)
                .textFieldStyle(.plain)
                .font(theme.typography.bodyFont)
                .foregroundStyle(theme.colors.textPrimary)
                .disabled(!canSendPrompt)
                .onSubmit {
                    guard canSendPrompt else { return }
                    let currentDraft = draft
                    draft = ""
                    viewModel.sendPrompt(currentDraft)
                }
        }
        .padding(.horizontal, theme.spacing.xl)
        .padding(.vertical, theme.spacing.md)
    }

    private var canSendPrompt: Bool {
        activeTab?.canSendPrompt ?? true
    }
}
