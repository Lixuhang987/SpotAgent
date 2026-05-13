// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "HandAgent",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "HandAgentDesktop", targets: ["HandAgentDesktop"])
    ],
    targets: [
        .executableTarget(
            name: "HandAgentDesktop",
            path: "apps/desktop",
            exclude: [
                "Web/App.tsx",
                "Web/BubbleList.tsx",
                "Web/build.mjs",
                "Web/main.tsx",
                "Web/node_modules",
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
        )
    ]
)
