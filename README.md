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

当前模型配置不再读取环境变量，而是统一由桌面端设置页写入 `~/.spotAgent/settings.json`。可配置项包括：

- `model`
- `apiKey`
- `baseUrl`
- `api`：当前支持 `responses`、`chat`、`completion`

首次启动后，可通过应用菜单里的 `Settings...` 打开配置页并保存。配置完成后，再按正常流程启动桌面宿主：

```bash
pnpm install
bash ./scripts/swiftw run HandAgentDesktop
```

注意：

- `agent-server` 会在每次模型请求前重新读取 `~/.spotAgent/settings.json`，因此保存设置后无需重启应用即可影响后续新请求。
- 如果未配置 `apiKey`，提交 prompt 后会返回明确错误：`Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。`
- 如果对话里看到 `Could not connect to the server`，优先排查本地 `agent-server` 是否启动成功；这类错误发生在连接本地会话服务阶段，通常早于模型 API key 校验。

## 说明

- 默认不会把屏幕、窗口、文件、剪贴板、App 状态等上下文预注入模型。
- 这些上下文只能由 LLM 通过 tool 按需读取。
- 当前桌面壳只负责任务入口、会话窗口和状态反馈，runtime 与平台抽象继续下沉在共享层。
