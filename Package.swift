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
            exclude: [
                "TestsSwift",
                "desktop.md",
                "Web/App.tsx",
                "Web/BubbleList.tsx",
                "Web/build.mjs",
                "Web/main.tsx",
                "Web/node_modules",
                "Web/Web.md",
                "Web/PromptBox.tsx",
                "Web/package.json",
                "Web/sessionState.test.ts",
                "Web/sessionState.ts",
                "Web/tsconfig.json",
                "Web/bridge.ts",
                "Web/vitest.config.ts",
                "tests",
                "tests/hotkey.test.ts"
            ],
            resources: [
                .process("Web/index.html"),
                .process("Web/dist")
            ]
        ),
        .testTarget(
            name: "HandAgentDesktopTests",
            dependencies: ["HandAgentDesktop"],
            path: "apps/desktop/TestsSwift"
        )
    ]
)
