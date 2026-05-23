import SwiftUI

struct MCPSettingsView: View {
    private enum TransportOption: String, CaseIterable, Identifiable {
        case stdio
        case streamableHTTP = "streamableHttp"

        var id: String { rawValue }
        var title: String {
            switch self {
            case .stdio: return "stdio"
            case .streamableHTTP: return "HTTP"
            }
        }
    }

    @Bindable var viewModel: MCPSettingsViewModel
    @Environment(\.appTheme) private var theme
    @State private var isAdding = false
    @State private var transport = TransportOption.stdio
    @State private var serverId = ""
    @State private var title = ""
    @State private var command = ""
    @State private var argsText = ""
    @State private var cwd = ""
    @State private var requestTimeoutMsText = ""
    @State private var autoAcceptEmptyForm = false
    @State private var url = ""
    @State private var headersText = ""

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                restartNotice

                if viewModel.servers.isEmpty {
                    emptyState
                } else {
                    SettingsListSection(items: viewModel.servers) { server in
                        serverRow(server)
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

    private var restartNotice: some View {
        SettingsSection {
            HStack(spacing: theme.spacing.sm) {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .foregroundStyle(theme.colors.textSecondary)
                Text("MCP 配置会在 agent-server 启动时读取；保存后重启桌面 App 生效")
                    .font(theme.typography.captionFont)
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

    private var emptyState: some View {
        SettingsSection {
            HStack(spacing: theme.spacing.sm) {
                Image(systemName: "server.rack")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(theme.colors.textSecondary)
                Text("暂无 MCP Server")
                    .font(theme.typography.bodyFont)
                    .foregroundStyle(theme.colors.textSecondary)
                Spacer()
            }
        }
    }

    private func serverRow(_ server: MCPServerEntry) -> some View {
        SettingsRow(server.title) {
            VStack(alignment: .leading, spacing: theme.spacing.sm) {
                HStack(alignment: .firstTextBaseline, spacing: theme.spacing.sm) {
                    Text(server.detail)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textPrimary)
                        .lineLimit(2)
                        .truncationMode(.middle)
                    Spacer()
                    Button {
                        viewModel.removeServer(id: server.id)
                    } label: {
                        Label("删除", systemImage: "trash")
                    }
                    .font(theme.typography.captionFont)
                    .buttonStyle(.plain)
                    .foregroundStyle(theme.colors.error)
                }
                HStack(spacing: theme.spacing.sm) {
                    Text(server.id)
                        .font(theme.typography.captionFont.monospaced())
                    Text(server.transportLabel)
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
                    Label(isAdding ? "收起" : "新增 MCP Server", systemImage: isAdding ? "chevron.up" : "plus")
                }
                .buttonStyle(.plain)
                .foregroundStyle(theme.colors.accent)

                Spacer()

                Button {
                    viewModel.installExampleServers()
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
            SettingsSectionHeader("新增 MCP Server")
            SettingsSection {
                SettingsRow("Transport") {
                    Picker("Transport", selection: $transport) {
                        ForEach(TransportOption.allCases) { option in
                            Text(option.title).tag(option)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .controlSize(.small)
                    .frame(maxWidth: 340)
                }
                SettingsRowDivider()
                SettingsRow("Server ID") {
                    TextField("filesystem", text: $serverId)
                        .textFieldStyle(SettingsFieldStyle())
                }
                SettingsRowDivider()
                SettingsRow("标题") {
                    TextField("Filesystem", text: $title)
                        .textFieldStyle(SettingsFieldStyle())
                }

                if transport == .stdio {
                    stdioFields
                } else {
                    httpFields
                }

                SettingsRowDivider()
                formButtons
            }
        }
    }

    @ViewBuilder
    private var stdioFields: some View {
        SettingsRowDivider()
        SettingsRow("Command") {
            TextField("npx", text: $command)
                .textFieldStyle(SettingsFieldStyle())
        }
        SettingsRowDivider()
        SettingsRow("Args") {
            TextField("--yes @modelcontextprotocol/server-filesystem /tmp", text: $argsText)
                .textFieldStyle(SettingsFieldStyle())
        }
        SettingsRowDivider()
        SettingsRow("CWD") {
            TextField("/path/to/server", text: $cwd)
                .textFieldStyle(SettingsFieldStyle())
        }
        SettingsRowDivider()
        SettingsRow("Timeout") {
            TextField("60000", text: $requestTimeoutMsText)
                .textFieldStyle(SettingsFieldStyle())
        }
        SettingsRowDivider()
        SettingsRow("Elicitation") {
            Toggle("autoAcceptEmptyForm", isOn: $autoAcceptEmptyForm)
                .toggleStyle(.switch)
        }
    }

    @ViewBuilder
    private var httpFields: some View {
        SettingsRowDivider()
        SettingsRow("URL") {
            TextField("https://example.com/mcp", text: $url)
                .textFieldStyle(SettingsFieldStyle())
        }
        SettingsRowDivider()
        SettingsRow("Headers") {
            SettingsTextEditor(text: $headersText, placeholder: "Authorization=Bearer ${TOKEN}")
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
                if saveServer() {
                    resetForm()
                }
            } label: {
                Label("保存", systemImage: "checkmark")
            }
            .buttonStyle(.plain)
            .foregroundStyle(theme.colors.accent)
            .disabled(serverId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .font(theme.typography.bodyFont)
    }

    private func saveServer() -> Bool {
        switch transport {
        case .stdio:
            return viewModel.createStdioServer(
                id: serverId,
                title: title,
                command: command,
                argsText: argsText,
                cwd: cwd,
                requestTimeoutMsText: requestTimeoutMsText,
                autoAcceptEmptyForm: autoAcceptEmptyForm
            )
        case .streamableHTTP:
            return viewModel.createHTTPServer(
                id: serverId,
                title: title,
                url: url,
                headersText: headersText
            )
        }
    }

    private func resetForm() {
        isAdding = false
        transport = .stdio
        serverId = ""
        title = ""
        command = ""
        argsText = ""
        cwd = ""
        requestTimeoutMsText = ""
        autoAcceptEmptyForm = false
        url = ""
        headersText = ""
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
