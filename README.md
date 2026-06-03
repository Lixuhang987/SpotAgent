# HandAgent

HandAgent 是一个 macOS 优先的桌面 Agent Runtime MVP。当前桌面壳使用 `AppKit + SwiftUI`，Agent Core 负责会话与工具编排，LLM 按需调用 builtin tools；PromptPanel 会把本地 manifest prompts 构建为 `ActionDefinition`，其中 plugin action 可把 prompt 模板绑定到 session-scoped MCP tools。

## 当前能力

- 全局热键唤起 `PromptPanel`
- `PromptPanel` 右上角按钮和 `Command+,` 打开快捷键设置页
- 设置页支持配置模型、builtin tools、Plugin、Append Prompt、MCP server、权限规则、快捷键和 workspace
- PromptPanel 会读取 `~/.spotAgent/plugins/*/plugin.json` 中的 prompts，构建 `ActionDefinition`，按 trigger 渲染 template 并创建新 session
- 文本选区与区域截图可作为 PromptPanel attachment chip 附加到用户输入
- 提交 prompt 后创建 `SessionWindow`
- `SessionWindow` 展示 user / assistant / tool 消息、历史侧栏、连接状态、权限审批气泡和 workspace 选择气泡，并具备断线自动重连基础逻辑
- `agent-server` 驱动 `AgentRuntime`、builtin tool 注册、workspace 沙箱文件工具、权限策略、会话持久化和 Action session 的 MCP tool 绑定
- 状态气泡提供当前会话回跳入口

## 目录

- `apps/desktop/HandAgentApp.swift`：macOS 宿主、PromptPanel、SessionWindow 与状态气泡入口
- `apps/desktop/Sources/Settings`：模型、快捷键与 workspace 设置页
- `packages/core`：跨平台 Agent Core、工具与会话逻辑
- `apps/agent-server`：本地 session server、平台反向 IPC 与权限桥

## 本地验证

- Agent-server + Core tests：`bash ./scripts/test.sh`
- Swift tests：`bash ./scripts/swiftw test`
- Swift build：`bash ./scripts/swiftw build`

## 模型配置

当前模型配置不再读取环境变量，而是统一由桌面端设置页写入 `~/.spotAgent/settings.json`。可配置项包括：

- `provider`：当前支持 `openai-compatible`、`anthropic`
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

## ActionDefinition 与 MCP

Action manifest 位于 `~/.spotAgent/plugins/<plugin-id>/plugin.json`，声明 `prompts[]`、`kind`、`template`、参数、可选全局快捷键和 `mcpServerIds`。Desktop 负责构建 `ActionDefinition`、trigger 解析、`[name: value]` 参数填充和 template 渲染；skill action 只提交普通 prompt，plugin action 额外发送 `actionBinding`。agent-server 会重新校验 plugin action 的 `actionBinding`，并把 manifest 中的 `mcpServerIds` 持久化到新 session metadata。

MCP server 配置位于 `~/.spotAgent/mcp.json`，支持 `stdio` 与 `streamableHttp`。真实 LLM 模式下，新 session 初始只暴露 `use_tools` 激活入口；激活后会把 builtin tools 与全局 MCP server tools 注入当前 session。plugin action 的 `mcpServerIds` 会作为该 session 的绑定范围参与激活后的工具组合。stdio server 可按需配置 `elicitation.autoAcceptEmptyForm: true`，用于 Computer Use 这类只要求空表单确认的本地授权握手。

Settings 中的 `Plugin`、`追加` 与 `MCP` 页面可以直接编辑这些本地文件，并提供与 `examples/` 目录一致的示例配置。MCP 配置由 agent-server 启动时读取，保存后需要重启桌面 App 才会进入当前运行中的 server。

## 说明

- 默认不会把屏幕、窗口、文件、剪贴板、App 状态等上下文预注入模型。
- 这些上下文只能由 LLM 通过 tool 按需读取。
- 图片附件会写入 BlobStore；进入 runtime 前 agent-server 会把 image STUB 展开为多模态 image part，是否可用取决于当前 provider capability。
- 当前 assistant delta 已接入 LLM adapter 的真实 streaming；协议仍用 `assistant_message_start/delta/end` 向桌面端增量推送。
- 当前桌面壳只负责任务入口、会话窗口和状态反馈，runtime 与平台抽象继续下沉在共享层。
