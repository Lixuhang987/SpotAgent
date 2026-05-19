import SwiftUI

struct SessionHistoryWindowView: View {
    @Bindable var viewModel: SessionHistoryViewModel
    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider().overlay(theme.colors.border)
            HStack(spacing: 0) {
                sidebar
                Divider().overlay(theme.colors.border)
                previewPane
            }
        }
        .frame(minWidth: 920, minHeight: 620)
        .background(theme.colors.background)
        .alert("删除会话？", isPresented: pendingDeleteBinding) {
            Button("取消", role: .cancel) {
                viewModel.cancelDelete()
            }
            Button("删除", role: .destructive) {
                viewModel.confirmDelete()
            }
        } message: {
            Text("删除后无法恢复本地历史文件。")
        }
        .onAppear {
            viewModel.refresh()
        }
    }

    private var header: some View {
        HStack(spacing: theme.spacing.md) {
            Image(systemName: "clock.arrow.circlepath")
                .foregroundStyle(theme.colors.accent)
            Text("会话历史")
                .font(theme.typography.bodyFont)
                .foregroundStyle(theme.colors.textPrimary)
            Spacer()
            TextField("搜索会话", text: $viewModel.query)
                .textFieldStyle(.roundedBorder)
                .frame(width: 240)
        }
        .padding(.horizontal, theme.spacing.xl)
        .padding(.vertical, theme.spacing.md)
    }

    private var sidebar: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                ForEach(viewModel.filteredItems) { item in
                    historyRow(item)
                        .contextMenu {
                            Button("恢复") {
                                viewModel.restore(item.id)
                            }
                            Button("删除", role: .destructive) {
                                viewModel.requestDelete(item.id)
                            }
                        }
                }
            }
        }
        .frame(width: 320)
        .background(theme.colors.surface.opacity(0.35))
    }

    private func historyRow(_ item: SessionHistoryEntry) -> some View {
        let isSelected = item.id == viewModel.selectedSessionID
        return Button {
            viewModel.select(item.id)
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: theme.spacing.sm) {
                    Text(item.title ?? "未命名会话")
                        .font(theme.typography.bodyFont)
                        .foregroundStyle(theme.colors.textPrimary)
                        .lineLimit(1)
                    Spacer()
                    Text(item.updatedAt)
                        .font(theme.typography.captionFont.monospaced())
                        .foregroundStyle(theme.colors.textSecondary)
                }
                Text(item.preview)
                    .font(theme.typography.captionFont)
                    .foregroundStyle(theme.colors.textSecondary)
                    .lineLimit(2)
                HStack(spacing: theme.spacing.sm) {
                    Text(item.id)
                        .font(theme.typography.captionFont.monospaced())
                        .foregroundStyle(theme.colors.textSecondary)
                        .lineLimit(1)
                    Spacer()
                    Text("\(item.messageCount) 条")
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textSecondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, theme.spacing.md)
            .padding(.vertical, theme.spacing.md)
            .background(isSelected ? theme.colors.accentSubtle : Color.clear)
        }
        .buttonStyle(.plain)
    }

    private var previewPane: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: theme.spacing.lg) {
                if let detail = viewModel.selectedDetail {
                    VStack(alignment: .leading, spacing: theme.spacing.sm) {
                        Text(detail.entry.title ?? "未命名会话")
                            .font(theme.typography.titleFont)
                            .foregroundStyle(theme.colors.textPrimary)
                        Text(detail.entry.preview)
                            .font(theme.typography.bodyFont)
                            .foregroundStyle(theme.colors.textSecondary)
                        HStack(spacing: theme.spacing.md) {
                            Text(detail.entry.id)
                            Text(detail.entry.updatedAt)
                            Text("\(detail.entry.messageCount) 条消息")
                        }
                        .font(theme.typography.captionFont.monospaced())
                        .foregroundStyle(theme.colors.textSecondary)
                    }

                    Divider().overlay(theme.colors.border)

                    VStack(alignment: .leading, spacing: theme.spacing.md) {
                        ForEach(detail.messages.prefix(6)) { message in
                            VStack(alignment: .leading, spacing: theme.spacing.xs) {
                                HStack {
                                    Text(message.role)
                                        .font(theme.typography.captionFont.monospaced())
                                        .foregroundStyle(theme.colors.accent)
                                    Spacer()
                                    Text(message.id)
                                        .font(theme.typography.captionFont.monospaced())
                                        .foregroundStyle(theme.colors.textSecondary)
                                }
                                Text(message.text.isEmpty ? " " : message.text)
                                    .font(theme.typography.bodyFont)
                                    .foregroundStyle(theme.colors.textPrimary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .padding(.horizontal, theme.spacing.md)
                            .padding(.vertical, theme.spacing.sm)
                            .background(theme.colors.surface.opacity(0.4))
                        }
                    }
                } else {
                    Text("没有可预览的会话。")
                        .font(theme.typography.bodyFont)
                        .foregroundStyle(theme.colors.textSecondary)
                }

                if let errorMessage = viewModel.errorMessage {
                    Text(errorMessage)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.error)
                }
            }
            .padding(theme.spacing.xl)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .overlay(alignment: .topTrailing) {
            Button {
                viewModel.restoreSelected()
            } label: {
                Label("恢复", systemImage: "arrow.uturn.backward")
            }
            .buttonStyle(.borderedProminent)
            .padding(theme.spacing.xl)
        }
    }

    private var pendingDeleteBinding: Binding<Bool> {
        Binding(
            get: { viewModel.pendingDeletionID != nil },
            set: { isPresented in
                if !isPresented { viewModel.cancelDelete() }
            }
        )
    }
}
