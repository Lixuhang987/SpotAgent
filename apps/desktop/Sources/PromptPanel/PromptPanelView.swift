import SwiftUI

struct PromptPanelView: View {
    let actions: [PromptAction]
    let onSubmit: ((PromptAction) -> Void)?

    @State private var query = ""
    @FocusState private var isQueryFocused: Bool

    private var filteredActions: [PromptAction] {
        PromptAction.filter(actions, query: query)
    }

    var body: some View {
        VStack(spacing: 16) {
            TextField("Search actions", text: $query)
                .textFieldStyle(.plain)
                .font(.system(size: 20, weight: .semibold))
                .focused($isQueryFocused)
                .onSubmit {
                    submitFirstFilteredAction()
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
                                submit(action)
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

    private func submit(_ action: PromptAction) {
        if let onSubmit {
            onSubmit(action)
        } else {
            action.perform()
        }
    }

    private func submitFirstFilteredAction() {
        guard let action = filteredActions.first else { return }
        submit(action)
    }
}
