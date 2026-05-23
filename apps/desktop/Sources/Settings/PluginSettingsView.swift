import SwiftUI

struct PluginSettingsView: View {
    @Bindable var viewModel: PluginSettingsViewModel
    @Environment(\.appTheme) private var theme
    @State private var isAdding = false
    @State private var pluginId = ""
    @State private var title = ""
    @State private var description = ""
    @State private var trigger = ""
    @State private var promptName = ""
    @State private var promptTitle = ""
    @State private var template = ""
    @State private var requiredArgumentName = ""
    @State private var mcpServerIdsText = ""

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                if viewModel.plugins.isEmpty {
                    emptyState
                } else {
                    SettingsListSection(items: viewModel.plugins) { plugin in
                        pluginRow(plugin)
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
                Image(systemName: "puzzlepiece.extension")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(theme.colors.textSecondary)
                Text("暂无 Plugin")
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

    private func pluginRow(_ plugin: PluginSettingsEntry) -> some View {
        SettingsRow(plugin.title) {
            VStack(alignment: .leading, spacing: theme.spacing.sm) {
                HStack(alignment: .firstTextBaseline, spacing: theme.spacing.sm) {
                    Text(plugin.description.isEmpty ? plugin.id : plugin.description)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textPrimary)
                        .lineLimit(2)
                    Spacer()
                    Toggle("启用", isOn: Binding(
                        get: { plugin.isEnabled },
                        set: { viewModel.setEnabled(pluginId: plugin.id, enabled: $0) }
                    ))
                    .labelsHidden()
                    .toggleStyle(.switch)
                }
                HStack(spacing: theme.spacing.sm) {
                    Text(plugin.id)
                        .font(theme.typography.captionFont.monospaced())
                    Text("\(plugin.promptCount) prompts")
                    if !plugin.mcpServerIds.isEmpty {
                        Text(plugin.mcpServerIds.joined(separator: ", "))
                            .lineLimit(1)
                    }
                    Spacer()
                    Button {
                        viewModel.deletePlugin(id: plugin.id)
                    } label: {
                        Label("删除", systemImage: "trash")
                    }
                    .font(theme.typography.captionFont)
                    .buttonStyle(.plain)
                    .foregroundStyle(theme.colors.error)
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
                    Label(isAdding ? "收起" : "新增 Plugin", systemImage: isAdding ? "chevron.up" : "plus")
                }
                .buttonStyle(.plain)
                .foregroundStyle(theme.colors.accent)

                Spacer()

                Button {
                    viewModel.installExamplePlugin()
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
            SettingsSectionHeader("新增 Plugin")
            SettingsSection {
                SettingsRow("Plugin ID") {
                    TextField("github-review", text: $pluginId)
                        .textFieldStyle(SettingsFieldStyle())
                }
                SettingsRowDivider()
                SettingsRow("标题") {
                    TextField("GitHub Review", text: $title)
                        .textFieldStyle(SettingsFieldStyle())
                }
                SettingsRowDivider()
                SettingsRow("描述") {
                    TextField("Review PRs with GitHub MCP", text: $description)
                        .textFieldStyle(SettingsFieldStyle())
                }
                SettingsRowDivider()
                SettingsRow("MCP IDs") {
                    TextField("github, filesystem", text: $mcpServerIdsText)
                        .textFieldStyle(SettingsFieldStyle())
                }
                SettingsRowDivider()
                SettingsRow("Trigger") {
                    TextField("gh-review", text: $trigger)
                        .textFieldStyle(SettingsFieldStyle())
                }
                SettingsRowDivider()
                SettingsRow("Prompt 名称") {
                    TextField("review", text: $promptName)
                        .textFieldStyle(SettingsFieldStyle())
                }
                SettingsRowDivider()
                SettingsRow("Prompt 标题") {
                    TextField("Review PR", text: $promptTitle)
                        .textFieldStyle(SettingsFieldStyle())
                }
                SettingsRowDivider()
                SettingsRow("必填参数") {
                    TextField("url", text: $requiredArgumentName)
                        .textFieldStyle(SettingsFieldStyle())
                }
                SettingsRowDivider()
                SettingsRow("Template") {
                    SettingsTextEditor(text: $template, placeholder: "Review PR {{url}}")
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
                let didCreate = viewModel.createPlugin(
                    id: pluginId,
                    title: title,
                    description: description,
                    trigger: trigger,
                    promptName: promptName,
                    promptTitle: promptTitle,
                    template: template,
                    requiredArgumentName: requiredArgumentName,
                    mcpServerIdsText: mcpServerIdsText
                )
                if didCreate {
                    resetForm()
                }
            } label: {
                Label("保存", systemImage: "checkmark")
            }
            .buttonStyle(.plain)
            .foregroundStyle(theme.colors.accent)
            .disabled(pluginId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .font(theme.typography.bodyFont)
    }

    private func resetForm() {
        isAdding = false
        pluginId = ""
        title = ""
        description = ""
        trigger = ""
        promptName = ""
        promptTitle = ""
        template = ""
        requiredArgumentName = ""
        mcpServerIdsText = ""
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
