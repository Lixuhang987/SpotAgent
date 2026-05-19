# 手工验收清单

## 验收目标

确认桌面 Agent MVP 的端到端主链路可用，并把仍需补齐或待验证的路径单独记录：热键唤起、输入 prompt、附件采集、创建会话窗口、LLM 返回结果、状态气泡回跳、会话历史入口、权限审批、工作区管理、agent-server 崩溃恢复。

## 验收前提

- 已完成依赖安装
- 已通过 `bash ./scripts/test.sh`
- 已通过 `bash ./scripts/swiftw test`
- 已通过 `bash ./scripts/swiftw build`

## 本轮实机 QA 进度（2026-05-20）

- 已归档：mock LLM 主链路基础、文本选区附件、区域截图附件、Workspace 设置与文件 tool 基础链路、权限审批「仅本次」路径、权限审批记忆 / 拒绝 / 超时 / 永久规则撤销、Tool 设置热加载、会话历史入口与删除确认、agent-server 崩溃恢复。详见 [archive.md](./archive.md)。
- 已确认缺陷：部分 tool completed UI 气泡展示入参而非实际 tool result。详见 [bugs.md](./bugs.md)。
- 仍需继续验证：权限关闭窗口取消挂起请求、workspace.askUser、多会话 platform request 隔离、real LLM vision 与真实 token streaming。

## 新增待验收能力（2026-05-20）

- 已实现并待实机确认：OCR / Accessibility 平台能力、SessionWindow Stop / interrupt、多 provider LLM、用户自定义 tool / 本地插件系统。实现记录见 [待验收.md](./待验收.md)。
- 权限审批端到端 QA 仍只剩「关闭 SessionWindow 取消挂起请求」路径未归档；该项继续保留在 [TODO.md](./TODO.md)。

## 主链路（P0）

1. 启动桌面应用。
2. 确认状态气泡显示在桌面右下角。
3. 按 `showPromptPanel` 热键（默认 ⌘⇧Space）唤起 PromptPanel。
4. 确认 PromptPanel 输入框自动聚焦。
5. 在前台 App 预先选中一段文字后，再次按 `showPromptPanel` 热键，确认 PromptPanel 只聚焦输入框，不出现 textSelection chip；提交后 session 文件中不应出现 `[选区]` 或未主动提供的选区文本。
6. 输入一段用户主动发起的请求并提交。
7. 观察 PromptPanel 关闭并新建 SessionWindow。
8. 观察 SessionWindow 中出现用户消息和 assistant 回复；assistant 回复应随 LLM token delta 逐段更新，而不是只在最终完成时一次性出现。
9. 点击状态气泡，确认优先回到当前 running session；没有 running session 时回最近活跃窗口。
10. 触发一个失败会话（例如临时移除 `apiKey` 或使用会返回错误的 mock prompt），确认 SessionWindow 显示 `failed` 后，状态气泡同步从 `Running` 切回 `Idle`，摘要显示失败文案而不是停留在原始 prompt。
11. 如未配置 `apiKey`，确认错误会以可见文案 `Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。` 和 assistant 气泡展示，而不是静默失败。

## 选区与区域附件（P1）

12. 在任意 App 中选中一段文字，按 `captureSelection` 热键，确认 PromptPanel 弹出且输入框上方出现 textSelection chip；chip 可点击移除。
13. 没有任何文字选中时再按一次，确认 PromptPanel 仅弹出，无 chip（`SelectionCaptureResult.empty`）。
14. 按 `captureRegion` 热键进入 macOS 系统圈选 UI，画一个矩形完成截图，确认 PromptPanel 弹出且出现 imageRegion chip；点 chip 触发 QuickLook 内嵌预览，按 ESC 取消圈选时不弹 PromptPanel。
15. 提交带 chip 的 prompt，到 SessionWindow 后确认当前用户气泡显示附件数量与类型（`text_selection` / `image`），agent-server 可收到 `attachments` 字段并写入会话持久化。文本选区会在服务端拼入 user content；图片附件持久化为 image STUB，进入 runtime 前会展开为 LLM 多模态 image part。

## 工作区与文件 tool（P2）

16. 打开「设置」→ Workspaces tab，新增一个工作区，rootPath 选 `~/Desktop/handagent-test`，description 填「测试工作区」，确认列表立即更新。
17. 唤起 PromptPanel，输入「在测试工作区里写一个 hello.txt 文件」，确认：
    - LLM 先调 `workspace.list`（log 中可见 tool_call）。
    - 再调 `file.write({workspaceId, relativePath: "hello.txt", content})`，路径落到 `~/Desktop/handagent-test/hello.txt`。
18. 输入「读取上面那个文件」，确认 `file.read` 返回正文。
19. 验证沙箱：尝试让 LLM 写 `../../etc/passwd`，确认 tool 返回明确的越狱错误，文件不创建。

## 会话历史入口（P2）

20. 准备至少两条 `~/.spotAgent/sessions/*.json` 历史会话，确认 `updatedAt` 不同且消息内容可区分。
21. 唤起 PromptPanel，输入历史标题、sessionId 或消息 preview 关键字，确认 action 列表出现「最近会话：...」并可过滤。
22. 点击最近会话 action，确认打开目标 session 的 SessionWindow；若同一 sessionId 已有窗口，再次恢复时只聚焦已有窗口，不新建第二个同 id 窗口。
23. 唤起 PromptPanel，点击「会话历史」action，确认独立历史窗口打开。
24. 在独立历史窗口搜索标题 / sessionId / preview，确认左侧列表过滤、右侧预览随选中项更新。
25. 点击恢复按钮，确认目标 session 打开或聚焦。
26. 在独立历史窗口删除一条历史，确认先出现二次确认；点取消时文件仍存在，点删除后对应 `~/.spotAgent/sessions/<id>.json` 被移除且列表刷新。
27. 在 SessionWindow 左侧历史侧栏右键删除，也应先出现二次确认，确认后才发送删除并移除列表。

## 权限审批（P2）

28. 在 SessionWindow 内触发一个会调 `file.write` 的 prompt，首次出现内联气泡询问；选择「本次允许」，确认本次执行通过、下次同 tool 仍询问。
29. 第二次询问时选择「会话内允许」，再下一次同 tool 同参数自动放行；切换到新会话再触发一次，应再次询问。
30. 选择「拒绝」时，确认 LLM 收到「用户拒绝执行该 tool」的伪造 tool message 并能继续推进，不卡死。
31. 询问超时（默认 60s）保持沉默，确认按 deny 处理。
32. 关闭 SessionWindow 时若有挂起请求，确认全部被取消，不留僵尸。
33. 查看 `~/.spotAgent/permissions.json`，确认「始终允许」规则已写入，并在 Settings → 权限中确认 toolName、参数摘要、decision、createdAt 可见，点击「撤销」后规则从 UI 和文件中移除。

## agent-server 崩溃恢复（P3）

已于 2026-05-20 通过 mock-llm 实机 QA 验证并归档，详见 [archive.md](./archive.md)「agent-server 崩溃恢复」。

## worktree 启动路径（P1）

34. 在 `.worktrees/<name>/` 下修改或临时标记 `apps/agent-server/src/server.ts`，执行 `bash ./scripts/swiftw run HandAgentDesktop`。
35. 确认 node 子进程命令行、日志或可观测行为来自当前 worktree 下的 `apps/agent-server/src/server.ts`，而不是主仓库路径。

## 通过标准

- 主链路全部跑通；
- 文本附件能从用户输入流转到 agent-server，并在当前 SessionWindow 用户气泡中显示附件摘要；图片附件能传输、回显摘要、落 Blob，并进入多模态 LLM 消息；
- PromptPanel 最近会话 action、独立历史窗口搜索 / 预览 / 恢复 / 删除确认可用，同一 sessionId 恢复只聚焦已有窗口或打开一个恢复窗口；
- file tool 严格沙箱化，越狱被拒；
- 权限审批 UI 不阻塞其他会话，决策被持久化；Settings 权限页可以查看和撤销永久规则；
- agent-server 崩溃可自动重启，过限有可见反馈；现有会话自动重连订阅可恢复；
- worktree 内启动桌面端时，agent-server 使用同一 worktree 下的源码与依赖路径；
- 所有错误路径均有明确文案，不出现静默失败。

---

## 待手工验收功能（代码已实现，需实机 QA 确认）

以下功能已有代码实现和单测覆盖，但尚未经过完整实机 QA 验证。详细实现记录见 [待验收.md](./待验收.md)。

### Tool 运行时基础

36. 启动 App，检查 `~/.spotAgent/log/` 中 agent-server 启动日志，确认打印「已注册 tool 列表」且包含 9 个 builtin tool。
37. 在 `~/.spotAgent/settings.json` 中设置 `tools.denylist: ["clipboard.read"]`，重启 App，确认 LLM 调 `clipboard.read` 时返回「tool 不可用」错误。
38. 断开 desktop（关闭 App 但保留 agent-server），通过 WebSocket 客户端发送 `screen.capture` 请求，确认返回 `desktop offline` 错误而非超时。

### ScreenCaptureKit 反向 IPC

39. 让 LLM 调 `screen.capture(target: "display")`，确认返回当前显示器截图（base64 图片可解码）。
40. 让 LLM 调 `screen.capture(target: "window", windowId: <frontmost>)`，确认返回指定窗口截图。
41. 快速连续发送 3 个 `platform_request`，确认通过 `requestId` 隔离，结果不串。

### Workspace 沙箱

42. 首次启动 App（删除 `~/.spotAgent/workspaces.json`），确认自动创建 default workspace 且 `~/.spotAgent/workspace/` 目录存在。
43. 通过 LLM 调 `file.write({workspaceId: "default", relativePath: "../../etc/test"})`，确认返回路径越狱错误。
44. 在 workspace 目录内创建 symlink 指向外部目录，通过 LLM 调 `file.write` 写入该 symlink 路径，确认 realpath 校验拦截。

### 多模态图片附件

45. 使用 `captureRegion` 截取一个区域，提交 prompt「描述这张图片」，确认 LLM 能基于图片内容给出真实描述（非占位文本）。

### 真实流式输出

46. 提交一个会产生长回复的 prompt，观察 SessionWindow 中 assistant 气泡逐段更新（至少 5 段 delta），而非一次性出现完整文本。

### workspace.askUser

49. 注册 3 个 workspace（Notes / Code / Drafts），让 LLM 保存一个文件但不指定目标，确认 SessionWindow 弹出内联气泡让用户选择 workspace。
50. 选择一个 workspace，确认文件落到对应目录。
51. 再次触发，这次点「取消」或等待 60s 超时，确认 LLM 收到 `{cancelled: true}` 并能继续推进。

### 协议拆分与多会话绑定

52. 打开两个 SessionWindow（两个不同 session），在两个窗口中同时触发需要 platform 能力的 tool，确认两个请求通过 `requestId` 隔离，结果不串。
53. 关闭其中一个 SessionWindow，确认另一个 session 的 platform 请求不受影响。

### OCR 与 Accessibility 平台能力

53. 在「系统设置 → 隐私与安全性 → 辅助功能」允许 HandAgent；如要用截图生成 OCR 输入，也在「屏幕录制」里允许 HandAgent。
54. 使用 `captureRegion` 截取包含清晰文字的区域，或让 LLM 先调用 `screen.capture` 获得图片，再调用 `ocr.read({imageBase64, mimeType: "image/png"})`，确认返回 `text` 与 `lines[].confidence`，且文字内容与图片一致。
55. 让 LLM 直接调用缺少 `imageBase64` 的 `ocr.read`，确认返回明确 `invalid_argument`，且不会默认读取屏幕、剪贴板或文件。
56. 打开 TextEdit、系统设置或 Finder 作为前台 App，让 LLM 调用 `accessibility.snapshot({kind: "frontmost_app"})`，确认返回有限层级的 `children`，节点包含 `role`、可读 label/value 和可复用 `elementId`。
57. 选择一个快照中的按钮或文本框，用对应 `elementId` 调用 `accessibility.action`：按钮验证 `press` 或 `click`，文本框验证 `set_value`。
58. 用 `window.list` 取得窗口 id 后调用 `accessibility.snapshot({kind: "window", windowId: <id>})`，确认返回的是指定窗口的树；再传入同一 App 下不存在或不匹配的 `windowId`，确认返回 `not_found`，不会退回 focused window。
59. 临时移除 HandAgent 辅助功能权限后重复 snapshot/action，确认返回 `permission_denied`，文案指向「系统设置 → 隐私与安全性 → 辅助功能」。

### 会话中断 / Stop

60. 使用 real LLM 或 mock 慢响应场景提交一个会持续 streaming 或长时间 tool 调用的 prompt，确认 SessionWindow 运行态出现 Stop 控件。
61. 点击 Stop，确认窗口不关闭、socket 不断开，状态变为 `interrupted`，后续 assistant delta / tool result 不再追加到当前 run。
62. 等待原长耗时请求自然返回后，确认 `~/.spotAgent/sessions/<id>.json` 没有写入 Stop 之后的 assistant / tool 消息。
63. 在同一个 SessionWindow 继续提交新 prompt，确认新 run 可以正常进入 running 并收到回复。

### 多 provider LLM

64. 打开 Settings → 模型配置，确认 provider 可在 `openai-compatible` 与 `anthropic` 间切换，保存后 `~/.spotAgent/settings.json` 写入 `llm.provider`。
65. 选择 `openai-compatible`，使用当前 OpenAI 兼容端点提交普通文本 prompt，确认 streaming、tool call 与图片附件路径仍按原逻辑工作。
66. 选择 `anthropic`，配置可用 Anthropic API key 与模型后提交普通文本 prompt，确认 assistant 回复可见且逐段 streaming。
67. 在 Anthropic provider 下触发一个会调用 tool 的 prompt，确认 tool name 经适配后仍能回到点号风格（如 `file.read`），tool result 可回灌给 LLM。
68. 将 provider 设为 `openai-compatible` 且 `api` 设为 `completion` 后提交图片附件 prompt，确认返回明确「provider 不支持 multimodal」类错误；提交需要 tool 的 prompt 时确认降级为纯文本请求，不暴露工具列表。

### 用户自定义 tool / 本地插件系统

69. 在 `~/.spotAgent/plugins/echo/plugin.json` 准备一个本地插件，tool 名为 `plugin.echo`，`command` 指向插件目录内可执行脚本，脚本从 stdin 读取 JSON 并向 stdout 输出 JSON。
70. 重启 App 或触发下一轮 user message，确认 agent-server 日志的已注册 tool 列表包含 `plugin.echo`。
71. 让 LLM 调用 `plugin.echo`，确认插件收到 `{input, context}`，SessionWindow 展示 JSON tool result，session event 中写入 `tool_call/tool_result`。
72. 在 `~/.spotAgent/settings.json` 设置 `tools.denylist: ["plugin.echo"]`，不重启 App 再触发该 tool，确认下一轮请求热加载后返回 tool 不可用。
73. 创建一个与 builtin 同名的插件 tool（如 `file.read`）和两个重复同名插件 tool，确认日志记录 disabled reason，builtin 不被覆盖。
74. 创建一个会非 0 exit、输出非 JSON、超时或输出超过 1 MiB 的插件 tool，确认错误作为 tool result 返回，agent-server 不崩溃；超时或输出超限时确认子进程被终止。
75. 创建一个 `command` 经 symlink 指向插件目录外的插件 tool，确认调用时返回 command 越界错误；创建声明 `permissions.workspace: "read"` 或 `"write"` 的插件 tool，分别验证合法 `workspaceId/relativePath` 会收到校验后的 `workspaceRoot/absolutePath`，`../../` 或 symlink 越界会被 workspace 路径校验拦截。该验证只覆盖传给插件的路径边界，不代表插件进程拥有 OS 级沙箱。

---

## 已知问题（待修复）

当前已知 bug 见 [bugs.md](./bugs.md)。主要包括：

- P1：部分 tool completed UI 气泡展示入参而非实际 tool result。
