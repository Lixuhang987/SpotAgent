// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "HandAgent",
    platforms: [
        .macOS(.v15)
    ],
    products: [
        .executable(name: "HandAgentDesktop", targets: ["HandAgentDesktop"])
    ],
    dependencies: [
        .package(url: "https://github.com/sindresorhus/KeyboardShortcuts", from: "2.0.0"),
        .package(url: "https://github.com/gonzalezreal/swift-markdown-ui", from: "2.4.1")
    ],
    targets: [
        .executableTarget(
            name: "HandAgentDesktop",
            dependencies: [
                .product(name: "KeyboardShortcuts", package: "KeyboardShortcuts"),
                .product(name: "MarkdownUI", package: "swift-markdown-ui")
            ],
            path: "apps/desktop",
            exclude: ["TestsSwift", "desktop.md"]
        ),
        .testTarget(
            name: "HandAgentDesktopTests",
            dependencies: ["HandAgentDesktop"],
            path: "apps/desktop/TestsSwift"
        )
    ]
)
