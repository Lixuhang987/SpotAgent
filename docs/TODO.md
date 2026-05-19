# 待办清单

本文只保留当前仍需修复、补齐或端到端验证的事项。已由代码实现并有测试覆盖的历史项不再保留在 TODO 中；实现细节见对应模块文档与 [architecture-review.md](/Users/mu9/proj/handAgent/docs/architecture-review.md)。

最后核对日期：2026-05-19。

## P2 — 运行时与 UX 增强

### 1. tool 设置 UI 与热加载

**现状**：core 已有 `ToolSettings` 与 `registerBuiltinTools(... settings)`，支持 `tools.allowlist / tools.denylist`；但 Settings 窗口没有 tool 管理 Tab，agent-server 只在启动时 `loadToolSettings()` 一次，保存设置后不会影响已启动的 registry。

**用户场景**：用户应能在设置页禁用高风险 tool（例如 `clipboard.read` / `screen.capture` / `file.write`），并在保存后让后续会话立即按新规则暴露工具。

**验收标准**：

- Settings 增加 tool 管理入口，展示 builtin tool、说明、启用状态与风险提示。
- 写入 `~/.spotAgent/settings.json` 的 `tools.allowlist / tools.denylist` 字段。
- agent-server 支持 tool 设置热加载：settings 变化后新一轮 LLM 请求使用最新 registry，或明确重启子进程并恢复可用状态。
- 测试覆盖 denylist 保存后 registry 不再暴露对应 tool。

**依赖**：建议复用 `SettingsBackedLLMClient` 已采用的 settings 文件戳失效策略。

### 2. workspace.askUser tool

**现状**：`workspace.list` 已落地；`workspace.askUser` 暂未实现。当前 file tool description 已提示“模糊时调 `workspace.askUser`”，但 registry 中没有这个 tool。

**用户场景**：多个 workspace 都可能匹配时，LLM 能让用户在 SessionWindow 内选择目标 workspace。

**验收标准**：

- 新增 `workspace.askUser({ prompt, candidateIds? })`。
- SessionWindow 复用内联气泡显示候选 workspace。
- 用户取消或超时返回 `{ cancelled: true }`。
- 同一 session 内多个询问串行展示。
- 在 `file.read/write` description 中保留该 tool 的使用指引。

**依赖**：权限气泡 UI 可作为交互样式参考。

### 3. 权限规则管理 UI 与端到端验证

**现状**：`FilePermissionPolicy`、`SessionPermissionBridge`、`AgentRuntime` 权限拦截、`SessionSocketClient` 解码、`SessionWindowView` 内联气泡都已实现。剩余风险在 UI 端到端验证和永久规则管理。

**验收标准**：

- 手工验证 `once / session / always / deny / timeout / close session` 全路径。
- Settings 增加权限规则列表，支持查看和撤销 `~/.spotAgent/permissions.json` 中的永久规则。
- UI 中展示 toolName、关键参数摘要、decision、createdAt。

**依赖**：无。`session` scope 已按 `sessionId` 隔离并在 socket 关闭时清理。

### 4. 会话历史入口补齐

**现状**：后端 `list/load/delete` 已实现，SessionWindow 左侧历史侧栏已落地；PromptPanel 最近会话 action 与独立历史窗口未实现。

**验收标准**：

- PromptPanel action 列表支持最近会话过滤和恢复。
- 独立历史窗口支持搜索、预览、恢复、删除。
- 删除前二次确认。
- 多窗口恢复同一会话时行为明确，避免状态漂移。

**依赖**：无。

### 5. OCR 与 Accessibility 平台能力落地

**现状**：`ocr.read`、`accessibility.snapshot`、`accessibility.action` 已作为 builtin tool 注册并暴露给 LLM，但 macOS 侧 `MacPlatformProvider` 对这三个 method 统一返回 `not_implemented`。

**用户场景**：LLM 需要读取截图中文字、理解前台 App 可访问性树或执行基础点击/输入动作时，tool 应返回真实结果，而不是运行时失败。

**验收标准**：

- `ocr.read` 基于 Vision 或系统 OCR 从用户主动提供图片 / tool 截图中识别文本。
- `accessibility.snapshot` 基于 Accessibility API 返回 frontmost app/window/element 的结构化树。
- `accessibility.action` 至少支持 press/click/set_value，并在权限不足时返回明确可读错误。
- 未授权 Accessibility / Screen Recording 时有明确权限引导。
- 增加 Swift provider 单元测试可测的解析层，以及手工 QA 覆盖真实 App。

**依赖**：macOS 权限提示与审计文案应与 permission UI 对齐。

### 6. 会话中断 / Stop

**现状**：协议里已有 `interrupt` 帧，但 `SessionRouter` 未处理，SessionWindow 也没有 Stop 按钮；一旦 LLM 请求或 tool 调用耗时较长，用户只能关闭窗口或等待。

**用户场景**：用户发现请求写错或 tool 卡住时，应能在 SessionWindow 中停止当前 run，并让后端取消或忽略后续输出。

**验收标准**：

- SessionWindow 运行态显示 Stop 控件。
- `interrupt` 帧由 server 路由到当前 session run。
- `AgentRuntime` / `LLMClient` 支持 abort signal，至少能停止后续事件推送并把会话状态置为 interrupted。
- tool 调用无法硬取消时，后续结果不再写入已中断 run。
- 测试覆盖 interrupt 后不再追加 assistant/tool 消息。

**依赖**：LLM 真实 streaming 接口已完成；UI Stop 可先做“忽略后续输出”的最小闭环，再继续向 provider abort 语义收敛。

## P3 — 长期能力

### 7. 多 provider LLM 支持

**现状**：生产路径只有 `VercelClient`，OpenAI 兼容 API 通过 `responses/chat/completion` 切换。仓库依赖中已有 `@ai-sdk/anthropic`，但尚未接入到 provider factory。

**验收标准**：

- 抽出 `LLMClientFactory`。
- settings 支持 provider 字段。
- 至少接入第二个 provider 验证消息、stream、tool call 归一化。
- provider capability 显式声明是否支持 tool calling / multimodal / streaming。

**依赖**：provider capability 需要声明是否支持当前已落地的多模态 content part、tool calling 与 streaming。

### 8. 用户自定义 tool / 插件系统

**现状**：所有 tool 都是 builtin，随代码构建。

**验收标准**：

- 设计插件 manifest、安装目录、启停机制、权限声明和冲突规则。
- 第一版可以只支持本地目录插件。
- 插件崩溃/超时不拖垮 agent-server。
- 与 workspace 沙箱和权限审批系统对齐。

**依赖**：权限 UI、workspace askUser、tool 注册边界稳定后再启动。

## 手工验证清单入口

端到端验证步骤见 [manual-qa.md](/Users/mu9/proj/handAgent/docs/manual-qa.md)。每次完成以上条目后，应同步更新本文件和对应模块 `<dir>.md`。
