# 待办清单

本文只保留当前仍需修复、补齐或端到端验证的事项。已由代码实现并有测试覆盖的历史项不再保留在 TODO 中；实现细节见对应模块文档与 [architecture-review.md](/Users/mu9/proj/handAgent/docs/architecture-review.md)。

最后核对日期：2026-05-19。

## P0 — 需要修复的产品闭环缺口

### 1. 图片附件真实进入多模态消息

**现状**：PromptPanel 已能采集 `imageRegion` 并通过 `user_message.attachments` 发到 agent-server；`MessageTranslator.composeUserContent()` 已把图片写入 BlobStore，并在 user message 中插入空 body 的 image STUB。原始 base64 不再进入 LLM 上下文，但 LLM 仍不能直接理解图像内容。

**用户场景**：用户圈选屏幕区域后问“这张图里有什么”，模型应能直接基于图片内容回答，而不是只看到占位文本。

**验收标准**：

- 新增 vision / `image.describe` tool，按 blobId 读取图片并输出文本描述；或让 `AgentMessage.user.content` 支持 `string | AgentContentPart[]` 并映射到 AI SDK 多模态消息。
- 图片理解路径仍遵守“屏幕上下文不默认注入”的边界，只处理用户主动提供的图片附件或 LLM 显式读取的 blob。
- 截屏后让 LLM 描述图片内容，能给出真实描述。
- 增加 image blob 读取 / vision 映射测试与 runtime fake provider 测试。

**依赖**：无。文本附件与 WebSocket attachment 链路已接通。

### 2. workspace / permission 文件缓存失效

**现状**：`FileWorkspaceRegistry.cache` 与 `FilePermissionPolicy.cache` 启动后一次性加载。Settings 修改 workspace，或外部撤销权限规则后，agent-server 在重启前看不到变化。

**用户场景**：用户在 Settings 添加工作区或撤销永久权限后，下一次 tool 调用应立即看到新规则。

**验收标准**：

- 两个 registry/policy 统一引入 mtime 检测或明确的 invalidate 机制。
- 每次 `workspace.list / get / register / update / remove` 前可感知文件变化。
- 每次 `PermissionPolicy.check / listPersistedRules / revoke` 前可感知文件变化。
- 测试覆盖“外部修改文件后下一次读取看到新内容”。

**依赖**：无。

### 3. SessionWindow 当前用户气泡不展示附件

**现状**：`PromptSubmission` 会把 text selection / image attachment 通过 `SessionSocketClient.sendUserMessage(... attachments)` 发到 agent-server；但 `SessionViewModel.sendPrompt()` 本地先追加的 user bubble 只包含文本 prompt，不显示附件数量、选区摘要或图片预览。server 持久化后的 user content 包含选区文本和 image STUB，但当前窗口不会自动用该版本替换本地回显。

**用户场景**：用户圈选图片或选区后提交，应能在 SessionWindow 里确认这次请求带了哪些附件，并能区分“只发了文字”还是“发了文字 + 图片/选区”。

**验收标准**：

- 当前 run 的 user bubble 展示附件数量和类型，至少包含 `text_selection` / `image` 占位。
- 图片附件可复用 PromptPanel 的预览能力，或提供明确的缩略/占位入口。
- `session_snapshot` / `load_session_response` 中的历史 user message 与当前本地回显形态一致。
- `SessionViewModelTests` 覆盖带附件提交后的 user bubble 展示。

**依赖**：图片真实理解可独立推进；本项只修 UI 回显和历史一致性。

## P1 — 需要修复的可靠性与协议边界

### 4. 生产窗口 presenter 的 NotificationCenter observer 释放（已完成）

**现状**：已收敛到 `WindowCloseObservation`。`ProductionSessionWindowPresenter` 与 `ProductionSettingsWindowPresenter` 会持有每个窗口的 `NotificationCenter` observer token，并在首次收到 `NSWindow.willCloseNotification` 时先释放 token，再触发关闭回调。

**用户场景**：用户反复打开/关闭 SessionWindow 或 Settings 后，关闭回调不应因悬挂 observer 累积而重复触发或泄漏窗口相关闭包。

**验收状态**：

- 已持有 observer token 并在窗口关闭时释放。
- `WindowCloseObservationTests` 覆盖单个窗口重复 close notification 只触发一次。
- `WindowCloseObservationTests` 覆盖 20 次窗口关闭循环不重复调用 close 回调，并验证 token 已释放。

**依赖**：无。

### 5. SessionMessage 拆分会话协议与平台 RPC

**现状**：`SessionMessage` 同时承载会话帧和平台反向 RPC，平台通道依赖 `sessionId = "_platform"` 魔法值。

**验收标准**：

- 拆出 `PlatformBridgeMessage`，或在外层增加 `channel: "session" | "platform"`。
- `server.ts` 的消息派发不再依赖 `"_platform"`。
- Swift 与 TypeScript 双侧 codec 同步更新。

**依赖**：无。

### 6. WebSocketPlatformBridge 多连接与多会话绑定

**现状**：`WebSocketPlatformBridge.attach(send)` 会静默覆盖上一条 bridge socket；`server.ts` 每条普通 socket 只保存一个 `boundSessionId`，同一 socket 如果未来承载多个 session，权限回流与 `session` scope 清理会绑定到首次 `user_message`。

**用户场景**：桌面端重连、重复启动 bridge 或未来多窗口复用 socket 时，旧连接应明确失效，权限请求应路由到正确 session，不应被新连接静默“偷走”。

**验收标准**：

- `attach` 引入 fencing token 或显式 detach 通知；旧 bridge 被替换时 pending platform request 明确失败。
- `server.ts` 把单个 `boundSessionId` 改为 `Set<string>`，每条 `user_message` 都绑定对应 session。
- socket close 时清理该 socket 绑定过的所有 session 权限回流与 session-scope 规则。
- 新增 `WebSocketPlatformBridge.test.ts` 多 attach 覆盖，以及 `server`/`SessionPermissionBridge` 多 session 绑定测试。

**依赖**：无。

### 7. 跨包 path alias

**现状**：`apps/agent-server/src/*.ts` 仍通过 `../../../packages/core/src/...` reach into core；仓库当前也没有 `tsconfig*.json` path alias 配置。

**验收标准**：

- 增加仓库级 TypeScript path alias，例如 `@core/*`。
- agent-server 源码不再出现 `../../../packages/core`。
- 测试与运行脚本支持新的 import 解析。

**依赖**：无。

### 8. builtin tool 运行时入参校验

**现状**：builtin tool 已通过 `defineTool({ inputSchema: zodSchema })` 生成 JSON Schema 给 LLM，但 `defineTool.create(...).call(input)` 直接把原始 input 传给 `run`，没有执行 `zodSchema.parse`。模型返回畸形参数时，错误由各 tool 内部偶然抛出，文案和字段路径不稳定。

**用户场景**：LLM 误传 `screen.capture({ target: { kind: "window", windowId: "abc" } })` 或漏传 `file.read.cached` 时，SessionWindow 应显示明确的 tool 参数错误，审计日志也应能定位字段路径。

**验收标准**：

- `defineTool` 在 `call(input)` 时执行 zod parse / safeParse。
- 校验失败返回统一可读错误，包含 tool name 与字段路径。
- `register-builtins.test.ts` 或新增 `defineTool.test.ts` 覆盖字段类型错误、缺少必填字段、未知字段 strict object 三类场景。
- 不破坏现有 `inputSchema` JSON Schema 输出。

**依赖**：无。

## P2 — 运行时与 UX 增强

### 9. LLMClient 真实流式接口

**现状**：`LLMClient.complete()` 返回完整结果，`AgentRuntime` 人工发出 `start + 单次 delta + end`，桌面端看到的是伪流式。

**验收标准**：

- `LLMClient` 暴露统一 `AsyncIterable<LLMStreamEvent>` 或等价接口。
- `VercelClient` 使用 AI SDK streaming API。
- `AgentRuntime` 直接转发 token delta 与 tool call 事件。
- fake provider 测试覆盖多段 delta 顺序。
- 桌面端能看到 token 级 streaming（至少 5 段 delta）。

**依赖**：会话路由 / 编排 / 持久化拆分已完成。

### 10. SettingsBackedLLMClient 热路径缓存

**现状**：每次 `complete()` 都同步读取 `~/.spotAgent/settings.json` 并重建 `VercelClient`。

**验收标准**：

- 引入 mtime 或短 TTL 缓存。
- settings 未变化时复用 `VercelClient`。
- 测试覆盖 100 次 complete 中实际读盘次数小于等于 2。

**依赖**：无。

### 11. tool 设置 UI 与热加载

**现状**：core 已有 `ToolSettings` 与 `registerBuiltinTools(... settings)`，支持 `tools.allowlist / tools.denylist`；但 Settings 窗口没有 tool 管理 Tab，agent-server 只在启动时 `loadToolSettings()` 一次，保存设置后不会影响已启动的 registry。

**用户场景**：用户应能在设置页禁用高风险 tool（例如 `clipboard.read` / `screen.capture` / `file.write`），并在保存后让后续会话立即按新规则暴露工具。

**验收标准**：

- Settings 增加 tool 管理入口，展示 builtin tool、说明、启用状态与风险提示。
- 写入 `~/.spotAgent/settings.json` 的 `tools.allowlist / tools.denylist` 字段。
- agent-server 支持 tool 设置热加载：settings 变化后新一轮 LLM 请求使用最新 registry，或明确重启子进程并恢复可用状态。
- 测试覆盖 denylist 保存后 registry 不再暴露对应 tool。

**依赖**：建议与 SettingsBackedLLMClient 缓存一起设计 settings 失效策略。

### 12. workspace.askUser tool

**现状**：`workspace.list` 已落地；`workspace.askUser` 暂未实现。当前 file tool description 已提示“模糊时调 `workspace.askUser`”，但 registry 中没有这个 tool。

**用户场景**：多个 workspace 都可能匹配时，LLM 能让用户在 SessionWindow 内选择目标 workspace。

**验收标准**：

- 新增 `workspace.askUser({ prompt, candidateIds? })`。
- SessionWindow 复用内联气泡显示候选 workspace。
- 用户取消或超时返回 `{ cancelled: true }`。
- 同一 session 内多个询问串行展示。
- 在 `file.read/write` description 中保留该 tool 的使用指引。

**依赖**：权限气泡 UI 可作为交互样式参考。

### 13. 权限规则管理 UI 与端到端验证

**现状**：`FilePermissionPolicy`、`SessionPermissionBridge`、`AgentRuntime` 权限拦截、`SessionSocketClient` 解码、`SessionWindowView` 内联气泡都已实现。剩余风险在 UI 端到端验证和永久规则管理。

**验收标准**：

- 手工验证 `once / session / always / deny / timeout / close session` 全路径。
- Settings 增加权限规则列表，支持查看和撤销 `~/.spotAgent/permissions.json` 中的永久规则。
- UI 中展示 toolName、关键参数摘要、decision、createdAt。

**依赖**：无。`session` scope 已按 `sessionId` 隔离并在 socket 关闭时清理。

### 14. 会话历史入口补齐

**现状**：后端 `list/load/delete` 已实现，SessionWindow 左侧历史侧栏已落地；PromptPanel 最近会话 action 与独立历史窗口未实现。

**验收标准**：

- PromptPanel action 列表支持最近会话过滤和恢复。
- 独立历史窗口支持搜索、预览、恢复、删除。
- 删除前二次确认。
- 多窗口恢复同一会话时行为明确，避免状态漂移。

**依赖**：无。

### 15. OCR 与 Accessibility 平台能力落地

**现状**：`ocr.read`、`accessibility.snapshot`、`accessibility.action` 已作为 builtin tool 注册并暴露给 LLM，但 macOS 侧 `MacPlatformProvider` 对这三个 method 统一返回 `not_implemented`。

**用户场景**：LLM 需要读取截图中文字、理解前台 App 可访问性树或执行基础点击/输入动作时，tool 应返回真实结果，而不是运行时失败。

**验收标准**：

- `ocr.read` 基于 Vision 或系统 OCR 从用户主动提供图片 / tool 截图中识别文本。
- `accessibility.snapshot` 基于 Accessibility API 返回 frontmost app/window/element 的结构化树。
- `accessibility.action` 至少支持 press/click/set_value，并在权限不足时返回明确可读错误。
- 未授权 Accessibility / Screen Recording 时有明确权限引导。
- 增加 Swift provider 单元测试可测的解析层，以及手工 QA 覆盖真实 App。

**依赖**：macOS 权限提示与审计文案应与 permission UI 对齐。

### 16. 会话中断 / Stop

**现状**：协议里已有 `interrupt` 帧，但 `SessionRouter` 未处理，SessionWindow 也没有 Stop 按钮；一旦 LLM 请求或 tool 调用耗时较长，用户只能关闭窗口或等待。

**用户场景**：用户发现请求写错或 tool 卡住时，应能在 SessionWindow 中停止当前 run，并让后端取消或忽略后续输出。

**验收标准**：

- SessionWindow 运行态显示 Stop 控件。
- `interrupt` 帧由 server 路由到当前 session run。
- `AgentRuntime` / `LLMClient` 支持 abort signal，至少能停止后续事件推送并把会话状态置为 interrupted。
- tool 调用无法硬取消时，后续结果不再写入已中断 run。
- 测试覆盖 interrupt 后不再追加 assistant/tool 消息。

**依赖**：真实 streaming 接口会让取消语义更完整，但 UI Stop 可先做“忽略后续输出”的最小闭环。

## P3 — 长期能力

### 17. 多 provider LLM 支持

**现状**：生产路径只有 `VercelClient`，OpenAI 兼容 API 通过 `responses/chat/completion` 切换。仓库依赖中已有 `@ai-sdk/anthropic`，但尚未接入到 provider factory。

**验收标准**：

- 抽出 `LLMClientFactory`。
- settings 支持 provider 字段。
- 至少接入第二个 provider 验证消息、stream、tool call 归一化。
- provider capability 显式声明是否支持 tool calling / multimodal / streaming。

**依赖**：建议在真实 streaming 和多模态 content part 后做。

### 18. 用户自定义 tool / 插件系统

**现状**：所有 tool 都是 builtin，随代码构建。

**验收标准**：

- 设计插件 manifest、安装目录、启停机制、权限声明和冲突规则。
- 第一版可以只支持本地目录插件。
- 插件崩溃/超时不拖垮 agent-server。
- 与 workspace 沙箱和权限审批系统对齐。

**依赖**：权限 UI、workspace askUser、tool 注册边界稳定后再启动。

## 手工验证清单入口

端到端验证步骤见 [manual-qa.md](/Users/mu9/proj/handAgent/docs/manual-qa.md)。每次完成以上条目后，应同步更新本文件和对应模块 `<dir>.md`。
