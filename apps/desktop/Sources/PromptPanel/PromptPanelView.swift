import SwiftUI

struct PromptPanelView: View {
    @Bindable var viewModel: PromptPanelViewModel
    @Environment(\.appTheme) private var theme
    @FocusState private var isQueryFocused: Bool
    @State private var hoveredActionId: String?

    var body: some View {
        VStack(spacing: theme.spacing.lg) {
            inputField
            Divider()
                .overlay(theme.colors.border)
            actionList
        }
        .promptPanelContainer()
        .onAppear { isQueryFocused = true }
        .onChange(of: viewModel.focusSeed) { _, _ in isQueryFocused = true }
    }

    private var inputField: some View {
        HStack(spacing: theme.spacing.md) {
            Image(systemName: "sparkles")
                .foregroundStyle(theme.colors.accent)
                .font(.system(size: 16, weight: .medium))
            TextField("输入你的请求", text: $viewModel.draft)
                .textFieldStyle(.plain)
                .font(theme.typography.promptInputFont)
                .foregroundStyle(theme.colors.textPrimary)
                .focused($isQueryFocused)
                .onSubmit { viewModel.submit() }
            Button { viewModel.openSettings() } label: {
                Image(systemName: "gearshape")
                    .foregroundStyle(theme.colors.textSecondary)
                    .font(.system(size: 14))
            }
            .buttonStyle(.plain)
            .help("打开设置 (⌘,)")
        }
        .padding(.vertical, theme.spacing.sm)
    }

    private var actionList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: theme.spacing.xs) {
                if viewModel.filteredActions.isEmpty {
                    Text("No actions")
                        .foregroundStyle(theme.colors.textSecondary)
                        .font(theme.typography.bodyFont)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, theme.spacing.md)
                } else {
                    ForEach(viewModel.filteredActions) { action in
                        actionRow(action)
                    }
                }
            }
        }
    }

    private func actionRow(_ action: PromptAction) -> some View {
        let isHovered = hoveredActionId == action.id
        return Button { viewModel.submitAction(action) } label: {
            HStack(spacing: theme.spacing.md) {
                Text(action.title)
                    .font(theme.typography.bodyFont)
                    .foregroundStyle(isHovered ? theme.colors.textPrimary : theme.colors.textSecondary)
                Spacer()
                if let shortcut = viewModel.shortcutLabel(for: action) {
                    Text(shortcut)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textSecondary.opacity(0.7))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(
                            RoundedRectangle(cornerRadius: 4)
                                .fill(theme.colors.surface)
                        )
                }
            }
            .actionRow(isHighlighted: isHovered)
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: theme.animation.highlightDuration)) {
                hoveredActionId = hovering ? action.id : nil
            }
        }
    }
}
