import Foundation

struct AgentServerRepositoryRootLocator {
    let agentServerRelativePath: String
    var fileExists: (String) -> Bool = { FileManager.default.fileExists(atPath: $0) }

    func locate(
        bundleExecutableURL: URL?,
        bundleResourceURL: URL?,
        bundleURL: URL?,
        currentDirectoryURL: URL
    ) -> URL? {
        let candidates: [URL] = [
            currentDirectoryURL,
            bundleExecutableURL,
            bundleResourceURL,
            bundleURL,
        ].compactMap { $0 }

        for candidate in candidates {
            if let root = findRepositoryRoot(startingAt: candidate) {
                return root
            }
        }

        return nil
    }

    func findRepositoryRoot(startingAt url: URL) -> URL? {
        var current = url.standardizedFileURL
        var visitedPaths = Set<String>()

        while true {
            let currentPath = current.path
            guard visitedPaths.insert(currentPath).inserted else {
                return nil
            }

            let packageManifest = current.appendingPathComponent("Package.swift")
            let serverPath = current.appendingPathComponent(agentServerRelativePath)

            if fileExists(packageManifest.path),
               fileExists(serverPath.path) {
                return current
            }

            if currentPath == "/" {
                return nil
            }

            let parent = current.deletingLastPathComponent()
            if parent.path == currentPath {
                return nil
            }

            current = parent
        }
    }
}
