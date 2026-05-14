import SwiftUI

struct SessionWindowView: View {
    @ObservedObject var viewModel: SessionViewModel

    @State private var draft = ""

    var body: some View {
        VStack(spacing: 16) {
            HStack {
                Text("状态：\(viewModel.status)")
                    .font(.headline)
                Spacer()
            }

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(viewModel.messages) { message in
                        Text(message.text)
                            .frame(
                                maxWidth: .infinity,
                                alignment: message.role == "user" ? .trailing : .leading
                            )
                            .padding(.horizontal, 12)
                            .padding(.vertical, 10)
                            .background(backgroundColor(for: message.role))
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            if let error = viewModel.error {
                Text(error)
                    .foregroundStyle(.red)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            TextField("继续追问", text: $draft)
                .textFieldStyle(.roundedBorder)
                .onSubmit {
                    let currentDraft = draft
                    draft = ""
                    viewModel.sendPrompt(currentDraft)
                }
        }
        .padding(20)
    }

    private func backgroundColor(for role: String) -> Color {
        switch role {
        case "user":
            return Color(nsColor: .selectedContentBackgroundColor)
        case "tool":
            return Color(nsColor: .controlBackgroundColor)
        default:
            return Color(nsColor: .windowBackgroundColor)
        }
    }
}
