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

1. 临时移除 HandAgent 辅助功能权限后重复 snapshot/action，确认返回 `permission_denied`，文案指向「系统设置 → 隐私与安全性 → 辅助功能」。

最近阻塞记录：2026-05-21 已验证 Accessibility 正向链路：`/Users/mu9/.spotAgent/sessions/session-1779364328843-mryubj.json` 证明 `accessibility.snapshot({kind:"frontmost_app"})` 返回 TextEdit AX 树，包含 `AXTextArea`、可读 value 和 `elementId`；`/Users/mu9/.spotAgent/sessions/session-1779364361967-p3vtsm.json` 证明 `accessibility.action({kind:"set_value"})` 成功把 TextEdit 内容改为 `HANDAGENT_ACCESSIBILITY_SET_VALUE_20260521`；修复 `window.list` CG id 与 AX window 映射后，`/Users/mu9/.spotAgent/sessions/session-1779366519673-yu9crt.json` 证明 `accessibility.snapshot({kind:"window", windowId:52648})` 返回 `AXWindow`、`children=9` 且不匹配 id `999999999` 不会退回 focused window。当前仅剩“临时移除 HandAgent 辅助功能权限后返回 `permission_denied`”未验证；这需要修改 macOS「隐私与安全性 → 辅助功能」权限，未获用户明确授权前不执行。

## 多 provider LLM（P2）

1. 配置可用 Anthropic API key 与模型后提交普通文本 prompt，确认 assistant 回复可见且逐段 streaming。
1. 在 Anthropic provider 下触发一个会调用 tool 的 prompt，确认 tool name 经适配后仍能回到点号风格（如 `file.read`），tool result 可回灌给 LLM。

最近阻塞记录：2026-05-21 打开 Settings → 模型配置，Computer Use 确认 provider segmented control 同时展示 `OpenAI 兼容` 与 `Anthropic`。当前 `~/.spotAgent/settings.json` 只有 `provider: "openai-compatible"`、`api: "chat"`、`model: "gpt-5.2"`、`baseUrl: "https://new.cooree.de/v1"`，API key 已配置但不展示；环境变量中也没有 `ANTHROPIC_API_KEY` 或 `CLAUDE_API_KEY`。OpenAI 兼容端真实 streaming、真实 vision 底层请求、区域截图附件路径、`openai-compatible + completion` 的多模态拒绝和 tool 降级纯文本请求均已归档到 [archive.md](./archive.md)。配置文件没有可用的 Anthropic key 或 Anthropic 模型；在没有用户提供真实 Anthropic 配置前，不能验证 Anthropic streaming 与 tool call 回灌，本项不归档为通过。

## 通过标准

- 本文件中对应条目的用户可见行为、持久化记录、错误文案和隔离边界均符合预期。
- 所有错误路径均有明确文案，不出现静默失败。
- 每个通过的条目都已从本文件删除，并在 [archive.md](./archive.md) 保留完整验证记录。
