import AppKit
import SwiftUI

struct WorkspaceSettingsView: View {
    @Bindable var viewModel: WorkspaceSettingsViewModel
    @Environment(\.appTheme) private var theme
    @State private var showingAdd = false
    @State private var editingId: String?
    @State private var editName = ""
    @State private var editDescription = ""

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                SettingsSection {
                    ForEach(Array(viewModel.workspaces.enumerated()), id: \.element.id) { index, ws in
                        if index > 0 { SettingsRowDivider() }
                        workspaceRow(ws)
                    }
                }

                SettingsSectionSeparator()

                Button("添加 Workspace") {
                    pickDirectoryAndAdd()
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 20)
                .padding(.vertical, 12)

                Spacer(minLength: 0)
            }
        }
        .sheet(isPresented: Binding(
            get: { editingId != nil },
            set: { if !$0 { editingId = nil } }
        )) {
            if let ws = viewModel.workspaces.first(where: { $0.id == editingId }) {
                editSheet(ws)
            }
        }
    }

    private func workspaceRow(_ ws: WorkspaceEntry) -> some View {
        SettingsRow(ws.name) {
            HStack(spacing: 8) {
                Text(ws.description.isEmpty ? ws.rootPath : ws.description)
                    .font(theme.typography.captionFont)
                    .foregroundStyle(theme.colors.textSecondary)
                    .lineLimit(1)
                Spacer()
                if ws.isDefault {
                    Text("默认")
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.accent)
                }
                Button("编辑") {
                    editName = ws.name
                    editDescription = ws.description
                    editingId = ws.id
                }
                .buttonStyle(.plain)
                .foregroundStyle(theme.colors.accent)
                if !ws.isDefault {
                    Button("删除") {
                        viewModel.remove(id: ws.id)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(theme.colors.error)
                }
            }
        }
    }

    private func editSheet(_ ws: WorkspaceEntry) -> some View {
        VStack(spacing: 16) {
            Text("编辑 Workspace")
                .font(theme.typography.bodyFont)
            TextField("名称", text: $editName)
                .textFieldStyle(.roundedBorder)
            TextField("描述（200 字以内）", text: $editDescription)
                .textFieldStyle(.roundedBorder)
            Text("\(editDescription.count)/200")
                .font(theme.typography.captionFont)
                .foregroundStyle(editDescription.count > 200 ? theme.colors.error : theme.colors.textSecondary)
            HStack {
                Button("取消") { editingId = nil }
                Spacer()
                Button("保存") {
                    viewModel.update(id: ws.id, name: editName, description: String(editDescription.prefix(200)))
                    editingId = nil
                }
                .disabled(editName.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .padding(20)
        .frame(width: 360)
    }

    private func pickDirectoryAndAdd() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "选择目录"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        let name = url.lastPathComponent
        viewModel.add(name: name, description: "", rootPath: url.path)
    }
}
