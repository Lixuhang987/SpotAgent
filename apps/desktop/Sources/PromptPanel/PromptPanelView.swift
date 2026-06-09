import SwiftUI

struct PromptPanelView: View {
    @Bindable var viewModel: PromptPanelViewModel
    @Environment(\.appTheme) private var theme
    @FocusState private var isQueryFocused: Bool
    @State private var hoveredActionId: String?
    @State private var isSettingsHovered = false
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
        let style = attachmentStyle(for: attachment)
        return HStack(spacing: 6) {
            chipLabel(for: attachment, foreground: style.foreground)
            Button {
                viewModel.removeAttachment(id: attachment.id)
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(style.foreground)
                    .frame(width: 18, height: 18)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .help("移除附件")
            .accessibilityLabel("移除附件")
        }
        .padding(.leading, 10)
        .padding(.trailing, 4)
        .padding(.vertical, 5)
        .borderedCard(fill: style.background, border: style.border, cornerRadius: theme.radius.sm, borderWidth: 0.8)
        .help(tooltip(for: attachment))
    }

    private func attachmentStyle(for attachment: PromptAttachmentResult) -> (
        foreground: Color,
        background: Color,
        border: Color
    ) {
        if attachment.isError {
            return (theme.colors.error, theme.colors.surfaceSoft, theme.colors.error.opacity(0.55))
        }
        if attachment.isImage {
            return (theme.colors.textPrimary, theme.colors.surfaceSoft, theme.colors.accentRing)
        }
        return (theme.colors.textPrimary, theme.colors.surfaceSoft, theme.colors.hairline)
    }

    @ViewBuilder
    private func chipLabel(for attachment: PromptAttachmentResult,
                           foreground: Color) -> some View {
        let content = HStack(spacing: 6) {
            Image(systemName: attachment.iconSystemName)
                .font(.system(size: 11, weight: attachment.isImage ? .semibold : .regular))
                .foregroundStyle(attachment.isImage ? theme.colors.accent : foreground)
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
            placeholder: "输入请求，Return 提交",
            fontSize: theme.typography.promptInputFontSize,
            isFocused: isQueryFocused,
            isDisabled: viewModel.isSubmissionInputDisabled,
            maxVisibleLines: 5,
            onMoveSelection: { viewModel.moveSelectedAction($0) },
            onSubmitSelectedAction: { viewModel.submitSelectedAction() }
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
        let isActionError = message.hasPrefix("缺少必填参数") || message.contains("Action 渲染失败")
        let semanticColor = isActionError ? theme.colors.error : theme.colors.warning
        let iconName = isActionError ? "exclamationmark.triangle" : "wifi.exclamationmark"
        let displayMessage = isActionError ? message : "\(message)，草稿已保留"

        return HStack(spacing: theme.spacing.sm) {
            Image(systemName: iconName)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(semanticColor)
            Text(displayMessage)
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
                .strokeBorder(semanticColor.opacity(0.5), lineWidth: 0.8)
        )
    }

    private var settingsButton: some View {
        Button { viewModel.openSettings() } label: {
            Image(systemName: "gearshape")
                .foregroundStyle(isSettingsHovered ? theme.colors.textPrimary : theme.colors.textSecondary)
                .font(.system(size: 14, weight: .medium))
                .promptPanelIconButton(isHovered: isSettingsHovered)
        }
        .buttonStyle(.plain)
        .help("打开设置 (⌘,)")
        .accessibilityLabel("打开设置")
        .onHover { hovering in
            withAnimation(.easeInOut(duration: theme.animation.highlightDuration)) {
                isSettingsHovered = hovering
            }
        }
    }

    private var actionList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: theme.spacing.xs) {
                if viewModel.filteredActions.isEmpty {
                    Text(emptyActionsMessage)
                        .foregroundStyle(theme.colors.muted)
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

    private var emptyActionsMessage: String {
        viewModel.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? "暂无可用 Action"
            : "没有匹配的 Action"
    }

    private func actionRow(_ action: ActionDefinition) -> some View {
        let isHovered = hoveredActionId == action.id
        let isSelected = viewModel.selectedActionId == action.id
        let isHighlighted = isHovered || isSelected
        return Button { viewModel.selectAction(action) } label: {
            HStack(alignment: .center, spacing: theme.spacing.md) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(action.title)
                        .font(theme.typography.bodyFont)
                        .foregroundStyle(isHighlighted ? theme.colors.textPrimary : theme.colors.bodyStrong)
                        .lineLimit(1)
                    if let description = action.description, !description.isEmpty {
                        Text(description)
                            .font(theme.typography.captionFont)
                            .foregroundStyle(theme.colors.muted)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: theme.spacing.md)
                Text(action.trigger)
                    .promptPanelTriggerPill(isHighlighted: isHighlighted)
            }
            .actionRow(isHighlighted: isHighlighted)
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            withAnimation(.easeInOut(duration: theme.animation.highlightDuration)) {
                hoveredActionId = hovering ? action.id : nil
            }
        }
    }
}
