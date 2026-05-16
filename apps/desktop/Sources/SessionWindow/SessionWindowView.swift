import SwiftUI

struct SessionWindowView: View {
    @Bindable var viewModel: SessionViewModel
    @Environment(\.appTheme) private var theme
    @State private var draft = ""

    var body: some View {
        VStack(spacing: theme.spacing.lg) {
            statusHeader
            messageList
            if let error = viewModel.error {
                errorBanner(error)
            }
            inputField
        }
        .padding(theme.spacing.xl)
    }

    private var statusHeader: some View {
        HStack {
            Text("状态：\(viewModel.status)")
                .font(theme.typography.titleFont)
            Spacer()
        }
    }

    private var messageList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: theme.spacing.md) {
                ForEach(viewModel.messages) { message in
                    Text(message.text)
                        .messageBubble(role: message.role)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func errorBanner(_ error: String) -> some View {
        Text(error)
            .foregroundStyle(theme.colors.error)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var inputField: some View {
        TextField("继续追问", text: $draft)
            .textFieldStyle(.roundedBorder)
            .onSubmit {
                let currentDraft = draft
                draft = ""
                viewModel.sendPrompt(currentDraft)
            }
    }
}
