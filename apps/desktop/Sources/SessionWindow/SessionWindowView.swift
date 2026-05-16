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
                messageList
                if let error = viewModel.error {
                    errorBanner(error)
                }
                ForEach(viewModel.pendingPermissionRequests) { request in
                    permissionBubble(request)
                }
                Divider().overlay(theme.colors.border)
                inputField
            }
        }
        .background(theme.colors.background)
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
                                    viewModel.deleteSession(item.id)
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
                .fill(viewModel.status == "running" ? theme.colors.accent : theme.colors.textSecondary.opacity(0.4))
                .frame(width: 8, height: 8)
            Text(viewModel.status)
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.textSecondary)
            Spacer()
        }
        .padding(.horizontal, theme.spacing.xl)
        .padding(.vertical, theme.spacing.md)
    }

    private var messageList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: theme.spacing.md) {
                ForEach(viewModel.messages) { message in
                    Text(message.text)
                        .messageBubble(role: message.role)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .padding(theme.spacing.xl)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
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

    private var inputField: some View {
        HStack(spacing: theme.spacing.md) {
            TextField("继续追问", text: $draft)
                .textFieldStyle(.plain)
                .font(theme.typography.bodyFont)
                .foregroundStyle(theme.colors.textPrimary)
                .onSubmit {
                    let currentDraft = draft
                    draft = ""
                    viewModel.sendPrompt(currentDraft)
                }
        }
        .padding(.horizontal, theme.spacing.xl)
        .padding(.vertical, theme.spacing.md)
    }
}
