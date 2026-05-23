import SwiftUI

struct AppendPromptSettingsView: View {
    @Bindable var viewModel: AppendPromptSettingsViewModel
    @Environment(\.appTheme) private var theme
    @State private var isAdding = false
    @State private var name = ""
    @State private var trigger = ""
    @State private var title = ""
    @State private var description = ""
    @State private var template = ""
    @State private var requiredArgumentName = ""

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                if viewModel.prompts.isEmpty {
                    emptyState
                } else {
                    SettingsListSection(items: viewModel.prompts) { prompt in
                        promptRow(prompt)
                    }
                }

                SettingsSectionSeparator()
                addButton

                if isAdding {
                    SettingsSectionSeparator()
                    createForm
                }

                if let error = viewModel.saveErrorMessage {
                    errorFooter(error)
                }

                Spacer(minLength: 0)
            }
        }
    }

    private var emptyState: some View {
        SettingsSection {
            HStack(spacing: theme.spacing.sm) {
                Image(systemName: "text.badge.plus")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(theme.colors.textSecondary)
                Text("暂无 Append Prompt")
                    .font(theme.typography.bodyFont)
                    .foregroundStyle(theme.colors.textSecondary)
                Spacer()
                Button {
                    viewModel.reload()
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 12))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func promptRow(_ prompt: AppendPromptEntry) -> some View {
        SettingsRow(prompt.title) {
            VStack(alignment: .leading, spacing: theme.spacing.sm) {
                HStack(alignment: .firstTextBaseline, spacing: theme.spacing.sm) {
                    Text(prompt.description.isEmpty ? prompt.template : prompt.description)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textPrimary)
                        .lineLimit(2)
                    Spacer()
                    Button {
                        viewModel.deletePrompt(id: prompt.id)
                    } label: {
                        Label("删除", systemImage: "trash")
                    }
                    .font(theme.typography.captionFont)
                    .buttonStyle(.plain)
                    .foregroundStyle(theme.colors.error)
                }
                HStack(spacing: theme.spacing.sm) {
                    Text(prompt.trigger)
                        .font(theme.typography.captionFont.monospaced())
                    if !prompt.argumentNames.isEmpty {
                        Text(prompt.argumentNames.joined(separator: ", "))
                    }
                    Spacer()
                }
                .foregroundStyle(theme.colors.textSecondary)
            }
        }
    }

    private var addButton: some View {
        SettingsSection {
            HStack {
                Button {
                    isAdding.toggle()
                } label: {
                    Label(isAdding ? "收起" : "新增 Append Prompt", systemImage: isAdding ? "chevron.up" : "plus")
                }
                .buttonStyle(.plain)
                .foregroundStyle(theme.colors.accent)

                Spacer()

                Button {
                    viewModel.installExamplePrompts()
                } label: {
                    Label("添加示例", systemImage: "sparkles")
                }
                .buttonStyle(.plain)
                .foregroundStyle(theme.colors.textSecondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var createForm: some View {
        VStack(spacing: 0) {
            SettingsSectionHeader("新增 Append Prompt")
            SettingsSection {
                SettingsRow("名称") {
                    TextField("explain", text: $name)
                        .textFieldStyle(SettingsFieldStyle())
                }
                SettingsRowDivider()
                SettingsRow("Trigger") {
                    TextField("explain", text: $trigger)
                        .textFieldStyle(SettingsFieldStyle())
                }
                SettingsRowDivider()
                SettingsRow("标题") {
                    TextField("Explain Code", text: $title)
                        .textFieldStyle(SettingsFieldStyle())
                }
                SettingsRowDivider()
                SettingsRow("描述") {
                    TextField("Explain a code block", text: $description)
                        .textFieldStyle(SettingsFieldStyle())
                }
                SettingsRowDivider()
                SettingsRow("必填参数") {
                    TextField("code", text: $requiredArgumentName)
                        .textFieldStyle(SettingsFieldStyle())
                }
                SettingsRowDivider()
                SettingsRow("Template") {
                    SettingsTextEditor(text: $template, placeholder: "Explain this code:\n{{code}}")
                }
                SettingsRowDivider()
                formButtons
            }
        }
    }

    private var formButtons: some View {
        HStack {
            Button {
                resetForm()
            } label: {
                Label("取消", systemImage: "xmark")
            }
            .buttonStyle(.plain)
            .foregroundStyle(theme.colors.textSecondary)

            Spacer()

            Button {
                let didCreate = viewModel.createPrompt(
                    name: name,
                    trigger: trigger,
                    title: title,
                    description: description,
                    template: template,
                    requiredArgumentName: requiredArgumentName
                )
                if didCreate {
                    resetForm()
                }
            } label: {
                Label("保存", systemImage: "checkmark")
            }
            .buttonStyle(.plain)
            .foregroundStyle(theme.colors.accent)
            .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .font(theme.typography.bodyFont)
    }

    private func resetForm() {
        isAdding = false
        name = ""
        trigger = ""
        title = ""
        description = ""
        template = ""
        requiredArgumentName = ""
    }

    private func errorFooter(_ error: String) -> some View {
        SettingsSection {
            Label(error, systemImage: "exclamationmark.triangle.fill")
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.error)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
