import Foundation

@MainActor
final class PromptCaptureCoordinator {
    private let controller: PromptPanelController
    private let selectionProvider: any SelectionCaptureProvider
    private let regionProvider: any RegionCaptureProvider

    init(
        controller: PromptPanelController,
        selectionProvider: any SelectionCaptureProvider,
        regionProvider: any RegionCaptureProvider
    ) {
        self.controller = controller
        self.selectionProvider = selectionProvider
        self.regionProvider = regionProvider
    }

    func captureSelectionAndShow() async {
        let result = await selectionProvider.captureSelectedText()
        let attachmentId = "selection-\(UUID().uuidString)"
        switch result {
        case .selected(let text):
            controller.appendAttachment(.textSelection(id: attachmentId, text: text))
        case .empty:
            break
        case .error(let message):
            controller.appendAttachment(.selectionError(id: attachmentId, message: message))
        }
        controller.show()
    }

    func captureRegionAndShow() async {
        let result = await regionProvider.captureRegion()
        let attachmentId = "region-\(UUID().uuidString)"
        switch result {
        case .captured(let pngBase64):
            controller.appendAttachment(
                .imageRegion(id: attachmentId, mimeType: "image/png", base64: pngBase64)
            )
            controller.show()
        case .cancelled:
            break
        case .error(let message):
            controller.appendAttachment(.selectionError(id: attachmentId, message: message))
            controller.show()
        }
    }
}
