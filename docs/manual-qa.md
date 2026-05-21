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

最近阻塞记录：2026-05-21 打开 Settings → 模型配置，Computer Use 确认 provider segmented control 同时展示 `OpenAI 兼容` 与 `Anthropic`。当前 `~/.spotAgent/settings.json` 只有 `provider: "openai-compatible"`、`api: "chat"`、`model: "gpt-5.2"`、`baseUrl: "https://new.cooree.de/v1"`，API key 已配置但不展示；环境变量中也没有 `ANTHROPIC_API_KEY` 或 `CLAUDE_API_KEY`。OpenAI 兼容端真实 streaming、真实 vision 底层请求、区域截图附件路径、`openai-compatible + completion` 的多模态拒绝和 tool 降级纯文本请求均已归档到 [archive.md](./archive.md)。配置文件没有可用的 Anthropic key 或 Anthropic 模型；在没有用户提供真实 Anthropic 配置前，不能验证 Anthropic streaming 与 tool call 回灌，本项不归档为通过。

## Computer Use MCP 真实工具调用（P0）

1. 在 `~/.spotAgent/mcp.json` 注册 `computer_use` stdio server 后启动 mock App。
1. 提交 `run [mock:computer-use-list-apps]`，允许 `mcp.computer_use.list_apps`，确认返回 App 列表而不是 `tools/call` 超时。
1. 提交 `run [mock:computer-use-get-finder]`，允许 `mcp.computer_use.get_app_state`，确认返回 Finder 的截图与 accessibility tree，或 Computer Use 明确的策略/授权错误。

最近阻塞记录：2026-05-22 在 `main` 分支 `4547246` 验证，`mcp.computer_use.list_apps` 已返回 App 列表，`mcp.computer_use.get_app_state` 也不再出现 `tools/call` 超时；但 `app: "Finder"` 被解析为 `Keka Finder Integration`（`bundleId: "com.aone.keka.KekaFinderIntegration"`），不是真正 Finder / 访达（`bundleId: "com.apple.finder"`）。已记录到 [bugs.md](./bugs.md)「Computer Use MCP `get_app_state` 会把 `Finder` 误匹配为 `Keka Finder Integration`」。本项在该 bug 修复前不能归档为通过。

## 侧边栏 Workspace 分组（P1）

1. 在 `~/.spotAgent/workspaces.json` 配置至少两个非默认 workspace 后打开 SessionWindow，确认左侧侧边栏显示 workspace 折叠列表。
1. 点击 workspace 行，确认展开/折叠切换正常，展开后显示该 workspace 下的会话。
1. 点击 workspace 行右侧 "+" 按钮，确认在该 workspace 下创建新对话（不触发展开/折叠）。
1. 确认无 workspaceId 的旧会话显示在 "默认" 分隔线下方。
1. 在搜索框输入关键词，确认忽略分组、平铺显示所有匹配结果。
1. 无 workspace 配置时（workspaces.json 为空或只有 default），确认侧边栏退化为平铺列表，无 "默认" 分隔线。

## 通过标准

- 本文件中对应条目的用户可见行为、持久化记录、错误文案和隔离边界均符合预期。
- 所有错误路径均有明确文案，不出现静默失败。
- 每个通过的条目都已从本文件删除，并在 [archive.md](./archive.md) 保留完整验证记录。
