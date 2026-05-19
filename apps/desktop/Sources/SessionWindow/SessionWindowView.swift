import SwiftUI

struct SessionWindowView: View {
    @Bindable var viewModel: SessionViewModel
    @Environment(\.appTheme) private var theme
    @State private var draft = ""
    @State private var sidebarVisible = false

    var body: some View {
        HStack(spacing: 0) {
            if sidebarVisible {
                historySidebar
                    .frame(width: 220)
                    .transition(.move(edge: .leading))
                Divider().overlay(theme.colors.border)
            }
            VStack(spacing: 0) {
                statusHeader
                Divider().overlay(theme.colors.border)
                if let connectionMessage = viewModel.connectionMessage {
                    connectionBanner(connectionMessage)
                }
                messageList
                if let error = viewModel.error {
                    errorBanner(error)
                }
                ForEach(viewModel.pendingPermissionRequests) { request in
                    permissionBubble(request)
                }
                if let request = viewModel.visibleWorkspaceAskRequest {
                    workspaceAskBubble(request)
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
        let isCurrent = item.id == viewModel.sessionID
        return Button {
            if !isCurrent {
                viewModel.restoreSession(item.id)
            }
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title ?? "未命名会话")
                    .font(theme.typography.bodyFont)
                    .foregroundStyle(isCurrent ? theme.colors.accent : theme.colors.textPrimary)
                    .lineLimit(1)
                Text("\(item.messageCount) 条")
                    .font(theme.typography.captionFont)
                    .foregroundStyle(theme.colors.textSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, theme.spacing.md)
            .padding(.vertical, theme.spacing.sm)
            .background(isCurrent ? theme.colors.accentSubtle : Color.clear)
        }
        .buttonStyle(.plain)
    }

    private var statusHeader: some View {
        HStack(spacing: theme.spacing.sm) {
            Button {
                withAnimation(.easeInOut(duration: 0.15)) {
                    sidebarVisible.toggle()
                }
                if sidebarVisible {
                    viewModel.refreshHistory()
                }
            } label: {
                Image(systemName: "sidebar.left")
                    .font(.system(size: 12))
                    .foregroundStyle(theme.colors.textSecondary)
            }
            .buttonStyle(.plain)
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)
            Text(statusLabel)
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.textSecondary)
            Spacer()
            if viewModel.status == "running" {
                Button {
                    viewModel.stop()
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

    private var statusColor: Color {
        switch viewModel.connectionState {
        case .connected:
            return viewModel.status == "running" ? theme.colors.accent : theme.colors.textSecondary.opacity(0.4)
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
        switch viewModel.connectionState {
        case .connected:
            return viewModel.status
        case .connecting:
            return "connecting"
        case .reconnecting:
            return "reconnecting"
        case .disconnected:
            return "disconnected"
        }
    }

    private var messageList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: theme.spacing.md) {
                ForEach(viewModel.messages) { message in
                    messageBubble(message)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .padding(theme.spacing.xl)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
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

    private func permissionBubble(_ request: SessionPermissionRequest) -> some View {
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
                permissionButton("拒绝", role: "deny", scope: nil, requestId: request.id, accent: false)
                permissionButton("仅本次", role: "allow", scope: "once", requestId: request.id, accent: true)
                permissionButton("本会话", role: "allow", scope: "session", requestId: request.id, accent: true)
                permissionButton("始终允许", role: "allow", scope: "always", requestId: request.id, accent: true)
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
        accent: Bool
    ) -> some View {
        Button {
            viewModel.resolvePermission(requestId: requestId, decision: role, scope: scope)
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

    private func workspaceAskBubble(_ request: SessionWorkspaceAskRequest) -> some View {
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
                        viewModel.resolveWorkspaceAsk(requestId: request.id, workspaceId: candidate.id)
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
                viewModel.resolveWorkspaceAsk(requestId: request.id, workspaceId: nil)
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
                .disabled(!viewModel.canSendPrompt)
                .onSubmit {
                    guard viewModel.canSendPrompt else { return }
                    let currentDraft = draft
                    draft = ""
                    viewModel.sendPrompt(currentDraft)
                }
        }
        .padding(.horizontal, theme.spacing.xl)
        .padding(.vertical, theme.spacing.md)
    }
}
