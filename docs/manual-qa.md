# 手工验收清单

## 维护规则

本文件只保留尚未通过实机 QA 的手工验收项。验证通过后，必须从本文件删除对应内容，并把完整验证日期、环境、过程、证据与结论移动到 [archive.md](./archive.md)(永远不要读取archive.md的内容，仅在最后追加)。

## 验收目标

确认桌面 Agent MVP 仍未归档的端到端路径可用，并把新通过的条目及时移入归档：ScreenCaptureKit 反向 IPC、Accessibility、多 provider LLM。

## 验收前提

- 已完成依赖安装。
- 已通过 `bash ./scripts/test.sh`。
- 已通过 `bash ./scripts/swiftw test`。
- 已通过 `bash ./scripts/swiftw build`。

## AgentCore 消息输出回归（P2）

1. 使用 mock LLM 打包并启动桌面 App：`bash ./scripts/package-app.sh --mock-llm`，再打开 `dist/HandAgentDesktop.app`。
1. 通过 PromptPanel 提交 `please [mock:file-write] QA_AGENTCORE_MESSAGES_ONLY_YYYYMMDD_HHMMSS`。
1. 确认 SessionWindow 仍按协议事件显示 user、tool、assistant 消息气泡，最终 assistant 文案为 `Mock file.write completed for hello.txt.`。
1. 打开对应 `~/.spotAgent/sessions/<session-id>.json`，确认持久化只包含 `messages` / `events` 等会话数据，不依赖 runtime 额外返回 UI 气泡字段。

## 删除 running session 回归（P1）

1. 使用 mock LLM 打包并启动桌面 App：`bash ./scripts/package-app.sh --mock-llm`，再打开 `dist/HandAgentDesktop.app`。
1. 通过 PromptPanel 提交 `[mock:slow-focus] QA_DELETE_RUNNING_SESSION_TIMEOUT_YYYYMMDD_HHMMSS`，确认 SessionWindow 中该 session 进入 running 状态。
1. 在左侧历史列表删除同一 session，并确认删除弹窗。
1. 确认 UI 在有限时间内返回删除结果：对应 tab 被关闭，历史列表不再展示该 session，窗口没有长期停在 running 或等待删除状态。
1. 记录删除前 session id，并确认 `~/.spotAgent/sessions/<session-id>.json` 已不存在。

说明：不响应 abort 的 runtime 强制清理边界已由 `SessionRuntimeOrchestrator` 与 `SessionRouter` 自动化测试覆盖；本条实机 QA 只验证桌面删除 running session 的用户可见链路。

## Anthropic Provider 真实调用（P1）

1. 配置可用 Anthropic API key 与模型后提交普通文本 prompt，确认 assistant 回复可见且逐段 streaming。
1. 在 Anthropic provider 下触发一个会调用 tool 的 prompt，确认 tool name 经适配后仍能回到点号风格（如 `file.read`），tool result 可回灌给 LLM。

最近阻塞记录：2026-05-21 打开 Settings → 模型配置，Computer Use 确认 provider segmented control 同时展示 `OpenAI 兼容` 与 `Anthropic`。当前 `~/.spotAgent/settings.json` 只有 `provider: "openai-compatible"`、`api: "chat"`、`model: "gpt-5.2"`、`baseUrl: "https://new.cooree.de/v1"`，API key 已配置但不展示；环境变量中也没有 `ANTHROPIC_API_KEY` 或 `CLAUDE_API_KEY`。OpenAI 兼容端真实 streaming、真实 vision 底层请求、区域截图附件路径、`openai-compatible + completion` 的多模态拒绝和 tool 降级纯文本请求均已归档到 [archive.md](./archive.md)。配置文件没有可用的 Anthropic key 或 Anthropic 模型；在没有用户提供真实 Anthropic 配置前，不能验证 Anthropic streaming 与 tool call 回灌，本项不归档为通过。

## 懒加载工具激活（P1）

最近阻塞记录：2026-05-23 在 `main` 合并 `feat/lazy-tool-activation` 后完成基线验证：`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build` 均通过。实机 QA 先用 `bash ./scripts/package-app.sh --mock-llm` 验证 App 可打包启动，但 mock LLM 不写真实 network log，也不会生成 `use_tools` 激活调用，因此不能作为本项通过证据。随后使用 settings/真实 LLM 模式重新打包启动，`session-1779550406952-0hxdoo` 的纯聊天首轮请求成功返回，网络日志 `/Users/mu9/.spotAgent/log/2026-05-23/network-001.jsonl` 显示请求体 `tools` 只包含 `use_tools`，且 session 只有 user/assistant 消息，没有 tool message。继续在同一 session 发送 `Please read my screen. HANDAGENT_LAZY_TOOL_QA_20260523` 后，日志写入第二轮 request，`tools` 仍只包含 `use_tools`，但超过 1 分钟没有对应 response 行，session 文件仍只有 3 条消息且 `events: []`。因此场景 1 的“纯聊天不激活真实工具”已有证据，场景 2–4 受真实 LLM 流未返回阻塞，暂不能归档通过。QA 后已停止 `HandAgentDesktop`，`agent-server` 随父进程退出。

### 场景 1：纯聊天问题不触发工具激活

1. 新建 session，输入一个不需要工具的普通问题（例如"今天天气怎么样"或"帮我写一首诗"）。
1. 确认模型直接回复，SessionWindow 中不出现任何 tool call 气泡。
1. 打开 `~/.spotAgent/log/<YYYY-MM-DD>/network-NNN.jsonl`，找到本次请求对应的条目，确认请求体中 `tools` 数组只包含一个名为 `use_tools` 的 tool，不含任何 builtin tool。

### 场景 2：需要工具的 prompt 触发激活并完成调用

1. 新建 session，输入"看一下我屏幕"或类似需要读取屏幕的 prompt。
1. 确认模型先调用 `use_tools`（SessionWindow 中出现对应 tool call 气泡），随后调用真实工具（如 `screen.capture`）。
1. 确认 SessionWindow 中 tool messages 完整出现：`use_tools` 的结果与真实工具的结果均可见。
1. 确认最终 assistant 回复包含对屏幕内容的描述。

### 场景 3：同一 session 激活后不再重复出现 use_tools

1. 接场景 2，在同一 session 中再次输入"再读一次桌面前台"或类似 prompt。
1. 确认 SessionWindow 中本轮不再出现 `use_tools` tool call 气泡，模型直接调用真实工具。
1. 打开 `~/.spotAgent/log/` 中本轮对应的网络日志条目，确认请求体 `tools` 数组已包含完整工具集，不再只有 `use_tools`。

### 场景 4：agent-server 重启后激活状态可恢复

1. 完成场景 2（触发过工具激活的 session），记录该 session id。
1. 在终端 kill agent-server 进程，再重新启动（或重启桌面 App）。
1. 在 SessionWindow 中打开同一 session，发送新的 user message（例如"再截一次屏"）。
1. 打开 `~/.spotAgent/log/` 中本轮对应的网络日志条目，确认请求体 `tools` 数组直接是完整工具集，不出现新的 `use_tools` 调用（验证 agent-server 通过历史 tool message 正确推断了激活状态）。

## 示例 Action Plugin 与 MCP tool（P1）

1. 从仓库根目录安装示例配置：

```bash
mkdir -p ~/.spotAgent/plugins
cp -R examples/plugins/* ~/.spotAgent/plugins/
cp examples/mcp/mcp.example.json ~/.spotAgent/mcp.json
```

2. 使用真实 LLM 设置启动桌面 App：`bash ./scripts/swiftw run HandAgentDesktop`。
3. 打开 PromptPanel，确认能看到 `Code Review`、`Meeting Notes`、`Release Notes` 对应 action。
4. 使用 `review` trigger 提交一段小 diff，确认新 session metadata 中包含 `actionBinding.pluginId: "code-review"` 与 `mcpServerIds: ["handagent_demo"]`。
5. 在同一 session 让模型生成 checklist，确认工具列表里出现 `mcp.handagent_demo.make_checklist`，调用完成后 SessionWindow 有对应 tool message，最终 assistant 回复引用了 checklist 内容。
6. 删除或恢复 QA 前的 `~/.spotAgent/mcp.json` 与 `~/.spotAgent/plugins/` 示例目录，避免影响后续手工测试。



- 本文件中对应条目的用户可见行为、持久化记录、错误文案和隔离边界均符合预期。
- 所有错误路径均有明确文案，不出现静默失败。
- 每个通过的条目都已从本文件删除，并在 [archive.md](./archive.md) 保留完整验证记录。
