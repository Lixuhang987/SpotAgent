# selection

用户主动选区的抽象。约束 `AgentThread` 只能消费"用户主动 + 文本"的选区，避免把整屏文本默默灌进 LLM。

## 文件

| 文件 | 职责 |
|------|------|
| `SelectionCapture.ts` | `SelectionCapture` 接口（`captureSelectedText()`）+ `SelectionCaptureResult`（`selected \| empty \| error`）+ `normalizeSelectedText` / `selectionResultFromText` 辅助 |

## 与桌面采集路径的关系

- core 的 `SelectionCapture` 是抽象接口，**当前 agent-server 主链路并不调用它**。生产路径是：desktop 端 [SelectionCapture 模块](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/SelectionCapture/selection-capture.md) 直接采集 → PromptPanel attachment chip → `UserInput.items` → React 首轮 `op.submit(UserInput)` → server 端 `composeUserContent` 拼成 user message。
- core 这个接口主要是给未来无桌面环境（CLI / 测试 / 其他平台）兜底用的；desktop 平台的实际实现走 Swift 而非 TS。
- `AgentThread.buildInitialUserMessage()` 仍消费 `SelectionCaptureResult.selected`，把选区拼到 prompt 前面（中文 prefix「选区文本：」）。

## 编辑此目录的约束

- 不要在 selection 里加屏幕 / 窗口 / 文件等其它"上下文"，那些应该走 tool。
- `selected.text` 是用户主动选区，不应包含 newline 噪声以外的特殊处理；`normalizeSelectedText` 仅做 CRLF → LF + trim 空。
- 新增 selection 类型（如 image selection）请考虑是否更合适放进 `protocol/UserMessageAttachment`，selection 抽象保持窄。

## 相关文档

- 桌面端实现：[apps/desktop/Sources/AppServices/SelectionCapture/selection-capture.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/SelectionCapture/selection-capture.md)
- 用户输入边界：[AGENTS.md "输入边界"](/Users/mu9/proj/handAgent/AGENTS.md)
- AgentThread：[runtime/runtime.md](/Users/mu9/proj/handAgent/packages/core/src/runtime/runtime.md)
