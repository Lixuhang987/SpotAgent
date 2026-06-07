import SwiftUI

struct StatusBubbleView: View {
    @Bindable var viewModel: StatusBubbleViewModel
    @Environment(\.appTheme) private var theme
    @State private var glowPulse = false

    var body: some View {
        HStack(spacing: theme.spacing.md) {
            Circle()
                .fill(viewModel.isRunning ? theme.colors.accentTeal : theme.colors.mutedSoft)
                .frame(width: 10, height: 10)
                .scaleEffect(glowPulse && viewModel.isRunning ? 1.3 : 1.0)
            VStack(alignment: .leading, spacing: 4) {
                Text(viewModel.isRunning ? "Running" : "Idle")
                    .font(theme.typography.captionFont)
                    .fontWeight(.medium)
                    .foregroundStyle(viewModel.isRunning ? theme.colors.accent : theme.colors.ink)
                Text(viewModel.latestSummary)
                    .font(theme.typography.captionFont)
                    .foregroundStyle(theme.colors.muted)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
        }
        .statusBubbleContainer(isRunning: viewModel.isRunning)
        .contentShape(Rectangle())
        .onTapGesture { viewModel.tap() }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(viewModel.isRunning ? "HandAgent 正在运行" : "HandAgent 空闲")
        .accessibilityHint("打开最近 thread 或输入面板")
        .accessibilityAddTraits(.isButton)
        .accessibilityAction {
            viewModel.tap()
        }
        .onAppear {
            updateGlowPulse(isRunning: viewModel.isRunning)
        }
        .onChange(of: viewModel.isRunning) { _, running in
            updateGlowPulse(isRunning: running)
        }
    }

    private func updateGlowPulse(isRunning: Bool) {
        if isRunning {
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
