import SwiftUI

struct StatusBubbleView: View {
    @ObservedObject var registry: SessionRegistry
    let onTap: () -> Void

    private var summary: SessionSummary? {
        registry.primarySessionID.flatMap { registry.summaries[$0] }
    }

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 6) {
                Text(summary?.isRunning == true ? "Running" : "Idle")
                    .font(.headline)
                Text(summary?.latestSummary ?? "点击开始")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Color(nsColor: .windowBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.black.opacity(0.08), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
    }
}
