import SwiftUI

struct SessionHistorySidebarView: View {
    let items: [SessionListItem]
    let activeSessionID: String?
    let openSessionIDs: Set<String>
    let runningSessionIDs: Set<String>
    let onSelect: (String) -> Void
    let onRequestDelete: (String) -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            Divider().overlay(theme.colors.border)

            if items.isEmpty {
                SessionHistoryEmptyView()
            } else {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: theme.spacing.xs) {
                        ForEach(items) { item in
                            SessionHistoryRowView(
                                item: item,
                                isActive: activeSessionID == item.id,
                                isOpen: openSessionIDs.contains(item.id),
                                isRunning: runningSessionIDs.contains(item.id),
                                onSelect: { onSelect(item.id) }
                            )
                            .contextMenu {
                                Button("删除", role: .destructive) {
                                    onRequestDelete(item.id)
                                }
                            }
                        }
                    }
                    .padding(theme.spacing.sm)
                }
            }
        }
        .background(theme.colors.surface.opacity(0.30))
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 3) {
                Text("会话")
                    .font(theme.typography.titleFont)
                    .foregroundStyle(theme.colors.textPrimary)
                Text("\(items.count) 条历史")
                    .font(theme.typography.captionFont)
                    .foregroundStyle(theme.colors.textSecondary)
            }
            Spacer()
        }
        .padding(.horizontal, theme.spacing.lg)
        .padding(.top, theme.spacing.xl)
        .padding(.bottom, theme.spacing.md)
    }
}

struct SessionHistoryEmptyView: View {
    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: theme.spacing.sm) {
            Image(systemName: "tray")
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(theme.colors.textSecondary)
                .accessibilityHidden(true)
            Text("还没有历史会话")
                .font(theme.typography.bodyFont)
                .foregroundStyle(theme.colors.textPrimary)
            Text("从底部输入发送第一条消息后，会话会出现在这里。")
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(theme.spacing.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct SessionHistoryRowView: View {
    let item: SessionListItem
    let isActive: Bool
    let isOpen: Bool
    let isRunning: Bool
    let onSelect: () -> Void

    @Environment(\.appTheme) private var theme
    @State private var isHovering = false

    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: theme.spacing.xs) {
                HStack(spacing: theme.spacing.sm) {
                    SessionHistoryStatusDot(isRunning: isRunning, isOpen: isOpen, isActive: isActive)
                    Text(item.title ?? "未命名会话")
                        .font(theme.typography.bodyFont)
                        .foregroundStyle(isActive ? theme.colors.textPrimary : theme.colors.textPrimary.opacity(0.9))
                        .lineLimit(1)
                    Spacer(minLength: theme.spacing.sm)
                    if isOpen {
                        SessionHistoryBadge(label: isActive ? "当前" : "已打开")
                    }
                }

                HStack(spacing: theme.spacing.sm) {
                    Text("\(item.messageCount) 条消息")
                    if isRunning {
                        Text("运行中")
                    }
                }
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.textSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, theme.spacing.md)
            .padding(.vertical, theme.spacing.sm)
            .contentShape(Rectangle())
            .background(rowBackground)
            .clipShape(RoundedRectangle(cornerRadius: theme.radius.sm))
            .overlay(
                RoundedRectangle(cornerRadius: theme.radius.sm)
                    .strokeBorder(rowBorder, lineWidth: 0.75)
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
        .onHover { isHovering = $0 }
    }

    private var rowBackground: Color {
        if isActive { return theme.colors.accentSubtle }
        if isHovering { return theme.colors.surface.opacity(0.64) }
        return theme.colors.surface.opacity(0.001)
    }

    private var rowBorder: Color {
        isActive ? theme.colors.accentRing : theme.colors.border.opacity(isHovering ? 0.95 : 0)
    }
}

struct SessionHistoryStatusDot: View {
    let isRunning: Bool
    let isOpen: Bool
    let isActive: Bool

    @Environment(\.appTheme) private var theme

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 7, height: 7)
            .accessibilityHidden(true)
    }

    private var color: Color {
        if isRunning { return theme.colors.accent }
        if isActive { return theme.colors.accentHover }
        if isOpen { return theme.colors.textSecondary.opacity(0.55) }
        return theme.colors.textSecondary.opacity(0.25)
    }
}

struct SessionHistoryBadge: View {
    let label: String

    @Environment(\.appTheme) private var theme

    var body: some View {
        Text(label)
            .font(theme.typography.captionFont)
            .foregroundStyle(theme.colors.textSecondary)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(theme.colors.surface.opacity(0.65))
            .clipShape(RoundedRectangle(cornerRadius: theme.radius.sm))
    }
}
