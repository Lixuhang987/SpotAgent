# 手工验收清单

## 维护规则

本文件只保留尚未通过实机 QA 的手工验收项。验证通过后，必须从本文件删除对应内容，并把完整验证日期、环境、过程、证据与结论移动到 [archive.md](./archive.md)。
已验证归档见 [archive.md](./archive.md)；已修复 bug 与回归记录见 [bugs.md](./bugs.md)；代码已实现但待实机确认的功能来源见 [待验收.md](./待验收.md)。

## 验收目标

确认桌面 Agent MVP 仍未归档的端到端路径可用，并把新通过的条目及时移入归档：权限关闭窗口取消挂起请求、tool 运行时基础、ScreenCaptureKit 反向 IPC、workspace 沙箱、多模态图片附件、真实流式输出、workspace.askUser、协议拆分与多会话绑定、OCR、Accessibility、会话中断 / Stop、多 provider LLM、用户自定义 tool / 本地插件系统。

## 验收前提

- 已完成依赖安装。
- 已通过 `bash ./scripts/test.sh`。
- 已通过 `bash ./scripts/swiftw test`。
- 已通过 `bash ./scripts/swiftw build`。

## 权限审批关闭窗口取消挂起请求（P2）

1. 在 SessionWindow 内触发一个需要权限审批且会保持挂起的 tool 请求。
1. 授权气泡出现后不做选择，直接关闭该 SessionWindow。
1. 确认挂起请求全部被取消，不留僵尸请求；后续新建会话和权限审批不受影响。

## Tool 运行时基础（P2）

1. 启动 App，检查 `~/.spotAgent/log/` 中 agent-server 启动日志，确认打印「已注册 tool 列表」且包含 9 个 builtin tool。
1. 在 `~/.spotAgent/settings.json` 中设置 `tools.denylist: ["clipboard.read"]`，重启 App，确认 LLM 调 `clipboard.read` 时返回「tool 不可用」错误。
1. 断开 desktop（关闭 App 但保留 agent-server），通过 WebSocket 客户端发送 `screen.capture` 请求，确认返回 `desktop offline` 错误而非超时。

## ScreenCaptureKit 反向 IPC（P2）

1. 让 LLM 调 `screen.capture(target: "display")`，确认返回当前显示器截图（base64 图片可解码）。
1. 让 LLM 调 `screen.capture(target: "window", windowId: <frontmost>)`，确认返回指定窗口截图。
1. 快速连续发送 3 个 `platform_request`，确认通过 `requestId` 隔离，结果不串。

## Workspace 沙箱（P2）

1. 首次启动 App（删除 `~/.spotAgent/workspaces.json`），确认自动创建 default workspace 且 `~/.spotAgent/workspace/` 目录存在。
1. 通过 LLM 调 `file.write({workspaceId: "default", relativePath: "../../etc/test"})`，确认返回路径越狱错误。
1. 在 workspace 目录内创建 symlink 指向外部目录，通过 LLM 调 `file.write` 写入该 symlink 路径，确认 realpath 校验拦截。

## 多模态图片附件（P1）

1. 使用 `captureRegion` 截取一个区域，提交 prompt「描述这张图片」，确认 LLM 能基于图片内容给出真实描述（非占位文本）。

## 真实流式输出（P1）

1. 提交一个会产生长回复的 prompt，观察 SessionWindow 中 assistant 气泡逐段更新（至少 5 段 delta），而非一次性出现完整文本。

## workspace.askUser（P2）

1. 注册 3 个 workspace（Notes / Code / Drafts），让 LLM 保存一个文件但不指定目标，确认 SessionWindow 弹出内联气泡让用户选择 workspace。
1. 选择一个 workspace，确认文件落到对应目录。
1. 再次触发，这次点「取消」或等待 60s 超时，确认 LLM 收到 `{cancelled: true}` 并能继续推进。

## 协议拆分与多会话绑定（P2）

1. 打开两个 SessionWindow（两个不同 session），在两个窗口中同时触发需要 platform 能力的 tool，确认两个请求通过 `requestId` 隔离，结果不串。
1. 关闭其中一个 SessionWindow，确认另一个 session 的 platform 请求不受影响。

## OCR 与 Accessibility 平台能力（P2）

1. 在「系统设置 → 隐私与安全性 → 辅助功能」允许 HandAgent；如要用截图生成 OCR 输入，也在「屏幕录制」里允许 HandAgent。
1. 使用 `captureRegion` 截取包含清晰文字的区域，或让 LLM 先调用 `screen.capture` 获得图片，再调用 `ocr.read({imageBase64, mimeType: "image/png"})`，确认返回 `text` 与 `lines[].confidence`，且文字内容与图片一致。
1. 让 LLM 直接调用缺少 `imageBase64` 的 `ocr.read`，确认返回明确 `invalid_argument`，且不会默认读取屏幕、剪贴板或文件。
1. 打开 TextEdit、系统设置或 Finder 作为前台 App，让 LLM 调用 `accessibility.snapshot({kind: "frontmost_app"})`，确认返回有限层级的 `children`，节点包含 `role`、可读 label/value 和可复用 `elementId`。
1. 选择一个快照中的按钮或文本框，用对应 `elementId` 调用 `accessibility.action`：按钮验证 `press` 或 `click`，文本框验证 `set_value`。
1. 用 `window.list` 取得窗口 id 后调用 `accessibility.snapshot({kind: "window", windowId: <id>})`，确认返回的是指定窗口的树；再传入同一 App 下不存在或不匹配的 `windowId`，确认返回 `not_found`，不会退回 focused window。
1. 临时移除 HandAgent 辅助功能权限后重复 snapshot/action，确认返回 `permission_denied`，文案指向「系统设置 → 隐私与安全性 → 辅助功能」。

## 会话中断 / Stop（P1）

1. 使用 real LLM 或 mock 慢响应场景提交一个会持续 streaming 或长时间 tool 调用的 prompt，确认 SessionWindow 运行态出现 Stop 控件。
1. 点击 Stop，确认窗口不关闭、socket 不断开，状态变为 `interrupted`，后续 assistant delta / tool result 不再追加到当前 run。
1. 等待原长耗时请求自然返回后，确认 `~/.spotAgent/sessions/<id>.json` 没有写入 Stop 之后的 assistant / tool 消息。
1. 在同一个 SessionWindow 继续提交新 prompt，确认新 run 可以正常进入 running 并收到回复。

## 多 provider LLM（P2）

1. 打开 Settings → 模型配置，确认 provider 可在 `openai-compatible` 与 `anthropic` 间切换，保存后 `~/.spotAgent/settings.json` 写入 `llm.provider`。
1. 选择 `openai-compatible`，使用当前 OpenAI 兼容端点提交普通文本 prompt，确认 streaming、tool call 与图片附件路径仍按原逻辑工作。
1. 选择 `anthropic`，配置可用 Anthropic API key 与模型后提交普通文本 prompt，确认 assistant 回复可见且逐段 streaming。
1. 在 Anthropic provider 下触发一个会调用 tool 的 prompt，确认 tool name 经适配后仍能回到点号风格（如 `file.read`），tool result 可回灌给 LLM。
1. 将 provider 设为 `openai-compatible` 且 `api` 设为 `completion` 后提交图片附件 prompt，确认返回明确「provider 不支持 multimodal」类错误；提交需要 tool 的 prompt 时确认降级为纯文本请求，不暴露工具列表。

## 用户自定义 tool / 本地插件系统（P2）

1. 在 `~/.spotAgent/plugins/echo/plugin.json` 准备一个本地插件，tool 名为 `plugin.echo`，`command` 指向插件目录内可执行脚本，脚本从 stdin 读取 JSON 并向 stdout 输出 JSON。
1. 重启 App 或触发下一轮 user message，确认 agent-server 日志的已注册 tool 列表包含 `plugin.echo`。
1. 让 LLM 调用 `plugin.echo`，确认插件收到 `{input, context}`，SessionWindow 展示 JSON tool result，session event 中写入 `tool_call/tool_result`。
1. 在 `~/.spotAgent/settings.json` 设置 `tools.denylist: ["plugin.echo"]`，不重启 App 再触发该 tool，确认下一轮请求热加载后返回 tool 不可用。
1. 创建一个与 builtin 同名的插件 tool（如 `file.read`）和两个重复同名插件 tool，确认日志记录 disabled reason，builtin 不被覆盖。
1. 创建一个会非 0 exit、输出非 JSON、超时或输出超过 1 MiB 的插件 tool，确认错误作为 tool result 返回，agent-server 不崩溃；超时或输出超限时确认子进程被终止。
1. 创建一个 `command` 经 symlink 指向插件目录外的插件 tool，确认调用时返回 command 越界错误；创建声明 `permissions.workspace: "read"` 或 `"write"` 的插件 tool，分别验证合法 `workspaceId/relativePath` 会收到校验后的 `workspaceRoot/absolutePath`，`../../` 或 symlink 越界会被 workspace 路径校验拦截。该验证只覆盖传给插件的路径边界，不代表插件进程拥有 OS 级沙箱。

## 通过标准

- 本文件中对应条目的用户可见行为、持久化记录、错误文案和隔离边界均符合预期。
- 所有错误路径均有明确文案，不出现静默失败。
- 每个通过的条目都已从本文件删除，并在 [archive.md](./archive.md) 保留完整验证记录。

## 已知问题（待修复）

当前没有已确认且未修复的 bug；继续以 [bugs.md](./bugs.md) 为准，发现新缺陷时补充到该文件。
