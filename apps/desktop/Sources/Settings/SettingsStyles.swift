import SwiftUI

// MARK: - Tab Bar

struct SettingsTabItem: Identifiable, Equatable {
    let id: String
    let title: String
    let icon: String
}

struct SettingsTabBar: View {
    let tabs: [SettingsTabItem]
    @Binding var selected: String
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

    private func tabButton(_ tab: SettingsTabItem) -> some View {
        let isSelected = selected == tab.id
        return Button {
            selected = tab.id
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
            .background(
                RoundedRectangle(cornerRadius: theme.radius.md)
                    .fill(isSelected ? theme.colors.surface : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: theme.radius.md)
                    .strokeBorder(isSelected ? theme.colors.border : Color.clear, lineWidth: 0.5)
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
                    .fill(Color.black.opacity(0.3))
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
