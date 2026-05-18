# 真实启动测试问题报告

测试时间：2026-05-19 02:20 CST

测试环境：

- worktree：`/Users/mu9/proj/handAgent/.worktrees/real-launch-qa-report`
- 分支：`codex/real-launch-qa-report`
- 启动命令：`bash ./scripts/swiftw run HandAgentDesktop`
- 快捷键注入方式：`osascript -e 'tell application "System Events" to key code 49 using {command down, shift down}'`
- 说明：Computer Use 的 `press_key: super+shift+space` 与真实 macOS 全局快捷键事件不等价，本次不再用它判断产品热键是否可用。

## 基线结果

- `bash ./scripts/test.sh`：通过，19 个测试文件 / 100 个测试。
- `bash ./scripts/swiftw test`：通过，输出 `SUCCESS`。
- `bash ./scripts/swiftw build`：通过；存在 SwiftPM 未声明 `.md` 资源的 warning，未阻塞构建。

## 已确认问题

### 1. 普通唤起 PromptPanel 会自动采集当前选区

严重级别：P0

现象：

- 使用默认全局热键 `showPromptPanel` 唤起 PromptPanel。
- 输入 `请只回复 OK，用于本地功能测试。` 并按 Return 提交。
- 新建会话 `B843D86F-9F97-4002-8F38-AAE39A861B5F` 后，持久化用户消息包含了额外选区内容：

```json
{
  "role": "user",
  "content": "请只回复 OK，用于本地功能测试。\n\n[选区]\n请回复 OK，不要调用工具。"
}
```

影响：

- 违反当前产品边界：“只有用户主动输入和用户主动选区可以作为初始上下文”。
- `showPromptPanel` 是普通输入入口，不应默认执行选区采集；否则会把用户当前前台 App 的选中内容隐式带进 LLM 上下文。
- 状态气泡摘要也显示 `[附件 ×1]`，用户容易误以为普通 prompt 没有附件，实际已经带入附件。

调用链证据：

- `AppCoordinator.setupHotkey()` 将 `.showPromptPanel` 绑定到 `send(.togglePromptPanel)`。
- `send(.togglePromptPanel)` 调用 `PromptPanelController.toggle()`。
- `PromptPanelController.show()` 内固定调用 `captureSelectionIfPossible()`。
- `captureSelectionIfPossible()` 使用 `MacSelectionCaptureProvider.captureSelectedText()` 合成 Cmd-C 并将结果 append 为 `.textSelection`。

期望：

- 普通 `showPromptPanel` 只打开输入面板并聚焦输入框，不采集选区。
- 只有 `captureSelection` 快捷键路径才采集选区并展示 textSelection chip。

### 2. 状态气泡不会随 SessionWindow 失败状态更新

严重级别：P1

现象：

- 会话窗口 `Session B843D86F` 最终显示：
  - 状态：`failed`
  - 错误：`Failed after 3 attempts. Last error: Gateway Timeout`
- 同时状态气泡仍显示：
  - `Running`
  - `请只回复 OK，用于本地功能测试。\n\n[附件 ×1]`

证据：

- SessionWindow 辅助功能文本：`failed, Failed after 3 attempts. Last error: Gateway Timeout`
- 状态气泡辅助功能文本：`Running, 请只回复 OK，用于本地功能测试。\n\n[附件 ×1]`
- 持久化 session 文件已有 error event：

```json
{
  "type": "error",
  "message": "Failed after 3 attempts. Last error: Gateway Timeout"
}
```

影响：

- 用户无法通过状态气泡判断当前会话已经失败。
- 状态气泡可能持续吸引用户回到一个已失败会话，表现为“仍在运行”。

调用链证据：

- `AppCoordinator.handleSubmitPrompt()` 创建会话时只向 `SessionRegistry` 写入一次 `isRunning: true`。
- `SessionViewModel.handle(.error)` 会将窗口内 `status` 更新为 `failed`。
- 现有代码没有看到从 `SessionViewModel.status/error` 回写 `SessionRegistry` 的路径。

期望：

- SessionWindow 收到 `.assistantMessageEnd`、`.status`、`.error` 后，应同步更新 `SessionRegistry` 中对应 `SessionSummary`。
- 状态气泡应在 failed/idle/running 间与当前会话窗口一致。

### 3. worktree 启动时 agent-server 使用了主仓库路径

严重级别：P1

现象：

- Swift App 从 worktree 启动：`/Users/mu9/proj/handAgent/.worktrees/real-launch-qa-report/.build/.../HandAgentDesktop`
- 但子进程命令行为：

```text
/opt/homebrew/bin/node --experimental-transform-types --experimental-specifier-resolution=node /Users/mu9/proj/handAgent/apps/agent-server/src/server.ts
```

- `lsof -nP -iTCP:4317 -sTCP:LISTEN` 也确认该 node 进程监听 4317。

影响：

- 在 worktree 中修改 `apps/agent-server` 后，真实启动测试可能仍运行主仓库的 agent-server，导致测试结果与当前分支不一致。
- 这违反仓库要求“worktree 可独立运行”的开发流程预期。

初步原因：

- `AgentServerService.locateRepositoryRoot()` 的候选包含 `Bundle.main.executableURL`、`Bundle.main.resourceURL`、`Bundle.main.bundleURL` 和当前工作目录。
- 当前运行中定位结果落到了主仓库 `/Users/mu9/proj/handAgent`，不是 worktree。

期望：

- 从 worktree 执行 `bash ./scripts/swiftw run HandAgentDesktop` 时，agent-server 应使用同一 worktree 下的 `apps/agent-server/src/server.ts`。
- 若无法定位同一 worktree，应在 UI 或日志中明确暴露启动路径，避免误测。

## 非产品缺陷 / 测试备注

### Computer Use 的 `super+shift+space` 不适合判断本项目全局热键

现象：

- Computer Use `press_key` 发送 `super+shift+space` 后未唤出 PromptPanel。
- 用户手动按快捷键可以唤出。
- 改用 macOS `System Events` 发送 `key code 49 using {command down, shift down}` 后，窗口数从 1 变 2，新增 `640x448` PromptPanel。

结论：

- 该问题属于测试工具按键注入不等价，不作为产品 bug。

### LLM 返回 Gateway Timeout

现象：

- 测试 prompt 最终返回 `Failed after 3 attempts. Last error: Gateway Timeout`。

判断：

- 这可能是当前 `~/.spotAgent/settings.json` 中配置的上游模型服务超时，不直接判断为产品代码缺陷。
- 产品 UI 对错误的展示是可见的，SessionWindow 已同步显示 failed 与错误文案。

## 已验证通过的链路

- 原生全局热键可唤出 PromptPanel。
- PromptPanel 文本框可自动聚焦。
- TextField Return 可提交 prompt。
- 提交后 PromptPanel 关闭并创建 `760x560` SessionWindow。
- 用户消息写入 `~/.spotAgent/sessions/<session-id>.json`。
- agent-server 错误最终可在 SessionWindow 中显示。

