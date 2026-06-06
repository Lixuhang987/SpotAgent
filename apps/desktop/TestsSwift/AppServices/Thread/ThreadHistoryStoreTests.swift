import XCTest
@testable import HandAgentDesktop

final class ThreadHistoryStoreTests: XCTestCase {
    func testDefaultDirectoryUsesThreadsPath() {
        XCTAssertTrue(ThreadHistoryStore.defaultDirectory.path.hasSuffix("/.spotAgent/threads"))
    }

    func testReadsThreadFilesFromConfiguredDirectory() throws {
        let directory = try makeTemporaryDirectory()
        try writeThread(
            id: "thread-1",
            updatedAt: "2026-06-06T10:00:00.000Z",
            content: "hello thread",
            to: directory
        )

        let store = ThreadHistoryStore(directory: directory)

        XCTAssertEqual(store.list(), [
            ThreadHistoryEntry(
                id: "thread-1",
                title: "Thread 1",
                createdAt: "2026-06-06T09:00:00.000Z",
                updatedAt: "2026-06-06T10:00:00.000Z",
                messageCount: 1,
                preview: "hello thread"
            )
        ])
        XCTAssertEqual(store.load(threadID: "thread-1")?.messages, [
            ThreadHistoryMessage(id: "message-1", role: "user", text: "hello thread")
        ])
    }

    func testDeleteRemovesThreadFile() throws {
        let directory = try makeTemporaryDirectory()
        try writeThread(
            id: "thread-delete",
            updatedAt: "2026-06-06T10:00:00.000Z",
            content: "delete me",
            to: directory
        )

        let store = ThreadHistoryStore(directory: directory)
        store.delete(threadID: "thread-delete")

        XCTAssertEqual(store.list(), [])
    }

    private func makeTemporaryDirectory() throws -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock {
            try? FileManager.default.removeItem(at: directory)
        }
        return directory
    }

    private func writeThread(
        id: String,
        updatedAt: String,
        content: String,
        to directory: URL
    ) throws {
        let json = """
        {
          "version": 1,
          "metadata": {
            "id": "\(id)",
            "title": "Thread 1",
            "createdAt": "2026-06-06T09:00:00.000Z",
            "updatedAt": "\(updatedAt)",
            "messageCount": 1
          },
          "messages": [
            {
              "id": "message-1",
              "role": "user",
              "content": "\(content)"
            }
          ],
          "events": []
        }
        """
        try json.data(using: .utf8)?.write(to: directory.appendingPathComponent("\(id).json"))
    }
}
