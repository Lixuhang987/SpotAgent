import SwiftUI

struct PromptPanelView: View {
    @Bindable var viewModel: PromptPanelViewModel
    @Environment(\.appTheme) private var theme
    @FocusState private var isQueryFocused: Bool

    var body: some View {
        VStack(spacing: theme.spacing.lg) {
            headerBar
            inputField
            Divider()
            actionList
        }
        .promptPanelContainer()
        .onAppear { isQueryFocused = true }
        .onChange(of: viewModel.focusSeed) { _, _ in isQueryFocused = true }
    }

    private var headerBar: some View {
        HStack {
            Spacer()
            Button { viewModel.openSettings() } label: {
                Image(systemName: "gearshape")
            }
            .buttonStyle(.plain)
            .help("打开设置 (⌘,)")
        }
    }

    private var inputField: some View {
        TextField("输入你的请求", text: $viewModel.draft)
            .textFieldStyle(.plain)
            .font(theme.typography.promptInputFont)
            .focused($isQueryFocused)
            .onSubmit { viewModel.submit() }
    }

    private var actionList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: theme.spacing.sm) {
                if viewModel.filteredActions.isEmpty {
                    Text("No actions")
                        .foregroundStyle(theme.colors.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, theme.spacing.sm)
                } else {
                    ForEach(viewModel.filteredActions) { action in
                        actionRow(action)
                    }
                }
            }
        }
    }

    private func actionRow(_ action: PromptAction) -> some View {
        Button { viewModel.submitAction(action) } label: {
            HStack(spacing: theme.spacing.md) {
                Text(action.title)
                    .foregroundStyle(theme.colors.textPrimary)
                Spacer()
                if let shortcut = viewModel.shortcutLabel(for: action) {
                    Text(shortcut)
                        .foregroundStyle(theme.colors.textSecondary)
                }
            }
            .actionRow()
        }
        .buttonStyle(.plain)
    }
}
