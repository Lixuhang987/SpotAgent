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

## 删除 running session 回归（P1）

1. 使用 mock LLM 打包并启动桌面 App：`bash ./scripts/package-app.sh --mock-llm`，再打开 `dist/HandAgentDesktop.app`。
1. 通过 PromptPanel 提交 `[mock:slow-focus] QA_DELETE_RUNNING_SESSION_TIMEOUT_YYYYMMDD_HHMMSS`，确认 SessionWindow 中该 session 进入 running 状态。
1. 在左侧历史列表删除同一 session，并确认删除弹窗。
1. 确认 UI 在有限时间内返回删除结果：对应 tab 被关闭，历史列表不再展示该 session，窗口没有长期停在 running 或等待删除状态。
1. 记录删除前 session id，并确认 `~/.spotAgent/sessions/<session-id>.json` 已不存在。

说明：不响应 abort 的 runtime 强制清理边界已由 `SessionRuntimeOrchestrator` 与 `SessionRouter` 自动化测试覆盖；本条实机 QA 只验证桌面删除 running session 的用户可见链路。

## 权限 / tool 等待态 running 状态回归（P2）

1. 使用 mock LLM 打包并启动桌面 App：`bash ./scripts/package-app.sh --mock-llm`，再打开 `dist/HandAgentDesktop.app`。
1. 通过 PromptPanel 提交 `[mock:workspace-ask] QA_PERMISSION_RUNNING_STATUS_YYYYMMDD_HHMMSS`。
1. 等待 SessionWindow 显示 `授权调用 workspace.askUser` 权限审批面板。
1. 确认权限审批面板可见期间，底部 composer 显示 Stop 按钮，不显示普通发送箭头；状态气泡也显示运行态。
1. 点击 `仅本次` 允许权限请求，等待 workspace 选择面板出现。
1. 确认 workspace 选择面板可见期间，底部 composer 仍显示 Stop 按钮，状态气泡仍显示运行态。
1. 选择 `qa-workspace`，等待最终 assistant 回复完成，并确认底部 composer 恢复普通发送按钮。
1. 记录 session id，并确认 `~/.spotAgent/sessions/<session-id>.json` 中有 `workspace.askUser` 的 tool result 和最终 assistant 消息。

说明：`assistant_message_end(completed)` 只表示当前 assistant 消息片段结束，不表示整轮运行结束；权限审批、workspace 选择和 tool running frame 到达时，桌面端必须继续把会话视为 running。

## Anthropic Provider 真实调用（P1）

1. 配置可用 Anthropic API key 与模型后提交普通文本 prompt，确认 assistant 回复可见且逐段 streaming。
1. 在 Anthropic provider 下触发一个会调用 tool 的 prompt，确认 tool name 经适配后仍能回到点号风格（如 `file.read`），tool result 可回灌给 LLM。

最近阻塞记录：2026-05-21 打开 Settings → 模型配置，Computer Use 确认 provider segmented control 同时展示 `OpenAI 兼容` 与 `Anthropic`。当前 `~/.spotAgent/settings.json` 只有 `provider: "openai-compatible"`、`api: "chat"`、`model: "gpt-5.2"`、`baseUrl: "https://new.cooree.de/v1"`，API key 已配置但不展示；环境变量中也没有 `ANTHROPIC_API_KEY` 或 `CLAUDE_API_KEY`。OpenAI 兼容端真实 streaming、真实 vision 底层请求、区域截图附件路径、`openai-compatible + completion` 的多模态拒绝和 tool 降级纯文本请求均已归档到 [archive.md](./archive.md)。配置文件没有可用的 Anthropic key 或 Anthropic 模型；在没有用户提供真实 Anthropic 配置前，不能验证 Anthropic streaming 与 tool call 回灌，本项不归档为通过。

## 通过标准

- 本文件中对应条目的用户可见行为、持久化记录、错误文案和隔离边界均符合预期。
- 所有错误路径均有明确文案，不出现静默失败。
- 每个通过的条目都已从本文件删除，并在 [archive.md](./archive.md) 保留完整验证记录。
