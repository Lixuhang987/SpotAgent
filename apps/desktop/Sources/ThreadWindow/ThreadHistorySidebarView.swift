import SwiftUI

struct ThreadHistorySidebarView: View {
    let items: [ThreadListItem]
    let workspaces: [WorkspaceEntry]
    let activeThreadID: String?
    let onSelect: (String) -> Void
    let onRequestDelete: (String) -> Void
    let onNewThread: () -> Void
    let onNewThreadInWorkspace: (String) -> Void

    @Environment(\.appTheme) private var theme
    @State private var searchText = ""
    @State private var isSearching = false
    @State private var expandedWorkspaces: Set<String> = []

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
                Button(action: onNewThread) {
                    HStack(spacing: theme.spacing.xs) {
                        Image(systemName: "plus.bubble")
                            .font(.system(size: 13))
                        Text("新thread")
                            .font(theme.typography.bodyFont)
                    }
                    .foregroundStyle(theme.colors.textPrimary)
                    .padding(.horizontal, theme.spacing.sm)
                    .padding(.vertical, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("新thread")

                Spacer()

                Button(action: { isSearching = true }) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 13))
                        .foregroundStyle(theme.colors.textSecondary)
                        .frame(width: 28, height: 28)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("搜索thread")
            }
        }
        .padding(.horizontal, theme.spacing.md)
        .padding(.top, theme.spacing.lg)
        .padding(.bottom, theme.spacing.sm)
    }

    private var scrollableContent: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: theme.spacing.xs) {
                if searchText.isEmpty {
                    groupedContent
                } else {
                    filteredFlatContent
                }
            }
            .padding(.horizontal, theme.spacing.sm)
            .padding(.vertical, theme.spacing.xs)
        }
        .frame(maxHeight: .infinity)
    }

    // MARK: - Grouped Content

    @ViewBuilder
    private var groupedContent: some View {
        let nonDefaultWorkspaces = workspaces.filter { !$0.isDefault }

        ForEach(nonDefaultWorkspaces) { workspace in
            workspaceSection(workspace)
        }

        if !nonDefaultWorkspaces.isEmpty {
            defaultSectionDivider
        }

        ForEach(defaultThreads) { item in
            threadRow(item)
        }
    }

    // MARK: - Workspace Section

    private func workspaceSection(_ workspace: WorkspaceEntry) -> some View {
        let threads = items.filter { $0.workspaceId == workspace.id }
        let isExpanded = expandedWorkspaces.contains(workspace.id)

        return VStack(alignment: .leading, spacing: 0) {
            workspaceSectionHeader(workspace: workspace, isExpanded: isExpanded)

            if isExpanded {
                ForEach(threads) { item in
                    threadRow(item)
                        .padding(.leading, theme.spacing.md)
                }
            }
        }
    }

    private func workspaceSectionHeader(workspace: WorkspaceEntry, isExpanded: Bool) -> some View {
        HStack(spacing: theme.spacing.sm) {
            Button(action: { toggleWorkspace(workspace.id) }) {
                HStack(spacing: theme.spacing.sm) {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(theme.colors.textSecondary)
                        .frame(width: 12)

                    Image(systemName: "folder")
                        .font(.system(size: 12))
                        .foregroundStyle(theme.colors.textSecondary)

                    Text(workspace.name)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textPrimary)
                        .lineLimit(1)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Spacer()

            Button(action: { onNewThreadInWorkspace(workspace.id) }) {
                Image(systemName: "plus")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(theme.colors.textSecondary)
                    .frame(width: 22, height: 22)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("在 \(workspace.name) 中新建thread")
        }
        .padding(.horizontal, theme.spacing.sm)
        .padding(.vertical, theme.spacing.xs)
    }

    // MARK: - Default Section

    private var defaultSectionDivider: some View {
        HStack(spacing: theme.spacing.sm) {
            Rectangle()
                .fill(theme.colors.border)
                .frame(height: 1)
            Text("默认")
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.textSecondary)
            Rectangle()
                .fill(theme.colors.border)
                .frame(height: 1)
        }
        .padding(.horizontal, theme.spacing.sm)
        .padding(.vertical, theme.spacing.sm)
    }

    private var defaultThreads: [ThreadListItem] {
        items.filter { $0.workspaceId == nil }
    }

    // MARK: - Flat Filtered Content

    private var filteredFlatContent: some View {
        ForEach(filteredItems) { item in
            threadRow(item)
        }
    }

    // MARK: - Thread Row

    private func threadRow(_ item: ThreadListItem) -> some View {
        ThreadHistoryRowView(
            item: item,
            isActive: activeThreadID == item.id,
            onSelect: { onSelect(item.id) }
        )
        .contextMenu {
            Button("删除", role: .destructive) {
                onRequestDelete(item.id)
            }
        }
    }

    // MARK: - Helpers

    private func toggleWorkspace(_ id: String) {
        if expandedWorkspaces.contains(id) {
            expandedWorkspaces.remove(id)
        } else {
            expandedWorkspaces.insert(id)
        }
    }

    private var filteredItems: [ThreadListItem] {
        guard !searchText.isEmpty else { return items }
        return items.filter { item in
            (item.title ?? "").localizedCaseInsensitiveContains(searchText)
        }
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
}

struct ThreadHistoryRowView: View {
    let item: ThreadListItem
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

                Text(item.title ?? "未命名thread")
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
