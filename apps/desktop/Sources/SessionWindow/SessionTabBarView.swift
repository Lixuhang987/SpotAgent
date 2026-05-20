import SwiftUI

struct SessionTabBarView: View {
    let tabs: [SessionTabViewModel]
    let activeTabID: String?
    let onActivate: (String) -> Void
    let onClose: (String) -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: theme.spacing.xs) {
                ForEach(tabs) { tab in
                    SessionTabItemView(
                        tab: tab,
                        isActive: tab.tabID == activeTabID,
                        onActivate: { onActivate(tab.tabID) },
                        onClose: { onClose(tab.tabID) }
                    )
                }
            }
            .padding(.horizontal, theme.spacing.lg)
            .padding(.vertical, theme.spacing.xs)
        }
        .frame(minHeight: 42)
        .background(theme.colors.surface.opacity(0.22))
    }
}

struct SessionTabItemView: View {
    let tab: SessionTabViewModel
    let isActive: Bool
    let onActivate: () -> Void
    let onClose: () -> Void

    @Environment(\.appTheme) private var theme
    @State private var isHovering = false

    var body: some View {
        HStack(spacing: theme.spacing.xs) {
            Button(action: onActivate) {
                HStack(spacing: theme.spacing.xs) {
                    SessionTabStatusDot(tab: tab, isActive: isActive)
                    Text(tabTitle)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Spacer(minLength: theme.spacing.xs)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("切换到 \(tabTitle)")
            .accessibilityAddTraits(isActive ? [.isSelected] : [])

            SessionCloseTabButton(onClose: onClose)
        }
        .font(theme.typography.captionFont)
        .foregroundStyle(isActive ? theme.colors.textPrimary : theme.colors.textSecondary)
        .padding(.leading, theme.spacing.sm)
        .padding(.trailing, 6)
        .frame(width: 190, height: 30)
        .background(tabBackground)
        .clipShape(RoundedRectangle(cornerRadius: theme.radius.sm))
        .overlay(
            RoundedRectangle(cornerRadius: theme.radius.sm)
                .strokeBorder(tabBorder, lineWidth: 0.75)
        )
        .onHover { isHovering = $0 }
        .contextMenu {
            Button("关闭", action: onClose)
        }
        .help(tabTitle)
    }

    private var tabTitle: String {
        let rawTitle = tab.messages.first { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }?.text
            ?? tab.sessionID
        let singleLineTitle = rawTitle.replacingOccurrences(of: "\n", with: " ")
        guard singleLineTitle.count > 44 else { return singleLineTitle }
        return "\(singleLineTitle.prefix(41))..."
    }

    private var tabBackground: Color {
        if isActive {
            return theme.colors.accentSubtle
        }
        if isHovering {
            return theme.colors.surface.opacity(0.72)
        }
        return theme.colors.surface.opacity(0.42)
    }

    private var tabBorder: Color {
        isActive ? theme.colors.accentRing : theme.colors.border
    }
}

struct SessionCloseTabButton: View {
    let onClose: () -> Void

    @Environment(\.appTheme) private var theme
    @State private var isHovering = false

    var body: some View {
        Button(action: onClose) {
            Image(systemName: "xmark")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(isHovering ? theme.colors.textPrimary : theme.colors.textSecondary)
                .frame(width: 20, height: 20)
                .background(closeBackground)
                .clipShape(Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("关闭标签页")
        .help("关闭标签页")
        .onHover { isHovering = $0 }
    }

    private var closeBackground: Color {
        isHovering ? theme.colors.surface.opacity(0.95) : theme.colors.surface.opacity(0.001)
    }
}

private struct SessionTabStatusDot: View {
    let tab: SessionTabViewModel
    let isActive: Bool

    @Environment(\.appTheme) private var theme

    var body: some View {
        Circle()
            .fill(statusColor)
            .frame(width: 7, height: 7)
            .overlay(
                Circle()
                    .strokeBorder(theme.colors.background.opacity(isActive ? 0.5 : 0), lineWidth: 1)
            )
            .accessibilityHidden(true)
    }

    private var statusColor: Color {
        if tab.status.isRunning {
            return theme.colors.accent
        }
        switch tab.connectionState {
        case .connected:
            return isActive ? theme.colors.textSecondary.opacity(0.75) : theme.colors.textSecondary.opacity(0.45)
        case .connecting, .reconnecting:
            return theme.colors.accentHover
        case .disconnected:
            return theme.colors.error
        }
    }
}
