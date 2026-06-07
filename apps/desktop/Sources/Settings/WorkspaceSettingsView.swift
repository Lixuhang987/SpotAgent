import SwiftUI
import UniformTypeIdentifiers

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
                SettingsListSection(items: viewModel.workspaces) { workspace in
                    workspaceRow(workspace)
                }

                SettingsSectionSeparator()

                Button("添加 Workspace") {
                    showingAdd = true
                }
                .buttonStyle(.plain)
                .foregroundStyle(theme.colors.accent)
                .padding(.horizontal, theme.spacing.xl)
                .padding(.vertical, theme.spacing.md)

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
        .fileImporter(
            isPresented: $showingAdd,
            allowedContentTypes: [.folder],
            allowsMultipleSelection: false,
            onCompletion: addImportedWorkspace
        )
    }

    private func workspaceRow(_ ws: WorkspaceEntry) -> some View {
        SettingsRow(ws.name) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(ws.rootPath)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textPrimary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .help(ws.rootPath)
                    HStack(spacing: 6) {
                        if !ws.description.isEmpty {
                            Text(ws.description)
                                .lineLimit(1)
                            Text("·")
                        }
                        Text("创建于 \(Self.formatCreatedAt(ws.createdAt))")
                    }
                    .font(theme.typography.captionFont)
                    .foregroundStyle(theme.colors.textSecondary)
                }
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

    private static let createdAtFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f
    }()

    private static func formatCreatedAt(_ date: Date?) -> String {
        guard let date else { return "—" }
        return createdAtFormatter.string(from: date)
    }

    private func editSheet(_ ws: WorkspaceEntry) -> some View {
        VStack(spacing: 16) {
            Text("编辑 Workspace")
                .font(theme.typography.titleFont)
                .foregroundStyle(theme.colors.ink)
            TextField("名称", text: $editName)
                .textFieldStyle(SettingsFieldStyle())
            TextField("描述（200 字以内）", text: $editDescription)
                .textFieldStyle(SettingsFieldStyle())
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
        .padding(theme.spacing.xl)
        .frame(width: 360)
        .background(theme.colors.canvas)
    }

    private func addImportedWorkspace(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result, let url = urls.first else { return }
        let didStartAccessing = url.startAccessingSecurityScopedResource()
        defer {
            if didStartAccessing {
                url.stopAccessingSecurityScopedResource()
            }
        }
        let name = url.lastPathComponent
        viewModel.add(name: name, description: "", rootPath: url.path)
    }
}
