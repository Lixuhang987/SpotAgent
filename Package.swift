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
        .package(url: "https://github.com/sindresorhus/KeyboardShortcuts", from: "2.0.0")
    ],
    targets: [
        .executableTarget(
            name: "HandAgentDesktop",
            dependencies: [
                .product(name: "KeyboardShortcuts", package: "KeyboardShortcuts")
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
