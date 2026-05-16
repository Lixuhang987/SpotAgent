import SwiftUI

struct SessionWindowView: View {
    @Bindable var viewModel: SessionViewModel
    @Environment(\.appTheme) private var theme
    @State private var draft = ""

    var body: some View {
        VStack(spacing: 0) {
            statusHeader
            Divider().overlay(theme.colors.border)
            messageList
            if let error = viewModel.error {
                errorBanner(error)
            }
            Divider().overlay(theme.colors.border)
            inputField
        }
        .background(theme.colors.background)
    }

    private var statusHeader: some View {
        HStack(spacing: theme.spacing.sm) {
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
