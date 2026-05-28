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

## Anthropic Provider 真实调用（P1）

1. 配置可用 Anthropic API key 与模型后提交普通文本 prompt，确认 assistant 回复可见且逐段 streaming。
1. 在 Anthropic provider 下触发一个会调用 tool 的 prompt，确认 tool name 经适配后仍能回到点号风格（如 `file.read`），tool result 可回灌给 LLM。

最近阻塞记录：2026-05-24 复查 `~/.spotAgent/settings.json`，当前 `llm.provider` 为 `openai-compatible`，`llm.api` 为 `responses`，`llm.model` 为 `gpt-5.4`，`llm.baseUrl` 为 `http://127.0.0.1:8317/v1`，API key 仅属于 OpenAI 兼容配置；环境变量中没有 `ANTHROPIC_API_KEY` 或 `CLAUDE_API_KEY`，仅有 `ANTHROPIC_BASE_URL`。配置文件没有可用的 Anthropic key 或 Anthropic 模型；在没有用户提供真实 Anthropic 配置前，不能验证 Anthropic streaming 与 tool call 回灌，本项不归档为通过。

## agent-server 源码目录重构 smoke（P2）

1. 从当前 worktree 执行 `bash ./scripts/swiftw run HandAgentDesktop`。
1. 确认 desktop 成功派生 agent-server，`ps -o pid,ppid,command -p <agent-server-pid>` 中命令路径指向 `apps/agent-server/src/server/server.ts`。
1. 提交一个普通文本 prompt，确认 SessionWindow 能收到 assistant 回复或明确的模型配置错误气泡，不出现 `agent-server` 入口文件缺失。
1. 在同一 session 触发一次需要 workspace 或 permission 回流的工具场景，确认权限 / workspace 选择气泡仍能回到当前 session。
1. 打开 `~/.spotAgent/sessions/<id>.json`，确认本轮 user / assistant 或 tool / event 按预期落盘。

## 懒加载工具激活（P1）

最近阻塞记录：2026-05-24 使用真实 LLM 模式重试 `HANDAGENT_LAZY_TOOL_QA_20260524`。首轮已验证 `use_tools` 激活后会调到真实工具链；在允许 `screen.capture` / `accessibility.snapshot` 之前，工具先被判定为拒绝。随后在权限弹窗中选择 `始终允许` 再重试 `HANDAGENT_LAZY_TOOL_QA_20260524_RETRY`，SessionWindow 已显示 `window.list` 与 `screen.capture` 的工具结果，但最终仍落到 UI 告警 `AI SDK stream finished without assistant content or tool calls.`，对应 session `session-1779601103378-sa0wyo` 也记录了同名 error 事件，因此本项当前仍不能归档为通过。

最近阻塞记录：2026-05-23 在 `main` 合并 `feat/lazy-tool-activation` 后完成基线验证：`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build` 均通过。实机 QA 先用 `bash ./scripts/package-app.sh --mock-llm` 验证 App 可打包启动，但 mock LLM 不写真实 network log，也不会生成 `use_tools` 激活调用，因此不能作为本项通过证据。随后使用 settings/真实 LLM 模式重新打包启动，`session-1779550406952-0hxdoo` 的纯聊天首轮请求成功返回，网络日志 `/Users/mu9/.spotAgent/log/2026-05-23/network-001.jsonl` 显示请求体 `tools` 只包含 `use_tools`，且 session 只有 user/assistant 消息，没有 tool message。继续在同一 session 发送 `Please read my screen. HANDAGENT_LAZY_TOOL_QA_20260523` 后，日志写入第二轮 request，`tools` 仍只包含 `use_tools`，但超过 1 分钟没有对应 response 行，session 文件仍只有 3 条消息且 `events: []`。因此场景 1 的“纯聊天不激活真实工具”已有证据，场景 2–4 受真实 LLM 流未返回阻塞，暂不能归档通过。QA 后已停止 `HandAgentDesktop`，`agent-server` 随父进程退出。

### 场景 0：并发 session 工具激活隔离

1. 使用真实 LLM 模式启动桌面 App，打开两个不同 session。
1. 在 session A 中提交需要工具的 prompt（例如"看一下我屏幕"），等待出现 `use_tools` 或真实工具调用。
1. 在 session B 中提交普通聊天 prompt，确认 session B 不出现 session A 的真实工具列表或 tool call 气泡。
1. 继续回到 session A 发送需要工具的第二轮 prompt，确认 session A 仍可继续使用真实工具，不会退回只暴露 `use_tools`。
1. 打开 `~/.spotAgent/log/<YYYY-MM-DD>/network-NNN.jsonl`，对比两条 session 的请求体：session A 激活后应包含完整工具集，session B 未激活时仍只包含 `use_tools`。

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



- 本文件中对应条目的用户可见行为、持久化记录、错误文案和隔离边界均符合预期。
- 所有错误路径均有明确文案，不出现静默失败。
- 每个通过的条目都已从本文件删除，并在 [archive.md](./archive.md) 保留完整验证记录。
