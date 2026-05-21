import SwiftUI

struct SessionPermissionBubbleView: View {
    let request: SessionPermissionRequest
    let tab: SessionTabViewModel

    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: theme.spacing.sm) {
            HStack(spacing: theme.spacing.sm) {
                Image(systemName: "lock.shield")
                    .foregroundStyle(theme.colors.accent)
                    .font(.system(size: 14, weight: .medium))
                Text("授权调用 \(request.toolName)")
                    .font(theme.typography.bodyFont)
                    .foregroundStyle(theme.colors.textPrimary)
                Spacer()
            }

            if request.argumentsJSON != "{}" {
                Text(request.argumentsJSON)
                    .font(theme.typography.captionFont.monospaced())
                    .foregroundStyle(theme.colors.textSecondary)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(theme.spacing.sm)
                    .background(theme.colors.background.opacity(0.45))
                    .clipShape(RoundedRectangle(cornerRadius: theme.radius.sm))
            }

            HStack(spacing: theme.spacing.sm) {
                permissionButton("拒绝", decision: "deny", scope: nil, accent: false)
                permissionButton("仅本次", decision: "allow", scope: "once", accent: true)
                permissionButton("本会话", decision: "allow", scope: "session", accent: true)
                permissionButton("始终允许", decision: "allow", scope: "always", accent: true)
            }
        }
        .padding(.horizontal, theme.spacing.xl)
        .padding(.vertical, theme.spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .borderedCard(fill: theme.colors.surface, border: theme.colors.border, cornerRadius: theme.radius.md, borderWidth: 0.75)
    }

    private func permissionButton(
        _ label: String,
        decision: String,
        scope: String?,
        accent: Bool
    ) -> some View {
        Button {
            tab.resolvePermission(requestId: request.id, decision: decision, scope: scope)
        } label: {
            Text(label)
                .font(theme.typography.captionFont)
                .foregroundStyle(accent ? theme.colors.accent : theme.colors.textSecondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .borderedCard(
                    fill: accent ? theme.colors.accentSubtle : theme.colors.surface.opacity(0.72),
                    border: accent ? theme.colors.accentRing : theme.colors.border,
                    cornerRadius: theme.radius.sm
                )
        }
        .buttonStyle(.plain)
        .help(label)
    }
}

struct SessionWorkspaceAskBubbleView: View {
    let request: SessionWorkspaceAskRequest
    let tab: SessionTabViewModel

    @Environment(\.appTheme) private var theme

    var body: some View {
        VStack(alignment: .leading, spacing: theme.spacing.sm) {
            HStack(spacing: theme.spacing.sm) {
                Image(systemName: "folder.badge.questionmark")
                    .foregroundStyle(theme.colors.accent)
                    .font(.system(size: 14, weight: .medium))
                Text(request.prompt)
                    .font(theme.typography.bodyFont)
                    .foregroundStyle(theme.colors.textPrimary)
                Spacer()
            }

            VStack(alignment: .leading, spacing: theme.spacing.xs) {
                ForEach(request.candidates) { candidate in
                    workspaceCandidateButton(candidate)
                }
            }

            Button {
                tab.resolveWorkspaceAsk(requestId: request.id, workspaceId: nil)
            } label: {
                Text("取消")
                    .font(theme.typography.captionFont)
                    .foregroundStyle(theme.colors.textSecondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .borderedCard(fill: theme.colors.surface, border: theme.colors.border, cornerRadius: theme.radius.sm)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, theme.spacing.xl)
        .padding(.vertical, theme.spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .borderedCard(fill: theme.colors.surface, border: theme.colors.border, cornerRadius: theme.radius.md, borderWidth: 0.75)
    }

    private func workspaceCandidateButton(_ candidate: WorkspaceAskCandidate) -> some View {
        Button {
            tab.resolveWorkspaceAsk(requestId: request.id, workspaceId: candidate.id)
        } label: {
            HStack(alignment: .top, spacing: theme.spacing.sm) {
                Image(systemName: candidate.isDefault ? "folder.fill.badge.gearshape" : "folder")
                    .font(.system(size: 13))
                    .foregroundStyle(theme.colors.accent)
                    .frame(width: theme.spacing.lg)
                VStack(alignment: .leading, spacing: 2) {
                    Text(candidate.name)
                        .font(theme.typography.bodyFont)
                        .foregroundStyle(theme.colors.textPrimary)
                    Text(candidate.description)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textSecondary)
                        .lineLimit(2)
                }
                Spacer()
            }
            .padding(.horizontal, theme.spacing.sm)
            .padding(.vertical, theme.spacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .borderedCard(fill: theme.colors.surface.opacity(0.78), border: theme.colors.border, cornerRadius: theme.radius.sm)
        }
        .buttonStyle(.plain)
        .help(candidate.name)
    }
}
