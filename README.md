# HandAgent

HandAgent 是一个 macOS 优先的桌面 Agent Runtime MVP。当前版本采用 Swift 宿主承载 `WKWebView`，Web 侧运行 React UI，Agent Core 负责会话与工具编排，LLM 按需调用 context tools 和 action tools。

## 当前能力

- 全局热键唤起输入框
- 支持用户主动选区作为会话前置上下文
- 仅用户主动输入进入 LLM
- LLM 按需调用上下文工具与操作工具
- 后台气泡反馈运行结果

## 目录

- `apps/desktop/HandAgentApp.swift`：macOS 宿主与热键入口
- `apps/desktop/Web/App.tsx`：桌面 UI、会话提交与气泡渲染
- `packages/core`：跨平台 Agent Core、工具与会话逻辑
- `packages/platform-macos`：macOS 选区捕获实现

## 本地验证

- Web bundle：`cd apps/desktop/Web && npm run build`
- Web hotkey test：`cd apps/desktop/Web && npm run test:hotkey`
- Core tests：`./apps/desktop/Web/node_modules/.bin/vitest run packages/core/tests/runtime.test.ts packages/core/tests/selection.test.ts packages/core/tests/context-tools.test.ts packages/core/tests/file-tools.test.ts`
- Root build：`swift build`

## 说明

- 默认不会把屏幕、窗口、文件、剪贴板、App 状态等上下文预注入模型。
- 这些上下文只能由 LLM 通过 tool 按需读取。
- 当前实现保留了后续多平台扩展所需的跨平台抽象。
