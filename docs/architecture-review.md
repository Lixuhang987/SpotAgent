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

- **职责过载**：`AppCoordinator`（419 行）与 `SessionManager`（agent-server 内）都吃了太多职责，新功能很难在不动它们的情况下加进去。
- **依赖注入断点**：上述两个枢纽对外暴露的注入点很少，子服务大多在 `init` 里直接 `new`，导致单元测试要么跳过整段链路（`skipServerStart`），要么需要起子进程。
- **协议表面与运行时实现不对齐**：`tool_message`、`status`、`interrupt`、`session_snapshot` 等协议变体是定义了但没人 emit；"伪流式" assistant_message_delta；图片附件被压成字符串占位；这些都会让上游误以为后端已经在做某事。
- **缓存与权限边界**：`FilePermissionPolicy.cache` / `FileWorkspaceRegistry.cache` 一次性加载、不监听文件；`session` 范围权限规则未按 sessionId 隔离。
- **安全盲区**：`FileWriteTool.resolveWritePathWithinWorkspace` 仅 realpath 父目录，basename 是 symlink 时可越狱写到 workspace 外。

### 0.2 改进路线建议（按依赖顺序）

P0（一周内可完成、收益最大）

1. 修 `FileWriteTool` symlink 越狱（§5.1）。
2. 把 `tool_message` 真实 emit，并把 `permission_request.arguments` 透传到 desktop（§3.1、§3.2）。
3. 把 `AppServices.swift` 真正激活成 DI 容器，让 `AppCoordinator(services:)` 接受外部注入（§1.1）。

P1（结构性收益）

4. 拆 `AppCoordinator`：抽 `SessionWindowFactory` / `SettingsWindowFactory` / `AgentServerHealth` 三个独立单元（§1.2）。
5. 抽 `defineTool({...})` 工厂，消灭 builtin tool 模板代码 + 用 zod / TypeBox 做 schema 单一源（§4.1）。
6. 拆 `SessionManager`：把"协议路由 / 持久化 / 翻译"分别独立成模块（§1.3）。

P2（持续演进）

7. 给 `LLMClient` 真实流式接口（§3.3），替换"假 delta"。
8. 缓存失效策略统一（§4.3）：要么换 watcher，要么用 mtime 校验。
9. 收敛 `SessionMessage` 的"协议混用"：把平台 RPC 拆成独立通道或独立类型族（§3.4）。

P3（架构演化）

10. 跨包发布边界：用 path alias（`@core/*`）替代 `../../packages/core/src/...` 相对路径（§2.1）。
11. 统一 settings 热加载机制：mtime + 内存 cache + 显式 invalidate API（§4.2）。

---

## 1. 职责分离

### 1.1 `AppServices.swift` 是空壳，但其实是关键 DI 锚点

**现状**：
```swift
// AppServices.swift
final class AppServices {
    let agentServerService: AgentServerService
    let sessionRegistry: SessionRegistry
    init(...) { ... }
}
```
该类目前没有任何调用方，`AppCoordinator.init` 直接 `AgentServerService()` / `SessionRegistry()` / `AgentSettingsStore()`。

**问题**：DI 入口缺失，Coordinator 无法注入测试替身（fake server / fake registry / fake store）；`skipServerStart` 这种"用布尔参数跳过整段 bootstrap"的方式，本质上是绕开测试，而不是支持测试。

**建议改法**：

1. 把 `AppServices` 升级为持有所有跨模块服务的 DI 容器（包括目前外置的 `AgentSettingsStore`、`PlatformBridgeService`、`MacSelectionCaptureProvider`、`MacRegionCaptureProvider`）。
2. `AppCoordinator.init` 改为 `init(services: AppServices, ...)`，默认参数提供生产实现，测试态可注入 fakes。
3. 删除 `skipServerStart`：测试用的 `services` 里直接给 stub `AgentServerService`。

**验收**：
- `AppCoordinatorTests` 不再依赖 `skipServerStart`，能通过注入 stub 验证 hotkey → SessionWindow 全链路。
- 新增 `AppServicesTests` 至少覆盖默认装配能跑通 init 不抛异常。

---

### 1.2 `AppCoordinator` 是 god object

**现状**：419 行，承担：服务持有、热键监听、PromptPanel / Settings / Session / StatusBubble 的窗口构造、SessionViewModel 工厂、attachment 翻译、激活策略切换、错误 alert、agent-server 监听、平台桥启停。

**问题**：

- 任何"新增一种入口 / 新增一类窗口"都要改 Coordinator；
- 窗口构造内嵌 `NotificationCenter.default.addObserver(...)`，token 不被持有，且对 `AppCoordinator` 形成隐式回调依赖；
- 不易做窗口生命周期的单元测试。

**建议改法**：把"造窗口 + 监听关闭 + 产出 ViewModel"抽为协议，例如：

```swift
@MainActor
protocol SessionWindowFactory {
    func makeWindow(viewModel: SessionViewModel,
                    onClose: @escaping (String) -> Void) -> NSWindow
}

@MainActor
protocol SettingsWindowFactory {
    func makeWindow(deps: SettingsViewDependencies,
                    onClose: @escaping () -> Void) -> NSWindow
}
```

`AppCoordinator` 只负责：路由 `Action`、保存当前 SessionViewModel 索引、把 attachment 翻译为 `UserMessageAttachmentPayload` —— 后两类工厂的具体 `NSWindow` / `NSHostingController` 细节都搬到 factory 实现。

同时把"agent-server 健康监听"独立成 `AgentServerHealth`（订阅 `onAvailabilityChange` / `onFatalError`，对外只暴露 `errorMessage` 和"显示致命 alert"），让 Coordinator 不再持有 `NSAlert` 构造逻辑。

**验收**：

- `AppCoordinator` 行数 < 200，无 `import AppKit` 中的 `NSWindow` / `NSHostingController` / `NSAlert` 直接构造调用。
- `SessionWindowFactoryTests` / `SettingsWindowFactoryTests` 单测各自的窗口配置；`AppCoordinatorTests` 用 fake factory 覆盖路由逻辑。

---

### 1.3 `SessionManager` 也是 god class

**现状**：单文件接管 `list_sessions_request` / `load_session_request` / `delete_session_request` / `user_message`，并：构造 prompt、调 `AgentRuntime.runWithMessages`、把 runtime 事件翻译为 `SessionMessage`、把 messages / events 写入 `SessionStore`、生成会话标题、合成 `composeUserContent`、转换 `agentMessagesToConversation`。

**问题**：单一文件做了"协议路由 + 持久化适配 + 翻译 + LLM 编排"，新增功能（例如真实流式、tool_message emit、image attachment 多模态化）都会进一步膨胀。

**建议改法**：拆为四个边界明确的模块：

| 新模块 | 职责 |
|------|------|
| `SessionRouter` | 只做 `SessionMessage` 路由：根据 `type` 调用对应 handler |
| `SessionRuntimeOrchestrator` | 跑 `AgentRuntime`，把 runtime 事件转 `SessionMessage`（含真实 streaming） |
| `SessionPersistence` | 写消息 / 写事件 / 标题 / 历史读取 |
| `MessageTranslator` | `AgentMessage` ↔ `ConversationMessage` 与 `UserMessageAttachment` ↔ user content |

`SessionManager` 退化为 `SessionRouter` 的实现，把后三者作为依赖。

**验收**：

- `SessionManager.test.ts` 拆为 4 个文件，每个文件只测一个责任。
- 新增 `tool_message` emit 不需要改其它模块。

---

### 1.4 `apps/desktop/Sources/AppServices/AgentSettings/AgentSettingsView.swift` 的位置错配

**现状**：View 文件在 `AppServices/AgentSettings/`，但 ViewModel 在 `Sources/Settings/`。`app-services.md` 自己也注释这是历史遗留例外。

**建议改法**：在下次 settings 相关改动里把 `AgentSettingsView.swift` 搬到 `Sources/Settings/`，让 `AppServices/AgentSettings/` 只剩 `AgentSettingsStore.swift`（数据层）。

---

## 2. 模块边界

### 2.1 跨包相对路径，没有真实"包"边界

**现状**：`apps/agent-server/src/SessionManager.ts` 等使用 `../../../packages/core/src/protocol/SessionMessage.ts` 这样的相对路径直接 reach into core。

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

**已修**：`SessionManager.toSessionMessage` 现在把 runtime 的 `tool_call` 翻译为 `tool_message(status: "running")`，把 `tool_result` 翻译为 `tool_message(status: "completed" | "failed")`，两条共享 `${sessionId}-${toolCallId}` 作为 messageId。`AgentRuntime` 的 `tool_result` 事件加上了 `toolName` 字段，方便 server 直接拼到 `payload.name`。`SessionManager.test.ts` 新增 "translates tool_call/tool_result events into tool_message frames" 用例。

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

**现状**：`SessionManager.composeUserContent` 把 `UserMessageAttachment.image` 拼成字符串占位 `[图片附件: image/png (id)]`，LLM 实际看不到字节。

**问题**：用户 captureRegion 之后 LLM 拿不到图，这是 TODO 2.x 的 last mile 缺口。

**建议改法**：

1. 把 `AgentMessage.user.content` 从 `string` 升级为 `string | AgentContentPart[]`（`{ type: "text" } | { type: "image"; mimeType; base64 }`）。
2. `VercelAdapters.toVercelMessages` 处理 `image` 部分映射到 SDK 的多模态消息。
3. `composeUserContent` 把 `image` 附件直接放进 content parts，不再字符串化。

**验收**：

- 截屏后让 LLM 描述图片内容，应能给出真实描述（不再是占位字符串）。
- `runtime.test.ts` 增加多模态 fake provider case。

---

## 4. 测试与可演化性

### 4.1 9 个 builtin tool 是模板代码

**现状**：每个 builtin tool 是独立 class，只持有一个 adapter 引用，转发一个方法。schema 全是手写 JSON Schema，与 TS 类型双向手动维护。

**问题**：新增 tool 写 80% 的样板；schema 与类型漂移没有自动检测。

**建议改法**：

1. 提供 `defineTool` 工厂：

```ts
export function defineTool<TInput, TOutput>(spec: {
  name: string;
  description: string;
  schema: ZodSchema<TInput>;
  run: (input: TInput) => Promise<TOutput>;
}): AgentTool<TInput, TOutput>
```

2. 引入 `zod` 或 `@sinclair/typebox` 作为单一 schema 源，运行时校验输入 + 自动转 JSON Schema。
3. 把 9 个 builtin 改为 `defineTool({...})` 调用，`builtins/` 目录下每个文件回到 1 个表达式 + 1 个 export 的级别。
4. 文档侧在 `tools/tools.md` 增补 tool 编写最佳实践。

**验收**：

- `tools/builtins/*.ts` 总行数下降 > 50%。
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

### 4.4 `session` scope 权限规则未按 sessionId 隔离

**现状**：`FilePermissionPolicy.sessionRules: Map<argHash, "allow" | "deny">`，没有 sessionId 维度。多会话并存时，A 会话的"本会话允许"会泄漏到 B 会话。

**建议改法**：把 key 改为 `${sessionId}::${argHash}`，并在 `bindSession`/`unbindSession`（agent-server 侧 `SessionPermissionBridge` 已有）时回调 `policy.dropSession(sessionId)`。

**验收**：

- `file-permission-policy.test.ts` 新增"两个 sessionId 互不影响"用例。

---

## 5. 安全与可靠性

### 5.1 `FileWriteTool` 的 symlink 越狱盲区

**现状**：`resolveWritePathWithinWorkspace` 只对 `dirname(filePath)` realpath，`basename` 是 symlink 时 `writeFile` 会跟随 symlink 把内容写到 workspace 外。

**问题**：用户只要在 workspace 内放一个指向 `/etc/passwd` 的符号链接就能让 LLM 写出 workspace。是当前最具体的安全缺口。

**建议改法**：

1. `writeFile` 前先 `realpath` 整个 path（要求文件已存在则 realpath 之；不存在则父目录 realpath + lstat 检查 basename 不是 symlink）。
2. 如果 basename 是 symlink，要么拒绝、要么显式 deny-by-default（建议拒绝）。
3. 给 `FileWriteTool` 加 size cap（建议 10 MiB）+ 原子写（写 `.tmp` 后 rename）+ 备份选项（可选）。

**验收**：

- `file-tools.test.ts` 增加 symlink 越狱用例（sun.: writeFile 后断言原 link 仍是 link、目标文件未被改写、tool 返回错误）。

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

- `AppCoordinator` 与 `SessionManager` 都在 200 行以内，新功能进得去、拿得出；
- 单元测试可以 mock 整条链路：DI 容器交给 fake services，runtime 通过 fake LLMClient + fake ToolRegistry 跑；
- `tool_message` / `permission_request.arguments` 在 desktop 上肉眼可见，体验追上参考的 claude-code；
- 添加新 builtin tool 在 30 行以内（schema + run），不再有重复 class；
- 添加新 LLM provider 在 100 行以内，不需要碰 runtime 或 SessionManager；
- workspace / 权限规则实时反映文件变化，不需要重启 agent-server。

P2 / P3 则是为"插件系统"、"多 provider"、"多窗口 / 多 session 复用 socket"等长期能力打地基，可以按 TODO 路线图节奏推进。
