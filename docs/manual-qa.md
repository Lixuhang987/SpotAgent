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

## 开发验证记录

### 后端常驻 Thread 输入队列

- 完成日期：2026-06-07
- 关键 commit：`8856f43`
- 实现位置：`apps/agent-server/src/thread/ThreadInputQueue.ts`、`apps/agent-server/src/thread/ThreadRuntimeOrchestrator.ts`、`apps/agent-server/src/thread/ThreadPersistence.ts`
- 验收结果：后端兼容旧 `turn.start`；运行中输入不再中断当前 run，而是排队进入 active turn follow-up。已通过 `bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`。

## Anthropic Provider 真实调用（P1）

1. 配置可用 Anthropic API key 与模型后提交普通文本 prompt，确认 assistant 回复可见且逐段 streaming。
1. 在 Anthropic provider 下触发一个会调用 tool 的 prompt，确认 tool name 经适配后仍能回到点号风格（如 `file.read`），tool result 可回灌给 LLM。

最近阻塞记录：2026-05-24 复查 `~/.spotAgent/settings.json`，当前 `llm.provider` 为 `openai-compatible`，`llm.api` 为 `responses`，`llm.model` 为 `gpt-5.4`，`llm.baseUrl` 为 `http://127.0.0.1:8317/v1`，API key 仅属于 OpenAI 兼容配置；环境变量中没有 `ANTHROPIC_API_KEY` 或 `CLAUDE_API_KEY`，仅有 `ANTHROPIC_BASE_URL`。配置文件没有可用的 Anthropic key 或 Anthropic 模型；在没有用户提供真实 Anthropic 配置前，不能验证 Anthropic streaming 与 tool call 回灌，本项不归档为通过。

最近阻塞记录：2026-06-06 修复 `Anthropic AI SDK provider 错误流被落成空 assistant` 后，继续使用 Anthropic provider、`llm.api = "chat"`、`llm.model = "claude-3-5-haiku-20241022"`、`llm.baseUrl = "https://anyrouter.top/v1"` 与 `ANTHROPIC_AUTH_TOKEN` 真实模式回归。提交 `Use plain text only. Reply exactly: ANTHROPIC_QA_TEXT_AFTER_FIX_20260606` 后，ThreadWindow 不再静默写空 assistant，而是显示红色错误 `Failed after 3 attempts...ssl/tls alert handshake failure`；thread 记录只有 user message，并记录同名 `error` event。当前 anyrouter endpoint 对 Node/AI SDK streaming TLS 握手失败，因此仍未获得 assistant 文本或 Anthropic tool call 回灌证据，本项不能归档为通过。

## agent-server thread 主链路 smoke（P2）

1. 从当前 worktree 执行 `bash ./scripts/swiftw run HandAgentDesktop`。
1. 确认 desktop 成功派生 agent-server，`ps -o pid,ppid,command -p <agent-server-pid>` 中命令路径指向 `apps/agent-server/src/server/server.ts`。
1. 提交一个普通文本 prompt，确认 thread 视图能收到 assistant 回复或明确的模型配置错误气泡，不出现 `agent-server` 入口文件缺失。
1. 在同一 thread 触发一次需要 workspace 或 permission 回流的工具场景，确认权限 / workspace 选择气泡仍能回到当前 thread。
1. 打开对应的 thread 持久化文件，确认本轮 user / assistant 或 tool / event 按预期落盘。

## 单连接 thread 路由 smoke（P2）

1. 从当前 worktree 执行 `bash ./scripts/swiftw run HandAgentDesktop`。
1. 打开主窗口后连续创建两个 thread，确认 desktop 侧只建立一条到 `ws://127.0.0.1:4317/api/thread` 的连接。
1. 在 thread A 发送普通 prompt，在 thread B 发送另一条普通 prompt，确认两边的 assistant / tool / permission / workspace 事件不会串到错误 thread。
1. 恢复 thread A，确认 client 发送的是 `thread.resume`，并收到 `thread.snapshot`；不再依赖显式 unsubscribe 协议。
1. 在 thread A 触发一次需要 permission 或 workspace 选择的工具场景，确认 `permission.requested` / `workspace.requested` 只回到当前 `threadId` 对应视图，不会串到其他 thread。
1. 在 agent-server 运行中手动重启 desktop 或 kill `agent-server` 后恢复，确认共享连接会自动重连、历史会刷新、已打开 thread 会重新恢复并继续可用。

## AppServer 共享 PlatformBridge smoke（P2）

1. 从当前 worktree 执行 `bash ./scripts/swiftw run HandAgentDesktop`。
1. 确认 desktop 启动 agent-server 后，只建立一条到 `ws://127.0.0.1:4317/api/thread` 的 WebSocket。
1. 触发一次需要平台能力的 tool，例如 `clipboard.read`、`app.frontmost`、`screen.capture` 或 `accessibility.snapshot`。
1. 确认 agent-server 收到 `platform_bridge_hello` 后能发出 `platform_request`，desktop 通过同一连接回写 `platform_response`，没有新建第二条 platform WebSocket。
1. 同时保持一个 thread 正在 streaming，确认 `assistant.delta` / `tool.finished` / `platform_response` 不互相串线。

## Thread 历史路径与状态气泡 smoke（P2）

1. 提交一个普通 prompt，确认本轮历史写入 `~/.spotAgent/threads/<threadId>.json`，不会写入旧历史目录。
1. 重启 desktop 后打开历史列表，确认刚才的 thread 可恢复，且旧历史目录文件不会作为 AppServices 主历史来源出现。
1. 在一个 thread 运行中观察状态气泡，确认气泡展示最新摘要 / running 状态，点击后回到当前活跃 thread 对应窗口。

## PromptPanel 输入框视觉与拖动 smoke（P2）

1. 从当前 worktree 执行 `bash ./scripts/swiftw run HandAgentDesktop`。
1. 通过全局快捷键打开 PromptPanel，确认首行输入区域左侧没有独立图标，也没有独立输入框卡片、背景或边框。
1. 在空输入框状态下，从 placeholder 文字区域右侧到设置按钮左侧的空白区域拖动面板，确认窗口可移动。
1. 输入一段普通文本，确认输入框占满设置按钮左侧剩余空间，不再保留中间拖动空隙。
1. 继续输入多行文本，确认输入框随文本自动增高；达到 5 行后停止增高，并在继续输入时出现垂直滚动条。
1. 按 Return 确认仍会提交 prompt；按 Shift + Return 或 Option + Return 确认可在输入框内插入换行。

## 懒加载工具激活（P1）

最近阻塞记录：2026-05-24 使用真实 LLM 模式重试 `HANDAGENT_LAZY_TOOL_QA_20260524`。首轮已验证 `use_tools` 激活后会调到真实工具链；在允许 `screen.capture` / `accessibility.snapshot` 之前，工具先被判定为拒绝。随后在权限弹窗中选择 `始终允许` 再重试 `HANDAGENT_LAZY_TOOL_QA_20260524_RETRY`，旧版窗口已显示 `window.list` 与 `screen.capture` 的工具结果，但最终仍落到 UI 告警 `AI SDK stream finished without assistant content or tool calls.`，对应旧版 thread 记录也写入了同名 error 事件，因此本项当前仍不能归档为通过。

最近阻塞记录：2026-06-06 复查当前 bug 清单，`docs/bugs.md` 仍保留 P1 缺陷 `AI SDK stream finished without assistant content or tool calls`。该缺陷正覆盖本项场景 2–4 的真实 provider 工具调用收尾链路：工具结果已能进入 ThreadWindow，但最终 assistant 总结无法稳定产生。因此在该 P1 缺陷修复前，本项仍不能归档为通过。

最近阻塞记录：2026-05-23 在 `main` 合并 `feat/lazy-tool-activation` 后完成基线验证：`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build` 均通过。实机 QA 先用 `bash ./scripts/package-app.sh --mock-llm` 验证 App 可打包启动，但 mock LLM 不写真实 network log，也不会生成 `use_tools` 激活调用，因此不能作为本项通过证据。随后使用 settings/真实 LLM 模式重新打包启动，纯聊天首轮请求成功返回，网络日志 `/Users/mu9/.spotAgent/log/2026-05-23/network-001.jsonl` 显示请求体 `tools` 只包含 `use_tools`，且 thread 只有 user/assistant 消息，没有 tool message。继续在同一 thread 发送 `Please read my screen. HANDAGENT_LAZY_TOOL_QA_20260523` 后，日志写入第二轮 request，`tools` 仍只包含 `use_tools`，但超过 1 分钟没有对应 response 行，thread 文件仍只有 3 条消息且 `events: []`。因此场景 1 的“纯聊天不激活真实工具”已有证据，场景 2–4 受真实 LLM 流未返回阻塞，暂不能归档通过。QA 后已停止 `HandAgentDesktop`，`agent-server` 随父进程退出。

### 场景 0：并发 thread 工具激活隔离

1. 使用真实 LLM 模式启动桌面 App，打开两个不同 thread。
1. 在 thread A 中提交需要工具的 prompt（例如"看一下我屏幕"），等待出现 `use_tools` 或真实工具调用。
1. 在 thread B 中提交普通聊天 prompt，确认 thread B 不出现 thread A 的真实工具列表或 tool call 气泡。
1. 继续回到 thread A 发送需要工具的第二轮 prompt，确认 thread A 仍可继续使用真实工具，不会退回只暴露 `use_tools`。
1. 打开 `~/.spotAgent/log/<YYYY-MM-DD>/network-NNN.jsonl`，对比两条 thread 的请求体：thread A 激活后应包含完整工具集，thread B 未激活时仍只包含 `use_tools`。

### 场景 1：纯聊天问题不触发工具激活

1. 新建 thread，输入一个不需要工具的普通问题（例如"今天天气怎么样"或"帮我写一首诗"）。
1. 确认模型直接回复，ThreadWindow 中不出现任何 tool call 气泡。
1. 打开 `~/.spotAgent/log/<YYYY-MM-DD>/network-NNN.jsonl`，找到本次请求对应的条目，确认请求体中 `tools` 数组只包含一个名为 `use_tools` 的 tool，不含任何 builtin tool。

### 场景 2：需要工具的 prompt 触发激活并完成调用

1. 新建 thread，输入"看一下我屏幕"或类似需要读取屏幕的 prompt。
1. 确认模型先调用 `use_tools`（ThreadWindow 中出现对应 tool call 气泡），随后调用真实工具（如 `screen.capture`）。
1. 确认 ThreadWindow 中 tool messages 完整出现：`use_tools` 的结果与真实工具的结果均可见。
1. 确认最终 assistant 回复包含对屏幕内容的描述。

### 场景 3：同一 thread 激活后不再重复出现 use_tools

1. 接场景 2，在同一 thread 中再次输入"再读一次桌面前台"或类似 prompt。
1. 确认 ThreadWindow 中本轮不再出现 `use_tools` tool call 气泡，模型直接调用真实工具。
1. 打开 `~/.spotAgent/log/` 中本轮对应的网络日志条目，确认请求体 `tools` 数组已包含完整工具集，不再只有 `use_tools`。

### 场景 4：agent-server 重启后激活状态可恢复

1. 完成场景 2（触发过工具激活的 thread），记录该 thread id。
1. 在终端 kill agent-server 进程，再重新启动（或重启桌面 App）。
1. 在 ThreadWindow 中打开同一 thread，发送新的 user message（例如"再截一次屏"）。
1. 打开 `~/.spotAgent/log/` 中本轮对应的网络日志条目，确认请求体 `tools` 数组直接是完整工具集，不出现新的 `use_tools` 调用（验证 agent-server 通过历史 tool message 正确推断了激活状态）。



- 本文件中对应条目的用户可见行为、持久化记录、错误文案和隔离边界均符合预期。
- 所有错误路径均有明确文案，不出现静默失败。
- 每个通过的条目都已从本文件删除，并在 [archive.md](./archive.md) 保留完整验证记录。
