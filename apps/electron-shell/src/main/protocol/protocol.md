# protocol

`protocol/` 定义 Swift <-> Electron command bridge 的 TypeScript 端协议。它是 Electron main 接收 Swift command 的唯一运行时校验层。

## 文件

| 文件 | 职责 |
|------|------|
| `electronShellProtocol.ts` | `SwiftToElectronCommand`、`ElectronToSwiftEvent`、`parseCommand()`、`encodeEvent()` 和 command type guard |

## Command 边界

- 所有 Swift -> Electron command 必须是 `channel: "electron_shell"`，且必须带 string `commandId`。
- 当前 command 只有 `thread_window.open_initial_prompt`、`thread_window.open_history`、`thread_window.focus`、`activity_window.show`、`shutdown`。
- `thread_window.prepare` 不存在；hidden ThreadWindow 预热由 Electron main 在 agent-server ready 后主动执行。
- `thread_window.open_initial_prompt.payload` 只接受 `clientRequestId`、`text`、`attachments`、`actionBinding`。attachments 的 runtime 校验只允许 `text_selection` 和 `image`，image MIME 限定 `image/png`、`image/jpeg`、`image/webp`。

## Event 边界

- Electron -> Swift event 只通过 `encodeEvent()` 输出 JSON line；字段名必须与 Swift `ElectronShellEvent` decoder 对齐。
- `thread_window.prepared` 和 `thread_window.prepare_failed` 是事件，不是 command ack。
- `command.ack` 只确认某个 Swift command 是否执行；它不代表 `/api/thread` 或 `/api/activity` 内部状态变化。
- Electron StatusBubble 点击不再产生 PromptPanel 相关 event；Swift 只通过全局热键、选区/截图入口或显式失败处理打开 PromptPanel。

## 修改约束

- 新增、删除或改名 command/event 时，必须同步更新 Swift [ElectronShellProtocol.swift](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProtocol.swift) 和双方测试。
- 不在本目录复制 core DTO。Initial prompt 的 attachment/action binding 类型从 `@handagent/core/protocol/*` 引用。
- `parseCommand()` 需要拒绝未知命令，尤其要持续覆盖拒绝 `thread_window.prepare` 的测试。
