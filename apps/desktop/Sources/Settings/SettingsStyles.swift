import SwiftUI

struct SettingsCardModifier: ViewModifier {
    @Environment(\.appTheme) private var theme
    let title: String?

    func body(content: Content) -> some View {
        VStack(alignment: .leading, spacing: theme.spacing.md) {
            if let title {
                Text(title)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(theme.colors.textSecondary)
                    .textCase(.uppercase)
                    .tracking(0.6)
            }
            content
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(theme.spacing.lg)
        .background(theme.colors.surface)
        .clipShape(RoundedRectangle(cornerRadius: theme.radius.md))
        .overlay(
            RoundedRectangle(cornerRadius: theme.radius.md)
                .strokeBorder(theme.colors.border, lineWidth: 0.5)
        )
    }
}

struct SettingsFieldStyle: TextFieldStyle {
    @Environment(\.appTheme) private var theme

    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .textFieldStyle(.plain)
            .font(theme.typography.bodyFont)
            .foregroundStyle(theme.colors.textPrimary)
            .padding(.horizontal, theme.spacing.md)
            .padding(.vertical, 8)
            .background(theme.colors.background.opacity(0.6))
            .clipShape(RoundedRectangle(cornerRadius: theme.radius.sm))
            .overlay(
                RoundedRectangle(cornerRadius: theme.radius.sm)
                    .strokeBorder(theme.colors.border, lineWidth: 0.5)
            )
    }
}

struct SettingsRow<Control: View>: View {
    @Environment(\.appTheme) private var theme
    let label: String
    let hint: String?
    @ViewBuilder let control: () -> Control

    init(_ label: String, hint: String? = nil, @ViewBuilder control: @escaping () -> Control) {
        self.label = label
        self.hint = hint
        self.control = control
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(theme.typography.captionFont)
                .foregroundStyle(theme.colors.textSecondary)
            control()
            if let hint {
                Text(hint)
                    .font(theme.typography.captionFont)
                    .foregroundStyle(theme.colors.textSecondary.opacity(0.7))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension View {
    func settingsCard(_ title: String? = nil) -> some View {
        modifier(SettingsCardModifier(title: title))
    }
}
