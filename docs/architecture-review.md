# 架构 Review 与改进建议

本文基于对当前仓库 Swift 与 TypeScript 全量代码的通读结果，按"职责分离 / 单元可测 / 迭代友好"三个目标维度，列出值得优先处理的结构性问题与对应的改造建议。每一项都尽量给出"现状 → 问题 → 建议改法 → 验收方式"四要素，便于直接转化为 PR。

> 阅读顺序：先看 §0 总览，再按优先级 P0–P3 阅读具体条目。文中所有"模块文档"链接都指向递归式文档结构里的对应 `<sub>.md`。

---

## 0. 总览

### 0.1 当前代码的整体观感

正面：

- 分层清晰：`apps/desktop` ↔ `apps/agent-server` ↔ `packages/core` 三段式，core 不依赖宿主，platform 抽象通过 `RemotePlatformAdapter + PlatformBridge` 反向 IPC 落到桌面，核心约束没有被打穿。
- 桌面端 SwiftUI 已统一切到 `@Observable` + MVVM + ViewModifier 四件套，`AppCoordinator` 用 `Action` 单向流，避免了散落的 NotificationCenter / 单例状态。
- 协议层 `SessionMessage`、tool 协议、permission 协议、storage 协议都已经显式定义为 TS 判别联合或 interface，跨进程协作的"合约面"是有的。

负面（驱动本文的根因）：

- **职责仍偏重**：`AppCoordinator`（247 行）已接入 DI / presenter / health / capture coordinator，但仍持有窗口索引、状态气泡路由与 AppKit 细节；`SessionManager`（208 行）已抽出 `MessageTranslator`，但仍同时做协议路由、持久化与 runtime 编排。
- **协议表面与运行时仍有不对齐**：`tool_message` 与 `permission_request.arguments` 已接通；剩余主要是"伪流式" assistant_message_delta、图片附件当前只进入 Blob/Stub 且尚未接入 vision 解读工具、平台 RPC 与会话协议混在同一个 `SessionMessage` union。
- **缓存边界**：`FilePermissionPolicy.cache` / `FileWorkspaceRegistry.cache` 一次性加载、不监听文件；Settings 修改 workspace 或撤销权限后，agent-server 重启前看不到。
- **安全盲区**：~~`FileWriteTool.resolveWritePathWithinWorkspace` 仅 realpath 父目录，basename 是 symlink 时可越狱写到 workspace 外。~~（已修：写前 lstat 检查 basename + 10 MiB 上限 + `.tmp → rename` 原子写，详见 §5.1）

### 0.2 改进路线建议（按依赖顺序）

已完成的基础项：

1. `FileWriteTool` symlink 越狱修复（§5.1）。
2. `tool_message` 真实 emit 与 `permission_request.arguments` 透传（§3.1、§3.2）。
3. `AppServices` DI 容器与测试替身（§1.1）。
4. `defineTool({...})` + zod schema 单一源（§4.1）。
5. `session` scope 权限按 `sessionId` 隔离（§4.4）。

当前优先级：

1. 图片附件多模态消息与 PromptPanel 区域圈选 SCK 化。
2. 缓存失效策略统一（§4.3）与 settings 热路径缓存（§4.2）。
3. 拆 `AppCoordinator` / `SessionManager`（§1.2、§1.3）。
4. 给 `LLMClient` 真实流式接口（§3.3）。
5. 收敛 `SessionMessage` 的协议混用（§2.2）与跨包 path alias（§2.1）。

---

## 1. 职责分离

### 1.1 `AppServices` DI 锚点（已完成基础版）

**现状**：`AppServices` 已成为生产组合根，持有 `agentServer`、`sessionRegistry`、`settingsStore`、`platformBridgeFactory`、`hotkeyRegistrar`、window presenter、fatal alert presenter 与激活策略注入点。`AppCoordinator.init(services:)` 已落地，测试用 `AppServices.testing()` 注入 nop 替身，不再使用 `skipServerStart`。

**剩余建议**：

1. 随后续拆分把 `sessionWindowPresenter` / `settingsWindowPresenter` 进一步收敛为 `SessionLifecycle` / `SettingsLifecycle`。
2. 给 `AppServices.testing()` 暴露更多可选替身参数，减少测试里手写生产依赖。
3. 补一个轻量 `AppServices` 装配测试，覆盖默认 init 不抛异常。

---

### 1.2 `AppCoordinator` 仍偏重

**现状**：247 行，已经把服务创建下沉到 `AppServices`，把 agent-server 健康监听抽到 `AgentServerHealth`，把采集串联抽到 `PromptCaptureCoordinator`，窗口构造通过 presenter 注入。但 Coordinator 仍直接 `import AppKit`、持有 `NSWindow` 字典、处理 settings/session 窗口生命周期与状态气泡回跳。

**问题**：

- 任何"新增一种入口 / 新增一类窗口"都要改 Coordinator；
- 窗口 presenter 内部仍使用 `NotificationCenter.default.addObserver(...)` 且不持有 token；
- 不易做窗口生命周期的单元测试。

**建议改法**：继续把"窗口生命周期 + registry 更新 + activation policy 更新"抽到生命周期对象，例如：

```swift
@MainActor
final class SessionLifecycle {
    func open(prompt: PromptSubmission, startupError: String?) -> String
    func close(sessionId: String)
    func focus(sessionId: String) -> Bool
}
```

`SettingsLifecycle` 同理持有 settings window 与 open/focus/close 逻辑。Coordinator 只路由 `Action`，不保存 `NSWindow`。

**验收**：

- `AppCoordinator` 行数 < 200，无 `import AppKit` 中的 `NSWindow` / `NSHostingController` / `NSAlert` 直接构造调用。
- `SessionLifecycleTests` / `SettingsLifecycleTests` 覆盖窗口生命周期与激活策略更新；`AppCoordinatorTests` 用 fake lifecycle 覆盖路由逻辑。

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

### 2.1 跨包相对路径，没有真实"包"边界

**现状**：`apps/agent-server/src/SessionRouter.ts` / `SessionRuntimeOrchestrator.ts` / `SessionPersistence.ts` 等使用 `../../../packages/core/src/...` 这样的相对路径直接 reach into core。

**问题**：

- core 内部任何文件位置变化都会破坏 agent-server。
- agent-server 也可以"绕过 core 的公开 API"直接拿到内部实现细节，违背封装。
- TS path 没法用别名 import（`@handagent/core`），IDE 跳转和重构都打折扣。

**建议改法**：

1. 在仓库根 `tsconfig.base.json` 增加 `paths: { "@core/*": ["packages/core/src/*"] }`。
2. 让 `packages/core/package.json` 的 `exports` 字段显式声明对外 API 入口（`./runtime`、`./protocol`、`./tools` 等），其它路径不导出。
3. agent-server 全部相对 import 改为 `@core/...`。

**验收**：

- `apps/agent-server/src/**/*.ts` 不再出现 `../../../packages` 字样。
- 改动 core 内部子目录布局不再连带 agent-server。

---

### 2.2 `SessionMessage` 把会话与平台 RPC 混在同一个 union

**现状**：`SessionMessage` 既是会话协议，又是平台反向 RPC 协议（`platform_request` / `platform_response` / `platform_bridge_hello`），混用 `sessionId = "_platform"` 作为标记。

**问题**：

- `server.ts` 不得不在每条 message 上 if-else 判断"是否平台帧"。
- `SessionListEntry`、`UserMessageAttachment` 等只跟会话有关的辅助类型也得跟着 protocol 文件变动，影响心智边界。

**建议改法**（任选其一）：

- 方案 A：拆成 `protocol/SessionMessage.ts` + `protocol/PlatformBridgeMessage.ts`，复用同一 socket 但在外层加 `channel: "session" | "platform"` 字段。
- 方案 B：保留单 union，但把 `_platform` 这种魔法 sessionId 抽成 `kind: "platform" | "session"` 显式字段，并在 `server.ts` 用 exhaustive switch 分派。

倾向方案 A：分两个 union 后两边的判别 narrowing 更干净。

**验收**：

- `apps/agent-server/src/server.ts` 的 message 派发不再依赖魔法字符串。
- 新增反向 IPC 方法时不会让 `SessionMessage` 文件膨胀。

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

### 3.3 "伪流式"消息

**现状**：`AgentRuntime.runWithMessages` 在每轮 `LLMClient.complete` 返回后，把整段 assistant 文本拆成 `start + 一次 delta + end` 发出来。

**问题**：

- 与协议的"流式"语义不符；
- desktop UI 没法做真正的 token streaming 体验；
- 后续接 Anthropic / Ollama 等 provider 时也仍然要"先攒再放"，丧失流式优势。

**建议改法**：

1. 把 `LLMClient.complete` 重命名为 `LLMClient.run`，签名变为返回 `AsyncIterable<LLMStreamEvent>`：`text-delta` / `tool-call` / `done`。
2. `VercelClient` 改用 `streamText`，把 SDK 的事件流映射为统一事件。
3. `AgentRuntime` 里直接转发 stream，不再合成假 delta。

这是 TODO 8.1 的扩展，建议把"流式"也并入 `LLMClient` 抽象重做。

**验收**：

- `bash ./scripts/test.sh` 中新增 `runtime-stream.test.ts` 用 fake provider 输出多段 token，runtime 按顺序 emit `text-delta`。
- desktop 上看到 token 级 streaming（>= 5 段 delta）。

---

### 3.4 图片附件未真实进多模态消息

**现状**：`MessageTranslator.composeUserContent` 会把 `UserMessageAttachment.image` 写入 BlobStore，并在 user message 中插入空 body 的 image STUB。原始 base64 不进入 LLM 上下文，LLM 看到的是 blob 引用而非图像内容。

**问题**：用户 captureRegion 之后，原始图像字节已可回读，但 LLM 还没有 vision / `image.describe` 工具把 blob 转成文本事实。这仍是 TODO 2.x 的 last mile 缺口。

**建议改法**：

1. 增加 `image.describe` / vision tool，按 blobId 读取图像并输出文本描述，输出继续走 `cached` 生命周期。
2. 或把 `AgentMessage.user.content` 从 `string` 升级为 `string | AgentContentPart[]`（`{ type: "text" } | { type: "image"; mimeType; base64 }`），由 `VercelAdapters.toVercelMessages` 映射到 SDK 多模态消息。
3. 两条路径都必须保持“屏幕 / 文件 / 剪贴板上下文不默认注入”的产品边界，只能处理用户主动提供的图片附件或 LLM 显式 tool 读取结果。

**验收**：

- 截屏后让 LLM 描述图片内容，应能给出真实描述（不再是占位字符串）。
- `runtime.test.ts` 增加多模态 fake provider case。

---

## 4. 测试与可演化性

### 4.1 builtin tool 模板代码（已完成基础版）

**现状**：`defineTool({ name, description, inputSchema, run })` 已落地，builtin tool 已改为 zod schema 单一源并自动生成 JSON Schema。当前生产注册 10 个 builtin tool：7 个平台类 + `workspace.list` + `file.read` + `file.write`。

**剩余问题**：tool 工厂已解决大部分样板，但运行时输入校验失败的错误文案和测试覆盖还可以继续补强。

**已完成**：

- `packages/core/src/tools/defineTool.ts` 提供工厂。
- `packages/core/src/tools/builtins/*.ts` 使用 zod schema。
- `packages/core/src/tools/tools.md` 已补 tool 编写约束。

**后续验收**：

- `register-builtins.test.ts` 增加输入校验失败用例（zod 抛错路径）。

---

### 4.2 settings 同步 IO 在 LLM 热路径

**现状**：`SettingsBackedLLMClient.complete` 每次调用都 `existsSync + readFileSync`，并新建 `VercelClient` 实例。

**问题**：

- 同步 IO 阻塞 event loop；
- HTTP keep-alive、ai-sdk 内部缓存全部废弃。

**建议改法**：

1. 引入 `loadModelSettingsCached(homeDir, mtimePolicyMs = 1000)`：维护 mtime + 上次内存值，间隔内不读盘。
2. `SettingsBackedLLMClient` 维护一个 `client + lastSettingsHash`，settings 不变时复用。
3. desktop 侧仍可保留 500ms 轮询写盘策略（保持"改完即生效"），但读盘开销不再 N 倍放大。

**验收**：

- `vercel-client.test.ts` 增加"100 次 complete 期间，loadModelSettings 实际只走盘 ≤ 2 次"。

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

**已修**：`FilePermissionPolicy.sessionRules` 的 key 已改为 `${sessionId}::${argHash}`，`server.ts` 在 socket 关闭时调用 `permissionPolicy.clearSessionRules(boundSessionId)` 清理对应会话规则。`file-permission-policy.test.ts` 覆盖了两个 sessionId 互不影响与定向清理。

**剩余建议**：

- 继续补 desktop 端权限气泡的手工端到端验证。
- Settings 增加永久权限规则查看 / 撤销 UI。

---

## 5. 安全与可靠性

### 5.1 `FileWriteTool` 的 symlink 越狱盲区（已修）

**已修**：`FileWriteTool.call` 在写入前 `lstat(absolutePath)`，basename 若为 symlink 直接拒绝；同步加上 10 MiB 写入上限和 `.tmp → rename` 原子写，避免半截文件可见。`file-tools.test.ts` 新增 "Refuse to write through symlink" 与 "exceeds size cap" 两个用例。

**保留参考（原现状）**：`resolveWritePathWithinWorkspace` 只对 `dirname(filePath)` realpath，`basename` 是 symlink 时 `writeFile` 会跟随 symlink 把内容写到 workspace 外，用户只要在 workspace 内放一个指向 `/etc/passwd` 的符号链接就能让 LLM 写出 workspace。

---

### 5.2 `WebSocketPlatformBridge` 单 bridge / 单 session 假设

**现状**：

- `attach(send)` 静默覆盖前一个 send，第二个 desktop 连接会偷走 bridge。
- `server.ts` 的 `boundSessionId` 一旦设定就不再变，单 socket 多 session 切换不可用。

**问题**：未来"多窗口同时连"或"重连恢复"会撞墙。

**建议改法**（轻量）：

1. `attach` 增加 fencing token，新 attach 用更高 token 才覆盖；旧 socket 收到 disconnect 通知。
2. `boundSessionId` 改为 `boundSessionIds: Set<string>`，每条 `user_message` 都尝试 bind。

**验收**：

- 新增 `WebSocketPlatformBridge.test.ts` 多 attach 场景：第二次 attach 后第一条 socket 收到 detach 通知。

---

### 5.3 `AgentServerService` 的回调线程模型

**现状**：`final class @unchecked Sendable`，回调通过 `DispatchQueue.main.async`，外部再 `Task { @MainActor in ... }`。

**问题**：双层切线程没必要、不易看出契约。

**建议改法**：把整个 `AgentServerService` 标 `@MainActor`，回调 `@MainActor () -> Void`，调用方就不用再嵌一层 `Task`。`Process` 操作仍然内部用 `DispatchQueue` 跑，回调切回 main 即可。

---

### 5.4 `NotificationCenter` 观察者未释放

**现状**：`AppCoordinator.handleSubmitPrompt` / `openOrFocusSettingsWindow` 用 `NotificationCenter.default.addObserver(forName:...)` 但不持有返回的 token。窗口销毁后通知中心仍持有闭包到下次 GC。

**建议改法**：用 `NSWindowDelegate.windowWillClose` 替换，或保留 token 到 `[NSObjectProtocol]` 数组并在 `sessionClosed` / `settingsWindowClosed` 时 remove。

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

完成上面 P0 + P1 后预期达到：

- `AppCoordinator` 保持在 200 行以内，agent-server 会话链路按 Router / Orchestrator / Persistence / Translator 分层，新功能进得去、拿得出；
- 单元测试可以 mock 整条链路：DI 容器交给 fake services，runtime 通过 fake LLMClient + fake ToolRegistry 跑；
- `tool_message` / `permission_request.arguments` 在 desktop 上肉眼可见，体验追上参考的 claude-code；
- 添加新 builtin tool 在 30 行以内（schema + run），不再有重复 class；
- 添加新 LLM provider 在 100 行以内，不需要碰 runtime 或 agent-server 会话路由；
- workspace / 权限规则实时反映文件变化，不需要重启 agent-server。

P2 / P3 则是为"插件系统"、"多 provider"、"多窗口 / 多 session 复用 socket"等长期能力打地基，可以按 TODO 路线图节奏推进。
