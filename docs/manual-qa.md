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

## 开发验证记录

### 默认路径 Swift StatusBubble activity 回归修复

- 完成日期：2026-06-09
- 实现位置：`apps/desktop/Sources/AppServices/AgentServer/AgentActivityConnectionClient.swift`、`apps/desktop/Sources/AppServices/AgentServer/AppServer.swift`、`apps/desktop/Sources/AppServices/Thread/ThreadRegistry.swift`、`apps/desktop/Sources/AppServices/AppServices.swift`
- 自动化验证：`bash ./scripts/swiftw test` 覆盖 `/api/activity` snapshot 更新 `ThreadRegistry`、默认 StatusBubble tap 使用 activity threadId 聚焦 ThreadWindow、默认 `AppServer` 同时启动 `/api/platform` 与 `/api/activity` 连接。
- 手工回归步骤：使用 `bash ./scripts/package-app.sh --mock-llm` 打包默认 WKWebView 路径，提交 `THREAD_HISTORY_STATUS_QA_20260609_MINIMIZE [mock:slow-focus]` 并保持 ThreadWindow 打开；运行中观察 Swift StatusBubble 应显示 running 与 `正在回复`，点击气泡应聚焦当前 ThreadWindow，不应打开 PromptPanel。
- 边界确认：默认 Swift 只消费 `/api/activity` 的轻量 `AgentActivityEvent` 更新 `ThreadRegistry`；不解析 `/api/thread`，不同步完整 React ThreadWindow 状态。Electron flag 路径仍由 Electron ActivityWindow 承载 React StatusBubble。

### Thread 输入队列与 input.submit 破坏性迁移

- 完成日期：2026-06-07（后端队列）；2026-06-08（输入协议破坏性迁移、running 输入显示顺序修正）
- 关键 commit：`b0893c5`（后端队列）；`3e562e1`（输入协议迁移）
- 实现位置：`packages/core/src/protocol/ThreadCommand.ts`、`apps/agent-server/src/thread/ThreadInputQueue.ts`、`apps/agent-server/src/thread/ThreadRuntimeOrchestrator.ts`、`apps/agent-server/src/thread/ThreadCommandRouter.ts`、`apps/agent-server/src/server/server.ts`、`apps/thread-window-web/src/protocol/threadProtocol.ts`、`apps/thread-window-web/src/thread/threadSocketClient.ts`、`apps/thread-window-web/src/store/threadWindowStore.ts`、`apps/thread-window-web/src/App.tsx`、`apps/thread-window-web/src/components/Composer.tsx`
- 验收结果：外部用户输入命令统一为 `input.submit`，旧输入命令已从当前 `ThreadCommand` 移除；ThreadWindow composer 在 running 状态下仍可提交输入并保留 Stop，但 running 输入先进入前端本地 FIFO 队列并显示在 Composer 上方，等 thread 离开 running 后逐条发送，避免两个 user input 连续显示；后端公开 `/api/thread input.submit` 在 running 时返回 `thread.error(code: "thread_running")`，普通用户 follow-up 不走后端排队。已通过 `bash ./scripts/test.sh`、`pnpm --filter handagent-thread-window-web test -- tests/threadWindowStore.test.ts`、`pnpm --filter handagent-thread-window-web build`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`。

### ThreadWindow workspace 分组排序修复

- 完成日期：2026-06-09
- 实现位置：`apps/thread-window-web/src/utils/groupThreads.ts`、`apps/thread-window-web/tests/groupThreads.test.ts`、`apps/thread-window-web/tests/historySidebar.test.ts`、`apps/thread-window-web/tests/threadWindowStore.test.ts`
- 验收结果：`workspace.listed` 仍按后端 registry 原序写入 store；ThreadWindow 历史侧栏在 `groupThreadsByWorkspace` 层按 workspace 名称排序，名为 `default` 的 workspace 参与正常字母序，`workspaceId: null` 的"默认对话"仍独立固定在最下方。已通过 `pnpm --filter handagent-thread-window-web exec vitest run tests/groupThreads.test.ts tests/threadWindowStore.test.ts tests/historySidebar.test.ts`。


## Electron UI Shell 最终态验收（P2）

**实施状态**：未通过实机 QA；本节为待验收项，不得归档为已通过。

1. 运行 `pnpm --filter handagent-electron-shell build`。
1. 设置 `HANDAGENT_ELECTRON_SHELL=1` 后运行桌面 App，确认 Electron shell 和 agent-server 只有各一份进程，`127.0.0.1:4317` 没有第二份 server 冲突。
1. 使用 packaged app + `HANDAGENT_ELECTRON_BINARY` 启动 Electron flag 路径，确认 Electron main 不因 Swift command bridge 阻塞在 stdin，启动后能上报 `electron.ready` 并继续拉起 agent-server。
1. 确认启动日志包含 agent-server supervisor description，并明确 `mode`、`coreRuntimeHost: "agent-server"` 与 `utilityProcessBlocker`；如果走 Node child fallback，日志必须说明 utilityProcess 的具体 blocker。
1. 启动完成前 PromptPanel 不允许提交；收到 `agent_server.health available=true` 与 `thread_window.prepared` 后 PromptPanel 才恢复可提交。
1. 通过全局快捷键打开或切换 PromptPanel 多次，确认不会显示 ThreadWindow，也不会发送 `thread_window.prepare` command；hidden ThreadWindow 预热只由 Electron main 在 app-server ready 后完成。
1. 提交 `ELECTRON_UI_SHELL_FINAL_QA_20260608`，确认打开的是 Electron ThreadWindow，创建新 tab/thread，并显示该首条 user message；`~/.spotAgent/threads/` 中对应 thread 文件包含同一 user message。
1. 再次打开 PromptPanel 连续提交第二条不同 prompt，确认复用同一个 Electron ThreadWindow，但创建新的 tab/thread，不写入当前 active tab 的 composer thread。
1. 触发 `openHistory`，确认聚焦 Electron ThreadWindow 并显示历史侧栏，不创建 Swift WKWebView host。
1. 触发 platform tool，例如 `clipboard.read`、`app.frontmost`、`screen.capture` 或 `accessibility.snapshot`，确认 agent-server 仍通过 `/api/platform` 请求 Swift 回写结果。
1. 确认不再显示 Swift StatusBubble，右下角显示 Electron React StatusBubble；提交 prompt 后 Electron StatusBubble 能展示 `starting` / `running` / `completed`。
1. 触发 tool、permission/workspace request、模型配置错误或 provider 错误，确认 Electron StatusBubble 分别展示 tool running、waiting、error 状态，ThreadWindow 内联请求面板和错误气泡仍正常可见。
1. 点击 Electron StatusBubble，若 Electron ThreadWindow 可见，确认聚焦 ThreadWindow；若无可聚焦 ThreadWindow，确认 Swift PromptPanel 打开。
1. 断开并重连 `/api/activity` subscriber，确认新连接立即收到 `activity.snapshot`，不会影响 `/api/thread` 消息流。
1. 确认 ActivityWindow 非激活展示：点击气泡不把 ActivityWindow 变成 key window，且不会出现在 Cmd+Tab。
1. 关闭 visible Electron ThreadWindow，确认 agent-server 进程仍存在；再次打开 PromptPanel 并提交，确认仍通过同一后台服务执行。
1. 关闭 Electron StatusBubble，确认 agent-server 进程仍存在，ThreadWindow 仍可继续对话。
1. 模拟 agent-server 非零退出，确认 supervisor 按退避重启；超过最大次数后 Swift 显示明确 fatal/diagnostic 文案。
1. 执行 `bash ./scripts/package-app.sh --mock-llm`，确认 `.app/Contents/Resources/ElectronShell/dist/main/main.js` 存在。
1. 确认 PATH 中存在 `electron`，或设置 `HANDAGENT_ELECTRON_BINARY` 指向可用 Electron binary。
1. 使用 mock LLM packaged app 路径启动 Electron flag，确认 prompt 返回 mock assistant，不访问真实 LLM。
1. 退出 HandAgent 后确认 Electron、agent-server 和 renderer 进程不残留。

## ThreadWindow UI 重构完整验收（P2）

**实施状态**：Phase 1-4 已 100% 完成（2026-06-07 合并到 main）

### 前提条件
- 已通过 `bash ./scripts/test.sh`
- 已通过 `bash ./scripts/swiftw build`
- 已执行 `pnpm --filter handagent-thread-window-web build`

### 验收场景

#### 场景 1: Tailwind CSS 构建与主题验证

1. 执行 `pnpm --filter handagent-thread-window-web build`
2. 确认 `apps/thread-window-web/dist/` 生成包含 Tailwind utilities 的 CSS
3. 确认构建输出无 PostCSS 或 Tailwind 配置错误
4. 检查 `dist/assets/*.css` 文件，确认包含 Claude warm-canvas theme tokens 对应的 CSS（如 `bg-canvas`、`bg-surface-dark`、`bg-primary`、`bg-user-bubble`）
5. 启动 desktop app，用开发者工具检查 DOM，确认组件使用 Tailwind 类名（如 `bg-canvas`、`bg-surface-dark`、`rounded-lg`）

#### 场景 2: workspaceId 向后兼容验证

1. 创建测试用旧版本 thread 文件（不含 `workspaceId` 字段）：
   ```bash
   cat > ~/.spotAgent/threads/test-old-thread.json <<'EOF'
   {
     "version": 1,
     "metadata": {
       "id": "test-old-thread",
       "preview": "测试旧版本 thread",
       "createdAt": "2026-06-01T10:00:00.000Z",
       "updatedAt": "2026-06-01T10:00:00.000Z",
       "messageCount": 0
     },
     "messages": [],
     "events": []
   }
   EOF
   ```
2. 启动 desktop app：`bash ./scripts/swiftw run HandAgentDesktop`
3. 打开 ThreadWindow 历史列表
4. 确认旧 thread 出现在"默认对话"分组（最下方），不出现解析错误或崩溃
5. 用 `cat ~/.spotAgent/threads/test-old-thread.json` 确认文件未被意外修改
6. 创建新 thread，用 `cat ~/.spotAgent/threads/<新threadId>.json | jq .metadata.workspaceId` 确认新文件包含 `"workspaceId": null` 字段
7. 清理测试文件：`rm ~/.spotAgent/threads/test-old-thread.json`

#### 场景 3: workspace.list 协议与 workspace 分组刷新验证

1. 审查 `packages/core/src/protocol/ThreadCommand.ts`，确认 `workspace.list` 命令类型存在
2. 审查 `packages/core/src/protocol/ThreadNotification.ts`，确认 `workspace.listed` 通知类型存在
3. 审查 `apps/thread-window-web/src/protocol/threadProtocol.ts`，确认 `isThreadNotification` 已覆盖 `workspace.listed`，并校验 `workspaces[].id/name/rootPath`
4. 启动 desktop app，打开浏览器开发者工具 Network 标签
5. 打开 ThreadWindow，确认 WebSocket 连接后自动发送 `workspace.list` 命令
6. 确认 Network 中收到 `workspace.listed` 后，历史边栏按返回的 workspace 列表刷新分组；若没有配置 workspace，至少应保留"默认对话"分组且不丢弃通知

#### 场景 4: 左侧边栏 workspace 分组交互

1. 确认历史边栏顶部显示"新建对话"按钮
2. 确认显示搜索输入框
3. 准备一个 registry 原序不是字母序的 `~/.spotAgent/workspaces.json`，例如 `default -> tmp -> qa-workspace -> handagent-test`；确认历史侧栏显示为 `default -> handagent-test -> qa-workspace -> tmp -> 默认对话`，即 workspace 分组按字母顺序排列，名为 `default` 的 workspace 不等同于"默认对话"，"默认对话"分组固定在最下方。
4. 点击 workspace 分组标题，确认可展开/收起，图标有旋转动画
5. 在搜索框输入关键词，确认过滤所有分组的 thread（按 preview 字段匹配）
6. 清空搜索，确认恢复完整列表
7. 展开/收起若干分组后刷新页面，确认展开状态保持（持久化到 store）
8. 点击"新建对话"按钮，确认创建空白 thread 并自动切换到新 tab
9. 点击历史项，确认激活或创建对应 tab

#### 场景 5: 左侧边栏响应式缩放与隐藏

1. 打开 ThreadWindow，保持默认窗口宽度，确认左侧历史边栏可见且宽度接近窗口宽度的 30%。
2. 横向放大窗口，确认左侧历史边栏随窗口变宽，但达到约 320px 后不再继续变宽。
3. 横向缩小窗口到约 760px 以上，确认左侧历史边栏随窗口变窄，且不会窄到低于约 220px。
4. 继续缩小窗口到 760px 以下，确认左侧历史边栏隐藏，右侧对话区占满窗口宽度。
5. 从窄窗口重新放大到 760px 以上，确认左侧历史边栏重新出现，历史项、搜索框和 workspace 展开状态仍正常。

#### 场景 5A: ThreadWindow 滚动容器验证

1. 准备足够多的历史 thread，使左侧列表高度超过窗口；滚动左侧边栏时，HandAgent 标题、新建对话按钮和搜索框保持固定，只有对话列表滚动。
2. 打开一个包含多轮消息的 thread，使右侧消息超过窗口高度；滚动右侧时，顶部 TabBar 和底部 Composer 保持固定，只有消息区域滚动。
3. 打开多个 tab，使 tab 总宽度超过右侧可视宽度；确认只有 TabBar 内部出现横向滚动，ThreadWindow 页面本身没有底部横向滚动条。
4. 将 ThreadWindow 缩到最小可用尺寸附近，确认消息、Composer、请求面板和历史项不撑出页面横向滚动。

#### 场景 6: ThreadWindow Claude warm-canvas 视觉验证

1. 创建新 thread，发送若干消息（user / assistant / tool）
2. 确认左侧历史栏是 warm cream surface：整体为 `#efe9de`，搜索框和选中 thread 为 `#faf9f5`，边线为浅 cream hairline。
3. 确认右侧 thread workspace 是 dark product surface：主背景为 `#181715`，顶部 tab bar 和 composer 区域为更深/更高的 dark surface。
4. 确认 "新建对话" 与 "发送" 是 coral primary（`#cc785c`），hover/active 会变深，不再使用 Mango Amber。
5. 确认 user 消息是 coral-tinted cream card，assistant 消息是 cream card，tool 消息是 dark code-style card 并使用 monospace。
6. 将窗口缩到最小尺寸附近，确认历史标题、tab 标题、消息、按钮文字没有互相遮挡或溢出容器。

#### 场景 7: GPT 风格布局验证

**验收目标**: 确认 ThreadWindow React 前端已按 `apps/thread-window-web/thread-window-web.md` 的 GPT 风格布局实现，同时保留 DESIGN.md 配色。

**前提条件**:
- 已执行 `pnpm --filter handagent-thread-window-web build`
- 启动 desktop app：`bash ./scripts/swiftw run HandAgentDesktop`
- 提交一个 prompt，打开 ThreadWindow

**消息展示 (MessageBubble)**:
- [ ] assistant 消息完全透明无背景，文本直接铺在 `surface-dark` (#181715) 背景上
- [ ] user 消息右对齐，最大宽度约 85%，带圆角背景（warm cream 色 `surface-card` #efe9de）
- [ ] tool 消息左对齐，半透明深色背景，使用代码字体
- [ ] 操作按钮（复制/编辑/重新生成）hover 时显示（不hover时也占位，不要发生hover后下面的所有消息移位）

**内容区布局 (MessageList)**:
- [ ] 消息区域水平居中，最大宽度 720pt
- [ ] 消息间距统一（12px / gap-sm）

**输入栏 (Composer)**:
- [ ] pill 形大圆角容器（24pt / rounded-3xl）
- [ ] 边框 `border-white/10`，聚焦时变为 `border-white/20`
- [ ] 输入栏与消息区同宽（720pt），水平居中
- [ ] 右侧内嵌按钮：附件按钮（占位 disabled）+ 发送/停止按钮
- [ ] 空闲时显示发送按钮（箭头向上图标），运行时显示停止按钮（方形图标）

**Tab 栏 (TabBar)**:
- [ ] 浏览器风格 tab：活跃 tab 与内容区背景融合（`bg-surface-dark` #181715）
- [ ] 非活跃 tab 视觉下沉（`bg-surface-dark-soft` #1f1e1b）
- [ ] tab 顶部圆角（8px / rounded-t-lg）
- [ ] 关闭按钮 hover 时显示（group-hover:opacity-100）
- [ ] 去除状态点，只保留标题

**运行状态指示器 (TypingIndicator)**:
- [ ] 提交一个需要 LLM 响应的 prompt
- [ ] 运行中时，最后一条 assistant 消息底部显示三个跳动的点
- [ ] 点的动画错峰延迟（0ms / 150ms / 300ms）
- [ ] 运行完成后打字指示器消失

**配色验证（保留 DESIGN.md）**:
- [ ] 主背景使用 `#181715` (surface-dark)，不是 spec 中的 `#212121`
- [ ] 侧边栏使用 `#efe9de` (surface-card, warm cream)，不是 spec 中的 `#2F2F2F`
- [ ] user 消息背景使用 `#efe9de` (surface-card, warm cream)，不是 spec 中的 `#3A3A3A`
- [ ] 主按钮使用 `#cc785c` (primary, coral)

#### 场景 8: 消息操作按钮验证（GPT 风格）

1. 确认 assistant 和 tool 消息的操作按钮默认不显示
2. hover assistant 消息，确认操作按钮显示
3. 确认 hover后 tool下面不显示操作按钮
4. 点击"复制"按钮，确认消息内容复制到剪贴板
5. 确认"编辑"和"重新生成"按钮显示但禁用，hover 时显示 tooltip "即将推出"
6. 确认操作按钮栏在深色 workspace 上使用低对比度 cream 文本，不干扰阅读

#### 场景 9: Composer 自动增高输入框验证（GPT 风格）

1. 在输入框输入单行文本，确认高度为最小值（52px）
2. 按 Shift+Return 插入换行，继续输入到第 2、3、4、5 行
3. 确认输入框随内容自动增高，最大 5 行（120px）
4. 继续输入第 6 行，确认输入框停止增高，出现垂直滚动条
5. 按 Return（无修饰键）确认提交消息，输入框清空并恢复最小高度
6. 确认输入栏保持 pill 形，居中，最大宽度 720pt

#### 场景 10: 视觉一致性验证

1. 确认 ThreadWindow 整体不再是 dark-only Raycast Glass 风格，而是 cream sidebar + dark product workspace 的双 surface 节奏。
2. 确认顶部工具栏不再显示 connection pill（已移除），TabBar 不显示状态点；running / failed / interrupted / idle 不要求通过 tab 状态点区分，应由消息流、发送/停止按钮、错误提示或状态气泡表达。
3. 确认历史项的 hover / focus / active 视觉边界与点击边界一致：点击 row 空白区域会打开 thread，点击删除图标只触发删除确认。
4. 触发 permission  请求，确认请求面板是 


### 场景 0：并发 thread 工具激活隔离

1. 使用真实 LLM 模式启动桌面 App，打开两个不同 thread。
1. 在 thread A 中提交需要工具的 prompt（例如"看一下我屏幕"），等待出现 `use_tools` 或真实工具调用。
1. 在 thread B 中提交普通聊天 prompt，确认 thread B 不出现 thread A 的真实工具列表或 tool call 气泡。
1. 继续回到 thread A 发送需要工具的第二轮 prompt，确认 thread A 仍可继续使用真实工具，不会退回只暴露 `use_tools`。
1. 打开 `~/.spotAgent/log/<YYYY-MM-DD>/network-NNN.jsonl`，对比两条 thread 的请求体：thread A 激活后应包含完整工具集，thread B 未激活时仍只包含 `use_tools`。

### 场景 1：纯聊天问题不触发工具激活

1. 新建 thread，输入一个不需要工具的普通问题（例如"今天天气怎么样"或"帮我写一首诗"）。
1. 确认模型直接回复，ThreadWindow 中不出现任何 tool call 气泡。
1. 打开 `~/.spotAgent/log/<YYYY-MM-DD>/network-NNN.jsonl`，找到本次请求对应的条目，确认请求体中 `tools` 数组只包含一个名为 `use_tools` 的 tool，不含任何 builtin tool。

### 场景 2：需要工具的 prompt 触发激活并完成调用

1. 新建 thread，输入"看一下我屏幕"或类似需要读取屏幕的 prompt。
1. 确认模型先调用 `use_tools`（ThreadWindow 中出现对应 tool call 气泡），随后调用真实工具（如 `screen.capture`）。
1. 确认 ThreadWindow 中 tool messages 完整出现：`use_tools` 的结果与真实工具的结果均可见。
1. 确认最终 assistant 回复包含对屏幕内容的描述。

### 场景 3：同一 thread 激活后不再重复出现 use_tools

1. 接场景 2，在同一 thread 中再次输入"再读一次桌面前台"或类似 prompt。
1. 确认 ThreadWindow 中本轮不再出现 `use_tools` tool call 气泡，模型直接调用真实工具。
1. 打开 `~/.spotAgent/log/` 中本轮对应的网络日志条目，确认请求体 `tools` 数组已包含完整工具集，不再只有 `use_tools`。

### 场景 4：agent-server 重启后激活状态可恢复

1. 完成场景 2（触发过工具激活的 thread），记录该 thread id。
1. 在终端 kill agent-server 进程，再重新启动（或重启桌面 App）。
1. 在 ThreadWindow 中打开同一 thread，发送新的 user message（例如"再截一次屏"）。
1. 打开 `~/.spotAgent/log/` 中本轮对应的网络日志条目，确认请求体 `tools` 数组直接是完整工具集，不出现新的 `use_tools` 调用（验证 agent-server 通过历史 tool message 正确推断了激活状态）。

### 对于每个可交互的点，都验证一遍，看是否符合预期，这里不当做硬性bug，而是记录下可能不符合的行为，事无巨细

- 本文件中对应条目的用户可见行为、持久化记录、错误文案和隔离边界均符合预期。
- 所有错误路径均有明确文案，不出现静默失败。
- 每个通过的条目都已从本文件删除，并在 [archive.md](./archive.md) 保留完整验证记录。
