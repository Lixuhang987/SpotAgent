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

## Accessibility 平台能力（P2）

1. 在「系统设置 → 隐私与安全性 → 辅助功能」允许 HandAgent。
1. 打开 TextEdit、系统设置或 Finder 作为前台 App，让 LLM 调用 `accessibility.snapshot({kind: "frontmost_app"})`，确认返回有限层级的 `children`，节点包含 `role`、可读 label/value 和可复用 `elementId`。
1. 选择一个快照中的按钮或文本框，用对应 `elementId` 调用 `accessibility.action`：按钮验证 `press` 或 `click`，文本框验证 `set_value`。
1. 用 `window.list` 取得窗口 id 后调用 `accessibility.snapshot({kind: "window", windowId: <id>})`，确认返回的是指定窗口的树；再传入同一 App 下不存在或不匹配的 `windowId`，确认返回 `not_found`，不会退回 focused window。
1. 临时移除 HandAgent 辅助功能权限后重复 snapshot/action，确认返回 `permission_denied`，文案指向「系统设置 → 隐私与安全性 → 辅助功能」。

最近阻塞记录：2026-05-21 已用 mock-LLM 验证 OCR 正向与缺参错误路径，并归档到 [archive.md](./archive.md)。同日保持 TextEdit 前台，通过 agent-server WebSocket 触发 `[mock:accessibility-frontmost]` 与 `[mock:accessibility-set-frontmost]`，两者都经过真实 PlatformBridge 到达桌面 provider，但当前 packaged app 没有辅助功能权限，session `~/.spotAgent/sessions/session-1779352892449-iyjcj0.json` 与 `~/.spotAgent/sessions/session-1779352937653-pt4c60.json` 均记录 `tool_result.status: error`，输出为 `HandAgent 没有辅助功能权限。请打开「系统设置 → 隐私与安全性 → 辅助功能」，允许 HandAgent 后重试。`。未获用户明确授权前，不重置或修改 macOS 隐私权限；获得权限后需回归 frontmost snapshot、element action、window target 与 `not_found` 边界。

## 多 provider LLM（P2）

1. 配置可用 Anthropic API key 与模型后提交普通文本 prompt，确认 assistant 回复可见且逐段 streaming。
1. 在 Anthropic provider 下触发一个会调用 tool 的 prompt，确认 tool name 经适配后仍能回到点号风格（如 `file.read`），tool result 可回灌给 LLM。

最近阻塞记录：2026-05-21 打开 Settings → 模型配置，Computer Use 确认 provider segmented control 同时展示 `OpenAI 兼容` 与 `Anthropic`，当前 UI 与 `~/.spotAgent/settings.json` 均为 `provider: "openai-compatible"`、`api: "chat"`、`model: "gpt-5.3-codex"`、`baseUrl: "https://lpgpt.us/v1"`，API key 已配置但不展示。OpenAI 兼容端真实 streaming、真实 vision 底层请求、区域截图附件路径、`openai-compatible + completion` 的多模态拒绝和 tool 降级纯文本请求均已归档到 [archive.md](./archive.md)。配置文件没有可用的 Anthropic key 或 Anthropic 模型；在没有用户提供真实 Anthropic 配置前，不能验证 Anthropic streaming 与 tool call 回灌，本项不归档为通过。

## 通过标准

- 本文件中对应条目的用户可见行为、持久化记录、错误文案和隔离边界均符合预期。
- 所有错误路径均有明确文案，不出现静默失败。
- 每个通过的条目都已从本文件删除，并在 [archive.md](./archive.md) 保留完整验证记录。
