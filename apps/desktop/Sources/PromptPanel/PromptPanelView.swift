import SwiftUI

struct PromptPanelView: View {
    let actions: [PromptAction]
    let onSubmitDraft: ((String) -> Void)?
    let onSubmitAction: ((PromptAction) -> Void)?

    @State private var draft = ""
    @FocusState private var isQueryFocused: Bool

    private var filteredActions: [PromptAction] {
        PromptAction.filter(actions, query: draft)
    }

    var body: some View {
        VStack(spacing: 16) {
            TextField("输入你的请求", text: $draft)
                .textFieldStyle(.plain)
                .font(.system(size: 20, weight: .semibold))
                .focused($isQueryFocused)
                .onSubmit {
                    submitDraft()
                }

            Divider()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 8) {
                    if filteredActions.isEmpty {
                        Text("No actions")
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 8)
                    } else {
                        ForEach(filteredActions) { action in
                            Button {
                                submitAction(action)
                            } label: {
                                HStack(spacing: 12) {
                                    Text(action.title)
                                        .foregroundStyle(.primary)

                                    Spacer()

                                    if let shortcut = action.shortcut {
                                        Text(shortcut)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .padding(.vertical, 8)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
        .padding(20)
        .frame(minWidth: 640, minHeight: 420)
        .background(Color(nsColor: .windowBackgroundColor))
        .onAppear {
            isQueryFocused = true
        }
    }

    private func submitAction(_ action: PromptAction) {
        if let onSubmitAction {
            onSubmitAction(action)
        } else {
            action.perform()
        }
    }

    private func submitDraft() {
        let trimmedDraft = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedDraft.isEmpty else { return }
        onSubmitDraft?(trimmedDraft)
    }
}
