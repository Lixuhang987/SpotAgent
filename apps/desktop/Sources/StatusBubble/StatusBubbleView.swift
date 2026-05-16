import SwiftUI

struct StatusBubbleView: View {
    @Bindable var viewModel: StatusBubbleViewModel
    @Environment(\.appTheme) private var theme
    @State private var glowPulse = false

    var body: some View {
        Button { viewModel.tap() } label: {
            HStack(spacing: theme.spacing.md) {
                Circle()
                    .fill(viewModel.isRunning ? theme.colors.accent : theme.colors.textSecondary.opacity(0.4))
                    .frame(width: 10, height: 10)
                    .scaleEffect(glowPulse && viewModel.isRunning ? 1.3 : 1.0)
                VStack(alignment: .leading, spacing: 4) {
                    Text(viewModel.isRunning ? "Running" : "Idle")
                        .font(theme.typography.captionFont)
                        .fontWeight(.medium)
                        .foregroundStyle(viewModel.isRunning ? theme.colors.accent : theme.colors.textPrimary)
                    Text(viewModel.latestSummary)
                        .font(theme.typography.captionFont)
                        .foregroundStyle(theme.colors.textSecondary)
                        .lineLimit(2)
                }
            }
            .statusBubbleContainer(isRunning: viewModel.isRunning)
        }
        .buttonStyle(.plain)
        .onChange(of: viewModel.isRunning) { _, running in
            if running {
                withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true)) {
                    glowPulse = true
                }
            } else {
                withAnimation(.easeOut(duration: 0.3)) {
                    glowPulse = false
                }
            }
        }
    }
}
