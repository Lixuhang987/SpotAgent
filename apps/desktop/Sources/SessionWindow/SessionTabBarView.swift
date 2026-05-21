import SwiftUI

struct SessionTabBarView: View {
    let tabs: [SessionTabViewModel]
    let activeTabID: String?
    let onActivate: (String) -> Void
    let onClose: (String) -> Void
    let onNewTab: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 1) {
                    ForEach(tabs) { tab in
                        SessionTabItemView(
                            tab: tab,
                            isActive: tab.tabID == activeTabID,
                            onActivate: { onActivate(tab.tabID) },
                            onClose: { onClose(tab.tabID) }
                        )
                    }
                }
                .padding(.leading, theme.spacing.sm)
            }

            Button(action: onNewTab) {
                Image(systemName: "plus")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(theme.colors.textSecondary)
                    .frame(width: 28, height: 28)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("新标签页")
            .padding(.trailing, theme.spacing.sm)
        }
        .frame(height: 36)
        .background(theme.colors.surface)
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
                Text(tabTitle)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("切换到 \(tabTitle)")
            .accessibilityAddTraits(isActive ? [.isSelected] : [])

            if isHovering || isActive {
                SessionCloseTabButton(onClose: onClose)
            }
        }
        .font(theme.typography.captionFont)
        .foregroundStyle(isActive ? theme.colors.textPrimary : theme.colors.textSecondary)
        .padding(.horizontal, theme.spacing.md)
        .frame(minWidth: 80, maxWidth: 180, minHeight: 32)
        .background(isActive ? theme.colors.background : (isHovering ? theme.colors.surfaceHover : theme.colors.surface))
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: theme.radius.md, topTrailingRadius: theme.radius.md))
        .contentShape(Rectangle())
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
}

struct SessionCloseTabButton: View {
    let onClose: () -> Void

    @Environment(\.appTheme) private var theme
    @State private var isHovering = false

    var body: some View {
        Button(action: onClose) {
            Image(systemName: "xmark")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(isHovering ? theme.colors.textPrimary : theme.colors.textSecondary)
                .frame(width: 16, height: 16)
                .background(isHovering ? theme.colors.surfaceHover : theme.colors.surfaceHover.opacity(0.001))
                .clipShape(Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("关闭标签页")
        .help("关闭标签页")
        .onHover { isHovering = $0 }
    }
}
