import SwiftUI

struct PromptPanelView: View {
    @Bindable var viewModel: PromptPanelViewModel
    @Environment(\.appTheme) private var theme
    @FocusState private var isQueryFocused: Bool
    @State private var hoveredActionId: String?
    @State private var inputHeight: CGFloat = 20

    var body: some View {
        VStack(alignment: .leading, spacing: theme.spacing.lg) {
            if !viewModel.attachments.isEmpty {
                attachmentRow
            }
            firstRow
            if let message = viewModel.submissionDisabledMessage {
                submissionDisabledBanner(message)
            }
            Divider()
                .overlay(theme.colors.hairline)
            actionList
        }
        .promptPanelContainer()
        .onAppear { isQueryFocused = true }
        .onChange(of: viewModel.focusSeed) { isQueryFocused = true }
    }

    private var attachmentRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: theme.spacing.sm) {
                ForEach(viewModel.attachments) { attachment in
                    attachmentChip(attachment)
                }
            }
        }
    }

    private func attachmentChip(_ attachment: PromptAttachmentResult) -> some View {
        let isError = attachment.isError
        let foreground = isError ? theme.colors.textSecondary : theme.colors.textPrimary
        let background = isError ? theme.colors.surfaceSoft : theme.colors.surfaceCard
        return HStack(spacing: 6) {
            chipLabel(for: attachment, foreground: foreground)
            Button {
                viewModel.removeAttachment(id: attachment.id)
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(theme.colors.textSecondary)
            }
            .buttonStyle(.plain)
            .help("移除附件")
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .borderedCard(fill: background, border: theme.colors.hairline, cornerRadius: theme.radius.sm)
        .help(tooltip(for: attachment))
    }

    @ViewBuilder
    private func chipLabel(for attachment: PromptAttachmentResult,
                           foreground: Color) -> some View {
        let content = HStack(spacing: 6) {
            Image(systemName: attachment.iconSystemName)
                .font(.system(size: 11))
                .foregroundStyle(foreground)
            Text(attachment.displayLabel)
                .font(theme.typography.captionFont)
                .foregroundStyle(foreground)
                .lineLimit(1)
        }
        if attachment.isImage {
            Button {
                viewModel.previewAttachment(attachment)
            } label: {
                content.contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("点击预览（空格键）")
        } else {
            content
        }
    }

    private func tooltip(for attachment: PromptAttachmentResult) -> String {
        switch attachment {
        case .selectionError(_, let message): return message
        case .textSelection(_, let text): return text
        default: return ""
        }
    }

    private var firstRow: some View {
        HStack(spacing: theme.spacing.md) {
            inputField
            if !inputShouldExpand {
                Spacer(minLength: theme.spacing.lg)
            }
            settingsButton
        }
    }

    private var inputField: some View {
        PromptPanelGrowingTextView(
            text: $viewModel.draft,
            measuredHeight: $inputHeight,
            placeholder: "输入你的请求",
            fontSize: theme.typography.promptInputFontSize,
            isFocused: isQueryFocused,
            isDisabled: viewModel.isSubmissionInputDisabled,
            maxVisibleLines: 5,
            onSubmit: { viewModel.submit() }
        )
        .frame(height: inputHeight)
        .frame(width: PromptPanelInputLayout.inputWidth(for: viewModel.draft))
        .frame(maxWidth: inputShouldExpand ? .infinity : nil)
        .onTapGesture {
            isQueryFocused = true
        }
    }

    private var inputShouldExpand: Bool {
        PromptPanelInputLayout.shouldExpandInput(for: viewModel.draft)
    }

    private func submissionDisabledBanner(_ message: String) -> some View {
        HStack(spacing: theme.spacing.sm) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(theme.colors.accent)
            Text(message)
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.textSecondary)
                .lineLimit(2)
        }
        .padding(.horizontal, theme.spacing.md)
        .padding(.vertical, theme.spacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: theme.radius.sm)
                .fill(theme.colors.surfaceSoft)
        )
        .overlay(
            RoundedRectangle(cornerRadius: theme.radius.sm)
                .strokeBorder(theme.colors.accentRing, lineWidth: 0.8)
        )
    }

    private var settingsButton: some View {
        Button { viewModel.openSettings() } label: {
            Image(systemName: "gearshape")
                .foregroundStyle(theme.colors.textSecondary)
                .font(.system(size: 14))
        }
        .buttonStyle(.plain)
        .help("打开设置 (⌘,)")
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

    private func actionRow(_ action: ActionDefinition) -> some View {
        let isHovered = hoveredActionId == action.id
        return Button { viewModel.selectAction(action) } label: {
            HStack(spacing: theme.spacing.md) {
                Text(action.title)
                    .font(theme.typography.bodyFont)
                    .foregroundStyle(isHovered ? theme.colors.bodyStrong : theme.colors.body)
                Spacer()
                Text(action.trigger)
                    .font(theme.typography.captionFont)
                    .foregroundStyle(isHovered ? theme.colors.accent : theme.colors.muted)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(
                        RoundedRectangle(cornerRadius: 4)
                            .fill(isHovered ? theme.colors.canvas : theme.colors.surfaceSoft)
                    )
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
