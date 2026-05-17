import SwiftUI

struct PromptPanelView: View {
    @Bindable var viewModel: PromptPanelViewModel
    @Environment(\.appTheme) private var theme
    @FocusState private var isQueryFocused: Bool
    @State private var hoveredActionId: String?
    @State private var previewedAttachmentId: String?

    var body: some View {
        VStack(alignment: .leading, spacing: theme.spacing.lg) {
            if !viewModel.attachments.isEmpty {
                attachmentRow
                if let preview = currentImagePreview {
                    imagePreviewPanel(for: preview)
                }
            }
            firstRow
            Divider()
                .overlay(theme.colors.border)
            actionList
        }
        .promptPanelContainer()
        .onAppear { isQueryFocused = true }
        .onChange(of: viewModel.focusSeed) { _, _ in isQueryFocused = true }
        .onChange(of: viewModel.attachments) { _, newValue in
            if let current = previewedAttachmentId,
               !newValue.contains(where: { $0.id == current }) {
                previewedAttachmentId = nil
            }
        }
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
        let background = isError ? theme.colors.surface.opacity(0.4) : theme.colors.accentSubtle
        let isExpanded = attachment.isImage && previewedAttachmentId == attachment.id
        return HStack(spacing: 6) {
            chipLabel(for: attachment, foreground: foreground, isExpanded: isExpanded)
            Button {
                if previewedAttachmentId == attachment.id {
                    previewedAttachmentId = nil
                }
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
        .background(
            RoundedRectangle(cornerRadius: theme.radius.sm)
                .fill(background)
        )
        .overlay(
            RoundedRectangle(cornerRadius: theme.radius.sm)
                .strokeBorder(isExpanded ? theme.colors.accentRing : theme.colors.border,
                              lineWidth: isExpanded ? 1 : 0.5)
        )
        .help(tooltip(for: attachment))
    }

    @ViewBuilder
    private func chipLabel(for attachment: PromptAttachmentResult,
                           foreground: Color,
                           isExpanded: Bool) -> some View {
        let content = HStack(spacing: 6) {
            Image(systemName: attachment.isImage && isExpanded ? "eye.fill" : attachment.iconSystemName)
                .font(.system(size: 11))
                .foregroundStyle(foreground)
            Text(attachment.displayLabel)
                .font(theme.typography.captionFont)
                .foregroundStyle(foreground)
                .lineLimit(1)
        }
        if attachment.isImage {
            Button {
                togglePreview(for: attachment.id)
            } label: {
                content.contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help(isExpanded ? "收起预览" : "点击预览")
        } else {
            content
        }
    }

    private var currentImagePreview: PromptAttachmentResult? {
        guard let id = previewedAttachmentId else { return nil }
        return viewModel.attachments.first { $0.id == id && $0.isImage }
    }

    @ViewBuilder
    private func imagePreviewPanel(for attachment: PromptAttachmentResult) -> some View {
        if let base64 = attachment.imageBase64,
           let data = Data(base64Encoded: base64),
           let nsImage = NSImage(data: data) {
            Image(nsImage: nsImage)
                .resizable()
                .scaledToFit()
                .frame(maxWidth: .infinity, maxHeight: 280, alignment: .center)
                .background(
                    RoundedRectangle(cornerRadius: theme.radius.md)
                        .fill(theme.colors.surface)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: theme.radius.md)
                        .strokeBorder(theme.colors.border, lineWidth: 0.5)
                )
                .clipShape(RoundedRectangle(cornerRadius: theme.radius.md))
        } else {
            Text("无法解码截图数据")
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.error)
                .padding(.vertical, theme.spacing.sm)
        }
    }

    private func togglePreview(for id: String) {
        previewedAttachmentId = (previewedAttachmentId == id) ? nil : id
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
            Spacer(minLength: theme.spacing.lg)
            settingsButton
        }
    }

    private var inputField: some View {
        HStack(spacing: theme.spacing.sm) {
            Image(systemName: "sparkles")
                .foregroundStyle(theme.colors.accent)
                .font(.system(size: 14, weight: .medium))
            TextField("输入你的请求", text: $viewModel.draft)
                .textFieldStyle(.plain)
                .font(theme.typography.promptInputFont)
                .foregroundStyle(theme.colors.textPrimary)
                .focused($isQueryFocused)
                .onSubmit { viewModel.submit() }
        }
        .padding(.horizontal, theme.spacing.md)
        .padding(.vertical, 10)
        .frame(width: 360)
        .background(
            RoundedRectangle(cornerRadius: theme.radius.md)
                .fill(theme.colors.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: theme.radius.md)
                .strokeBorder(theme.colors.border, lineWidth: 0.5)
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
