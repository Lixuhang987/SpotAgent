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

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
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
            }
        }
        .background(theme.colors.surface.opacity(0.4))
    }

    private var header: some View {
        HStack {
            Text("最近会话")
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.textSecondary)
            Spacer()
        }
        .padding(.horizontal, theme.spacing.md)
        .padding(.vertical, theme.spacing.sm)
    }
}

struct SessionHistoryRowView: View {
    let item: SessionListItem
    let isActive: Bool
    let isOpen: Bool
    let isRunning: Bool
    let onSelect: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: theme.spacing.sm) {
                    if isRunning {
                        Circle()
                            .fill(theme.colors.accent)
                            .frame(width: 6, height: 6)
                    }
                    Text(item.title ?? "未命名会话")
                        .font(theme.typography.bodyFont)
                        .foregroundStyle(isActive ? theme.colors.accent : theme.colors.textPrimary)
                        .lineLimit(1)
                    Spacer(minLength: theme.spacing.sm)
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
            .contentShape(Rectangle())
            .background(rowBackground)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }

    private var rowBackground: some ShapeStyle {
        isActive ? theme.colors.accentSubtle : theme.colors.surface.opacity(0.001)
    }
}
