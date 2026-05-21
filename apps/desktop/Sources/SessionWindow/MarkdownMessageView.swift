import MarkdownUI
import SwiftUI

struct MarkdownMessageView: View {
    let text: String
    let role: String

    @Environment(\.appTheme) private var theme

    var body: some View {
        Markdown(text)
            .markdownTheme(handAgentTheme)
            .textSelection(.enabled)
    }

    private var handAgentTheme: MarkdownUI.Theme {
        .init()
            .text {
                ForegroundColor(theme.colors.textPrimary)
                FontSize(15)
            }
            .code {
                FontFamilyVariant(.monospaced)
                FontSize(.em(0.88))
                ForegroundColor(theme.colors.accent)
                BackgroundColor(theme.colors.surface)
            }
            .strong {
                FontWeight(.semibold)
            }
            .link {
                ForegroundColor(theme.colors.accent)
            }
            .heading1 { configuration in
                configuration.label
                    .markdownMargin(top: 16, bottom: 8)
                    .markdownTextStyle {
                        FontWeight(.bold)
                        FontSize(.em(1.5))
                        ForegroundColor(theme.colors.textPrimary)
                    }
            }
            .heading2 { configuration in
                configuration.label
                    .markdownMargin(top: 12, bottom: 6)
                    .markdownTextStyle {
                        FontWeight(.semibold)
                        FontSize(.em(1.3))
                        ForegroundColor(theme.colors.textPrimary)
                    }
            }
            .heading3 { configuration in
                configuration.label
                    .markdownMargin(top: 10, bottom: 4)
                    .markdownTextStyle {
                        FontWeight(.semibold)
                        FontSize(.em(1.1))
                        ForegroundColor(theme.colors.textPrimary)
                    }
            }
            .paragraph { configuration in
                configuration.label
                    .relativeLineSpacing(.em(0.2))
                    .markdownMargin(top: 0, bottom: 10)
            }
            .blockquote { configuration in
                HStack(spacing: 0) {
                    RoundedRectangle(cornerRadius: 1)
                        .fill(theme.colors.accent.opacity(0.6))
                        .frame(width: 3)
                    configuration.label
                        .padding(.leading, 10)
                        .markdownTextStyle {
                            ForegroundColor(theme.colors.textSecondary)
                        }
                }
                .markdownMargin(top: 4, bottom: 10)
            }
            .codeBlock { configuration in
                configuration.label
                    .markdownTextStyle {
                        FontFamilyVariant(.monospaced)
                        FontSize(.em(0.88))
                    }
                    .padding(12)
                    .background(theme.colors.surface)
                    .clipShape(RoundedRectangle(cornerRadius: theme.radius.sm))
                    .markdownMargin(top: 4, bottom: 10)
            }
            .listItem { configuration in
                configuration.label
                    .markdownMargin(top: .em(0.2))
            }
    }
}
