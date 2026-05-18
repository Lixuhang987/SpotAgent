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

### 2. PromptPanel 区域圈选迁到 ScreenCaptureKit 自建流程

**现状**：`screen.capture` tool 已通过 `RemotePlatformAdapter → PlatformBridge → MacPlatformProvider` 使用 ScreenCaptureKit；但用户主动触发的 `captureRegion` 热键仍由 `MacRegionCaptureProvider` 调 `/usr/sbin/screencapture -i -x` 完成圈选。

**用户场景**：用户按“区域截图”快捷键后，应进入产品自有的区域选择流程，并由同一套 ScreenCaptureKit 截图能力产出 attachment。

**验收标准**：

- 新增自建区域选择 UI 或系统级内容选择流程，不再依赖 `screencapture` CLI。
- 截图能力复用 `MacPlatformProvider` / ScreenCaptureKit 路径。
- ESC 取消时不弹 PromptPanel。
- 未授权录屏权限时给出原生权限请求或明确引导。
- 更新 [selection-capture.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/SelectionCapture/selection-capture.md) 中的兜底说明。

**依赖**：ScreenCaptureKit 反向 IPC 已完成。

### 3. workspace / permission 文件缓存失效

**现状**：`FileWorkspaceRegistry.cache` 与 `FilePermissionPolicy.cache` 启动后一次性加载。Settings 修改 workspace，或外部撤销权限规则后，agent-server 在重启前看不到变化。

**用户场景**：用户在 Settings 添加工作区或撤销永久权限后，下一次 tool 调用应立即看到新规则。

**验收标准**：

- 两个 registry/policy 统一引入 mtime 检测或明确的 invalidate 机制。
- 每次 `workspace.list / get / register / update / remove` 前可感知文件变化。
- 每次 `PermissionPolicy.check / listPersistedRules / revoke` 前可感知文件变化。
- 测试覆盖“外部修改文件后下一次读取看到新内容”。

**依赖**：无。

## P1 — 结构性重构

### 4. 拆分 AppCoordinator

**现状**：`AppCoordinator` 已接入 `AppServices` DI、`AgentServerHealth`、`PromptCaptureCoordinator` 与窗口 presenter，但仍持有 `NSWindow`、`NSApp` 调用、settings/session 窗口生命周期和状态气泡路由逻辑。

**目标**：继续按 [split-app-coordinator plan](/Users/mu9/proj/handAgent/docs/superpowers/plans/2026-05-18-split-app-coordinator.md) 收敛职责。

**验收标准**：

- `AppCoordinator` 不再直接 `import AppKit`。
- 抽出 `SessionLifecycle` 与 `SettingsLifecycle` 或等价边界。
- Coordinator 只保留 Action 路由、PromptPanel/StatusBubble 串联、服务启动停止。
- 相关单测覆盖生命周期单元。

**依赖**：`AppServices` DI 已完成。

### 5. SessionMessage 拆分会话协议与平台 RPC

**现状**：`SessionMessage` 同时承载会话帧和平台反向 RPC，平台通道依赖 `sessionId = "_platform"` 魔法值。

**验收标准**：

- 拆出 `PlatformBridgeMessage`，或在外层增加 `channel: "session" | "platform"`。
- `server.ts` 的消息派发不再依赖 `"_platform"`。
- Swift 与 TypeScript 双侧 codec 同步更新。

**依赖**：无。

### 6. 跨包 path alias

**现状**：`apps/agent-server/src/*.ts` 仍通过 `../../../packages/core/src/...` reach into core。

**验收标准**：

- 增加仓库级 TypeScript path alias，例如 `@core/*`。
- agent-server 源码不再出现 `../../../packages/core`。
- 测试与运行脚本支持新的 import 解析。

**依赖**：无。

## P2 — 运行时与 UX 增强

### 7. LLMClient 真实流式接口

**现状**：`LLMClient.complete()` 返回完整结果，`AgentRuntime` 人工发出 `start + 单次 delta + end`，桌面端看到的是伪流式。

**验收标准**：

- `LLMClient` 暴露统一 `AsyncIterable<LLMStreamEvent>` 或等价接口。
- `VercelClient` 使用 AI SDK streaming API。
- `AgentRuntime` 直接转发 token delta 与 tool call 事件。
- fake provider 测试覆盖多段 delta 顺序。
- 桌面端能看到 token 级 streaming（至少 5 段 delta）。

**依赖**：会话路由 / 编排 / 持久化拆分已完成。

### 8. SettingsBackedLLMClient 热路径缓存

**现状**：每次 `complete()` 都同步读取 `~/.spotAgent/settings.json` 并重建 `VercelClient`。

**验收标准**：

- 引入 mtime 或短 TTL 缓存。
- settings 未变化时复用 `VercelClient`。
- 测试覆盖 100 次 complete 中实际读盘次数小于等于 2。

**依赖**：无。

### 9. workspace.askUser tool

**现状**：`workspace.list` 已落地；`workspace.askUser` 暂未实现。当前 file tool description 已提示“模糊时调 `workspace.askUser`”，但 registry 中没有这个 tool。

**用户场景**：多个 workspace 都可能匹配时，LLM 能让用户在 SessionWindow 内选择目标 workspace。

**验收标准**：

- 新增 `workspace.askUser({ prompt, candidateIds? })`。
- SessionWindow 复用内联气泡显示候选 workspace。
- 用户取消或超时返回 `{ cancelled: true }`。
- 同一 session 内多个询问串行展示。
- 在 `file.read/write` description 中保留该 tool 的使用指引。

**依赖**：权限气泡 UI 可作为交互样式参考。

### 10. 权限规则管理 UI 与端到端验证

**现状**：`FilePermissionPolicy`、`SessionPermissionBridge`、`AgentRuntime` 权限拦截、`SessionSocketClient` 解码、`SessionWindowView` 内联气泡都已实现。剩余风险在 UI 端到端验证和永久规则管理。

**验收标准**：

- 手工验证 `once / session / always / deny / timeout / close session` 全路径。
- Settings 增加权限规则列表，支持查看和撤销 `~/.spotAgent/permissions.json` 中的永久规则。
- UI 中展示 toolName、关键参数摘要、decision、createdAt。

**依赖**：无。`session` scope 已按 `sessionId` 隔离并在 socket 关闭时清理。

### 11. 会话历史入口补齐

**现状**：后端 `list/load/delete` 已实现，SessionWindow 左侧历史侧栏已落地；PromptPanel 最近会话 action 与独立历史窗口未实现。

**验收标准**：

- PromptPanel action 列表支持最近会话过滤和恢复。
- 独立历史窗口支持搜索、预览、恢复、删除。
- 删除前二次确认。
- 多窗口恢复同一会话时行为明确，避免状态漂移。

**依赖**：无。

## P3 — 长期能力

### 12. 多 provider LLM 支持

**现状**：生产路径只有 `VercelClient`，OpenAI 兼容 API 通过 `responses/chat/completion` 切换。

**验收标准**：

- 抽出 `LLMClientFactory`。
- settings 支持 provider 字段。
- 至少接入第二个 provider 验证消息、stream、tool call 归一化。
- provider capability 显式声明是否支持 tool calling / multimodal / streaming。

**依赖**：建议在真实 streaming 和多模态 content part 后做。

### 13. 用户自定义 tool / 插件系统

**现状**：所有 tool 都是 builtin，随代码构建。

**验收标准**：

- 设计插件 manifest、安装目录、启停机制、权限声明和冲突规则。
- 第一版可以只支持本地目录插件。
- 插件崩溃/超时不拖垮 agent-server。
- 与 workspace 沙箱和权限审批系统对齐。

**依赖**：权限 UI、workspace askUser、tool 注册边界稳定后再启动。

## 手工验证清单入口

端到端验证步骤见 [manual-qa.md](/Users/mu9/proj/handAgent/docs/manual-qa.md)。每次完成以上条目后，应同步更新本文件和对应模块 `<dir>.md`。
