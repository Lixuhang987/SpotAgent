import SwiftUI

struct SessionHistorySidebarView: View {
    let items: [SessionListItem]
    let activeSessionID: String?
    let onSelect: (String) -> Void
    let onRequestDelete: (String) -> Void
    let onNewSession: () -> Void

    @Environment(\.appTheme) private var theme
    @State private var searchText = ""
    @State private var isSearching = false

    var body: some View {
        VStack(spacing: 0) {
            sidebarHeader
            scrollableContent
            sidebarFooter
        }
        .background(theme.colors.surface)
    }

    private var sidebarHeader: some View {
        HStack(spacing: theme.spacing.sm) {
            if isSearching {
                HStack(spacing: theme.spacing.sm) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 13))
                        .foregroundStyle(theme.colors.textSecondary)
                    TextField("搜索", text: $searchText)
                        .textFieldStyle(.plain)
                        .font(theme.typography.bodyFont)
                        .foregroundStyle(theme.colors.textPrimary)
                    Button(action: { isSearching = false; searchText = "" }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(theme.colors.textSecondary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, theme.spacing.sm)
                .padding(.vertical, 6)
                .background(theme.colors.surfaceHover)
                .clipShape(RoundedRectangle(cornerRadius: theme.radius.sm))
            } else {
                Button(action: onNewSession) {
                    HStack(spacing: theme.spacing.xs) {
                        Image(systemName: "plus.bubble")
                            .font(.system(size: 13))
                        Text("新会话")
                            .font(theme.typography.bodyFont)
                    }
                    .foregroundStyle(theme.colors.textPrimary)
                    .padding(.horizontal, theme.spacing.sm)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("新会话")

                Spacer()

                Button(action: { isSearching = true }) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 13))
                        .foregroundStyle(theme.colors.textSecondary)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("搜索会话")
            }
        }
        .padding(.horizontal, theme.spacing.md)
        .padding(.top, theme.spacing.lg)
        .padding(.bottom, theme.spacing.sm)
    }

    private var scrollableContent: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: theme.spacing.xs) {
                ForEach(filteredItems) { item in
                    SessionHistoryRowView(
                        item: item,
                        isActive: activeSessionID == item.id,
                        onSelect: { onSelect(item.id) }
                    )
                    .contextMenu {
                        Button("删除", role: .destructive) {
                            onRequestDelete(item.id)
                        }
                    }
                }
            }
            .padding(.horizontal, theme.spacing.sm)
            .padding(.vertical, theme.spacing.xs)
        }
        .frame(maxHeight: .infinity)
    }

    private var sidebarFooter: some View {
        VStack(spacing: 0) {
            Divider().overlay(theme.colors.border)

            Button(action: {}) {
                HStack(spacing: theme.spacing.sm) {
                    Image(systemName: "gearshape")
                        .font(.system(size: 13))
                    Text("设置")
                        .font(theme.typography.bodyFont)
                }
                .foregroundStyle(theme.colors.textSecondary)
                .padding(.horizontal, theme.spacing.md)
                .padding(.vertical, theme.spacing.sm)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("设置")
        }
    }

    private var filteredItems: [SessionListItem] {
        guard !searchText.isEmpty else { return items }
        return items.filter { item in
            (item.title ?? "").localizedCaseInsensitiveContains(searchText)
        }
    }
}

struct SessionHistoryRowView: View {
    let item: SessionListItem
    let isActive: Bool
    let onSelect: () -> Void

    @Environment(\.appTheme) private var theme
    @State private var isHovering = false

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 0) {
                if isActive {
                    RoundedRectangle(cornerRadius: 1)
                        .fill(theme.colors.accent)
                        .frame(width: 2, height: 16)
                        .padding(.trailing, theme.spacing.sm)
                }

                Text(item.title ?? "未命名会话")
                    .font(theme.typography.bodyFont)
                    .foregroundStyle(theme.colors.textPrimary)
                    .lineLimit(1)

                Spacer()
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, theme.spacing.md)
            .padding(.vertical, theme.spacing.sm)
            .contentShape(Rectangle())
            .background(rowBackground)
            .clipShape(RoundedRectangle(cornerRadius: theme.radius.md))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
        .onHover { isHovering = $0 }
    }

    private var rowBackground: Color {
        if isActive || isHovering { return theme.colors.surfaceHover }
        return .clear
    }
}
