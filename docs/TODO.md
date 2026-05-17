# 待办清单

按依赖关系分组，组内按优先级排列。每一项扩展为：现状、用户场景、验收标准、边界情况、依赖、阻塞。

## 一、Tool 注册与运行时接入（当前最关键断点）

- [x] **1.1 生产环境 Tool 注册**
  - 现状：`startDefaultServer` 在 `apps/agent-server/src/server.ts:52` 创建空 `ToolRegistry()`，9 个 builtin tool（`file.read`、`file.write`、`clipboard.read`、`app.frontmost`、`window.list`、`screen.capture`、`ocr.read`、`accessibility.snapshot`、`accessibility.action`）均未注册到生产 server。
  - 用户场景：用户在 PromptPanel 输入「看下我桌面上有哪个窗口」，LLM 决策调用 `window.list`，但 registry 找不到 tool，会话直接返回空回复或错误。
  - 验收标准：
    - server 启动时把全部 9 个 builtin tool 注册到 registry。
    - settings.json 预留 `tools.allowlist` / `tools.denylist` 字段，可关闭单个 tool。
    - 启动日志打印「已注册 tool 列表」与「因配置/能力缺失被禁用的 tool」，便于排错。
  - 边界情况：
    - `file.read` / `file.write` 依赖 workspace registry；registry 为空（4.1 未完成）时禁用注册，不留运行时炸点。
    - 平台未实现的 tool（macOS 当前的 OCR、accessibility）允许注册占位 schema 但默认 disabled，并在调用时返回明确的「能力未实现」错误，便于 LLM 自行规避。
  - 依赖：4.1（workspace registry 是 file tool 的前置）。
  - 阻塞：1.2、7.1、7.2、7.3 都需要 tool 调用真实发生才能验证。

- [x] **1.2 Tool 需要 PlatformAdapter 注入**
  - 现状：`ScreenCaptureTool`、`FrontmostAppTool`、`WindowListTool` 等构造依赖 `PlatformAdapter`，server 启动时既未实例化 adapter，也没有把它透传给 tool。
  - 用户场景：1.1 完成后 LLM 调用 `screen.capture`，tool 内部 adapter 为 undefined，直接抛 NPE 或类似错误。
  - 验收标准：
    - server 启动时构造一个 `PlatformAdapter` 实例（基于 3.1 的反向 IPC 客户端）。
    - 通过 tool 工厂或简单的依赖注入把 adapter 透给需要的 tool。
    - 单个 adapter 实例在 server 生命周期内复用，不每次调用重建。
  - 边界情况：
    - desktop 未连接时 adapter 调用应返回明确的 `desktop offline` 错误而非默默超时。
    - 多个并发 session 共享同一 adapter；一个 session 的请求不应阻塞另一个。
  - 依赖：3.1（adapter 的反向 IPC 落地）。
  - 阻塞：所有依赖 PlatformAdapter 的 tool 实际可用性。

## 二、选区与附件接入（CLAUDE.md 标记「待收尾」）

- [x] **2.1 Swift 侧选区采集未接入 PromptPanel**
  - 现状：`PromptPanelViewModel.submit()` 只传 `attachments: []`，`PromptAttachmentResult` 始终为 `.noAttachment`，选区采集逻辑已实现但从未被调用。
  - 用户场景：用户在 Xcode 选了一段代码，唤起 PromptPanel 输入「这段代码什么意思」，但选区没进上下文，LLM 拿不到代码片段无法回答。
  - 验收标准：
    - PromptPanel 唤起时若用户当前有文本选区，自动调用 `MacSelectionCaptureProvider`，把结果作为 attachment chip 显示在输入框上方。
    - chip 可点击移除。
    - 提交时 attachment 经 `onSubmit` 上抛到 `AppCoordinator`,再串到 socket 客户端。
  - 边界情况：
    - 选区为空（`kind: "empty"`）不显示 chip。
    - 采集失败（`kind: "error"`）显示禁用 chip + tooltip 错误原因。
    - 唤起到 chip 出现的延迟应小于 200ms，避免用户感知卡顿。
  - 依赖：无。
  - 阻塞：2.2、2.3。

- [x] **2.2 选区未传入 WebSocket**
  - 现状：`SessionSocketClient.sendUserMessage` 在 `apps/desktop/Sources/SessionWindow/SessionSocketClient.swift:58` 硬编码 `selection: nil`。
  - 用户场景：即便 2.1 完成，附件仍然不会被传到 agent-server，相当于半截功能。
  - 验收标准：
    - `sendUserMessage` 接受 `selection: SelectionPayload?` 参数。
    - `SelectionPayload` 区分 `text` / `image` 两种 case，与 core 侧 `SelectionCaptureResult` 对齐。
    - `SessionMessage.user_message` schema 增加 `selection` 字段（core 已有定义，直接对齐即可）。
    - AgentRuntime 接收到 selection 后追加为 user message 的 attachments，让 LLM 看到。
  - 边界情况：
    - 单条消息可携带多个 attachment（如「文本选区 + 区域截图」组合）。
    - 图片以 base64 + mime 走 JSON 传输，单图上限暂定 5MB；超限报明确错误。
  - 依赖：2.1。
  - 阻塞：2.3 的端到端验证。

- [x] **2.3 选区采集时机：双全局快捷键**
  - 现状：只有一个唤起 PromptPanel 的快捷键，没有显式选区/截图采集入口。
  - 用户场景：
    - 场景 A（文本选区）：用户在某个 App 里手动选好文字，按「文本选区」快捷键，PromptPanel 弹出且文本已作为 chip 附上。
    - 场景 B（区域截图）：用户按「屏幕圈选」快捷键，进入类似 `cmd+shift+4` 的圈选 UI，松开后 PromptPanel 弹出且截图已作为 chip 附上。
  - 验收标准：
    - settings 中可配置两个独立快捷键：`hotkey.captureSelection` 与 `hotkey.captureRegion`。
    - 文本选区路径复用 `MacSelectionCaptureProvider`，唤起 PromptPanel 时把结果直接 push 进 attachments。
    - 区域截图路径走新增的 `RegionCapturePresenter`，使用 ScreenCaptureKit 的窗口/区域选择 API 完成圈选；截图后再唤起 PromptPanel。
  - 边界情况：
    - 两条路径都不绕过 PromptPanel——采集完成总是经面板提交。
    - 圈选过程中按 ESC 取消，不弹 PromptPanel。
    - 若 PromptPanel 已经打开，新一次采集应追加 attachment 而不是新建会话。
    - 区域截图依赖 macOS 录屏权限；未授权时弹原生权限请求 + 引导文案。
  - 依赖：2.1、2.2、3.1（区域截图依赖 SCK 落地）。
  - 阻塞：无。

## 三、ScreenCaptureKit 迁移

- [x] **3.1 迁移到 ScreenCaptureKit（反向 IPC 方案）**
  - 现状：已删除 `packages/platform-macos/`，`screen.capture` 全链路走 `RemotePlatformAdapter` → `PlatformBridge` → 桌面 `MacPlatformProvider`，由后者用 `SCScreenshotManager` 完成 display / window / region 三种 target 的截图，不再依赖 `screencapture` CLI。
  - 决策：SCK 必须运行在签了名的 macOS App 进程里（TCC 权限按 bundle id 记账），不在 agent-server 的 Node 进程内执行。`PlatformBridgeService` 在桌面 App 内独立维护一条 WebSocket，agent-server 通过 `platform_request` / `platform_response` 反向请求。
  - 用户场景：
    - LLM 调用 `screen.capture(target: window, windowId)` 截某个窗口。
    - LLM 调用 `screen.capture(target: region, x/y/width/height)` 截某显示器的指定区域。
    - 2.3 区域截图复用同一通道（`MacRegionCaptureProvider` 仍用 `screencapture -i` 兜底，后续切到自建 SCK 圈选 UI）。
  - 验收标准：
    - desktop 端 `PlatformBridgeService`（Swift）已订阅 `platform_request` 并回 `platform_response`。
    - core 侧 `RemotePlatformAdapter` 已把 `captureScreen` 打包成 `platform_request` 走 WS。
    - `SessionMessage` 协议已新增 `platform_request` / `platform_response`，带 `requestId` 与 `timeoutMs`。
    - 测试：[apps/agent-server/src/WebSocketPlatformBridge.test.ts](apps/agent-server/src/WebSocketPlatformBridge.test.ts) 覆盖超时 / desktop 断连 / 并发隔离；[apps/desktop/TestsSwift/ScreenCaptureKitSpikeTests.swift](apps/desktop/TestsSwift/ScreenCaptureKitSpikeTests.swift) 覆盖 SCK display / window / region 三条路径。
  - 边界情况：
    - 一次截图 round-trip 增加 < 50ms 延迟视为可接受。
    - 图片在 WS 上以 base64 传输，单次 < 10MB，超限改走分片或落盘 + 路径返回（暂未触达，留作后续）。
    - desktop 离线时 `platform_request` 立即抛 `PlatformBridgeOfflineError`，不挂死等。
    - 多个并发 `platform_request` 通过 `requestId` 隔离，互不影响。
  - 依赖：1.2 的注入机制。
  - 阻塞：2.3 的区域截图、`screen.capture` tool 的实际可用性、未来 OCR / AX 也走同一通道。

## 四、Workspace 管理

> 与 Claude Code / Cursor 等 code agent 不同，HandAgent 的 workspace 不是「当前目录」隐式上下文，而是用户显式注册的、带 description 的命名沙箱集合。LLM 不会默认看到 workspace 列表；只有当任务需要落盘或读盘时，才通过 `workspace.list` 按需发现，并根据 description 自行选择或询问用户。

- [x] **4.1 Workspace 注册表与默认初始化**
  - 现状：仓库内不存在 workspace 抽象；`file.read` / `file.write` 一旦注册会需要某种「根目录」上下文，目前没有出处。
  - 用户场景：用户首次启动 App，自动获得一个名为「default」的 workspace，rootPath 指向 `~/.spotAgent/workspace/`；可以直接说「帮我把这段文字保存成笔记」并落盘到该目录。后续可在 Settings 增加更多 workspace（如「Notes」「Code Snippets」）。
  - 验收标准：
    - core 层新增 `WorkspaceRegistry`，模型字段：`id` / `name` / `description` / `rootPath` / `createdAt` / `isDefault`。
    - 持久化到 `~/.spotAgent/workspaces.json`，与 `settings.json`、`sessions/`、`permissions.json` 并列。
    - 首次启动若注册表为空，自动创建 `default` workspace：rootPath = `~/.spotAgent/workspace/`，description = 「默认工作区，存放未归类的笔记和文件」。
    - rootPath 不存在时自动 `mkdir -p`。
  - 边界情况：
    - rootPath 必须是绝对路径；注册时校验路径存在或可创建。
    - 同一物理目录可被多个 workspace 引用（不去重，由用户自己保证不混乱）。
    - 删除 workspace 仅从注册表移除，不删除磁盘文件，避免误删用户内容。
  - 依赖：无。
  - 阻塞：4.2、4.3、1.1（file tool 注册前需要 registry 就绪）。

- [ ] **4.2 workspace.list / workspace.askUser tool**（仅 list 已落地，askUser 暂缓）
  - 现状：LLM 没有任何方式发现已注册的 workspace。
  - 用户场景：
    - 场景 A（LLM 自决策）：用户说「保存为笔记」→ LLM 调 `workspace.list` 拿到列表 → 看到「Notes」description 为「日常笔记」→ 自行选用，无需追问。
    - 场景 B（模糊时反问）：用户说「保存这个文件」，列表里有「Notes」「Code Snippets」「Drafts」三个都可能匹配 → LLM 调 `workspace.askUser({prompt: "保存到哪里？", candidateIds: [...]})` → SessionWindow 弹气泡让用户点选 → tool 返回用户选中的 workspaceId。
  - 验收标准：
    - `workspace.list` 输出 `[{id, name, description, isDefault}]`，**不含 rootPath**（避免泄露绝对路径给 LLM）。
    - `workspace.askUser` 入参 `{prompt: string, candidateIds?: string[]}`，出参 `{workspaceId: string} | {cancelled: true}`；UI 复用 7.2 的内联气泡机制。
    - 用户可点「取消」，tool 返回 `cancelled`，LLM 据此终止当前流程。
    - 询问超时（默认 60s）视为 cancel。
  - 边界情况：
    - `candidateIds` 中存在不在注册表的 id 时过滤掉；全部无效则 fallback 到全量列表。
    - 同一 session 并发多次 `askUser` 串行排队，UI 气泡不叠加。
  - 依赖：4.1；UI 部分与 7.2 共用基础设施。
  - 阻塞：4.3 的「LLM 选 workspace」混合策略生效。

- [x] **4.3 file tool 接入 workspace（沙箱化）**
  - 现状：`FileReadTool` / `FileWriteTool` 当前定义接收任意路径，无沙箱、无 workspace 概念。
  - 用户场景：LLM 调 `file.write({workspaceId: "default", relativePath: "2026-05-17.md", content: "..."})`，文件落到 `~/.spotAgent/workspace/2026-05-17.md`；尝试写 `../../etc/passwd` 被拒。
  - 验收标准：
    - `file.read` / `file.write` 入参改为 `{workspaceId: string, relativePath: string, ...}`，**去掉绝对路径入口**。
    - tool 内部解析 `workspaceId` → `rootPath`，与 `relativePath` join 后必须仍在 rootPath 内（防 `..` 越狱）。
    - tool description 显式提示 LLM：「调用前若不确定 workspace，先调 `workspace.list`，匹配模糊时调 `workspace.askUser`」。
    - 单测覆盖：路径越狱（`..`、绝对路径）、workspaceId 不存在、symlink 越狱。
  - 边界情况：
    - symlink 越狱：joined path 走 `realpath` 后再校验是否仍在 rootPath 内。
    - relativePath 含 `..` 但 join 后仍在 root 内时（如 `a/../b.md`）允许。
    - 写入时若中间目录不存在自动 `mkdir -p`，但仅限 rootPath 子树。
  - 依赖：4.1、4.2。
  - 阻塞：1.1 中 file tool 真正可用、7.2 权限策略 key 设计（按 `workspaceId` 而非裸路径记忆）。

- [ ] **4.4 Workspace 管理 UI**（待优化）
  - 现状：无 UI，注册表只能通过手动编辑 `workspaces.json` 改。
  - 用户场景：用户在 Settings 增加一个 workspace「项目笔记」指向 `~/Documents/proj-notes/`，描述「与当前项目相关的笔记和草稿」；后续 LLM 保存时会识别这个语义。
  - 验收标准：
    - Settings 新增「Workspaces」tab，列出已注册 workspace。
    - 「添加」按钮：弹原生目录选择器选 rootPath，输入 name + description，落地到注册表。
    - 「编辑」：可改 name / description；rootPath 只读，避免一改就把已有引用打散。
    - 「删除」：二次确认；default workspace 不可删（按钮禁用 + tooltip 解释）。
  - 边界情况：
    - 用户选了一个不可写目录时给出友好报错。
    - description 上限 200 字（让 LLM 更容易消费），UI 显示字符计数。
  - 依赖：4.1。
  - 阻塞：无（CLI / 手编 JSON 可作为短期兜底）。

## 六、会话历史与恢复

- [ ] **6.1 会话历史 UI + 恢复（三处入口）**（仅落地 SessionWindow 侧栏入口；PromptPanel action / 独立历史窗口暂缓）
  - 现状：`listSessions()` / `getSessionHistory()` 后端已实现，前端无任何浏览或恢复入口。
  - 用户场景：
    - 入口 A（PromptPanel action）：用户唤起面板，输入框 query 实时过滤「最近会话」action，回车恢复对应会话。
    - 入口 B（SessionWindow 侧栏）：会话窗口左侧抽屉显示会话列表，可切换 / 新建 / 删除，类似 ChatGPT 布局。
    - 入口 C（独立历史窗口）：全局快捷键 `hotkey.openHistory` 唤起 Raycast Clipboard History 风格的窗口，专注浏览 / 搜索。
  - 验收标准：
    - PromptPanel action 列表新增「最近会话」项，匹配规则：query 命中标题或最近一条 assistant bubble 摘要。
    - SessionWindow 侧栏：宽度可拖拽，标题双击重命名，右键菜单删除 + 二次确认。
    - 独立历史窗口：搜索框 + 列表 + 右侧预览（最近 N 条 bubble），双击 / 回车恢复。
    - 恢复时 SessionWindow 重建消息列表，WebSocket 仅订阅历史快照，不重新跑 runtime。
  - 边界情况：
    - 删除会话不可逆，需要二次确认。
    - 历史超过一定数量时分页或懒加载（建议每页 50）。
    - 多窗口同时打开同一会话时，订阅同一 sessionId 的事件流，UI 状态一致。
  - 依赖：无（后端已就绪）。
  - 阻塞：无。

## 七、审计与权限

- [x] **7.1 SessionEvent 审计写入**
  - 现状：`SessionRecord` 定义了 `tool_call` / `tool_result` / `permission_request` / `error` 事件类型，runtime 循环里没有任何写入。
  - 用户场景：用户事后排查「Agent 究竟执行了什么 tool、参数是什么、用了多久」，目前查不到。
  - 验收标准：
    - `AgentRuntime` 在 tool 调用前后写 `tool_call` / `tool_result` 事件，包含 `toolName`、`arguments`、`result` 摘要、`durationMs`。
    - LLM 异常 / tool 异常写 `error` 事件。
    - 事件批量 append 到 `SessionStore`，不阻塞 runtime 主循环。
    - 历史会话恢复时事件可读取（暂不在 UI 显示，留给后续审计页）。
  - 边界情况：
    - 大对象 `result` 截断（避免 session 文件膨胀，建议 8KB cap + `truncated: true` 标记）。
    - 敏感字段（剪贴板内容、文件正文）按 settings 决定是否落盘明文。
  - 依赖：1.1（tool 调用真实发生）。
  - 阻塞：7.2（权限决策也作为事件写入）。

- [x] **7.2 权限审批流程（首次询问 + 记忆策略）**
  - 现状：`permission_request` 事件类型已定义，无任何拦截 / 审批逻辑。
  - 用户场景：LLM 第一次想调用 `file.write` 改某个文件，弹询问气泡；用户选「本次会话允许」或「始终允许此 tool 写此目录」，后续按策略自动放行；选「拒绝」则 runtime 收到拒绝结果，LLM 自行决定下一步。
  - 验收标准：
    - `PermissionPolicy` 抽象：输入 `(toolName, arguments)`，输出 `allow` / `deny` / `ask`。
    - 三档记忆粒度：本次调用、本次会话、永久（按 `toolName` + 关键参数 hash 做 key）。
    - 永久策略持久化到 `~/.spotAgent/permissions.json`。
    - 询问 UI 走 SessionWindow 内联气泡（不阻塞面板，但阻塞 runtime）。
    - 用户决策写入 `permission_request` 事件。
  - 边界情况：
    - 询问超时（默认 60s）视为 deny。
    - 同一 session 内并发的多个 `permission_request` 串行排队，避免多个气泡叠加。
    - 永久策略支持在 Settings 里查看和撤销。
  - 依赖：7.3。
  - 阻塞：无。

- [x] **7.3 Tool 执行前权限检查**
  - 现状：架构预留，runtime 未实现。
  - 用户场景：是 7.2 的「前置拦截器」，独立列出来是因为它属于 runtime 改动而非 UI 改动。
  - 验收标准：
    - `AgentRuntime` 在调用 `ToolRegistry.get(name).call()` 前，先调用 `PermissionPolicy.check`。
    - `check` 返回 `ask` 时挂起当前 tool 调用，发出 `permission_request` 事件等待解析。
    - `check` 返回 `deny` 时把 tool 结果伪造为「用户拒绝」的 tool message 回灌给 LLM，让其继续推进。
    - 提供 sync + async 两种 `PolicyResolver`（测试用 sync，生产用 async via UI）。
  - 边界情况：
    - 拒绝消息内容要让 LLM 能理解并继续推进（不是空字符串），建议固定文案「用户拒绝执行该 tool」。
    - 拦截器不能让 runtime 主循环卡死——使用可取消的 promise，session 关闭时 reject 所有挂起请求。
  - 依赖：1.1。
  - 阻塞：7.2 的 UI 落地。

## 八、补全与扩展

- [ ] **8.1 多 provider LLM 支持（先重做抽象层）**
  - 现状：只有 `VercelClient`（OpenAI 兼容），`LLMClient` 抽象较薄，stream 协议、tool 协议未归一化。
  - 决策：先把 `LLMClient` 协议清理干净，再挂具体 provider，避免每加一个 provider 都打补丁。
  - 用户场景：用户在 settings 里切换 provider，无需改代码；未来可挂 Anthropic、本地 Ollama 等。
  - 验收标准：
    - 重构 `LLMClient` 接口，覆盖：消息 schema 归一化、stream 事件归一化、tool 协议归一化（OpenAI `tool_calls` vs Anthropic `tool_use`）。
    - 抽出 `LLMClientFactory`，由 `settings.provider` + `settings.model` 决定具体实现。
    - 至少两个实现：现有 `VercelClient` + 一个新 provider 验证抽象正确性（建议 Anthropic）。
    - 测试覆盖：相同输入 + 相同 mock provider 响应，runtime 行为保持一致。
  - 边界情况：
    - 部分 provider 不支持 tool calling，需要在 client 上声明 `capabilities`，UI / runtime 据此禁用 tool 相关功能。
    - stream 协议差异（SSE / WebSocket / HTTP chunked）在 client 内部吸收，对 runtime 暴露统一事件流。
  - 依赖：无。
  - 阻塞：后续具体 provider 接入。

- [x] **8.2 Agent Server 错误恢复**
  - 现状：`AgentServerService` 已存在，崩溃重启策略未明确。
  - 用户场景：agent-server 崩溃后桌面 App 应自动重启 server 并提示用户，而不是静默挂掉，让用户以为产品坏了。
  - 验收标准：
    - `AgentServerService` 监控 server 子进程退出码。
    - 非零退出码触发自动重启（指数退避 + 最多 N 次）。
    - 多次重启失败弹原生 alert 提示用户，并提供「查看日志」按钮。
    - SessionWindow 在 server 不可用时显示连接断开 UI；重连成功后自动续联订阅。
  - 边界情况：
    - 区分「用户主动退出 server」与「崩溃」，前者不触发重启。
    - 重启过程中 PromptPanel 不允许提交新 prompt，或排队等 server 起来。
  - 依赖：无。
  - 阻塞：无。

## 九、用户自定义 Tool（插件系统）

> 终态扩展性目标：所有 P0–P3 项稳定后再启动。完整覆盖一个平台的所有 App 操作几乎不可能，更现实的路径是让有动手能力的用户写自己的复杂工作流，类似 Raycast Extensions / Alfred Workflows 的模式。

- [ ] **9.1 用户自定义 tool 的注册、安装与运行**
  - 现状：所有 tool 都是 builtin，写在 `packages/core/src/tools/builtins/` 里随构建打包；用户无任何方式新增 tool。
  - 用户场景：
    - 场景 A（本地自制）：用户想做「把当前选区作为标题在 Things 3 里建一条待办」，写一个 AppleScript + 简单 manifest 放进 `~/.spotAgent/plugins/things-add-todo/`，重启 App 后 LLM 即可看到 `things.addTodo` tool 并按 schema 调用。
    - 场景 B（社区分发）：开发者把插件目录推到 GitHub，其他用户在 Settings 「从 URL 安装」一键拉取。
  - 验收标准（粗粒度，待实施时细化）：
    - 插件目录约定：`manifest.json`（name、version、description、tools[].schema、入口文件、声明的权限范围）+ 实现文件。
    - 启动时扫描 `~/.spotAgent/plugins/`，加载合法插件，通过 `ToolRegistry.register` 暴露给 runtime；非法插件跳过并写错误日志，不影响 builtin。
    - Settings 新增「Plugins」tab：已安装列表 / 启用切换 / 卸载 / 查看声明的权限。
    - 与 7.2 权限系统对接：插件声明的权限范围（如「只读 workspace X」「调任意 AppleScript」）首次调用时弹询问，记忆策略复用 7.2。
  - 边界情况：
    - 不可信代码隔离：插件不应能读 `~/.spotAgent/settings.json`、`~/.spotAgent/sessions/`、`~/.spotAgent/permissions.json` 等敏感数据；workspace 是插件文件访问的天然边界。
    - 插件崩溃 / 超时不能拖垮 agent-server 主循环；单个 tool 调用强制超时（建议 30s）。
    - 插件 tool 名与 builtin 冲突：builtin 优先，插件加载失败并提示用户重命名。
  - 开放问题（实施时拍板）：
    - 插件 runtime 选型：(a) TS 模块直接 `import()` 进 agent-server——简单，无沙箱；(b) 独立子进程 + JSON-RPC——沙箱强，工程量大；(c) 只允许声明式 wrapper（AppleScript / shell 脚本 + manifest）——表达力受限但安全。倾向 (c) 起步、(b) 兜底。
    - 分发渠道：本地目录 / Git URL / 中央仓库。第一版仅本地。
    - 签名与信任模型：强制签名 vs 显式权限声明 + 用户自负，待定。
  - 依赖：1.1（ToolRegistry 注入路径）、7.2（权限审批）、4.x（workspace 沙箱给插件提供文件边界）。
  - 阻塞：无（终态项目）。

## 路线图（按依赖排序）

**P0 — 让 tool 真的能跑起来：**

1. 4.1 Workspace 注册表与默认初始化
2. 4.3 file tool 接入 workspace（沙箱化）
3. 1.1 生产环境 Tool 注册
4. 3.1 ScreenCaptureKit 反向 IPC（同时是 PlatformAdapter 落地）
5. 1.2 PlatformAdapter 注入

**P1 — 让用户输入真正进入上下文：**

6. 2.1 PromptPanel attachment 接入
7. 2.2 WebSocket 选区传输
8. 2.3 双快捷键采集入口
9. 4.2 workspace.list / workspace.askUser tool（依赖 7.2 内联气泡机制，但可先落 list 部分）

**P2 — 让会话可追溯、可控：**

10. 7.1 SessionEvent 审计写入
11. 7.3 Tool 执行前权限拦截器
12. 7.2 权限审批 UI
13. 4.4 Workspace 管理 UI

**P3 — 让产品长期可演进：**

14. 6.1 会话历史 UI（三入口）
15. 8.1 LLMClient 抽象重做
16. 8.2 server 错误恢复

**P4 — 终态扩展性（前面全部完成后再启动）：**

17. 9.1 用户自定义 tool（插件系统）
