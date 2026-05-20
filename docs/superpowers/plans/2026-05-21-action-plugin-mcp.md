# Action Plugin MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build user-triggered local Plugin Actions in PromptPanel, render template prompts on the desktop side, and bind MCP tools to only the new session created by that Action.

**Architecture:** Desktop owns Action discovery, trigger parsing, argument editing, and template rendering from local Plugin manifests. Agent-server validates `{ pluginId, promptName }`, persists session-scoped tool bindings, and composes builtin tools with MCP tools only for bound sessions. MCP servers are configured separately and accessed through a new standard MCP client adapter supporting `stdio` and Streamable HTTP.

**Tech Stack:** Swift 6 / SwiftUI / XCTest for desktop; TypeScript / Vitest for core and agent-server; MCP JSON-RPC over stdio and Streamable HTTP; existing WebSocket `SessionMessage` protocol.

---

## Execution Setup

Implementation must follow the repository workflow from `AGENTS.md`.

- [ ] **Step 1: Create the implementation worktree**

```bash
git worktree add .worktrees/action-plugin-mcp -b codex/action-plugin-mcp
cd .worktrees/action-plugin-mcp
```

Expected: a new worktree at `/Users/mu9/proj/handAgent/.worktrees/action-plugin-mcp` on branch `codex/action-plugin-mcp`.

- [ ] **Step 2: Initialize dependencies**

```bash
pnpm install
```

Expected: install succeeds without changing source files beyond dependency lockfile changes that already belong to the repository.

- [ ] **Step 3: Run baseline verification before editing**

```bash
bash ./scripts/test.sh
bash ./scripts/swiftw build
```

Expected: both commands pass. If either fails before edits, capture the failure and stop to decide whether the baseline is acceptable.

---

## File Structure

Create focused files instead of expanding `PromptAction.swift`, `SettingsBackedToolRegistry.ts`, or `SessionRouter.ts` into god files.

### Desktop

- Create `apps/desktop/Sources/PromptPanel/ActionDefinition.swift`  
  Local Plugin manifest DTOs, validation, disabled reason model, and conversion to UI-facing `ActionDefinition`.
- Create `apps/desktop/Sources/PromptPanel/ActionManifestStore.swift`  
  Reads `~/.spotAgent/plugins/*/plugin.json`, applies stable plugin ordering, tracks file stamps, returns enabled actions and disabled reasons.
- Create `apps/desktop/Sources/PromptPanel/ActionInvocation.swift`  
  Pure parsing of trigger input, positional arguments, quoted arguments, and template rendering.
- Modify `apps/desktop/Sources/PromptPanel/PromptPanelViewModel.swift`  
  Replace `PromptAction` list with `ActionDefinition` list, add parameter editing state and submit callback for rendered Action invocation.
- Modify `apps/desktop/Sources/PromptPanel/PromptPanelView.swift`  
  Render Action rows and parameter slots, remove assumptions about `PromptAction.shortcutName`.
- Modify `apps/desktop/Sources/PromptPanel/PromptPanelController.swift`  
  Register actions through the new store and forward Action submissions.
- Modify `apps/desktop/Sources/Coordinator/AppCoordinator.swift`  
  Remove base PromptAction entries, refresh local Plugin Actions on panel show, and route Action submissions to a new session.
- Modify `apps/desktop/Sources/Coordinator/PromptSubmission.swift`  
  Carry optional `ActionBindingPayload` through prompt composition.
- Modify `apps/desktop/Sources/SessionWindow/SessionSocketClient.swift`  
  Encode `actionBinding` in `create_session_request`.
- Modify Swift tests under `apps/desktop/TestsSwift/PromptPanel/`, `apps/desktop/TestsSwift/Coordinator/`, and `apps/desktop/TestsSwift/SessionWindow/`.

### Core / Agent Server

- Create `packages/core/src/actions/PluginManifest.ts`  
  Shared TypeScript parser for new local Plugin manifest shape.
- Create `packages/core/src/actions/ActionBinding.ts`  
  Types for persisted session action binding and helpers to resolve a prompt’s `mcpServerIds`.
- Modify `packages/core/src/protocol/SessionMessage.ts`  
  Add `actionBinding` to `create_session_request.payload`.
- Modify `packages/core/src/storage/SessionRecord.ts` and `SessionStore.ts`  
  Add optional session metadata action binding and create-session input support.
- Modify `packages/core/src/storage/FileSessionStore.ts` and `InMemorySessionStore.ts`  
  Persist and list sessions without losing action metadata.
- Create `packages/core/src/mcp/MCPConfig.ts`  
  Parse `~/.spotAgent/mcp.json`.
- Create `packages/core/src/mcp/MCPClient.ts`  
  Minimal MCP client interface.
- Create `packages/core/src/mcp/StdioMCPClient.ts`  
  JSON-RPC over stdio transport.
- Create `packages/core/src/mcp/StreamableHttpMCPClient.ts`  
  JSON-RPC over MCP Streamable HTTP transport, including JSON and SSE responses.
- Create `packages/core/src/mcp/MCPToolAdapter.ts`  
  Wrap MCP `tools/list` entries as `AgentTool` with exposed names `mcp.<serverId>.<toolName>`.
- Create `apps/agent-server/src/ActionBindingResolver.ts`  
  Re-read Plugin manifest server-side and resolve binding from `{ pluginId, promptName }`.
- Create `apps/agent-server/src/SessionScopedToolRegistry.ts`  
  Compose builtin registry with session-bound MCP tools, enforce session authorization on MCP tools.
- Modify `apps/agent-server/src/SettingsBackedToolRegistry.ts`  
  Remove private plugin loader path and keep builtin + settings filtering responsibilities.
- Modify `apps/agent-server/src/SessionRouter.ts`  
  Validate action binding during `create_session_request` and persist it.
- Modify `apps/agent-server/src/SessionRuntimeOrchestrator.ts`  
  Refresh session-scoped tools before each run.
- Modify `apps/agent-server/src/server.ts`  
  Wire `ActionBindingResolver`, MCP config, MCP tool provider, and session-scoped registry into default server startup.
- Replace or remove old private plugin tests under `packages/core/tests/tools/plugins/`.
- Add tests under `packages/core/tests/actions/`, `packages/core/tests/mcp/`, and `apps/agent-server/tests/actions/`.

### Documentation

- Modify `apps/desktop/Sources/PromptPanel/prompt-panel.md`.
- Modify `apps/desktop/desktop.md`.
- Modify `apps/agent-server/agent-server.md`.
- Modify `packages/core/src/tools/tools.md`.
- Create `packages/core/src/mcp/mcp.md`.
- Modify `README.md`.

---

## Task 1: Desktop Action Manifest Parsing

**Files:**
- Create: `apps/desktop/Sources/PromptPanel/ActionDefinition.swift`
- Create: `apps/desktop/Sources/PromptPanel/ActionManifestStore.swift`
- Test: `apps/desktop/TestsSwift/PromptPanel/ActionDefinitionTests.swift`
- Test: `apps/desktop/TestsSwift/PromptPanel/ActionManifestStoreTests.swift`

- [ ] **Step 1: Write failing DTO and validation tests**

Add `ActionDefinitionTests` with these exact cases:

```swift
import XCTest
@testable import HandAgentDesktop

final class ActionDefinitionTests: XCTestCase {
    func testParsesEnabledPluginPromptIntoActionDefinition() throws {
        let data = """
        {
          "version": 1,
          "id": "review",
          "title": "Review",
          "enabled": true,
          "mcpServerIds": ["github"],
          "prompts": [
            {
              "name": "code_review",
              "trigger": "r",
              "title": "Request Code Review",
              "description": "Review code",
              "template": "Review this code:\\n{{code}}",
              "arguments": [
                { "name": "code", "description": "The code", "required": true }
              ]
            }
          ]
        }
        """.data(using: .utf8)!

        let manifest = try PluginManifestDefinition.decode(data)
        let actions = ActionDefinition.buildActions(from: [manifest])

        XCTAssertEqual(actions.enabled.map(\.id), ["review/code_review"])
        XCTAssertEqual(actions.enabled.first?.pluginId, "review")
        XCTAssertEqual(actions.enabled.first?.promptName, "code_review")
        XCTAssertEqual(actions.enabled.first?.trigger, "r")
        XCTAssertEqual(actions.enabled.first?.mcpServerIds, ["github"])
        XCTAssertEqual(actions.enabled.first?.arguments.map(\.name), ["code"])
        XCTAssertEqual(actions.disabled, [])
    }

    func testDisablesPromptWhenTemplateReferencesUnknownArgument() throws {
        let manifest = PluginManifestDefinition(
            version: 1,
            id: "review",
            title: "Review",
            description: nil,
            enabled: true,
            mcpServerIds: [],
            prompts: [
                PluginPromptDefinition(
                    name: "bad",
                    trigger: "b",
                    title: "Bad",
                    description: nil,
                    template: "Hello {{missing}}",
                    arguments: [],
                    icons: nil
                )
            ]
        )

        let actions = ActionDefinition.buildActions(from: [manifest])

        XCTAssertEqual(actions.enabled, [])
        XCTAssertEqual(actions.disabled.map(\.id), ["review/bad"])
        XCTAssertEqual(actions.disabled.first?.reason, "template references undeclared argument: missing")
    }

    func testTriggerConflictKeepsFirstPluginByStableOrder() throws {
        let first = PluginManifestDefinition.testManifest(id: "alpha", trigger: "r")
        let second = PluginManifestDefinition.testManifest(id: "beta", trigger: "R")

        let actions = ActionDefinition.buildActions(from: [second, first])

        XCTAssertEqual(actions.enabled.map(\.pluginId), ["alpha"])
        XCTAssertEqual(actions.disabled.map(\.id), ["beta/code_review"])
        XCTAssertEqual(actions.disabled.first?.reason, "trigger conflicts with alpha/code_review")
    }
}

private extension PluginManifestDefinition {
    static func testManifest(id: String, trigger: String) -> PluginManifestDefinition {
        PluginManifestDefinition(
            version: 1,
            id: id,
            title: id,
            description: nil,
            enabled: true,
            mcpServerIds: [],
            prompts: [
                PluginPromptDefinition(
                    name: "code_review",
                    trigger: trigger,
                    title: "Review",
                    description: nil,
                    template: "{{code}}",
                    arguments: [
                        ActionArgumentDefinition(
                            name: "code",
                            description: nil,
                            required: true
                        )
                    ],
                    icons: nil
                )
            ]
        )
    }
}
```

- [ ] **Step 2: Run tests and verify failure**

```bash
bash ./scripts/swiftw test --filter ActionDefinitionTests
```

Expected: FAIL because `PluginManifestDefinition`, `ActionDefinition`, and helper types do not exist.

- [ ] **Step 3: Implement Action DTOs**

Create `ActionDefinition.swift`:

```swift
import Foundation

struct PluginManifestDefinition: Codable, Equatable {
    let version: Int
    let id: String
    let title: String
    let description: String?
    let enabled: Bool?
    let mcpServerIds: [String]?
    let prompts: [PluginPromptDefinition]

    static func decode(_ data: Data) throws -> PluginManifestDefinition {
        try JSONDecoder().decode(PluginManifestDefinition.self, from: data)
    }
}

struct PluginPromptDefinition: Codable, Equatable {
    let name: String
    let trigger: String
    let title: String
    let description: String?
    let template: String
    let arguments: [ActionArgumentDefinition]?
    let icons: [ActionIconDefinition]?
}

struct ActionArgumentDefinition: Codable, Equatable, Identifiable {
    let name: String
    let description: String?
    let required: Bool?

    var id: String { name }
    var isRequired: Bool { required ?? false }
}

struct ActionIconDefinition: Codable, Equatable {
    let src: String
    let mimeType: String?
    let sizes: [String]?
}

struct DisabledActionDefinition: Equatable, Identifiable {
    let id: String
    let reason: String
}

struct ActionDefinitionBuildResult: Equatable {
    let enabled: [ActionDefinition]
    let disabled: [DisabledActionDefinition]
}

struct ActionDefinition: Equatable, Identifiable {
    let id: String
    let pluginId: String
    let promptName: String
    let trigger: String
    let title: String
    let description: String?
    let template: String
    let arguments: [ActionArgumentDefinition]
    let mcpServerIds: [String]
    let icons: [ActionIconDefinition]

    static func buildActions(from manifests: [PluginManifestDefinition]) -> ActionDefinitionBuildResult {
        var enabled: [ActionDefinition] = []
        var disabled: [DisabledActionDefinition] = []
        var triggers: [String: String] = [:]

        for manifest in manifests.sorted(by: { $0.id < $1.id }) {
            guard manifest.version == 1 else {
                disabled.append(.init(id: manifest.id, reason: "unsupported plugin version"))
                continue
            }
            guard manifest.enabled != false else {
                disabled.append(contentsOf: manifest.prompts.map {
                    .init(id: "\(manifest.id)/\($0.name)", reason: "plugin disabled")
                })
                continue
            }
            guard !manifest.prompts.isEmpty else {
                disabled.append(.init(id: manifest.id, reason: "plugin prompts must not be empty"))
                continue
            }

            for prompt in manifest.prompts {
                let promptId = "\(manifest.id)/\(prompt.name)"
                let validationError = validate(manifest: manifest, prompt: prompt)
                if let validationError {
                    disabled.append(.init(id: promptId, reason: validationError))
                    continue
                }

                let normalizedTrigger = prompt.trigger.lowercased()
                if let existing = triggers[normalizedTrigger] {
                    disabled.append(.init(id: promptId, reason: "trigger conflicts with \(existing)"))
                    continue
                }

                let action = ActionDefinition(
                    id: promptId,
                    pluginId: manifest.id,
                    promptName: prompt.name,
                    trigger: prompt.trigger,
                    title: prompt.title,
                    description: prompt.description,
                    template: prompt.template,
                    arguments: prompt.arguments ?? [],
                    mcpServerIds: manifest.mcpServerIds ?? [],
                    icons: prompt.icons ?? []
                )
                triggers[normalizedTrigger] = promptId
                enabled.append(action)
            }
        }

        return ActionDefinitionBuildResult(enabled: enabled, disabled: disabled)
    }

    private static func validate(
        manifest: PluginManifestDefinition,
        prompt: PluginPromptDefinition
    ) -> String? {
        if manifest.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "plugin id must not be empty"
        }
        if prompt.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "prompt name must not be empty"
        }
        if prompt.trigger.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "trigger must not be empty"
        }
        if prompt.trigger.contains(where: { $0.isWhitespace }) {
            return "trigger must not contain whitespace"
        }
        if prompt.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "title must not be empty"
        }
        if prompt.template.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return "template must not be empty"
        }

        let declared = Set((prompt.arguments ?? []).map(\.name))
        for placeholder in placeholders(in: prompt.template) where !declared.contains(placeholder) {
            return "template references undeclared argument: \(placeholder)"
        }
        return nil
    }

    static func placeholders(in template: String) -> [String] {
        let pattern = #"\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let nsRange = NSRange(template.startIndex..<template.endIndex, in: template)
        return regex.matches(in: template, range: nsRange).compactMap { match in
            guard let range = Range(match.range(at: 1), in: template) else { return nil }
            return String(template[range])
        }
    }
}
```

- [ ] **Step 4: Run DTO tests**

```bash
bash ./scripts/swiftw test --filter ActionDefinitionTests
```

Expected: PASS.

- [ ] **Step 5: Write failing manifest store tests**

Add `ActionManifestStoreTests`:

```swift
import XCTest
@testable import HandAgentDesktop

final class ActionManifestStoreTests: XCTestCase {
    func testLoadsPluginManifestsFromStablePluginDirectories() throws {
        let root = try FileManager.default.url(
            for: .itemReplacementDirectory,
            in: .userDomainMask,
            appropriateFor: FileManager.default.temporaryDirectory,
            create: true
        )
        defer { try? FileManager.default.removeItem(at: root) }
        let plugins = root.appendingPathComponent("plugins", isDirectory: true)
        try FileManager.default.createDirectory(at: plugins.appendingPathComponent("beta", isDirectory: true), withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: plugins.appendingPathComponent("alpha", isDirectory: true), withIntermediateDirectories: true)
        try writePlugin(id: "beta", trigger: "b", to: plugins.appendingPathComponent("beta/plugin.json"))
        try writePlugin(id: "alpha", trigger: "a", to: plugins.appendingPathComponent("alpha/plugin.json"))

        let store = ActionManifestStore(pluginsDirectoryURL: plugins)
        let result = store.load()

        XCTAssertEqual(result.actions.map(\.pluginId), ["alpha", "beta"])
        XCTAssertEqual(result.disabled, [])
    }

    func testDisablesManifestWhenDirectoryNameDoesNotMatchId() throws {
        let root = try FileManager.default.url(
            for: .itemReplacementDirectory,
            in: .userDomainMask,
            appropriateFor: FileManager.default.temporaryDirectory,
            create: true
        )
        defer { try? FileManager.default.removeItem(at: root) }
        let plugins = root.appendingPathComponent("plugins", isDirectory: true)
        let wrong = plugins.appendingPathComponent("wrong", isDirectory: true)
        try FileManager.default.createDirectory(at: wrong, withIntermediateDirectories: true)
        try writePlugin(id: "actual", trigger: "a", to: wrong.appendingPathComponent("plugin.json"))

        let result = ActionManifestStore(pluginsDirectoryURL: plugins).load()

        XCTAssertEqual(result.actions, [])
        XCTAssertEqual(result.disabled.map(\.id), ["plugin:wrong"])
        XCTAssertEqual(result.disabled.first?.reason, "plugin id must match directory name")
    }
}

private func writePlugin(id: String, trigger: String, to url: URL) throws {
    let json = """
    {
      "version": 1,
      "id": "\(id)",
      "title": "\(id)",
      "enabled": true,
      "prompts": [
        {
          "name": "code_review",
          "trigger": "\(trigger)",
          "title": "Review",
          "template": "{{code}}",
          "arguments": [
            { "name": "code", "required": true }
          ]
        }
      ]
    }
    """
    try json.data(using: .utf8)!.write(to: url)
}
```

- [ ] **Step 6: Run store tests and verify failure**

```bash
bash ./scripts/swiftw test --filter ActionManifestStoreTests
```

Expected: FAIL because `ActionManifestStore` does not exist.

- [ ] **Step 7: Implement manifest store**

Create `ActionManifestStore.swift`:

```swift
import Foundation

struct ActionManifestLoadResult: Equatable {
    let actions: [ActionDefinition]
    let disabled: [DisabledActionDefinition]
}

struct ActionManifestStore {
    let pluginsDirectoryURL: URL

    init(
        pluginsDirectoryURL: URL = FileManager.default
            .homeDirectoryForCurrentUser
            .appendingPathComponent(".spotAgent/plugins", isDirectory: true)
    ) {
        self.pluginsDirectoryURL = pluginsDirectoryURL
    }

    func load() -> ActionManifestLoadResult {
        let fileManager = FileManager.default
        guard let directories = try? fileManager.contentsOfDirectory(
            at: pluginsDirectoryURL,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else {
            return ActionManifestLoadResult(actions: [], disabled: [])
        }

        var manifests: [PluginManifestDefinition] = []
        var disabled: [DisabledActionDefinition] = []

        for directory in directories.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
            let values = try? directory.resourceValues(forKeys: [.isDirectoryKey])
            guard values?.isDirectory == true else { continue }

            let pluginId = directory.lastPathComponent
            let manifestURL = directory.appendingPathComponent("plugin.json")
            do {
                let manifest = try PluginManifestDefinition.decode(Data(contentsOf: manifestURL))
                guard manifest.id == pluginId else {
                    disabled.append(.init(id: "plugin:\(pluginId)", reason: "plugin id must match directory name"))
                    continue
                }
                manifests.append(manifest)
            } catch {
                disabled.append(.init(id: "plugin:\(pluginId)", reason: "plugin manifest not readable"))
            }
        }

        let built = ActionDefinition.buildActions(from: manifests)
        return ActionManifestLoadResult(actions: built.enabled, disabled: disabled + built.disabled)
    }
}
```

- [ ] **Step 8: Run PromptPanel tests**

```bash
bash ./scripts/swiftw test --filter ActionDefinitionTests
bash ./scripts/swiftw test --filter ActionManifestStoreTests
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

```bash
git add apps/desktop/Sources/PromptPanel/ActionDefinition.swift \
  apps/desktop/Sources/PromptPanel/ActionManifestStore.swift \
  apps/desktop/TestsSwift/PromptPanel/ActionDefinitionTests.swift \
  apps/desktop/TestsSwift/PromptPanel/ActionManifestStoreTests.swift
git commit -m "feat: load local action plugin manifests"
```

---

## Task 2: Action Invocation Parsing and Template Rendering

**Files:**
- Create: `apps/desktop/Sources/PromptPanel/ActionInvocation.swift`
- Test: `apps/desktop/TestsSwift/PromptPanel/ActionInvocationTests.swift`

- [ ] **Step 1: Write failing invocation tests**

Create `ActionInvocationTests.swift`:

```swift
import XCTest
@testable import HandAgentDesktop

final class ActionInvocationTests: XCTestCase {
    func testPlainPromptWhenTriggerDoesNotMatch() {
        let action = makeAction(trigger: "r")
        XCTAssertEqual(ActionInvocation.parse(draft: "hello world", actions: [action]), .plain("hello world"))
    }

    func testParsesPositionalArgumentsAfterTrigger() throws {
        let action = makeAction(trigger: "r")
        let result = ActionInvocation.parse(draft: "r foo bar", actions: [action])

        guard case .action(let invocation) = result else {
            return XCTFail("expected action")
        }
        XCTAssertEqual(invocation.action.id, action.id)
        XCTAssertEqual(invocation.values["code"], "foo")
        XCTAssertEqual(invocation.values["focus"], "bar")
    }

    func testParsesQuotedArguments() throws {
        let action = makeAction(trigger: "r")
        let result = ActionInvocation.parse(draft: #"r "hello world" "race conditions""#, actions: [action])

        guard case .action(let invocation) = result else {
            return XCTFail("expected action")
        }
        XCTAssertEqual(invocation.values["code"], "hello world")
        XCTAssertEqual(invocation.values["focus"], "race conditions")
    }

    func testRenderingFailsWhenRequiredArgumentIsEmpty() {
        let action = makeAction(trigger: "r")
        let invocation = ParsedActionInvocation(action: action, values: ["focus": "risk"])

        XCTAssertThrowsError(try invocation.renderedPrompt()) { error in
            XCTAssertEqual(error as? ActionInvocationError, .missingRequiredArgument("code"))
        }
    }

    func testRendersTemplateWithOptionalEmptyString() throws {
        let action = makeAction(trigger: "r")
        let invocation = ParsedActionInvocation(action: action, values: ["code": "let x = 1"])

        XCTAssertEqual(
            try invocation.renderedPrompt(),
            "Review:\\nlet x = 1\\nFocus:\\n"
        )
    }
}

private func makeAction(trigger: String) -> ActionDefinition {
    ActionDefinition(
        id: "review/code_review",
        pluginId: "review",
        promptName: "code_review",
        trigger: trigger,
        title: "Review",
        description: nil,
        template: "Review:\\n{{code}}\\nFocus:\\n{{focus}}",
        arguments: [
            ActionArgumentDefinition(name: "code", description: nil, required: true),
            ActionArgumentDefinition(name: "focus", description: nil, required: false),
        ],
        mcpServerIds: ["github"],
        icons: []
    )
}
```

- [ ] **Step 2: Run invocation tests and verify failure**

```bash
bash ./scripts/swiftw test --filter ActionInvocationTests
```

Expected: FAIL because invocation types do not exist.

- [ ] **Step 3: Implement invocation parser and renderer**

Create `ActionInvocation.swift`:

```swift
import Foundation

enum ActionInvocationParseResult: Equatable {
    case plain(String)
    case partial(ActionDefinition)
    case action(ParsedActionInvocation)
}

enum ActionInvocationError: Error, Equatable {
    case missingRequiredArgument(String)
}

struct ParsedActionInvocation: Equatable {
    let action: ActionDefinition
    var values: [String: String]

    func renderedPrompt() throws -> String {
        for argument in action.arguments where argument.isRequired {
            let value = values[argument.name]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if value.isEmpty {
                throw ActionInvocationError.missingRequiredArgument(argument.name)
            }
        }

        var output = action.template
        for argument in action.arguments {
            let value = values[argument.name] ?? ""
            output = output.replacingOccurrences(
                of: #"\{\{\s*\#(argument.name)\s*\}\}"#,
                with: value,
                options: .regularExpression
            )
        }
        return output
    }
}

enum ActionInvocation {
    static func parse(draft: String, actions: [ActionDefinition]) -> ActionInvocationParseResult {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .plain("") }
        let pieces = splitTrigger(trimmed)
        guard let action = actions.first(where: { $0.trigger.lowercased() == pieces.trigger.lowercased() }) else {
            return .plain(trimmed)
        }
        guard let tail = pieces.tail, !tail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return .partial(action)
        }

        let tokens = tokenize(tail)
        var values: [String: String] = [:]
        for (index, argument) in action.arguments.enumerated() where index < tokens.count {
            values[argument.name] = tokens[index]
        }
        return .action(ParsedActionInvocation(action: action, values: values))
    }

    private static func splitTrigger(_ text: String) -> (trigger: String, tail: String?) {
        guard let space = text.firstIndex(where: { $0.isWhitespace }) else {
            return (text, nil)
        }
        let trigger = String(text[..<space])
        let tail = String(text[text.index(after: space)...])
        return (trigger, tail)
    }

    static func tokenize(_ text: String) -> [String] {
        var tokens: [String] = []
        var current = ""
        var inQuotes = false
        var iterator = text.makeIterator()

        while let char = iterator.next() {
            if char == "\"" {
                inQuotes.toggle()
                continue
            }
            if char.isWhitespace && !inQuotes {
                if !current.isEmpty {
                    tokens.append(current)
                    current = ""
                }
                continue
            }
            current.append(char)
        }

        if !current.isEmpty {
            tokens.append(current)
        }
        return tokens
    }
}
```

- [ ] **Step 4: Run invocation tests**

```bash
bash ./scripts/swiftw test --filter ActionInvocationTests
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/desktop/Sources/PromptPanel/ActionInvocation.swift \
  apps/desktop/TestsSwift/PromptPanel/ActionInvocationTests.swift
git commit -m "feat: parse action invocations"
```

---

## Task 3: PromptPanel Action UI and Desktop Submission

**Files:**
- Modify: `apps/desktop/Sources/PromptPanel/PromptPanelViewModel.swift`
- Modify: `apps/desktop/Sources/PromptPanel/PromptPanelView.swift`
- Modify: `apps/desktop/Sources/PromptPanel/PromptPanelController.swift`
- Modify: `apps/desktop/Sources/Coordinator/PromptSubmission.swift`
- Modify: `apps/desktop/Sources/Coordinator/AppCoordinator.swift`
- Modify: `apps/desktop/Sources/Coordinator/SessionWindowLifecycle.swift`
- Modify: `apps/desktop/Sources/SessionWindow/SessionWindowViewModel.swift`
- Test: `apps/desktop/TestsSwift/PromptPanel/PromptPanelViewModelTests.swift`
- Test: `apps/desktop/TestsSwift/Coordinator/AppCoordinatorTests.swift`

- [ ] **Step 1: Write failing ViewModel submission tests**

Append tests to `PromptPanelViewModelTests.swift`:

```swift
@MainActor
func testSubmitActionInvocationRendersPromptAndForwardsBinding() {
    let action = makeReviewAction()
    let vm = PromptPanelViewModel(actions: [action])
    var submitted: (String, ActionBindingPayload)?
    vm.onSubmitAction = { prompt, binding, _ in submitted = (prompt, binding) }

    vm.draft = "r \"let x = 1\""
    vm.submit()

    XCTAssertEqual(submitted?.0, "Review:\\nlet x = 1")
    XCTAssertEqual(submitted?.1.pluginId, "review")
    XCTAssertEqual(submitted?.1.promptName, "code_review")
}

@MainActor
func testSubmitActionInvocationKeepsDraftWhenRequiredArgumentMissing() {
    let action = makeReviewAction()
    let vm = PromptPanelViewModel(actions: [action])
    var submitted = false
    vm.onSubmitAction = { _, _, _ in submitted = true }

    vm.draft = "r"
    vm.submit()

    XCTAssertFalse(submitted)
    XCTAssertEqual(vm.draft, "r")
}
```

Also add helper:

```swift
private func makeReviewAction() -> ActionDefinition {
    ActionDefinition(
        id: "review/code_review",
        pluginId: "review",
        promptName: "code_review",
        trigger: "r",
        title: "Review",
        description: nil,
        template: "Review:\\n{{code}}",
        arguments: [
            ActionArgumentDefinition(name: "code", description: nil, required: true)
        ],
        mcpServerIds: ["github"],
        icons: []
    )
}
```

- [ ] **Step 2: Run PromptPanel tests and verify failure**

```bash
bash ./scripts/swiftw test --filter PromptPanelViewModelTests
```

Expected: FAIL because `ActionBindingPayload`, `onSubmitAction`, and `PromptPanelViewModel(actions:)` signatures are not updated.

- [ ] **Step 3: Add desktop binding payload**

In `PromptSubmission.swift`, add:

```swift
struct ActionBindingPayload: Encodable, Equatable {
    let pluginId: String
    let promptName: String
}
```

Extend `PromptSubmission`:

```swift
struct PromptSubmission {
    let composed: String
    let summary: String
    let socketAttachments: [UserMessageAttachmentPayload]
    let actionBinding: ActionBindingPayload?
}
```

Update `compose` signature:

```swift
static func compose(
    draft: String,
    attachments: [PromptAttachmentResult],
    actionBinding: ActionBindingPayload? = nil
) -> PromptSubmission?
```

Return `actionBinding: actionBinding`.

- [ ] **Step 4: Update ViewModel to use ActionDefinition**

Change stored action type:

```swift
@ObservationIgnored private var actions: [ActionDefinition]
```

Add callback:

```swift
var onSubmitAction: ((String, ActionBindingPayload, [PromptAttachmentResult]) -> Void)?
```

Update `filteredActions`:

```swift
var filteredActions: [ActionDefinition] {
    let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return actions }
    let query = trimmed.lowercased()
    return actions.filter {
        $0.trigger.lowercased().hasPrefix(query)
            || $0.title.lowercased().contains(query)
            || ($0.description?.lowercased().contains(query) ?? false)
    }
}
```

Update `submit()` before plain prompt path:

```swift
let invocation = ActionInvocation.parse(draft: draft, actions: actions)
switch invocation {
case .action(let parsed):
    do {
        let rendered = try parsed.renderedPrompt()
        let binding = ActionBindingPayload(
            pluginId: parsed.action.pluginId,
            promptName: parsed.action.promptName
        )
        let payload = validAttachments()
        onSubmitAction?(rendered, binding, payload)
        resetForNewSession()
    } catch ActionInvocationError.missingRequiredArgument(let name) {
        submissionDisabledMessage = "缺少必填参数：\(name)"
    } catch {
        submissionDisabledMessage = "Action 渲染失败"
    }
    return
case .partial:
    return
case .plain:
    break
}
```

Extract valid attachments:

```swift
private func validAttachments() -> [PromptAttachmentResult] {
    attachments.filter {
        if case .selectionError = $0 { return false }
        return true
    }
}
```

- [ ] **Step 5: Update Controller and Coordinator routing**

In `PromptPanelController`, add:

```swift
var onSubmitAction: ((String, ActionBindingPayload, [PromptAttachmentResult]) -> Void)?
```

Wire VM callback:

```swift
vm.onSubmitAction = { [weak self] prompt, binding, attachments in
    self?.onSubmitAction?(prompt, binding, attachments)
}
```

In `AppCoordinator.Action`, add:

```swift
case submitActionPrompt(String, actionBinding: ActionBindingPayload, attachments: [PromptAttachmentResult])
```

Route:

```swift
case .submitActionPrompt(let draft, let binding, let attachments):
    handleSubmitPrompt(draft, attachments: attachments, actionBinding: binding, createsNewSession: true)
```

Change `handleSubmitPrompt` signature:

```swift
private func handleSubmitPrompt(
    _ draft: String,
    attachments: [PromptAttachmentResult],
    actionBinding: ActionBindingPayload? = nil,
    createsNewSession: Bool = false
)
```

Compose with binding:

```swift
guard let prompt = PromptSubmission.compose(
    draft: draft,
    attachments: attachments,
    actionBinding: actionBinding
) else { return }
```

For ordinary prompt keep existing active-tab behavior. For action prompt call a new lifecycle method:

```swift
if createsNewSession {
    sessionWindowLifecycle.createNewTabWithInitialPrompt(prompt) { [weak self] in
        self?.send(.sessionWindowClosed)
    }
} else {
    sessionWindowLifecycle.createTabWithInitialPrompt(prompt) { [weak self] in
        self?.send(.sessionWindowClosed)
    }
}
```

- [ ] **Step 6: Add lifecycle method that always creates a new session**

In `SessionWindowLifecycle`, add:

```swift
func createNewTabWithInitialPrompt(
    _ prompt: PromptSubmission,
    onClosed: @escaping @MainActor () -> Void
) {
    let model = ensureWindow(onClosed: onClosed)
    model.createTabWithInitialPrompt(
        prompt.composed,
        attachments: prompt.socketAttachments,
        actionBinding: prompt.actionBinding
    )
}
```

Keep existing `createTabWithInitialPrompt` as ordinary prompt behavior.

In `SessionWindowViewModel.createTabWithInitialPrompt`, add `actionBinding` to pending prompt and pass to socket:

```swift
func createTabWithInitialPrompt(
    _ text: String,
    attachments: [UserMessageAttachmentPayload] = [],
    actionBinding: ActionBindingPayload? = nil
)
```

Extend `PendingCreatedSessionPrompt` with `actionBinding`.

- [ ] **Step 7: Update PromptPanel View rows**

In `PromptPanelView.actionRow`, replace shortcut display with trigger display:

```swift
Text(action.trigger)
    .font(theme.typography.captionFont)
    .foregroundStyle(theme.colors.textSecondary.opacity(0.7))
    .padding(.horizontal, 6)
    .padding(.vertical, 2)
    .background(
        RoundedRectangle(cornerRadius: 4)
            .fill(theme.colors.surface)
    )
```

Remove calls to `shortcutLabel(for:)`.

- [ ] **Step 8: Run Swift tests**

```bash
bash ./scripts/swiftw test --filter PromptPanelViewModelTests
bash ./scripts/swiftw test --filter AppCoordinatorTests
```

Expected: PASS after updating existing test helpers from `PromptAction` to `ActionDefinition` or moving old action-trigger tests to the new types.

- [ ] **Step 9: Commit Task 3**

```bash
git add apps/desktop/Sources/PromptPanel \
  apps/desktop/Sources/Coordinator \
  apps/desktop/Sources/SessionWindow \
  apps/desktop/TestsSwift/PromptPanel \
  apps/desktop/TestsSwift/Coordinator
git commit -m "feat: submit local actions from prompt panel"
```

---

## Task 4: WebSocket Protocol and Session Metadata Binding

**Files:**
- Modify: `packages/core/src/protocol/SessionMessage.ts`
- Modify: `packages/core/src/storage/SessionRecord.ts`
- Modify: `packages/core/src/storage/SessionStore.ts`
- Modify: `packages/core/src/storage/FileSessionStore.ts`
- Modify: `packages/core/src/storage/InMemorySessionStore.ts`
- Modify: `apps/agent-server/src/SessionPersistence.ts`
- Modify: `apps/agent-server/src/SessionRouter.ts`
- Modify: `apps/desktop/Sources/SessionWindow/SessionSocketClient.swift`
- Test: `packages/core/tests/storage/file-session-store.test.ts`
- Test: `apps/agent-server/tests/session/SessionRouter.test.ts`
- Test: `apps/desktop/TestsSwift/SessionWindow/SessionSocketClientTests.swift`

- [ ] **Step 1: Write failing storage metadata test**

Append to `file-session-store.test.ts`:

```ts
it("persists action binding metadata", async () => {
  const session = await store.create({
    id: "s-action",
    title: "Action",
    createdAt: "2026-05-21T00:00:00.000Z",
    actionBinding: {
      pluginId: "review",
      promptName: "code_review",
      mcpServerIds: ["github"],
    },
  });

  expect(session.metadata.actionBinding).toEqual({
    pluginId: "review",
    promptName: "code_review",
    mcpServerIds: ["github"],
  });

  const loaded = await store.get("s-action");
  expect(loaded?.metadata.actionBinding?.mcpServerIds).toEqual(["github"]);
});
```

- [ ] **Step 2: Run storage test and verify failure**

```bash
pnpm exec vitest run packages/core/tests/storage/file-session-store.test.ts -t "persists action binding metadata"
```

Expected: FAIL because `CreateSessionInput` does not accept `actionBinding`.

- [ ] **Step 3: Extend storage types**

In `SessionRecord.ts`:

```ts
export type SessionActionBinding = {
  pluginId: string;
  promptName: string;
  mcpServerIds: string[];
};

export type SessionMetadata = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  actionBinding?: SessionActionBinding;
};
```

In `SessionStore.ts`:

```ts
import type { SessionActionBinding } from "./SessionRecord.ts";

export type CreateSessionInput = {
  id: string;
  title?: string | null;
  createdAt?: string;
  actionBinding?: SessionActionBinding;
};
```

In both stores, add:

```ts
actionBinding: input.actionBinding,
```

inside `metadata`.

- [ ] **Step 4: Run storage tests**

```bash
pnpm exec vitest run packages/core/tests/storage/file-session-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing router binding test**

Add to `SessionRouter.test.ts`:

```ts
it("persists action binding from create_session_request", async () => {
  const persistence = new SessionPersistence(
    new InMemorySessionStore(),
    () => "2026-05-21T00:00:00.000Z",
  );
  const router = new SessionRouter(
    { async handleUserMessage() {} },
    persistence,
    () => "2026-05-21T00:01:00.000Z",
    {
      async resolve(binding) {
        expect(binding).toEqual({ pluginId: "review", promptName: "code_review" });
        return {
          pluginId: "review",
          promptName: "code_review",
          mcpServerIds: ["github"],
        };
      },
    },
  );
  const pushed: SessionMessage[] = [];

  await router.receive(
    {
      type: "create_session_request",
      sessionId: "",
      messageId: "create-action",
      timestamp: "2026-05-21T00:01:00.000Z",
      payload: {
        initialText: "Review:\\ncode",
        actionBinding: { pluginId: "review", promptName: "code_review" },
      },
    },
    (message) => pushed.push(message),
  );

  const created = await persistence.getSession(pushed[0].sessionId);
  expect(created?.metadata.actionBinding).toEqual({
    pluginId: "review",
    promptName: "code_review",
    mcpServerIds: ["github"],
  });
});
```

- [ ] **Step 6: Implement protocol and router binding**

In `SessionMessage.ts`, add:

```ts
actionBinding?: {
  pluginId: string;
  promptName: string;
};
```

to `create_session_request.payload`.

In `SessionPersistence.createSession`, add optional binding:

```ts
async createSession(title?: string, actionBinding?: SessionActionBinding): Promise<PersistedSession> {
  const id = generateSessionId();
  return this.store.create({ id, title, createdAt: this.now(), actionBinding });
}
```

In `SessionRouter.ts`, define:

```ts
type ActionBindingResolver = {
  resolve(binding: { pluginId: string; promptName: string }): Promise<SessionActionBinding>;
};
```

Add optional constructor parameter:

```ts
private readonly actionBindingResolver?: ActionBindingResolver
```

In `handleCreateSession`, before `createSession()`:

```ts
let actionBinding: SessionActionBinding | undefined;
if (message.payload.actionBinding) {
  actionBinding = await this.actionBindingResolver?.resolve(message.payload.actionBinding);
  if (!actionBinding) {
    push({
      type: "user_message_failed",
      sessionId: "",
      messageId: message.messageId,
      timestamp: this.now(),
      payload: {
        reason: "invalid_request",
        message: "Action binding resolver is not configured",
      },
    });
    return;
  }
}
const session = await this.persistence.createSession(undefined, actionBinding);
```

- [ ] **Step 7: Update Swift socket encoding**

In `SessionSocketClient.sendCreateSession`, add argument:

```swift
func sendCreateSession(
    initialText: String? = nil,
    attachments: [UserMessageAttachmentPayload] = [],
    actionBinding: ActionBindingPayload? = nil
)
```

Add to payload:

```swift
"actionBinding": actionBinding?.jsonObject,
```

Add extension:

```swift
private extension ActionBindingPayload {
    var jsonObject: [String: Any] {
        [
            "pluginId": pluginId,
            "promptName": promptName,
        ]
    }
}
```

Update call sites from Task 3 to pass pending action binding.

- [ ] **Step 8: Add Swift socket test**

In `SessionSocketClientTests`, extend `RecordingSessionWebSocketTask` to capture last sent JSON:

```swift
private(set) var sentObjects: [[String: Any]] = []
```

Append `object` in `send`. Add test:

```swift
func testSendsCreateSessionRequestWithActionBinding() {
    let transport = RecordingSessionSocketTransport()
    let client = SessionSocketClient(
        serverURL: URL(string: "ws://127.0.0.1:4317/api/session")!,
        transport: transport,
        reconnectDelay: 0
    )

    client.connect(sessionID: "")
    client.sendCreateSession(
        initialText: "Review:\\ncode",
        attachments: [],
        actionBinding: ActionBindingPayload(pluginId: "review", promptName: "code_review")
    )

    let payload = transport.tasks[0].sentObjects.last?["payload"] as? [String: Any]
    let binding = payload?["actionBinding"] as? [String: Any]
    XCTAssertEqual(binding?["pluginId"] as? String, "review")
    XCTAssertEqual(binding?["promptName"] as? String, "code_review")
}
```

- [ ] **Step 9: Run protocol tests**

```bash
bash ./scripts/swiftw test --filter SessionSocketClientTests
pnpm exec vitest run packages/core/tests/storage/file-session-store.test.ts apps/agent-server/tests/session/SessionRouter.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit Task 4**

```bash
git add packages/core/src/protocol/SessionMessage.ts \
  packages/core/src/storage \
  apps/agent-server/src/SessionPersistence.ts \
  apps/agent-server/src/SessionRouter.ts \
  apps/desktop/Sources/SessionWindow/SessionSocketClient.swift \
  packages/core/tests/storage/file-session-store.test.ts \
  apps/agent-server/tests/session/SessionRouter.test.ts \
  apps/desktop/TestsSwift/SessionWindow/SessionSocketClientTests.swift
git commit -m "feat: persist action bindings on sessions"
```

---

## Task 5: Server-Side Plugin Binding Resolver

**Files:**
- Create: `packages/core/src/actions/PluginManifest.ts`
- Create: `packages/core/src/actions/ActionBinding.ts`
- Create: `packages/core/tests/actions/plugin-manifest.test.ts`
- Create: `apps/agent-server/src/ActionBindingResolver.ts`
- Create: `apps/agent-server/tests/actions/ActionBindingResolver.test.ts`

- [ ] **Step 1: Write failing core manifest parser tests**

Create `packages/core/tests/actions/plugin-manifest.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parsePluginManifest } from "../../src/actions/PluginManifest.ts";

describe("parsePluginManifest", () => {
  it("parses plugin prompts and mcp server ids", () => {
    const manifest = parsePluginManifest({
      version: 1,
      id: "review",
      title: "Review",
      enabled: true,
      mcpServerIds: ["github"],
      prompts: [
        {
          name: "code_review",
          trigger: "r",
          title: "Review",
          template: "{{code}}",
          arguments: [{ name: "code", required: true }],
        },
      ],
    });

    expect(manifest.id).toBe("review");
    expect(manifest.mcpServerIds).toEqual(["github"]);
    expect(manifest.prompts[0].name).toBe("code_review");
  });

  it("rejects old private tool plugin manifests", () => {
    expect(() =>
      parsePluginManifest({
        id: "echo",
        name: "Echo",
        version: "1.0.0",
        tools: [{ name: "plugin.echo" }],
      }),
    ).toThrow("plugin manifest version must be 1");
  });
});
```

- [ ] **Step 2: Implement core parser**

Create `PluginManifest.ts`:

```ts
export type PluginPromptArgument = {
  name: string;
  description?: string;
  required?: boolean;
};

export type PluginPrompt = {
  name: string;
  trigger: string;
  title: string;
  description?: string;
  template: string;
  arguments: PluginPromptArgument[];
};

export type ActionPluginManifest = {
  version: 1;
  id: string;
  title: string;
  description?: string;
  enabled?: boolean;
  mcpServerIds: string[];
  prompts: PluginPrompt[];
};

export function parsePluginManifest(value: unknown): ActionPluginManifest {
  if (!isRecord(value)) throw new Error("plugin manifest must be an object");
  if (value.version !== 1) throw new Error("plugin manifest version must be 1");
  const id = requiredString(value, "id");
  const title = requiredString(value, "title");
  const promptsValue = value.prompts;
  if (!Array.isArray(promptsValue) || promptsValue.length === 0) {
    throw new Error("plugin manifest prompts must be a non-empty array");
  }
  return {
    version: 1,
    id,
    title,
    description: optionalString(value, "description"),
    enabled: optionalBoolean(value, "enabled"),
    mcpServerIds: optionalStringArray(value, "mcpServerIds"),
    prompts: promptsValue.map(parsePrompt),
  };
}

function parsePrompt(value: unknown): PluginPrompt {
  if (!isRecord(value)) throw new Error("plugin prompt must be an object");
  return {
    name: requiredString(value, "name"),
    trigger: requiredString(value, "trigger"),
    title: requiredString(value, "title"),
    description: optionalString(value, "description"),
    template: requiredString(value, "template"),
    arguments: Array.isArray(value.arguments) ? value.arguments.map(parseArgument) : [],
  };
}

function parseArgument(value: unknown): PluginPromptArgument {
  if (!isRecord(value)) throw new Error("plugin prompt argument must be an object");
  return {
    name: requiredString(value, "name"),
    description: optionalString(value, "description"),
    required: optionalBoolean(value, "required"),
  };
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`plugin manifest ${key} must be a non-empty string`);
  }
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error(`plugin manifest ${key} must be a string`);
  return value;
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`plugin manifest ${key} must be a boolean`);
  return value;
}

function optionalStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`plugin manifest ${key} must be a string array`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

Create `ActionBinding.ts`:

```ts
import type { SessionActionBinding } from "../storage/SessionRecord.ts";
import type { ActionPluginManifest } from "./PluginManifest.ts";

export type RequestedActionBinding = {
  pluginId: string;
  promptName: string;
};

export function resolveActionBindingFromManifest(
  manifest: ActionPluginManifest,
  request: RequestedActionBinding,
): SessionActionBinding {
  if (manifest.enabled === false) {
    throw new Error(`Plugin disabled: ${manifest.id}`);
  }
  if (manifest.id !== request.pluginId) {
    throw new Error(`Plugin id mismatch: ${request.pluginId}`);
  }
  const prompt = manifest.prompts.find((item) => item.name === request.promptName);
  if (!prompt) {
    throw new Error(`Plugin prompt not found: ${request.promptName}`);
  }
  return {
    pluginId: manifest.id,
    promptName: prompt.name,
    mcpServerIds: manifest.mcpServerIds,
  };
}
```

- [ ] **Step 3: Run parser tests**

```bash
pnpm exec vitest run packages/core/tests/actions/plugin-manifest.test.ts
```

Expected: PASS.

- [ ] **Step 4: Write failing agent-server resolver tests**

Create `apps/agent-server/tests/actions/ActionBindingResolver.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ActionBindingResolver } from "../../src/ActionBindingResolver.ts";

describe("ActionBindingResolver", () => {
  it("resolves prompt binding from plugin manifest", async () => {
    const pluginsDir = await makePlugin({
      id: "review",
      promptName: "code_review",
      mcpServerIds: ["github"],
    });
    const resolver = new ActionBindingResolver({ pluginsDir });

    await expect(
      resolver.resolve({ pluginId: "review", promptName: "code_review" }),
    ).resolves.toEqual({
      pluginId: "review",
      promptName: "code_review",
      mcpServerIds: ["github"],
    });
  });

  it("rejects directory id mismatch", async () => {
    const root = await mkdtemp(join(tmpdir(), "action-binding-"));
    const pluginDir = join(root, "plugins", "wrong");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(
      join(pluginDir, "plugin.json"),
      JSON.stringify({
        version: 1,
        id: "actual",
        title: "Actual",
        prompts: [{ name: "p", trigger: "p", title: "P", template: "" }],
      }),
    );

    const resolver = new ActionBindingResolver({ pluginsDir: join(root, "plugins") });
    await expect(resolver.resolve({ pluginId: "wrong", promptName: "p" })).rejects.toThrow(
      "plugin id must match directory name",
    );
  });
});

async function makePlugin({
  id,
  promptName,
  mcpServerIds,
}: {
  id: string;
  promptName: string;
  mcpServerIds: string[];
}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "action-binding-"));
  const pluginsDir = join(root, "plugins");
  const pluginDir = join(pluginsDir, id);
  await mkdir(pluginDir, { recursive: true });
  await writeFile(
    join(pluginDir, "plugin.json"),
    JSON.stringify({
      version: 1,
      id,
      title: id,
      enabled: true,
      mcpServerIds,
      prompts: [{ name: promptName, trigger: "r", title: "Review", template: "{{code}}" }],
    }),
  );
  return pluginsDir;
}
```

- [ ] **Step 5: Implement resolver**

Create `ActionBindingResolver.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SessionActionBinding } from "@handagent/core/storage/SessionRecord.ts";
import {
  parsePluginManifest,
} from "@handagent/core/actions/PluginManifest.ts";
import {
  resolveActionBindingFromManifest,
  type RequestedActionBinding,
} from "@handagent/core/actions/ActionBinding.ts";

export class ActionBindingResolver {
  constructor(private readonly options: { pluginsDir: string }) {}

  async resolve(binding: RequestedActionBinding): Promise<SessionActionBinding> {
    const pluginDir = join(this.options.pluginsDir, binding.pluginId);
    const manifestPath = join(pluginDir, "plugin.json");
    const manifest = parsePluginManifest(JSON.parse(await readFile(manifestPath, "utf8")));
    if (manifest.id !== binding.pluginId) {
      throw new Error("plugin id must match directory name");
    }
    return resolveActionBindingFromManifest(manifest, binding);
  }
}
```

- [ ] **Step 6: Run resolver tests**

```bash
pnpm exec vitest run packages/core/tests/actions/plugin-manifest.test.ts apps/agent-server/tests/actions/ActionBindingResolver.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add packages/core/src/actions \
  packages/core/tests/actions \
  apps/agent-server/src/ActionBindingResolver.ts \
  apps/agent-server/tests/actions/ActionBindingResolver.test.ts
git commit -m "feat: resolve local action bindings"
```

---

## Task 6: MCP Client and Tool Adapter

**Files:**
- Create: `packages/core/src/mcp/MCPConfig.ts`
- Create: `packages/core/src/mcp/MCPClient.ts`
- Create: `packages/core/src/mcp/StdioMCPClient.ts`
- Create: `packages/core/src/mcp/StreamableHttpMCPClient.ts`
- Create: `packages/core/src/mcp/MCPToolAdapter.ts`
- Test: `packages/core/tests/mcp/mcp-config.test.ts`
- Test: `packages/core/tests/mcp/mcp-tool-adapter.test.ts`
- Test: `packages/core/tests/mcp/stdio-mcp-client.test.ts`
- Test: `packages/core/tests/mcp/streamable-http-mcp-client.test.ts`

- [ ] **Step 1: Write config and adapter tests first**

Create `mcp-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseMCPConfig } from "../../src/mcp/MCPConfig.ts";

describe("parseMCPConfig", () => {
  it("parses stdio and streamable http servers", () => {
    const config = parseMCPConfig({
      version: 1,
      servers: [
        { id: "fs", title: "FS", transport: "stdio", command: "node", args: ["server.js"] },
        { id: "github", title: "GitHub", transport: "streamableHttp", url: "https://example.com/mcp" },
      ],
    });

    expect(config.servers.map((server) => server.id)).toEqual(["fs", "github"]);
  });
});
```

Create `mcp-tool-adapter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MCPToolAdapter } from "../../src/mcp/MCPToolAdapter.ts";

describe("MCPToolAdapter", () => {
  it("exposes server-prefixed tool names and calls original MCP tool", async () => {
    const calls: unknown[] = [];
    const adapter = new MCPToolAdapter({
      serverId: "github",
      tool: {
        name: "create_issue",
        description: "Create issue",
        inputSchema: { type: "object" },
      },
      callTool: async (name, args) => {
        calls.push({ name, args });
        return { content: [{ type: "text", text: "created" }] };
      },
    });

    expect(adapter.name).toBe("mcp.github.create_issue");
    await expect(adapter.call({ title: "Bug" })).resolves.toEqual({ content: [{ type: "text", text: "created" }] });
    expect(calls).toEqual([{ name: "create_issue", args: { title: "Bug" } }]);
  });
});
```

- [ ] **Step 2: Implement MCP config, client interface, and adapter**

Create `MCPClient.ts`:

```ts
export type MCPToolDescription = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type MCPCallToolResult = {
  content?: unknown[];
  isError?: boolean;
  [key: string]: unknown;
};

export interface MCPClient {
  initialize(): Promise<void>;
  listTools(): Promise<MCPToolDescription[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<MCPCallToolResult>;
  close(): Promise<void>;
}
```

Create `MCPConfig.ts`:

```ts
export type MCPServerConfig =
  | {
      id: string;
      title: string;
      transport: "stdio";
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }
  | {
      id: string;
      title: string;
      transport: "streamableHttp";
      url: string;
      headers?: Record<string, string>;
    };

export type MCPConfig = {
  version: 1;
  servers: MCPServerConfig[];
};

export function parseMCPConfig(value: unknown): MCPConfig {
  if (!isRecord(value)) throw new Error("mcp config must be an object");
  if (value.version !== 1) throw new Error("mcp config version must be 1");
  if (!Array.isArray(value.servers)) throw new Error("mcp config servers must be an array");
  return { version: 1, servers: value.servers.map(parseServer) };
}

function parseServer(value: unknown): MCPServerConfig {
  if (!isRecord(value)) throw new Error("mcp server must be an object");
  const id = requiredString(value, "id");
  const title = requiredString(value, "title");
  if (value.transport === "stdio") {
    return {
      id,
      title,
      transport: "stdio",
      command: requiredString(value, "command"),
      args: stringArray(value.args),
      env: isRecord(value.env) ? Object.fromEntries(
        Object.entries(value.env).filter(([, v]) => typeof v === "string"),
      ) as Record<string, string> : undefined,
    };
  }
  if (value.transport === "streamableHttp") {
    return {
      id,
      title,
      transport: "streamableHttp",
      url: requiredString(value, "url"),
      headers: isRecord(value.headers) ? interpolateHeaders(value.headers) : undefined,
    };
  }
  throw new Error("mcp server transport must be stdio or streamableHttp");
}

function interpolateHeaders(headers: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== "string") continue;
    result[key] = value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => process.env[name] ?? "");
  }
  return result;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") throw new Error(`mcp ${key} must be a non-empty string`);
  return value;
}

function stringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error("mcp args must be a string array");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

Create `MCPToolAdapter.ts`:

```ts
import type { AgentTool } from "../tools/AgentTool.ts";
import type { MCPCallToolResult, MCPToolDescription } from "./MCPClient.ts";

export class MCPToolAdapter implements AgentTool<Record<string, unknown>, MCPCallToolResult> {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;

  constructor(
    private readonly options: {
      serverId: string;
      tool: MCPToolDescription;
      callTool: (name: string, args: Record<string, unknown>) => Promise<MCPCallToolResult>;
    },
  ) {
    this.name = `mcp.${options.serverId}.${options.tool.name}`;
    this.description = `[mcp:${options.serverId}] ${options.tool.description ?? options.tool.name}`;
    this.inputSchema = options.tool.inputSchema ?? { type: "object" };
  }

  call(input: Record<string, unknown>): Promise<MCPCallToolResult> {
    return this.options.callTool(this.options.tool.name, input);
  }
}
```

- [ ] **Step 3: Run config and adapter tests**

```bash
pnpm exec vitest run packages/core/tests/mcp/mcp-config.test.ts packages/core/tests/mcp/mcp-tool-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 4: Write failing stdio transport test**

Create `packages/core/tests/mcp/stdio-mcp-client.test.ts`:

```ts
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { StdioMCPClient } from "../../src/mcp/StdioMCPClient.ts";

describe("StdioMCPClient", () => {
  it("lists and calls tools over newline-delimited json-rpc stdio", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stdio-mcp-"));
    const serverPath = join(dir, "server.js");
    await writeFile(
      serverPath,
      `#!/usr/bin/env node
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\\n")) !== -1) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    const req = JSON.parse(line);
    if (req.method === "initialize") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { protocolVersion: "2025-11-25" } }) + "\\n");
    } else if (req.method === "tools/list") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { tools: [{ name: "echo", description: "Echo", inputSchema: { type: "object" } }] } }) + "\\n");
    } else if (req.method === "tools/call") {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: { content: [{ type: "text", text: req.params.arguments.text }] } }) + "\\n");
    }
  }
});
`,
      "utf8",
    );
    await chmod(serverPath, 0o755);

    const client = new StdioMCPClient({
      id: "echo",
      title: "Echo",
      transport: "stdio",
      command: serverPath,
    });

    await client.initialize();
    await expect(client.listTools()).resolves.toEqual([
      { name: "echo", description: "Echo", inputSchema: { type: "object" } },
    ]);
    await expect(client.callTool("echo", { text: "hello" })).resolves.toEqual({
      content: [{ type: "text", text: "hello" }],
    });
    await client.close();
  });
});
```

- [ ] **Step 5: Implement stdio transport**

Create `packages/core/src/mcp/StdioMCPClient.ts`:

```ts
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type {
  MCPCallToolResult,
  MCPClient,
  MCPToolDescription,
} from "./MCPClient.ts";
import type { MCPServerConfig } from "./MCPConfig.ts";

type StdioServerConfig = Extract<MCPServerConfig, { transport: "stdio" }>;

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { message?: string };
};

export class StdioMCPClient implements MCPClient {
  private child?: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private buffer = "";
  private readonly pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();

  constructor(private readonly config: StdioServerConfig) {}

  async initialize(): Promise<void> {
    this.ensureChild();
    await this.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "handagent", version: "0.1.0" },
    });
  }

  async listTools(): Promise<MCPToolDescription[]> {
    const result = await this.request("tools/list", {});
    if (!isRecord(result) || !Array.isArray(result.tools)) return [];
    return result.tools.map(parseToolDescription);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPCallToolResult> {
    const result = await this.request("tools/call", { name, arguments: args });
    return isRecord(result) ? result as MCPCallToolResult : { content: [] };
  }

  async close(): Promise<void> {
    this.child?.kill("SIGTERM");
    this.child = undefined;
    for (const pending of this.pending.values()) {
      pending.reject(new Error("MCP stdio client closed"));
    }
    this.pending.clear();
  }

  private ensureChild(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;
    const child = spawn(this.config.command, this.config.args ?? [], {
      env: { ...process.env, ...(this.config.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.handleData(chunk));
    child.on("error", (error) => this.rejectAll(error));
    child.on("close", () => this.rejectAll(new Error("MCP stdio server closed")));
    this.child = child;
    return child;
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const child = this.ensureChild();
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    child.stdin.write(payload);
    return promise;
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;
    let index: number;
    while ((index = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (!line) continue;
      this.handleResponse(JSON.parse(line) as JsonRpcResponse);
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    if (response.error) {
      pending.reject(new Error(response.error.message ?? "MCP stdio request failed"));
      return;
    }
    pending.resolve(response.result);
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function parseToolDescription(value: unknown): MCPToolDescription {
  if (!isRecord(value) || typeof value.name !== "string") {
    throw new Error("Invalid MCP tool description");
  }
  return {
    name: value.name,
    description: typeof value.description === "string" ? value.description : undefined,
    inputSchema: isRecord(value.inputSchema) ? value.inputSchema : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 6: Write failing Streamable HTTP transport test**

Create `packages/core/tests/mcp/streamable-http-mcp-client.test.ts`:

```ts
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { StreamableHttpMCPClient } from "../../src/mcp/StreamableHttpMCPClient.ts";

describe("StreamableHttpMCPClient", () => {
  const servers: Array<{ close: () => void }> = [];

  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
  });

  it("sends MCP protocol header and reads json-rpc responses", async () => {
    const server = createServer((req, res) => {
      expect(req.headers["mcp-protocol-version"]).toBe("2025-11-25");
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        const rpc = JSON.parse(body);
        res.setHeader("content-type", "application/json");
        if (rpc.method === "tools/list") {
          res.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { tools: [{ name: "echo", inputSchema: { type: "object" } }] } }));
        } else if (rpc.method === "tools/call") {
          res.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { content: [{ type: "text", text: rpc.params.arguments.text }] } }));
        } else {
          res.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: {} }));
        }
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("bad address");

    const client = new StreamableHttpMCPClient({
      id: "echo",
      title: "Echo",
      transport: "streamableHttp",
      url: `http://127.0.0.1:${address.port}/mcp`,
    });

    await client.initialize();
    await expect(client.listTools()).resolves.toEqual([
      { name: "echo", description: undefined, inputSchema: { type: "object" } },
    ]);
    await expect(client.callTool("echo", { text: "hello" })).resolves.toEqual({
      content: [{ type: "text", text: "hello" }],
    });
  });

  it("parses event-stream json-rpc response data", async () => {
    const server = createServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        const rpc = JSON.parse(body);
        res.setHeader("content-type", "text/event-stream");
        res.end(`event: message\\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { tools: [] } })}\\n\\n`);
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("bad address");

    const client = new StreamableHttpMCPClient({
      id: "sse",
      title: "SSE",
      transport: "streamableHttp",
      url: `http://127.0.0.1:${address.port}/mcp`,
    });

    await expect(client.listTools()).resolves.toEqual([]);
  });
});
```

- [ ] **Step 7: Implement Streamable HTTP transport**

Create `packages/core/src/mcp/StreamableHttpMCPClient.ts`:

```ts
import type {
  MCPCallToolResult,
  MCPClient,
  MCPToolDescription,
} from "./MCPClient.ts";
import type { MCPServerConfig } from "./MCPConfig.ts";

type HttpServerConfig = Extract<MCPServerConfig, { transport: "streamableHttp" }>;

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { message?: string };
};

export class StreamableHttpMCPClient implements MCPClient {
  private nextId = 1;

  constructor(private readonly config: HttpServerConfig) {}

  async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "handagent", version: "0.1.0" },
    });
  }

  async listTools(): Promise<MCPToolDescription[]> {
    const result = await this.request("tools/list", {});
    if (!isRecord(result) || !Array.isArray(result.tools)) return [];
    return result.tools.map(parseToolDescription);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPCallToolResult> {
    const result = await this.request("tools/call", { name, arguments: args });
    return isRecord(result) ? result as MCPCallToolResult : { content: [] };
  }

  async close(): Promise<void> {}

  private async request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const response = await fetch(this.config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
        ...(this.config.headers ?? {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    });
    if (!response.ok) {
      throw new Error(`MCP HTTP request failed: ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();
    const rpc = contentType.includes("text/event-stream")
      ? parseEventStreamResponse(text, id)
      : JSON.parse(text) as JsonRpcResponse;
    if (rpc.error) {
      throw new Error(rpc.error.message ?? "MCP HTTP request failed");
    }
    return rpc.result;
  }
}

function parseEventStreamResponse(text: string, id: number): JsonRpcResponse {
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const parsed = JSON.parse(line.slice("data:".length).trim()) as JsonRpcResponse;
    if (parsed.id === id) return parsed;
  }
  throw new Error("MCP HTTP event stream did not contain response");
}

function parseToolDescription(value: unknown): MCPToolDescription {
  if (!isRecord(value) || typeof value.name !== "string") {
    throw new Error("Invalid MCP tool description");
  }
  return {
    name: value.name,
    description: typeof value.description === "string" ? value.description : undefined,
    inputSchema: isRecord(value.inputSchema) ? value.inputSchema : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 8: Run MCP tests**

```bash
pnpm exec vitest run packages/core/tests/mcp
```

Expected: PASS.

- [ ] **Step 9: Commit Task 6**

```bash
git add packages/core/src/mcp packages/core/tests/mcp
git commit -m "feat: add standard mcp clients"
```

---

## Task 7: Session-Scoped Tool Registry

**Files:**
- Create: `apps/agent-server/src/SessionScopedToolRegistry.ts`
- Modify: `apps/agent-server/src/SettingsBackedToolRegistry.ts`
- Modify: `apps/agent-server/src/SessionRuntimeOrchestrator.ts`
- Test: `apps/agent-server/tests/settings/SettingsBackedToolRegistry.test.ts`
- Test: `apps/agent-server/tests/session/SessionRuntimeOrchestrator.test.ts`
- Test: `apps/agent-server/tests/actions/SessionScopedToolRegistry.test.ts`

- [ ] **Step 1: Remove private plugin loader expectations**

In `SettingsBackedToolRegistry.test.ts`, delete `loads local plugins and applies denylist to plugin tools`. Replace with:

```ts
it("does not load private plugin tools from the plugins directory", async () => {
  const manager = new SettingsBackedToolRegistry(
    { platform: new OfflinePlatformAdapter(), pluginsDir: "/tmp/unused" },
    {
      readSettingsStamp: () => "v1",
      loadToolSettings: () => ({ allowlist: null, denylist: [] }),
      log: () => {},
    },
  );

  await manager.refresh();

  expect(manager.registry.list().map((tool) => tool.name)).not.toContain("plugin.echo");
});
```

- [ ] **Step 2: Update SettingsBackedToolRegistry**

Remove imports:

```ts
import { loadLocalPluginTools } from "@handagent/core/tools/plugins/loadLocalPluginTools.ts";
```

Change `registerTools` call plugin loaders to an empty list:

```ts
pluginLoaders: [],
```

Keep `pluginsDir` only if needed for stamp compatibility during this task; otherwise remove it in a focused follow-up within the same commit.

- [ ] **Step 3: Write failing session-scoped registry test**

Create `SessionScopedToolRegistry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ToolRegistry } from "@handagent/core/tools/ToolRegistry.ts";
import type { AgentTool } from "@handagent/core/tools/AgentTool.ts";
import { SessionScopedToolRegistry } from "../../src/SessionScopedToolRegistry.ts";

describe("SessionScopedToolRegistry", () => {
  it("adds mcp tools only for sessions bound to their server", async () => {
    const builtin = new ToolRegistry([makeTool("clipboard.read")]);
    const scoped = new SessionScopedToolRegistry({
      builtinRegistry: builtin,
      listMcpTools: async (serverId) => serverId === "github" ? [makeTool("mcp.github.create_issue")] : [],
    });

    await scoped.refreshForSession("plain", undefined);
    expect(scoped.registry.list().map((tool) => tool.name)).toEqual(["clipboard.read"]);

    await scoped.refreshForSession("action", {
      pluginId: "review",
      promptName: "code_review",
      mcpServerIds: ["github"],
    });
    expect(scoped.registry.list().map((tool) => tool.name)).toEqual([
      "clipboard.read",
      "mcp.github.create_issue",
    ]);
  });
});

function makeTool(name: string): AgentTool {
  return {
    name,
    description: name,
    inputSchema: { type: "object" },
    async call() {
      return {};
    },
  };
}
```

- [ ] **Step 4: Implement SessionScopedToolRegistry**

First add this accessor to `packages/core/src/tools/ToolRegistry.ts`:

```ts
all(): AgentTool[] {
  return Array.from(this.tools.values());
}
```

Then create `apps/agent-server/src/SessionScopedToolRegistry.ts`:

```ts
import type { AgentTool } from "@handagent/core/tools/AgentTool.ts";
import { ToolRegistry } from "@handagent/core/tools/ToolRegistry.ts";
import type { SessionActionBinding } from "@handagent/core/storage/SessionRecord.ts";

export class SessionScopedToolRegistry {
  readonly registry = new ToolRegistry();

  constructor(
    private readonly options: {
      builtinRegistry: ToolRegistry;
      listMcpTools: (serverId: string) => Promise<AgentTool[]>;
    },
  ) {}

  async refreshForSession(
    sessionId: string,
    binding: SessionActionBinding | undefined,
  ): Promise<void> {
    void sessionId;
    const tools: AgentTool[] = [...this.options.builtinRegistry.all()];
    for (const serverId of binding?.mcpServerIds ?? []) {
      tools.push(...await this.options.listMcpTools(serverId));
    }

    const byName = new Map<string, AgentTool>();
    for (const tool of tools) {
      if (!byName.has(tool.name)) {
        byName.set(tool.name, tool);
      }
    }
    this.registry.replaceAll([...byName.values()]);
  }
}
```

- [ ] **Step 5: Modify orchestrator beforeRun hook**

Change `BeforeRunHook` in `SessionRuntimeOrchestrator.ts`:

```ts
type BeforeRunHook = (sessionId: string) => void | Promise<void>;
```

Call:

```ts
await this.beforeRun(sessionId);
```

In `server.ts`, use:

```ts
async (sessionId) => {
  await toolRegistry.refresh();
  const session = await persistence.getSession(sessionId);
  await sessionScopedTools.refreshForSession(sessionId, session?.metadata.actionBinding);
}
```

AgentRuntime must receive `sessionScopedTools.registry`, not the builtin registry.

- [ ] **Step 6: Run registry tests**

```bash
pnpm exec vitest run apps/agent-server/tests/settings/SettingsBackedToolRegistry.test.ts apps/agent-server/tests/actions/SessionScopedToolRegistry.test.ts apps/agent-server/tests/session/SessionRuntimeOrchestrator.test.ts
```

Expected: PASS after updating existing orchestrator test hooks to accept `sessionId`.

- [ ] **Step 7: Commit Task 7**

```bash
git add packages/core/src/tools/ToolRegistry.ts \
  apps/agent-server/src/SettingsBackedToolRegistry.ts \
  apps/agent-server/src/SessionRuntimeOrchestrator.ts \
  apps/agent-server/src/SessionScopedToolRegistry.ts \
  apps/agent-server/tests/settings/SettingsBackedToolRegistry.test.ts \
  apps/agent-server/tests/session/SessionRuntimeOrchestrator.test.ts \
  apps/agent-server/tests/actions/SessionScopedToolRegistry.test.ts
git commit -m "feat: scope mcp tools to action sessions"
```

---

## Task 8: Wire MCP Servers Into Agent Server

**Files:**
- Modify: `apps/agent-server/src/server.ts`
- Create: `apps/agent-server/src/MCPServerRegistry.ts`
- Test: `apps/agent-server/tests/actions/MCPServerRegistry.test.ts`

- [ ] **Step 1: Write failing MCP server registry test**

Create:

```ts
import { describe, expect, it } from "vitest";
import type { MCPClient } from "@handagent/core/mcp/MCPClient.ts";
import { MCPServerRegistry } from "../../src/MCPServerRegistry.ts";

describe("MCPServerRegistry", () => {
  it("caches tools per server id", async () => {
    let createCount = 0;
    const registry = new MCPServerRegistry({
      createClient: (serverId) => {
        createCount += 1;
        return makeClient(serverId);
      },
    });

    await expect(registry.listTools("github")).resolves.toHaveLength(1);
    await expect(registry.listTools("github")).resolves.toHaveLength(1);
    expect(createCount).toBe(1);
  });
});

function makeClient(serverId: string): MCPClient {
  return {
    async initialize() {},
    async listTools() {
      return [{ name: "create_issue", description: serverId, inputSchema: { type: "object" } }];
    },
    async callTool() {
      return { content: [{ type: "text", text: "ok" }] };
    },
    async close() {},
  };
}
```

- [ ] **Step 2: Implement MCPServerRegistry**

Create:

```ts
import type { AgentTool } from "@handagent/core/tools/AgentTool.ts";
import type { MCPClient } from "@handagent/core/mcp/MCPClient.ts";
import { MCPToolAdapter } from "@handagent/core/mcp/MCPToolAdapter.ts";

export class MCPServerRegistry {
  private readonly clients = new Map<string, MCPClient>();
  private readonly toolCache = new Map<string, AgentTool[]>();

  constructor(
    private readonly options: {
      createClient: (serverId: string) => MCPClient;
    },
  ) {}

  async listTools(serverId: string): Promise<AgentTool[]> {
    const cached = this.toolCache.get(serverId);
    if (cached) return cached;

    let client = this.clients.get(serverId);
    if (!client) {
      client = this.options.createClient(serverId);
      await client.initialize();
      this.clients.set(serverId, client);
    }

    const tools = (await client.listTools()).map((tool) =>
      new MCPToolAdapter({
        serverId,
        tool,
        callTool: (name, args) => client!.callTool(name, args),
      }),
    );
    this.toolCache.set(serverId, tools);
    return tools;
  }
}
```

- [ ] **Step 3: Wire default server**

In `startDefaultServer`:

- read MCP config from `join(spotDir, "mcp.json")`
- create MCP client factory:

```ts
function createMCPClientFromConfig(config: MCPServerConfig): MCPClient {
  return config.transport === "stdio"
    ? new StdioMCPClient(config)
    : new StreamableHttpMCPClient(config);
}
```

- instantiate `ActionBindingResolver({ pluginsDir: join(spotDir, "plugins") })`
- pass resolver into `SessionRouter`
- instantiate `MCPServerRegistry`
- instantiate `SessionScopedToolRegistry` with builtin registry and `mcpRegistry.listTools`
- pass `sessionScopedTools.registry` to `AgentRuntime`

Keep missing `mcp.json` behavior: no servers registered. If a Plugin references a missing MCP server, `SessionScopedToolRegistry.refreshForSession` should log and skip that server, and runtime still runs prompt.

- [ ] **Step 4: Run server tests**

```bash
pnpm exec vitest run apps/agent-server/tests/actions apps/agent-server/tests/server apps/agent-server/tests/session
```

Expected: PASS.

- [ ] **Step 5: Commit Task 8**

```bash
git add apps/agent-server/src/server.ts \
  apps/agent-server/src/MCPServerRegistry.ts \
  apps/agent-server/tests/actions/MCPServerRegistry.test.ts
git commit -m "feat: wire mcp tools into action sessions"
```

---

## Task 9: Delete Old Private Plugin Runtime Path

**Files:**
- Delete: `packages/core/src/tools/plugins/PluginManifest.ts`
- Delete: `packages/core/src/tools/plugins/PluginTool.ts`
- Delete: `packages/core/src/tools/plugins/loadLocalPluginTools.ts`
- Delete: `packages/core/src/tools/plugins/plugins.md`
- Delete: `packages/core/tests/tools/plugins/plugin-tools.test.ts`
- Modify: `packages/core/src/tools/registerTools.ts`
- Modify: `packages/core/src/tools/tools.md`

- [ ] **Step 1: Remove plugin loader types from registerTools**

In `registerTools.ts`, remove `pluginLoaders` and `PluginToolsLoadResult` from options. Keep builtin candidate filtering:

```ts
export type RegisterToolsOptions = {
  registry?: ToolRegistry;
  platform: PlatformAdapter;
  workspaceRegistry?: WorkspaceRegistry;
  workspaceAskResolver?: WorkspaceAskResolver;
  settings?: ToolSettings;
};
```

Remove plugin conflict logic.

- [ ] **Step 2: Delete obsolete private plugin implementation files and tests**

Remove the obsolete private plugin runtime path:

```bash
rm -rf packages/core/src/tools/plugins
rm -rf packages/core/tests/tools/plugins
```

Remove old references found by `rg` in the same commit.

Run:

```bash
rg -n "PluginTool|loadLocalPluginTools|plugins/PluginManifest|pluginLoaders|plugin\\.echo|plugin tools" packages apps docs
```

Expected: only docs that explicitly describe the new Action Plugin design remain, or no results for old private runtime identifiers.

- [ ] **Step 3: Run tool registry tests**

```bash
pnpm exec vitest run packages/core/tests/tools apps/agent-server/tests/settings/SettingsBackedToolRegistry.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit Task 9**

```bash
git add -A packages/core/src/tools packages/core/tests/tools apps/agent-server/tests/settings packages/core/src/tools/tools.md
git commit -m "refactor: remove private plugin tool protocol"
```

---

## Task 10: Documentation and Final Verification

**Files:**
- Modify: `README.md`
- Modify: `apps/desktop/Sources/PromptPanel/prompt-panel.md`
- Modify: `apps/desktop/desktop.md`
- Modify: `apps/agent-server/agent-server.md`
- Modify: `packages/core/src/tools/tools.md`
- Create: `packages/core/src/mcp/mcp.md`
- Modify: directory index files if new directories require them, especially `packages/core/src/src.md`

- [ ] **Step 1: Update PromptPanel docs**

In `prompt-panel.md`, replace `PromptAction` descriptions with:

```md
| `ActionDefinition.swift` | 本地 Plugin prompt 的 UI 定义、校验、trigger 冲突处理 |
| `ActionManifestStore.swift` | 从 `~/.spotAgent/plugins/*/plugin.json` 读取 Action manifests |
| `ActionInvocation.swift` | trigger / 参数解析与 `template` 渲染 |
```

Document:

- “打开设置”和“会话历史”不再是 Action rows.
- Action prompt 强制创建新 session.
- Desktop 只渲染 template and sends `actionBinding`.

- [ ] **Step 2: Update agent-server docs**

In `agent-server.md`, add:

```md
| `src/ActionBindingResolver.ts` | 校验 create_session_request.actionBinding，并从本地 Plugin manifest 解析 session 绑定的 mcpServerIds |
| `src/MCPServerRegistry.ts` | MCP client 缓存与 tools/list 适配 |
| `src/SessionScopedToolRegistry.ts` | 按 session metadata 组合 builtin tools 与 MCP tools |
```

Mention `~/.spotAgent/mcp.json` and `~/.spotAgent/plugins/<id>/plugin.json`.

- [ ] **Step 3: Add MCP module doc**

Create `packages/core/src/mcp/mcp.md`:

```md
# mcp

标准 MCP client 与 tool adapter。第一版支持 `stdio` 和 `Streamable HTTP`，按 MCP `2025-11-25` 稳定规范实现。HandAgent session scope 不依赖 MCP transport session，而是由 session metadata 的 `actionBinding` 决定。

| 文件 | 职责 |
|------|------|
| `MCPConfig.ts` | 解析 `~/.spotAgent/mcp.json` |
| `MCPClient.ts` | 最小 MCP client 接口 |
| `StdioMCPClient.ts` | JSON-RPC over stdio |
| `StreamableHttpMCPClient.ts` | JSON-RPC over Streamable HTTP |
| `MCPToolAdapter.ts` | 把 MCP tool 包装为 `AgentTool`，暴露名为 `mcp.<serverId>.<toolName>` |
```

Update `packages/core/src/src.md` to index `mcp/`.

- [ ] **Step 4: Run full verification**

```bash
bash ./scripts/test.sh
bash ./scripts/swiftw test
bash ./scripts/swiftw build
```

Expected: all pass.

- [ ] **Step 5: Commit Task 10**

```bash
git add README.md \
  apps/desktop/Sources/PromptPanel/prompt-panel.md \
  apps/desktop/desktop.md \
  apps/agent-server/agent-server.md \
  packages/core/src/tools/tools.md \
  packages/core/src/mcp/mcp.md \
  packages/core/src/src.md
git commit -m "docs: document action plugin mcp flow"
```

---

## Self-Review Checklist

- Spec coverage:
  - Local Plugin `prompts[]`: Tasks 1, 5, 10.
  - `template` rendering in Desktop: Tasks 2, 3.
  - PromptPanel trigger and argument editing: Tasks 2, 3.
  - `actionBinding` protocol: Task 4.
  - Session-persisted MCP scope: Tasks 4, 7.
  - MCP stdio and Streamable HTTP: Task 6.
  - Server wiring and tool scoping: Tasks 7, 8.
  - Old plugin protocol removal: Task 9.
  - Documentation: Task 10.
- Placeholder scan: passed; the plan contains no placeholder markers or unspecified test steps.
- Type consistency:
  - Swift uses `ActionDefinition`, `ActionBindingPayload`, and `ParsedActionInvocation`.
  - TypeScript uses `SessionActionBinding`, `RequestedActionBinding`, `ActionBindingResolver`, and `SessionScopedToolRegistry`.
  - MCP exposed tool names follow `mcp.<serverId>.<toolName>`.

## Execution Handoff

Plan complete. Choose one execution mode:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fastest for this multi-module change.
2. **Inline Execution** - Execute tasks in this session using `superpowers:executing-plans`, with checkpoints after each task.
