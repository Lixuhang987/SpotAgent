# 手工验收清单

## 维护规则

本文件只保留尚未通过实机 QA 的手工验收项。验证通过后，必须从本文件删除对应内容，并把完整验证日期、环境、过程、证据与结论移动到 [archive.md](./archive.md)。
已验证归档见 [archive.md](./archive.md)；已修复 bug 与回归记录见 [bugs.md](./bugs.md)；代码已实现但待实机确认的功能来源见 [待验收.md](./待验收.md)。

## 验收目标

确认桌面 Agent MVP 仍未归档的端到端路径可用，并把新通过的条目及时移入归档：ScreenCaptureKit 反向 IPC、多模态图片附件、真实流式输出、协议拆分与多会话绑定、OCR、Accessibility、多 provider LLM、用户自定义 tool 后续异常路径 / 本地插件系统边界。

## 验收前提

- 已完成依赖安装。
- 已通过 `bash ./scripts/test.sh`。
- 已通过 `bash ./scripts/swiftw test`。
- 已通过 `bash ./scripts/swiftw build`。

## ScreenCaptureKit 反向 IPC（P2）

1. 让 LLM 调 `screen.capture(target: "display")`，确认返回当前显示器截图（base64 图片可解码）。
1. 让 LLM 调 `screen.capture(target: "window", windowId: <frontmost>)`，确认返回指定窗口截图。
1. 快速连续发送 3 个 `platform_request`，确认通过 `requestId` 隔离，结果不串。

最近阻塞记录：2026-05-21 使用 mock-LLM 触发 `[mock:screen-display]` 已验证到 `screen.capture` 权限气泡与真实 PlatformBridge 调用，但 macOS 返回 `Failed to enumerate shareable content (用户拒绝了应用程序、窗口、显示器捕捉的TCC)。请确认 HandAgent 已获得「屏幕录制」权限。`。复测 session `~/.spotAgent/sessions/session-1779306464331-1c7li4.json` 记录了 `permission_request(action: allow)`、`tool_call(screen.capture display)` 与 `tool_result(status: error)`，错误输出仍为屏幕录制 TCC 拒绝。授权屏幕录制后需重新验证 display/window 截图和 3 个快速 `platform_request` 隔离。

## 多模态图片附件（P1）

1. 使用 `captureRegion` 截取一个区域，提交 prompt「描述这张图片」，确认 LLM 能基于图片内容给出真实描述（非占位文本）。

## 真实流式输出（P1）

1. 提交一个会产生长回复的 prompt，观察 SessionWindow 中 assistant 气泡逐段更新（至少 5 段 delta），而非一次性出现完整文本。

## 单窗口多 Tab 会话历史（P1）

1. 从 PromptPanel 提交一条 prompt，确认只打开一个 SessionWindow，并在收到 create 响应后创建一个 active tab。
1. 再次从 PromptPanel 提交 prompt，确认复用同一个 SessionWindow，并创建新的 session tab，不会打到当前 active tab。
1. 从 PromptPanel 执行“会话历史”，确认只聚焦 SessionWindow，不改变 active tab、running 状态或草稿。
1. 点击左侧历史项，确认已有 tab 会被激活，未打开历史会话会创建新 tab。
1. 在一个 tab running 时切换到另一个 tab，确认后台 tab 继续输出且状态标记可见。
1. 删除 running session，确认 server 先 interrupt 再删除，历史列表刷新。

最近阻塞记录：2026-05-21 已验证前 5 步通过；第 6 步发现删除 running session 后 session 文件已删除、历史列表已刷新，但已打开 tab 仍停留在 `运行中`，详见 [bugs.md](./bugs.md) 当前 bug。修复后需要重测本条完整链路。

## 协议拆分与多会话绑定（P2）

1. 在同一个 SessionWindow 内打开两个不同 session tab，在两个 tab 中同时触发需要 platform 能力的 tool，确认两个请求通过 `requestId` 隔离，结果不串。
1. 关闭其中一个 tab，确认另一个 session 的 platform 请求不受影响。

## OCR 与 Accessibility 平台能力（P2）

1. 在「系统设置 → 隐私与安全性 → 辅助功能」允许 HandAgent；如要用截图生成 OCR 输入，也在「屏幕录制」里允许 HandAgent。
1. 使用 `captureRegion` 截取包含清晰文字的区域，或让 LLM 先调用 `screen.capture` 获得图片，再调用 `ocr.read({imageBase64, mimeType: "image/png"})`，确认返回 `text` 与 `lines[].confidence`，且文字内容与图片一致。
1. 让 LLM 直接调用缺少 `imageBase64` 的 `ocr.read`，确认返回明确 `invalid_argument`，且不会默认读取屏幕、剪贴板或文件。
1. 打开 TextEdit、系统设置或 Finder 作为前台 App，让 LLM 调用 `accessibility.snapshot({kind: "frontmost_app"})`，确认返回有限层级的 `children`，节点包含 `role`、可读 label/value 和可复用 `elementId`。
1. 选择一个快照中的按钮或文本框，用对应 `elementId` 调用 `accessibility.action`：按钮验证 `press` 或 `click`，文本框验证 `set_value`。
1. 用 `window.list` 取得窗口 id 后调用 `accessibility.snapshot({kind: "window", windowId: <id>})`，确认返回的是指定窗口的树；再传入同一 App 下不存在或不匹配的 `windowId`，确认返回 `not_found`，不会退回 focused window。
1. 临时移除 HandAgent 辅助功能权限后重复 snapshot/action，确认返回 `permission_denied`，文案指向「系统设置 → 隐私与安全性 → 辅助功能」。

已验证子项：2026-05-21 使用 mock-LLM 触发 `[mock:ocr-invalid] QA ocr invalid argument 20260521`，应用内 `ocr.read` 授权气泡参数为空对象 `{}`；选择「仅本次」后 UI 显示 `ocr.read: Invalid input for tool "ocr.read": imageBase64: Invalid input: expected string, received undefined`，session `~/.spotAgent/sessions/session-1779306749007-ojxi0q.json` 记录 `permission_request(action: allow)`、`tool_call(input: {})` 与 `tool_result(status: error)`。该子项证明缺少 `imageBase64` 时返回明确错误，且没有默认读取屏幕、剪贴板或文件。OCR 图片识别与 Accessibility snapshot/action 子项仍待验。

## 多 provider LLM（P2）

1. 打开 Settings → 模型配置，确认 provider 可在 `openai-compatible` 与 `anthropic` 间切换，保存后 `~/.spotAgent/settings.json` 写入 `llm.provider`。
1. 选择 `openai-compatible`，使用当前 OpenAI 兼容端点提交普通文本 prompt，确认 streaming、tool call 与图片附件路径仍按原逻辑工作。
1. 选择 `anthropic`，配置可用 Anthropic API key 与模型后提交普通文本 prompt，确认 assistant 回复可见且逐段 streaming。
1. 在 Anthropic provider 下触发一个会调用 tool 的 prompt，确认 tool name 经适配后仍能回到点号风格（如 `file.read`），tool result 可回灌给 LLM。
1. 将 provider 设为 `openai-compatible` 且 `api` 设为 `completion` 后提交图片附件 prompt，确认返回明确「provider 不支持 multimodal」类错误；提交需要 tool 的 prompt 时确认降级为纯文本请求，不暴露工具列表。

## 用户自定义 tool / 本地插件系统后续边界（P2）

1. 创建一个与 builtin 同名的插件 tool（如 `file.read`）和两个重复同名插件 tool，确认日志记录 disabled reason，builtin 不被覆盖。
1. 创建一个会非 0 exit、输出非 JSON、超时或输出超过 1 MiB 的插件 tool，确认错误作为 tool result 返回，agent-server 不崩溃；超时或输出超限时确认子进程被终止。
1. 创建一个 `command` 经 symlink 指向插件目录外的插件 tool，确认调用时返回 command 越界错误；创建声明 `permissions.workspace: "read"` 或 `"write"` 的插件 tool，分别验证合法 `workspaceId/relativePath` 会收到校验后的 `workspaceRoot/absolutePath`，`../../` 或 symlink 越界会被 workspace 路径校验拦截。该验证只覆盖传给插件的路径边界，不代表插件进程拥有 OS 级沙箱。

## 通过标准

- 本文件中对应条目的用户可见行为、持久化记录、错误文案和隔离边界均符合预期。
- 所有错误路径均有明确文案，不出现静默失败。
- 每个通过的条目都已从本文件删除，并在 [archive.md](./archive.md) 保留完整验证记录。

## 已知问题（待修复）

当前已确认缺陷以 [bugs.md](./bugs.md) 为准。2026-05-21 已确认：删除 running session 后，已打开 tab 仍显示 `运行中`。
