# Bug 清单

本文记录当前已知但尚未修复的 bug。功能待办继续放在 [TODO.md](/Users/mu9/proj/handAgent/docs/TODO.md)，架构问题继续放在 [architecture-review.md](/Users/mu9/proj/handAgent/docs/architecture-review.md)。

最后核对日期：2026-05-19。

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

## 当前 bug

### 2. 普通唤起 PromptPanel 会自动采集当前选区

**严重级别**：P0

**现象**：使用默认全局热键 `showPromptPanel` 唤起 PromptPanel 时，会自动执行选区采集，将前台 App 的选中内容隐式带入 LLM 上下文。

**复现步骤**：

1. 在任意 App 中选中一段文字。
2. 按 `showPromptPanel` 热键（默认 ⌘⇧Space）唤起 PromptPanel。
3. 输入任意 prompt 并提交。
4. 查看 `~/.spotAgent/sessions/<session-id>.json`，user message 中包含了未主动提供的选区内容。

**期望**：普通 `showPromptPanel` 只打开输入面板并聚焦输入框，不采集选区。只有 `captureSelection` 快捷键路径才采集选区并展示 textSelection chip。

**根因边界**：`PromptPanelController.show()` 内固定调用 `captureSelectionIfPossible()`，未区分唤起来源。

**调用链**：

- `AppCoordinator.setupHotkey()` → `.showPromptPanel` → `send(.togglePromptPanel)`
- `send(.togglePromptPanel)` → `PromptPanelController.toggle()`
- `PromptPanelController.show()` → `captureSelectionIfPossible()`
- `captureSelectionIfPossible()` → `MacSelectionCaptureProvider.captureSelectedText()` → append `.textSelection`

**发现日期**：2026-05-19（commit 环境：`codex/real-launch-qa-report` 分支）

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

**发现日期**：2026-05-19

---

### 4. worktree 启动时 agent-server 使用了主仓库路径

**严重级别**：P1

**现象**：从 worktree 执行 `bash ./scripts/swiftw run HandAgentDesktop` 时，子进程 node 命令行指向主仓库 `/Users/mu9/proj/handAgent/apps/agent-server/src/server.ts`，而非当前 worktree 下的同名文件。

**复现步骤**：

1. 在 `.worktrees/<name>/` 下修改 `apps/agent-server/src/server.ts`。
2. 执行 `bash ./scripts/swiftw run HandAgentDesktop`。
3. `lsof -nP -iTCP:4317 -sTCP:LISTEN` 查看 node 进程命令行，指向主仓库路径。

**期望**：agent-server 应使用同一 worktree 下的 `apps/agent-server/src/server.ts`。若无法定位同一 worktree，应在 UI 或日志中明确暴露启动路径。

**根因边界**：`AgentServerService.locateRepositoryRoot()` 的候选包含 `Bundle.main.executableURL`、`Bundle.main.resourceURL`、`Bundle.main.bundleURL` 和当前工作目录，定位结果落到了主仓库而非 worktree。

**发现日期**：2026-05-19
