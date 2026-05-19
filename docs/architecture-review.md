# 架构 Review 与改进建议

本文基于对当前仓库 Swift 与 TypeScript 全量代码的通读结果，按"职责分离 / 单元可测 / 迭代友好"三个目标维度，列出值得优先处理的结构性问题与对应的改造建议。每一项都尽量给出"现状 → 问题 → 建议改法 → 验收方式"四要素，便于直接转化为 PR。

> 阅读顺序：先看 §0 总览，再按优先级 P0–P3 阅读具体条目。文中所有"模块文档"链接都指向递归式文档结构里的对应 `<sub>.md`。

---

## 0. 总览

### 0.1 当前代码的整体观感

正面：

- 分层清晰：`apps/desktop` ↔ `apps/agent-server` ↔ `packages/core` 三段式，core 不依赖宿主，platform 抽象通过 `RemotePlatformAdapter + PlatformBridge` 反向 IPC 落到桌面，核心约束没有被打穿。
- 桌面端 SwiftUI 已统一切到 `@Observable` + MVVM + ViewModifier 四件套，`AppCoordinator` 用 `Action` 单向流，避免协调逻辑散落到 NotificationCenter / 单例状态。
- 协议层 `SessionMessage`、tool 协议、permission 协议、storage 协议都已经显式定义为 TS 判别联合或 interface，跨进程协作的"合约面"是有的。

负面（驱动后续 TODO 的根因）：

- **产品闭环进展**：图片附件已写入 Blob/Stub，SessionWindow 已展示当前与历史用户气泡的附件摘要，agent-server 会在调用 runtime 前把 image STUB 展开为 LLM 多模态 content part。
- **协议表面与运行时仍有不对齐**：`tool_message`、`permission_request.arguments` 与真实 assistant token delta 已接通；剩余主要是 `interrupt` 帧未处理。平台 RPC 与会话协议的混用已通过 `PlatformBridgeMessage` 拆分修正。
- **缓存边界**：workspace / permission 文件缓存已通过文件戳刷新；`SettingsBackedLLMClient` 已按 settings 文件戳缓存并复用 `VercelClient`；tool registry 也已通过 `SettingsBackedToolRegistry` 在每轮 user message 前按 settings 文件戳刷新。
- **可靠性盲区**：生产窗口 presenter 已通过 `WindowCloseObservation` 持有并释放关闭 observer token；`WebSocketPlatformBridge` 已用 fencing token 处理重复 attach 与旧 socket 关闭。
- **能力暴露早于实现**：`ocr.read` / `accessibility.snapshot` / `accessibility.action` 已注册为 builtin tool，但 macOS provider 仍返回 `not_implemented`。

### 0.2 改进路线建议（按依赖顺序）

已完成的基础项：

1. `FileWriteTool` symlink 越狱修复（§5.1）。
2. `tool_message` 真实 emit 与 `permission_request.arguments` 透传（§3.1、§3.2）。
3. `AppServices` DI 容器与测试替身（§1.1）。
4. `defineTool({...})` + zod schema 单一源（§4.1）。
5. `session` scope 权限按 `sessionId` 隔离（§4.4）。

当前优先级：

1. `workspace.askUser` tool。
2. 补会话 `interrupt` / Stop。
3. 权限规则管理 UI 与端到端验证。

---

## 1. 职责分离

### 1.1 `AppServices` DI 锚点（已完成基础版）

**现状**：`AppServices` 已成为生产组合根，持有 `agentServer`、`sessionRegistry`、`settingsStore`、`platformBridgeFactory`、`hotkeyRegistrar`、window presenter、fatal alert presenter 与激活策略注入点。`AppCoordinator.init(services:)` 已落地，测试用 `AppServices.testing()` 注入 nop 替身，不再使用 `skipServerStart`。

**剩余建议**：

1. 给 `AppServices.testing()` 暴露更多可选替身参数，减少测试里手写生产依赖。
2. 补一个轻量 `AppServices` 装配测试，覆盖默认 init 不抛异常。
3. 继续补一个轻量 `AppServices` 装配测试，覆盖默认生产组合根可构造。

---

### 1.2 `AppCoordinator` 拆分（已修）

**已修**：`AppCoordinator.swift` 当前 188 行，已移除 `import AppKit`，不再持有 `NSWindow` 字典或直接构造窗口 / alert。会话窗口生命周期下沉到 `SessionLifecycle`，设置窗口生命周期下沉到 `SettingsLifecycle`，采集串联下沉到 `PromptCaptureCoordinator`，agent-server 健康状态下沉到 `AgentServerHealth`。

**测试覆盖**：

- `SessionLifecycleTests` 覆盖 open / close / focus / closeAll 与激活策略更新。
- `SettingsLifecycleTests` 覆盖 openOrFocus / handleClosed。
- `AppCoordinatorTests` 通过 `AppServices.testing()` 覆盖设置窗口、会话创建、server 不可用、bootstrap 启动。

**已收尾**：生产窗口 presenter 的关闭 observer 已收敛到 `WindowCloseObservation`，由 presenter 持有 token 并在首次关闭通知时释放；该问题不再属于 Coordinator 职责拆分风险。

---

### 1.3 `SessionManager` 也是 god class（已修）

**原状**：单文件接管 `list_sessions_request` / `load_session_request` / `delete_session_request` / `user_message`，并：构造 prompt、调 `AgentRuntime.runWithMessages`、把 runtime 事件翻译为 `SessionMessage`、把 messages / events 写入 `SessionStore`、生成会话标题、合成 `composeUserContent`、转换 `agentMessagesToConversation`。

**已修**：会话侧已拆为四个边界明确的模块：

| 模块 | 职责 |
|------|------|
| `SessionRouter` | 只做 `SessionMessage` 路由：根据 `type` 调用对应 handler |
| `SessionRuntimeOrchestrator` | 跑 `AgentRuntime`，把 runtime 事件交给 `MessageTranslator` 后推送 / 审计 |
| `SessionPersistence` | 写消息 / 写事件 / 标题 / 历史读取 |
| `MessageTranslator` | `AgentMessage` ↔ `ConversationMessage` 与 `UserMessageAttachment` ↔ user content |

**验收**：

- `SessionManager.test.ts` 已拆为 `SessionRouter.test.ts` / `SessionRuntimeOrchestrator.test.ts` / `SessionPersistence.test.ts` / `MessageTranslator.test.ts`。
- 新增 `tool_message` emit 只需改 `MessageTranslator`。

---

### 1.4 `apps/desktop/Sources/AppServices/AgentSettings/AgentSettingsView.swift` 的位置错配

**现状**：View 文件在 `AppServices/AgentSettings/`，但 ViewModel 在 `Sources/Settings/`。`app-services.md` 自己也注释这是历史遗留例外。

**建议改法**：在下次 settings 相关改动里把 `AgentSettingsView.swift` 搬到 `Sources/Settings/`，让 `AppServices/AgentSettings/` 只剩 `AgentSettingsStore.swift`（数据层）。

---

## 2. 模块边界

### 2.1 跨包相对路径，没有真实"包"边界（已修）

**已修**：`packages/core` 已声明为 `@handagent/core` workspace 包，并通过 `exports` 把 `./*` 映射到 `./src/*`。`apps/agent-server` 依赖 `@handagent/core: workspace:*`，源码与测试统一使用 `@handagent/core/...` import，不再通过 `../../../packages/core/src/...` reach into core。

**修复效果**：

- agent-server 的 core 依赖变成 package-level alias，路径意图更清晰；
- 生产运行仍兼容 `node --experimental-transform-types --experimental-specifier-resolution=node apps/agent-server/src/server.ts`；
- `scripts/test.sh` 纳入 `path-alias.test.ts`，防止相对 reach-in 回归。

**测试覆盖**：

- `apps/agent-server/src/path-alias.test.ts` 扫描 agent-server 源码，断言不再出现 `../../../packages/core`。
- 额外手工验证 Node 可直接 import `apps/agent-server/src/server.ts` 并解析 `@handagent/core`。

---

### 2.2 `SessionMessage` 把会话与平台 RPC 混在同一个 union

**已修**：平台反向 RPC 已从 `SessionMessage` 拆分到 `PlatformBridgeMessage`，外层使用 `channel: "platform"` 显式分流，不再依赖 `sessionId = "_platform"`。

**结果**：

- `server.ts` 先按 `channel` 识别平台帧，再进入 session 分派。
- `SessionMessage.ts` 只保留会话 / 历史 / 权限审批相关帧。
- Swift `PlatformBridgeService` 与 TS `WebSocketPlatformBridge` 都对齐新的平台 envelope。

**验收**：

- `apps/agent-server/src/server.ts` 的 message 派发不再依赖魔法字符串。✅
- 新增反向 IPC 方法时不会让 `SessionMessage` 文件膨胀。✅

---

## 3. 协议与运行时一致性

### 3.1 `tool_message` 在协议里定义了，但 server 从不 emit（已修）

**已修**：`MessageTranslator.toSessionMessage` 现在把 runtime 的 `tool_call` 翻译为 `tool_message(status: "running")`，把 `tool_result` 翻译为 `tool_message(status: "completed" | "failed")`，两条共享 `${sessionId}-${toolCallId}` 作为 messageId。`AgentRuntime` 的 `tool_result` 事件加上了 `toolName` 字段，方便 server 直接拼到 `payload.name`。`MessageTranslator.test.ts` 覆盖 tool frame 翻译，`SessionRuntimeOrchestrator.test.ts` 覆盖实时推送。

**未做**：`permission_decision` 仍未单独转成 `SessionMessage`；当前由 `permission_request` / `permission_response` 一对协议覆盖，等到有 UX 需要再补。

---

### 3.2 `permission_request.arguments` 在 desktop 侧被吞（已修）

**已修**：`SessionSocketClient.swift` 在解码 `permission_request` 时调用新增的 `extractPermissionArgumentsJSON`，从原始 JSON 二次解析 `payload.arguments` 并以 sortedKeys + prettyPrinted 输出 JSON 字符串，透传给 `SessionPermissionRequest.argumentsJSON`；`SessionWindowView` 在气泡里以等宽字体展示参数 JSON。`SessionSocketClientTests` 覆盖了正常 payload 与缺省 payload 的回退场景。
- `SessionViewModelTests` 增加 arguments 透传 case。

---

### 3.3 "伪流式"消息（已修）

**原状**：`AgentRuntime.runWithMessages` 在每轮 `LLMClient.complete` 返回后，把整段 assistant 文本拆成 `start + 一次 delta + end` 发出来。

**问题**：

- 与协议的"流式"语义不符；
- desktop UI 没法做真正的 token streaming 体验；
- 后续接 Anthropic / Ollama 等 provider 时也仍然要"先攒再放"，丧失流式优势。

**已修**：

1. `LLMClient` 主接口改为 `stream(...): AsyncIterable<LLMStreamEvent>`，事件包含 `text_delta` / `tool_call` / `message_end`。
2. `VercelClient` 改用 AI SDK `streamText().fullStream`，把 SDK `text-delta` / `tool-call` 归一化为 core 事件。
3. `AgentRuntime` 直接消费 stream，把每段 `text_delta` 转发为 `assistant_message_delta`；legacy `complete()` fake 仅通过 helper 兼容。

**测试覆盖**：

- `bash ./scripts/test.sh` 中新增 `runtime-stream.test.ts` 用 fake provider 输出多段 token，runtime 按顺序 emit `text-delta`。
- `vercel-client.test.ts` 覆盖 AI SDK `fullStream` 中的 text delta 与 tool call 映射。

---

### 3.4 图片附件多模态消息（已修）

**已修**：`MessageTranslator.composeUserContent` 仍会把 `UserMessageAttachment.image` 写入 BlobStore，并在持久化 user message 中插入空 body 的 image STUB；原始 base64 不进入会话历史。`SessionRuntimeOrchestrator` 调用 runtime 前会通过 `agentMessagesToRuntimeMessages()` 把 image STUB 展开为 `{ type: "image"; blobId; mimeType }` content part，`AgentRuntime` 把注入的 `BlobStore` 透传给 `LLMClient.stream()`，`VercelAdapters.toVercelMessages()` 再读取 blob bytes 并映射为 AI SDK image part。

**边界**：

- 只处理用户主动提交的图片附件；屏幕、窗口、剪贴板等上下文仍不会默认注入模型。
- 持久化层仍保存 STUB 文本，避免把 base64 或二进制内容写入 session JSON。
- `api = "completion"` 会在遇到 image content 时提前报错，要求改用 `chat` 或 `responses`。
- network logger 会脱敏 AI SDK image payload 与 `data:image/*` 字符串。

**测试覆盖**：

- `MessageTranslator.test.ts` 覆盖 image STUB → runtime 多模态 parts。
- `SessionRuntimeOrchestrator.test.ts` 覆盖 runtime 收到 typed image content、持久化仍保留 STUB。
- `runtime.test.ts` 覆盖 `BlobStore` 透传给 LLM client。
- `vercel-client.test.ts` 覆盖 blob 读取、AI SDK image part 映射、缺 blobStore / 缺 blob / 非 image blob / completion API 报错。
- `logging-fetch.test.ts` 覆盖 image payload 脱敏。

---

### 3.5 当前用户气泡附件摘要（已修）

**已修**：`SessionViewModel.sendPrompt(_:attachments:)` 本地追加 user bubble 时，会把 `UserMessageAttachmentPayload` 归一成 `SessionAttachmentSummary`，显示附件数量、类型与文本选区 / 图片占位信息。`session_snapshot` 与 `load_session_response` 恢复历史消息时，也会把持久化文本中的 `[选区]` 与 image `STUB` 解析为同样的附件摘要展示形态。

**修复效果**：

- 用户在当前窗口可确认本轮请求实际带了哪些附件；
- 当前本地回显与历史恢复消息的展示形态一致；
- 附件摘要仍可作为多模态链路的调试线索。

**测试覆盖**：

- `SessionViewModelTests.testSendPromptWithAttachmentsAddsUserBubbleAttachmentDisplayState`
- `SessionViewModelTests.testHistoricalUserMessagesNormalizeAttachmentDisplayState`

---

### 3.6 `interrupt` 协议帧未接入运行时

**现状**：`SessionMessage` 中已经定义 `interrupt`，但 `SessionRouter.receive` 未处理该分支，`SessionWindowView` 也没有 Stop 控件。

**问题**：

- 用户无法停止长耗时 LLM 请求或 tool 调用；
- 关闭窗口只是断开 socket，后端 run 仍可能继续落库；
- 后续真实 streaming 接入后如果没有 abort 语义，token / tool 事件仍会继续推送。

**建议改法**：

1. SessionWindow 运行态显示 Stop 控件，发送 `interrupt`。
2. agent-server 维护 sessionId → active run controller 映射。
3. `LLMClient` / `AgentRuntime` 支持 `AbortSignal`；无法硬取消的 tool 至少要在完成后丢弃已中断 run 的结果。

**验收**：

- interrupt 后不再追加 assistant/tool 消息，状态变为 interrupted 或 idle。
- 测试覆盖 LLM 进行中、tool 进行中、无 active run 三种分支。

---

## 4. 测试与可演化性

### 4.1 builtin tool 模板代码（已修）

**现状**：`defineTool({ name, description, inputSchema, run })` 已落地，builtin tool 已改为 zod schema 单一源并自动生成 JSON Schema。`create(deps).call(input)` 会在调用 `run` 前执行同一个 zod schema 的 `safeParse`，失败时返回包含 tool name 与字段路径的统一可读错误。当前生产注册 10 个 builtin tool：7 个平台类 + `workspace.list` + `file.read` + `file.write`。

**已完成**：

- `packages/core/src/tools/defineTool.ts` 提供工厂。
- `packages/core/src/tools/builtins/*.ts` 使用 zod schema。
- `packages/core/src/tools/tools.md` 已补 tool 编写约束。
- `packages/core/tests/define-tool.test.ts` 覆盖类型错误、缺必填、strict object 未知字段，以及 JSON Schema 输出不变。

---

### 4.2 settings 同步 IO 在 LLM 热路径（已修）

**现状**：`SettingsBackedLLMClient.stream` / `complete` 每次调用先读取 `~/.spotAgent/settings.json` 的 `mtimeMs + size` 文件戳；文件戳未变化时复用已缓存的 `VercelClient`，文件戳变化后重读 settings，并只在有效 LLM 配置变化时重建 client。

**修复效果**：

- settings 未变化时不再反复同步读盘；
- HTTP keep-alive 与 ai-sdk 内部缓存可随 `VercelClient` 实例复用；
- settings 写盘后下一次 `complete` 可见，保留热加载语义。

**测试覆盖**：

- `SettingsBackedLLMClient.test.ts` 覆盖 100 次 LLM 请求时 settings 读取次数小于等于 2、文件戳变化后重载并按有效配置决定是否重建 client、`summarizerModel` 路径与 network logger 透传。

---

### 4.2.1 tool settings 热加载与 UI（已修）

**现状**：`ToolSettings` 支持 `tools.allowlist / tools.denylist`，`registerBuiltinTools` 能按配置过滤 registry。`SettingsBackedToolRegistry` 已在 agent-server 启动时创建，并在每轮 user message 进入 runtime 前按 `settings.json` 文件戳刷新同一个 `ToolRegistry` 实例；Settings UI 已新增"工具"Tab，保存后下一轮 LLM 请求会看到最新工具列表。

**修复效果**：

- 用户可在 UI 中启停高风险 tool；
- `llm` 与 `tools` 共享同一个 `settings.json`，Swift store 写任一配置组都保留另一个配置组；
- denylist 保存后，下一轮 `LLMClient.stream(messages, tools)` 的 tools 不再包含对应 tool。

**测试覆盖**：

- `register-builtins.test.ts` 覆盖同一个 registry 随 settings 变化重新注册；
- `SettingsBackedToolRegistry.test.ts` 覆盖文件戳变化后刷新与 stamp 未变跳过；
- `SessionRuntimeOrchestrator.test.ts` 覆盖 runtime 前调用刷新钩子；
- `AgentSettingsStoreTests.swift` / `ToolSettingsViewModelTests.swift` 覆盖 tools denylist 保存、allowlist 保留和 UI view model 状态。

---

### 4.3 缓存永不失效

**现状**：

- `FilePermissionPolicy.cache: PersistedRule[] | null` 一次性加载，外部编辑或多进程共享时不会刷新。
- `FileWorkspaceRegistry.cache` 同样问题。

**问题**：用户在 desktop UI 改 workspace / 撤销永久权限后，agent-server 重启前看不到。

**建议改法**：两个文件统一用"mtime 检测 + 重读"策略：

```ts
private async loadIfChanged(): Promise<void> {
  const stat = await fs.stat(this.filePath).catch(() => null);
  if (!stat) { this.cache = []; this.cacheMtimeMs = 0; return; }
  if (stat.mtimeMs <= this.cacheMtimeMs) return;
  this.cache = JSON.parse(await fs.readFile(this.filePath, "utf8")).rules;
  this.cacheMtimeMs = stat.mtimeMs;
}
```

每次 `check / list / register` 调一次。

**验收**：

- `file-permission-policy.test.ts` 增加"外部修改文件后，下次 check 看到新规则"。

---

### 4.4 `session` scope 权限规则隔离（已修）

**已修**：`FilePermissionPolicy.sessionRules` 的 key 已改为 `${sessionId}::${argHash}`，`server.ts` 在 socket 关闭时遍历该 socket 绑定过的 `boundSessionIds`，逐个调用 `permissionPolicy.clearSessionRules(sessionId)` 清理对应会话规则。`file-permission-policy.test.ts` 覆盖了两个 sessionId 互不影响与定向清理，`server.test.ts` 覆盖同一 socket 多 session close 清理。

**剩余建议**：

- 继续补 desktop 端权限气泡的手工端到端验证。
- Settings 增加永久权限规则查看 / 撤销 UI。

---

## 5. 安全与可靠性

### 5.1 `FileWriteTool` 的 symlink 越狱盲区（已修）

**已修**：`FileWriteTool.call` 在写入前 `lstat(absolutePath)`，basename 若为 symlink 直接拒绝；同步加上 10 MiB 写入上限和 `.tmp → rename` 原子写，避免半截文件可见。`file-tools.test.ts` 新增 "Refuse to write through symlink" 与 "exceeds size cap" 两个用例。

**保留参考（原现状）**：`resolveWritePathWithinWorkspace` 只对 `dirname(filePath)` realpath，`basename` 是 symlink 时 `writeFile` 会跟随 symlink 把内容写到 workspace 外，用户只要在 workspace 内放一个指向 `/etc/passwd` 的符号链接就能让 LLM 写出 workspace。

---

### 5.2 `WebSocketPlatformBridge` 单 bridge / 单 session 假设（已修）

**已修**：

- `WebSocketPlatformBridge.attach(send)` 返回递增 fencing token；新 bridge attach 会把旧 token 下的 pending platform request 以 `PlatformBridgeOfflineError` 失败，错误原因包含 `desktop bridge replaced`。
- `detach(token)` 只在 token 仍是 current 时生效，旧 socket close 不会摘掉新 bridge。
- `call()` 把 pending request 绑定到创建时的 token；`handleResponse(payload, token)` 只处理 token 匹配的 pending request，旧 socket 晚到 response 会被忽略。
- `server.ts` 已抽出 `attachSessionSocketHandlers`，每个 socket 保存 `bridgeToken` 和 `boundSessions: Map<sessionId, bindingToken>`；同 socket 同 session 的后续 `user_message` 复用原 token，close 时只清理仍由该 socket token 持有的权限回流和 session-scope 规则，旧 socket close 不会删除新 socket 的同 session 绑定。

**测试覆盖**：

- `WebSocketPlatformBridge.test.ts` 覆盖重复 attach、旧 token detach、旧 token response 隔离。
- `server.test.ts` 覆盖同 socket 多 session 绑定 / close 清理，以及 bridge socket close 按 attach 返回 token detach。
- `SessionPermissionBridge.test.ts` 覆盖多 session 权限请求路由与单 session unbind 不影响其他 session。

---

### 5.3 `AgentServerService` 的回调线程模型

**现状**：`final class @unchecked Sendable`，回调通过 `DispatchQueue.main.async`，外部再 `Task { @MainActor in ... }`。

**问题**：双层切线程没必要、不易看出契约。

**建议改法**：把整个 `AgentServerService` 标 `@MainActor`，回调 `@MainActor () -> Void`，调用方就不用再嵌一层 `Task`。`Process` 操作仍然内部用 `DispatchQueue` 跑，回调切回 main 即可。

---

### 5.4 生产窗口 presenter 的 `NotificationCenter` 观察者释放（已修）

**已修**：`ProductionSessionWindowPresenter.present` 与 `ProductionSettingsWindowPresenter.present` 通过 `WindowCloseObservation` 监听 `NSWindow.willCloseNotification`。presenter 按窗口 `ObjectIdentifier` 持有观察器，首次关闭通知会先移除 observer token，再触发关闭回调并从 presenter 字典中移除。

**边界**：释放逻辑留在 presenter / lifecycle 边界内，没有倒灌回 Coordinator。

**测试覆盖**：

- `WindowCloseObservationTests` 覆盖单个窗口重复 close notification 只触发一次。
- `WindowCloseObservationTests` 覆盖 20 次关闭循环不会重复调用 close 回调，并验证 token 已释放。

---

### 5.5 OCR / Accessibility tool 已暴露但 macOS provider 未实现

**现状**：`registerBuiltinTools` 默认注册 `ocr.read`、`accessibility.snapshot`、`accessibility.action`，但 `MacPlatformProvider.handle` 对这三个 method 统一抛 `not_implemented`。

**问题**：

- LLM 在需要读图中文字或操作前台 App 时会自然选择这些 tool，但用户看到的是运行时失败；
- tool list 给模型的能力承诺大于实际能力；
- 端到端 QA 很难区分“模型不会调用”和“平台没实现”。

**建议改法**：

1. `ocr.read` 用 Vision / 系统 OCR 从用户主动提供图片或 `screen.capture` 结果识别文本。
2. `accessibility.snapshot` 用 Accessibility API 返回 frontmost app/window/element 树。
3. `accessibility.action` 至少支持 press / click / set_value，并在未授权时返回权限引导。
4. 如果短期不实现，应通过 tool settings 默认禁用未实现 tool，避免暴露给 LLM。

**验收**：

- 在真实 macOS App 上通过手工 QA 验证 OCR、snapshot、action 三条路径。
- 单元测试覆盖 provider 参数解析和错误映射。

---

## 6. 渐进式文档结构（已落地）

为了"AI / 新人 渐进披露"，本次同时建立了递归式文档结构。每个目录的 `<dir>.md` 只索引下一级，并解释边界与跨子模块关系，详细实现下沉到子目录的 `<sub>.md`。

```
AGENTS.md                         总索引、约定、产品边界
  └─ handAgent.md                 仓库总览 + 主调用链路 + DTO 索引
       ├─ apps/apps.md            apps 层总览（desktop + agent-server）
       │    ├─ apps/agent-server/agent-server.md
       │    └─ apps/desktop/desktop.md
       │         ├─ Sources/Coordinator/coordinator.md
       │         ├─ Sources/Theme/theme.md
       │         ├─ Sources/PromptPanel/prompt-panel.md
       │         ├─ Sources/SessionWindow/session-window.md
       │         ├─ Sources/StatusBubble/status-bubble.md
       │         ├─ Sources/Settings/settings.md
       │         └─ Sources/AppServices/app-services.md
       │              ├─ AgentServer/agent-server.md
       │              ├─ AgentSettings/agent-settings.md
       │              ├─ Hotkey/hotkey.md
       │              ├─ Lifecycle/lifecycle.md
       │              ├─ PlatformBridge/platform-bridge.md
       │              ├─ SelectionCapture/selection-capture.md
       │              └─ Session/session.md
       └─ packages/packages.md
            └─ packages/core/core.md
                 └─ packages/core/src/src.md
                      ├─ runtime/runtime.md
                      ├─ llm/llm.md
                      ├─ tools/tools.md
                      ├─ platform/platform.md
                      ├─ permission/permission.md
                      ├─ storage/storage.md
                      ├─ workspace/workspace.md
                      ├─ config/config.md
                      ├─ logging/logging.md
                      ├─ protocol/protocol.md
                      ├─ conversation/conversation.md
                      └─ selection/selection.md
```

阅读规则：

- 进入新模块前，先读对应同名 `.md`；要不要继续向下钻取由问题决定。
- 修改源码必须同步更新该目录的 `<dir>.md` 文件清单与索引；上层文档不需要逐文件列出。
- 协议字段、文件路径等"跨模块约定"必须在双方 `.md` 互相引用。

---

## 7. 改造后的目标手感

完成当前 P0 + P1 后预期达到：

- `AppCoordinator` 保持在 200 行以内，生产窗口 presenter 的关闭 observer 可释放，agent-server 会话链路按 Router / Orchestrator / Persistence / Translator 分层，新功能进得去、拿得出；
- 单元测试可以 mock 整条链路：DI 容器交给 fake services，runtime 通过 fake LLMClient + fake ToolRegistry 跑；
- `tool_message` / `permission_request.arguments` 在 desktop 上肉眼可见，体验追上参考的 claude-code；
- 添加新 builtin tool 在 30 行以内（schema + run），并有统一运行时入参校验；
- 添加新 LLM provider 在 100 行以内，不需要碰 runtime 或 agent-server 会话路由；
- workspace / 权限规则实时反映文件变化，不需要重启 agent-server；
- 未实现的平台 tool 不默认误导模型，或已经完成 OCR / Accessibility 最小闭环。

P2 / P3 则是为"插件系统"、"多 provider"、"多窗口 / 多 session 复用 socket"等长期能力打地基，可以按 TODO 路线图节奏推进。
