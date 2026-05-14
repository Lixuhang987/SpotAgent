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
    targets: [
        .executableTarget(
            name: "HandAgentDesktop",
            path: "apps/desktop",
            exclude: ["TestsSwift", "desktop.md", "tests"]
        ),
        .testTarget(
            name: "HandAgentDesktopTests",
            dependencies: ["HandAgentDesktop"],
            path: "apps/desktop/TestsSwift"
        )
    ]
)
