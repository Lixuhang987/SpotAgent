# Bug 清单

本文记录当前已知但尚未修复的 bug。功能待办继续放在 [TODO.md](/Users/mu9/proj/handAgent/docs/TODO.md)，架构问题继续放在 [architecture-review.md](/Users/mu9/proj/handAgent/docs/architecture-review.md)。

最后核对日期：2026-05-20。

## 修 bug 约束

- 修复跨 View / ViewModel / Coordinator / Service / 进程边界 / 系统 API 的 bug 时，必须遵循 [$trace-and-verify-call-chain](/Users/mu9/.agents/skills/trace-and-verify-call-chain/SKILL.md)。
- 修复前先写出预期调用链，并把每一跳标成 checkpoint：说明该跳应发生什么、如何观察、什么证据能证明。
- 按顺序复现并验证每个 checkpoint，停在第一个未被证实的跳点；不要提前假设后续链路成功或失败。
- 只有在明确证明某一跳失败后，才实施最小修复；修复完成后需要补回能防止回归的测试或手工验收记录，并重新验证完整链路。

## 非产品缺陷 / 测试备注

### Computer Use 的 `super+shift+space` 不适合判断本项目全局热键

- Computer Use `press_key` 发送 `super+shift+space` 后未唤出 PromptPanel，但用户手动按快捷键可以唤出。
- 改用 macOS `System Events` 发送 `key code 49 using {command down, shift down}` 后正常唤起。
- 结论：属于测试工具按键注入不等价，不作为产品 bug。

### LLM 返回 Gateway Timeout

- 测试 prompt 返回 `Failed after 3 attempts. Last error: Gateway Timeout`。
- 属于上游模型服务超时，不直接判断为产品代码缺陷。产品 UI 对错误的展示是可见的。

### mock-llm 不能证明真实 vision 与 token streaming

- 2026-05-19 本轮实机 QA 使用 `bash ./scripts/package-app.sh --mock-llm` 打包启动。
- 图片附件链路可验证到 Quick Look、SessionWindow 摘要、blob stub 持久化；但 `[mock:image-summary]` 只返回固定文本，不能证明真实 LLM 基于图片内容描述。
- `[mock:assistant-ok]` 为一次性 mock assistant 回复，不能证明真实 token delta 至少 5 段逐段更新。
- 结论：第 45、46 项需要 real LLM 环境单独验证。

---

## 已修复 bug

### 1. 快捷键修改配置不会生效

**现象**：用户在设置页修改快捷键配置后，新配置不会在运行中的桌面 App 里生效。

**预期**：保存或录入新的快捷键后，后续全局快捷键触发应立即使用最新配置；若需要重新注册监听，也应由 Settings 保存链路或快捷键服务显式完成。

**状态**：已修复。

**checkpoint 与结论**：

- 设置页录入 -> `KeyboardShortcuts` 存储：`KeyboardShortcuts.Recorder` 走库内 `setShortcut`，会写入 `UserDefaults` 并发送 `KeyboardShortcuts_shortcutByNameDidChange` 通知。
- `KeyboardShortcuts` 存储 -> Hotkey registrar 监听更新：失败点在宿主热键层缺少显式监听/重绑定契约。现已由 `NamedHotkeyRegistrar` 订阅同名快捷键变更通知，收到变更后先移除旧 handler，再按新配置重新绑定。
- Hotkey registrar -> `AppCoordinator` 回调：`ProductionHotkeyRegistrar` 仍只注册 `showPromptPanel` / `captureSelection` / `captureRegion` 三条 handler，业务回调不变。
- `PromptPanel` action 快捷键：无需额外缓存失效；`PromptPanelViewModel.shortcutLabel(for:)` 与 `PromptPanelController` 局部 keyDown 匹配都实时读取 `KeyboardShortcuts.getShortcut(for:)`。回归测试覆盖同名 action shortcut 更新后 label 读取新值。

**验证**：

- `HotkeyRegistrarTests.testNamedHotkeyRebindsHandlerWhenShortcutChanges` 覆盖同名 `KeyboardShortcuts.Name` 更新后运行中 handler 重新绑定到新配置。
- `HotkeyRegistrarTests.testPromptActionShortcutLabelReadsUpdatedStoredShortcut` 覆盖 PromptAction 快捷键从存储读取更新值。

### 2. 普通唤起 PromptPanel 会自动采集当前选区

**严重级别**：P0

**现象**：使用默认全局热键 `showPromptPanel` 唤起 PromptPanel 时，会自动执行选区采集，将前台 App 的选中内容隐式带入 LLM 上下文。

**复现步骤**：

1. 在任意 App 中选中一段文字。
2. 按 `showPromptPanel` 热键（默认 ⌘⇧Space）唤起 PromptPanel。
3. 输入任意 prompt 并提交。
4. 查看 `~/.spotAgent/sessions/<session-id>.json`，user message 中包含了未主动提供的选区内容。

**期望**：普通 `showPromptPanel` 只打开输入面板并聚焦输入框，不采集选区。只有 `captureSelection` 快捷键路径才采集选区并展示 textSelection chip。

**状态**：已修复。

**根因边界**：`PromptPanelController.show()` 内固定调用 `captureSelectionIfPossible()`，导致普通 `showPromptPanel` / `togglePromptPanel` 与用户主动 `captureSelection` 共用同一采集入口。修复后 `PromptPanelController.show()` 只负责窗口展示与聚焦；文本选区采集只保留在 `PromptCaptureCoordinator.captureSelectionAndShow()` 的主动快捷键路径。

**checkpoint 与结论**：

- `AppCoordinator.setupHotkey()` -> `.showPromptPanel` -> `send(.togglePromptPanel)`：路径保持不变，仍只进入面板显示分支。
- `send(.togglePromptPanel)` -> `PromptPanelController.toggle()` -> `show()`：已验证失败点在 `show()` 内隐式调用 selection provider；修复后 `PromptPanelController` 不再持有 selection provider，回归测试证明普通 `show()` 不会追加 `.textSelection` 附件。
- `captureSelection` 热键 -> `PromptCaptureCoordinator.captureSelectionAndShow()`：主动采集路径仍在 `show()` 前调用 `SelectionCaptureProvider.captureSelectedText()`，不依赖 `PromptPanelController.show()` 的副作用。

**验证**：

- 修复前 RED 证据：临时定向测试把 provider 注入 `PromptPanelController.show()` 后失败，inverted expectation 被触发，且 `viewModel.attachments` 出现 `textSelection("implicit selection")`。
- 修复后 `bash ./scripts/swiftw test --filter PromptPanelControllerTests` 通过；真实执行了 `testShowDoesNotAppendSelectionAttachment` 与 `testCaptureSelectionCoordinatorStillAppendsSelectionBeforeShowingPanel`。
- 修复后 `bash ./scripts/swiftw test` 通过。

**发现日期**：2026-05-19（commit 环境：`codex/real-launch-qa-report` 分支）

**修复日期**：2026-05-20

---

### 3. 状态气泡不会随 SessionWindow 失败状态更新

**严重级别**：P1

**现象**：会话窗口显示 `failed` + 错误文案后，状态气泡仍显示 `Running` 和原始 prompt 摘要。

**复现步骤**：

1. 提交一个 prompt 触发会话。
2. 等待 LLM 返回错误（如 Gateway Timeout 重试耗尽）。
3. SessionWindow 显示 `failed`，但状态气泡仍显示 `Running`。

**期望**：SessionWindow 收到 `.assistantMessageEnd`、`.status`、`.error` 后，应同步更新 `SessionRegistry` 中对应 `SessionSummary`。状态气泡应在 failed/idle/running 间与当前会话窗口一致。

**根因边界**：`AppCoordinator.handleSubmitPrompt()` 创建会话时只向 `SessionRegistry` 写入一次 `isRunning: true`；`SessionViewModel.handle(.error)` 更新窗口内 status 但没有回写 `SessionRegistry`。

**状态**：已修复。

**checkpoint 与结论**：

- `SessionEvent(.error/.status/.assistantMessageEnd)` -> `SessionViewModel.handle(_:)`：窗口内 `status`、`error`、`messages` 已按预期更新，失败点不在事件解析或窗口状态维护。
- `SessionViewModel.handle(_:)` -> `SessionRegistry`：修复前 RED 测试证明 registry 仍停留在创建会话时的 `isRunning: true` 与原始 prompt 摘要；现由 `SessionViewModel` 暴露 `onStateChanged` 闭包，`SessionLifecycle` 接收后同步 `SessionSummary`。
- `SessionRegistry` -> `StatusBubbleViewModel`：StatusBubble 继续只从 registry 派生 `isRunning` / `latestSummary`，不新增 mirror 状态；registry 更新后气泡会随 failed/idle/running 状态变化。

**验证**：

- 修复前 RED 证据：`bash ./scripts/swiftw test --filter SessionLifecycleTests` 中新增的 `testViewModelErrorUpdatesRegistrySummary`、`testAssistantMessageEndUpdatesRegistrySummaryToIdle`、`testStatusEventsUpdateRegistryRunningStateWhilePreservingSummary` 失败，registry 仍为 `isRunning: true` 且摘要仍是 `hello`。
- 修复后 `bash ./scripts/swiftw test --filter SessionLifecycleTests` 通过。

**发现日期**：2026-05-19

**修复日期**：2026-05-20

---

### 4. worktree 启动时 agent-server 使用了主仓库路径

**严重级别**：P1

**现象**：从 worktree 执行 `bash ./scripts/swiftw run HandAgentDesktop` 时，子进程 node 命令行指向主仓库 `/Users/mu9/proj/handAgent/apps/agent-server/src/server.ts`，而非当前 worktree 下的同名文件。

**复现步骤**：

1. 在 `.worktrees/<name>/` 下修改 `apps/agent-server/src/server.ts`。
2. 执行 `bash ./scripts/swiftw run HandAgentDesktop`。
3. `lsof -nP -iTCP:4317 -sTCP:LISTEN` 查看 node 进程命令行，指向主仓库路径。

**期望**：agent-server 应使用同一 worktree 下的 `apps/agent-server/src/server.ts`。若无法定位同一 worktree，应在 UI 或日志中明确暴露启动路径。

**根因边界**：`AgentServerService.locateRepositoryRoot()` 的候选包含 `Bundle.main.executableURL`、`Bundle.main.resourceURL`、`Bundle.main.bundleURL` 和当前工作目录，但候选顺序优先 Bundle 路径。worktree 内 `bash ./scripts/swiftw run HandAgentDesktop` 可能复用主仓库构建产物路径，导致 Bundle 候选先命中主仓库，当前 worktree cwd 没有机会作为 repo root。

**状态**：已修复。

**checkpoint 与结论**：

- `bash ./scripts/swiftw run HandAgentDesktop` -> 进程 cwd：`scripts/swiftw` 在当前 worktree 内执行 `swift run`，应把 `FileManager.default.currentDirectoryPath` 暴露给桌面进程；失败点不在脚本参数传递。
- `AgentServerService.locateRepositoryRoot()` -> repo root 选择：修复前 RED 测试证明当 Bundle 候选和 currentDirectory 候选都指向有效仓库时，旧顺序会返回 Bundle 所在主仓库；修复后 `AgentServerRepositoryRootLocator` 优先检查 currentDirectory，再回退到 Bundle 候选。
- repo root -> node 子进程：`launchProcess()` 继续用解析出的 repo root 同时设置 `process.currentDirectoryURL`、`NODE_PATH` 和 `apps/agent-server/src/server.ts` 绝对入口；因此 root 选择修正后，agent-server 命令行与模块解析都落在同一 worktree。

**验证**：

- 修复前 RED 证据：临时恢复旧候选顺序后，`bash ./scripts/swiftw test --filter 'AgentServerRuntimeModeTests/testRepositoryRootLocatorPrefersCurrentWorktreeOverBundleRepository'` 失败，实际解析为 `/repo/main-repo` 而非 `/repo/worktree-repo`。
- 修复后同一测试通过。

**发现日期**：2026-05-19

---

## 当前 bug

### 5. Tool message UI 在部分 tool 结果中展示了入参而非实际结果

**严重级别**：P1

**现象**：tool 实际执行结果已经正确写入 session 持久化，但 SessionWindow 可见 tool 气泡在部分场景展示的是调用入参摘要，而不是 tool result。

**复现步骤**：

1. 使用 mock LLM 打包启动：`bash ./scripts/package-app.sh --mock-llm`。
2. 提交 `[mock:workspace-list] QA workspace.list`。
3. 授权 `workspace.list` 后观察 SessionWindow。
4. 提交 `[mock:path-escape] QA 越狱写入拦截`。
5. 授权 `file.write` 后观察 SessionWindow。

**实际结果**：

- `workspace.list` UI 气泡显示 `workspace.list: {}`，但 session 文件中的 tool result 包含完整 workspace 列表。
- 越狱 `file.write` UI 气泡显示 `{"workspaceId":"qa-workspace","relativePath":"../../etc/passwd","content":"should be rejected"}`，但 session 文件中的 tool result 是 `Path escapes workspace root: ../../etc/passwd`。

**期望结果**：SessionWindow 的 completed tool 气泡应展示实际 tool result；错误结果应显示明确错误文案，而不是继续显示 tool 入参。

**证据**：

- `~/.spotAgent/sessions/FC95D6F1-415C-41A8-89A8-FAB137DBDEDA.json` 中 `workspace.list` 的 `tool_result.output` 包含 `default`、`tmp`、`qa-workspace`、`handagent-test`。
- `~/.spotAgent/sessions/AC07B7E0-9852-48A0-B38D-DC8016DE3352.json` 中 `file.write` 的 `tool_result.status` 为 `error`，`output` 为 `Path escapes workspace root: ../../etc/passwd`。

**初步调用链 / 根因边界**：

- agent-server 持久化：`AgentRuntime` 已正确写入 `tool_result` event，说明 runtime/tool 层结果正常。
- UI 展示：SessionWindow 收到 `tool_message` 后可能保留了 running 阶段的 arguments 文本，或 MessageTranslator / ViewModel 合并 completed tool message 时未用 result text 覆盖旧文本。
- 下一步应从 `SessionRuntimeOrchestrator` 下发 `tool_message`、`MessageTranslator` 转换和 `SessionViewModel` 合并消息三处追踪。

**发现日期**：2026-05-19
