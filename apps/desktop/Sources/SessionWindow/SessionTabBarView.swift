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
            .padding(.horizontal, theme.spacing.md)
            .padding(.vertical, theme.spacing.xs)
        }
    }
}

struct SessionTabItemView: View {
    let tab: SessionTabViewModel
    let isActive: Bool
    let onActivate: () -> Void
    let onClose: () -> Void

    @Environment(\.appTheme) private var theme

    var body: some View {
        Button(action: onActivate) {
            HStack(spacing: theme.spacing.xs) {
                if tab.status == "running" {
                    Circle()
                        .fill(theme.colors.accent)
                        .frame(width: 6, height: 6)
                }
                Text(tab.messages.first?.text ?? tab.sessionID)
                    .lineLimit(1)
                Image(systemName: "xmark")
                    .font(.system(size: 10))
            }
            .font(theme.typography.captionFont)
            .padding(.horizontal, theme.spacing.sm)
            .padding(.vertical, theme.spacing.xs)
            .background(isActive ? theme.colors.accentSubtle : theme.colors.surface.opacity(0.45))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button("关闭", action: onClose)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }
}
