# HandAgent

HandAgent 是一个 macOS 优先的桌面 Agent Runtime MVP。当前桌面壳正从 `WKWebView` 迁移到 `AppKit + SwiftUI`，Agent Core 负责会话与工具编排，LLM 按需调用 context tools 和 action tools。

## 当前能力

- 全局热键唤起输入框
- 支持用户主动选区作为会话前置上下文
- 仅用户主动输入进入 LLM
- LLM 按需调用上下文工具与操作工具
- 后台气泡反馈运行结果

## 目录

- `apps/desktop/HandAgentApp.swift`：macOS 宿主、PromptPanel、SessionWindow 与状态气泡入口
- `apps/desktop/Web/`：旧 WebView 交互壳残留与当前 TS 测试工具链承载目录
- `packages/core`：跨平台 Agent Core、工具与会话逻辑
- `apps/agent-server`：本地 session server 与流式消息桥
- `packages/platform-macos`：macOS 选区捕获实现

## 本地验证

- Agent-server + Core tests：`apps/desktop/Web/node_modules/.bin/vitest run apps/agent-server/src/SessionManager.test.ts packages/core/tests/runtime.test.ts packages/core/tests/selection.test.ts packages/core/tests/context-tools.test.ts packages/core/tests/file-tools.test.ts`
- Swift tests：`bash ./scripts/swiftw test`
- Swift build：`bash ./scripts/swiftw build`

## API key 配置

当前本地 Node agent-server 会从启动进程环境读取 `OPENAI_API_KEY`。如果没有配置，提交 prompt 后会返回明确错误提示，且不会产生模型回复。

建议在当前 shell 里先执行：

```bash
export OPENAI_API_KEY="你的 OpenAI API key"
```

如果希望每次打开终端都自动生效，可以把同一行追加到你的 shell 配置文件，例如 `~/.zshrc`，然后重新打开终端或执行：

```bash
source ~/.zshrc
```

配置完成后，再按正常流程启动桌面宿主：

```bash
cd apps/desktop/Web && npm run build
bash ./scripts/swiftw run HandAgentDesktop
```

## 说明

- 默认不会把屏幕、窗口、文件、剪贴板、App 状态等上下文预注入模型。
- 这些上下文只能由 LLM 通过 tool 按需读取。
- 当前实现保留了后续多平台扩展所需的跨平台抽象。
