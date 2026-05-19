import XCTest
@testable import HandAgentDesktop

final class SessionHistoryViewModelTests: XCTestCase {
    @MainActor
    func testRefreshLoadsSortedFilteredHistoryWithPreview() throws {
        let directory = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = SessionHistoryStore(directory: directory)
        try writeSession(
            to: directory.appendingPathComponent("session-a.json"),
            id: "session-a",
            title: "API 设计",
            createdAt: "2026-05-18T10:00:00.000Z",
            updatedAt: "2026-05-18T11:00:00.000Z",
            messages: [
                #"{"role":"user","content":"hello world"}"#,
                #"{"role":"assistant","content":"response"}"#,
            ]
        )
        try writeSession(
            to: directory.appendingPathComponent("session-b.json"),
            id: "session-b",
            title: "UI 讨论",
            createdAt: "2026-05-19T10:00:00.000Z",
            updatedAt: "2026-05-19T11:00:00.000Z",
            messages: [
                #"{"role":"user","content":"整理历史入口"}"#,
            ]
        )

        let viewModel = SessionHistoryViewModel(store: store)
        viewModel.refresh()

        XCTAssertEqual(viewModel.items.map(\SessionHistoryEntry.id), ["session-b", "session-a"])
        XCTAssertEqual(viewModel.items.first?.preview, "整理历史入口")

        viewModel.query = "api"
        XCTAssertEqual(viewModel.filteredItems.map(\SessionHistoryEntry.id), ["session-a"])

        viewModel.query = "hello"
        XCTAssertEqual(viewModel.filteredItems.map(\SessionHistoryEntry.id), ["session-a"])
    }

    @MainActor
    func testDeleteRequiresConfirmationBeforeRemovingFile() throws {
        let directory = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = SessionHistoryStore(directory: directory)
        let sessionURL = directory.appendingPathComponent("session-a.json")
        try writeSession(
            to: sessionURL,
            id: "session-a",
            title: "API 设计",
            createdAt: "2026-05-18T10:00:00.000Z",
            updatedAt: "2026-05-18T11:00:00.000Z",
            messages: [
                #"{"role":"user","content":"hello world"}"#,
            ]
        )

        let viewModel = SessionHistoryViewModel(store: store)
        viewModel.refresh()
        viewModel.requestDelete("session-a")

        XCTAssertEqual(viewModel.pendingDeletionID, "session-a")
        XCTAssertTrue(FileManager.default.fileExists(atPath: sessionURL.path))

        viewModel.confirmDelete()

        XCTAssertFalse(FileManager.default.fileExists(atPath: sessionURL.path))
        XCTAssertNil(viewModel.pendingDeletionID)
        XCTAssertTrue(viewModel.items.isEmpty)
    }

    private func makeTemporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private func writeSession(
        to url: URL,
        id: String,
        title: String,
        createdAt: String,
        updatedAt: String,
        messages: [String]
    ) throws {
        let json = """
        {
          "version": 1,
          "metadata": {
            "id": "\(id)",
            "title": "\(title)",
            "createdAt": "\(createdAt)",
            "updatedAt": "\(updatedAt)",
            "messageCount": \(messages.count)
          },
          "messages": [\(messages.joined(separator: ","))],
          "events": []
        }
        """
        guard let data = json.data(using: .utf8) else {
            XCTFail("Failed to encode session JSON")
            return
        }
        try data.write(to: url)
    }
}
