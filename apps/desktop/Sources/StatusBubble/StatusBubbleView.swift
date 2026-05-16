import SwiftUI

struct StatusBubbleView: View {
    @Bindable var viewModel: StatusBubbleViewModel
    @Environment(\.appTheme) private var theme

    var body: some View {
        Button { viewModel.tap() } label: {
            VStack(alignment: .leading, spacing: 6) {
                Text(viewModel.isRunning ? "Running" : "Idle")
                    .font(theme.typography.titleFont)
                Text(viewModel.latestSummary)
                    .font(theme.typography.captionFont)
                    .foregroundStyle(theme.colors.textSecondary)
                    .lineLimit(2)
            }
            .statusBubbleContainer()
        }
        .buttonStyle(.plain)
    }
}
