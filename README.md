# HandAgent

HandAgent 是一个 macOS 优先的桌面 Agent Runtime MVP。当前桌面壳使用 `AppKit + SwiftUI`，Agent Core 负责会话与工具编排，LLM 按需调用 context tools 和 action tools。

## 当前能力

- 全局热键唤起 `PromptPanel`
- 提交 prompt 后创建 `SessionWindow`
- `SessionWindow` 流式展示 user / assistant / tool 消息
- `agent-server` 驱动 `AgentRuntime` 与 tool 调用
- 状态气泡提供当前会话回跳入口

## 目录

- `apps/desktop/HandAgentApp.swift`：macOS 宿主、PromptPanel、SessionWindow 与状态气泡入口
- `packages/core`：跨平台 Agent Core、工具与会话逻辑
- `apps/agent-server`：本地 session server 与流式消息桥
- `packages/platform-macos`：macOS 选区捕获实现

## 本地验证

- Agent-server + Core tests：`bash ./scripts/test.sh`
- Swift tests：`bash ./scripts/swiftw test`
- Swift build：`bash ./scripts/swiftw build`

## 模型配置

当前本地 Node agent-server 会从启动进程环境读取 `OPENAI_API_KEY`，并可选读取 `OPENAI_BASE_URL`。如果没有配置 API key，提交 prompt 后会返回明确错误提示，且不会产生模型回复。

建议在当前 shell 里先执行：

```bash
export OPENAI_API_KEY="你的 OpenAI API key"
export OPENAI_BASE_URL="https://你的模型提供商兼容 OpenAI 的入口/v1"
```

如果你使用的是官方 OpenAI，通常不需要配置 `OPENAI_BASE_URL`。如果希望每次打开终端都自动生效，可以把同样的 `export` 语句追加到你的 shell 配置文件，例如 `~/.zshrc`，然后重新打开终端或执行：

```bash
source ~/.zshrc
```

配置完成后，再按正常流程启动桌面宿主：

```bash
pnpm install
bash ./scripts/swiftw run HandAgentDesktop
```

## 说明

- 默认不会把屏幕、窗口、文件、剪贴板、App 状态等上下文预注入模型。
- 这些上下文只能由 LLM 通过 tool 按需读取。
- 当前桌面壳只负责任务入口、会话窗口和状态反馈，runtime 与平台抽象继续下沉在共享层。
