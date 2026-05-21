import SwiftUI

// MARK: - Tab Bar

enum SettingsTab: String, CaseIterable, Identifiable {
    case model
    case tools
    case permissions
    case shortcuts
    case workspaces

    var id: String { rawValue }

    var title: String {
        switch self {
        case .model: return "模型"
        case .tools: return "工具"
        case .permissions: return "权限"
        case .shortcuts: return "快捷键"
        case .workspaces: return "工作区"
        }
    }

    var icon: String {
        switch self {
        case .model: return "cpu"
        case .tools: return "slider.horizontal.3"
        case .permissions: return "lock.shield"
        case .shortcuts: return "keyboard"
        case .workspaces: return "folder"
        }
    }
}

struct SettingsTabBar: View {
    let tabs: [SettingsTab]
    @Binding var selected: SettingsTab
    @Environment(\.appTheme) private var theme

    var body: some View {
        HStack(spacing: 2) {
            ForEach(tabs) { tab in
                tabButton(tab)
            }
        }
        .padding(.horizontal, theme.spacing.lg)
        .padding(.top, 6)
        .padding(.bottom, theme.spacing.sm)
    }

    private func tabButton(_ tab: SettingsTab) -> some View {
        let isSelected = selected == tab
        return Button {
            selected = tab
        } label: {
            VStack(spacing: 4) {
                Image(systemName: tab.icon)
                    .font(.system(size: 20))
                    .frame(height: 24)
                Text(tab.title)
                    .font(.system(size: 11))
            }
            .foregroundStyle(isSelected ? theme.colors.textPrimary : theme.colors.textSecondary)
            .frame(width: 72, height: 56)
            .borderedCard(
                fill: isSelected ? theme.colors.surface : Color.clear,
                border: isSelected ? theme.colors.border : Color.clear,
                cornerRadius: theme.radius.md
            )
            .contentShape(RoundedRectangle(cornerRadius: theme.radius.md))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Section

struct SettingsSectionHeader: View {
    @Environment(\.appTheme) private var theme
    let title: String

    init(_ title: String) {
        self.title = title
    }

    var body: some View {
        Text(title)
            .font(theme.typography.captionFont.weight(.semibold))
            .foregroundStyle(theme.colors.textSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, theme.spacing.xxl)
            .padding(.top, theme.spacing.lg)
            .padding(.bottom, theme.spacing.xs)
    }
}

struct SettingsSection<Content: View>: View {
    @Environment(\.appTheme) private var theme
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            content()
        }
        .padding(.vertical, theme.spacing.lg)
        .padding(.horizontal, theme.spacing.xxl)
    }
}

struct SettingsListSection<Data: RandomAccessCollection, RowContent: View>: View where Data.Element: Identifiable {
    let items: Data
    @ViewBuilder let rowContent: (Data.Element) -> RowContent

    var body: some View {
        SettingsSection {
            let firstID = items.first?.id
            ForEach(items) { item in
                if item.id != firstID {
                    SettingsRowDivider()
                }
                rowContent(item)
            }
        }
    }
}

// MARK: - Row (left label, right control)

struct SettingsRow<Control: View>: View {
    @Environment(\.appTheme) private var theme
    let label: String
    @ViewBuilder let control: () -> Control

    init(_ label: String, @ViewBuilder control: @escaping () -> Control) {
        self.label = label
        self.control = control
    }

    var body: some View {
        HStack(alignment: .center, spacing: theme.spacing.xl) {
            Text(label)
                .font(theme.typography.bodyFont)
                .foregroundStyle(theme.colors.textSecondary)
                .frame(width: 120, alignment: .trailing)
            control()
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, theme.spacing.md)
    }
}

// MARK: - Row Divider

struct SettingsRowDivider: View {
    @Environment(\.appTheme) private var theme

    var body: some View {
        Divider()
            .overlay(theme.colors.border)
            .padding(.leading, 152)
    }
}

// MARK: - Field Style

struct SettingsFieldStyle: TextFieldStyle {
    @Environment(\.appTheme) private var theme

    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .textFieldStyle(.plain)
            .font(theme.typography.bodyFont)
            .foregroundStyle(theme.colors.textPrimary)
            .padding(.horizontal, theme.spacing.md)
            .padding(.vertical, 8)
            .frame(maxWidth: 340)
            .background(
                RoundedRectangle(cornerRadius: theme.radius.sm)
                    .fill(theme.colors.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: theme.radius.sm)
                    .strokeBorder(theme.colors.border, lineWidth: 0.5)
            )
    }
}

// MARK: - Section Separator

struct SettingsSectionSeparator: View {
    @Environment(\.appTheme) private var theme

    var body: some View {
        Rectangle()
            .fill(theme.colors.border)
            .frame(height: 0.5)
    }
}
