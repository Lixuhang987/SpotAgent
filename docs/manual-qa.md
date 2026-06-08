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

### Worktree 基线与 Swift 缓存优化

- 完成日期：2026-06-08
- 实现位置：`scripts/swiftw`、`scripts/package-app.sh`、`scripts/swiftw.test.sh`、`scripts/package-app.test.sh`、`AGENTS.md`、`README.md`、`docs/dev.md`
- 验收结果：新 worktree 的默认基线策略调整为先跑 `bash ./scripts/test.sh`，只有涉及 Swift desktop、`Package.swift`、Swift 脚本、打包脚本或桌面启动链路时才在开始阶段追加 `bash ./scripts/swiftw build`。`swiftw` 与 `package-app.sh` 默认使用主 checkout 的 `.cache/swiftpm/` 作为 SwiftPM 依赖缓存，并支持 `HANDAGENT_SWIFTPM_CACHE_DIR` 与 `HANDAGENT_SWIFT_MODULE_CACHE_DIR` 覆盖缓存路径。已通过 `bash ./scripts/test.sh`、`bash ./scripts/swiftw build`、`bash ./scripts/swiftw test`。

### Thread 输入队列与 input.submit 破坏性迁移

- 完成日期：2026-06-07（后端队列）；2026-06-08（输入协议破坏性迁移）
- 关键 commit：`b0893c5`（后端队列）；`3e562e1`（输入协议迁移）
- 实现位置：`packages/core/src/protocol/ThreadCommand.ts`、`apps/agent-server/src/thread/ThreadInputQueue.ts`、`apps/agent-server/src/thread/ThreadRuntimeOrchestrator.ts`、`apps/agent-server/src/thread/ThreadCommandRouter.ts`、`apps/agent-server/src/server/server.ts`、`apps/thread-window-web/src/protocol/threadProtocol.ts`、`apps/thread-window-web/src/thread/threadSocketClient.ts`、`apps/thread-window-web/src/App.tsx`、`apps/thread-window-web/src/components/Composer.tsx`
- 验收结果：外部用户输入命令统一为 `input.submit`，旧输入命令已从当前 `ThreadCommand` 移除；运行中输入不再中断当前 run，而是排队进入 active turn follow-up；ThreadWindow composer 在 running 状态下仍可提交输入并保留 Stop。已通过 `bash ./scripts/test.sh`、`pnpm --filter handagent-thread-window-web test`、`pnpm --filter handagent-thread-window-web build`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`。

## 文档一致性 smoke（P2）

1. 从 `AGENTS.md → handAgent.md → apps/apps.md / packages/packages.md` 逐层打开文档，确认每级 `<dir>.md` 只索引直接子节点。
1. 检索当前文档中的 `SessionWindow` / `sessionWindow`，确认非归档命中只作为历史旧称说明出现，当前实现统一使用 `ThreadWindow`。
1. 对照 `apps/desktop/Sources/ThreadWindow/thread-window.md`、`apps/thread-window-web/thread-window-web.md` 和 `apps/agent-server/agent-server.md`，确认 Swift 只做 WKWebView host 与 `/api/platform`，React 持有 `/api/thread` 和 ThreadWindow UI 状态。
1. 对照 `packages/core/src/protocol/protocol.md` 与 Web/agent-server 文档，确认 `workspace.list` / `workspace.listed`、`permission.requested` / `permission.answered`、`workspace.requested` / `workspace.answered` 的归属一致。

## Anthropic Provider 真实调用（P1）

1. 配置可用 Anthropic API key 与模型后提交普通文本 prompt，确认 assistant 回复可见且逐段 streaming。
1. 在 Anthropic provider 下触发一个会调用 tool 的 prompt，确认 tool name 经适配后仍能回到点号风格（如 `file.read`），tool result 可回灌给 LLM。

最近阻塞记录：2026-05-24 复查 `~/.spotAgent/settings.json`，当前 `llm.provider` 为 `openai-compatible`，`llm.api` 为 `responses`，`llm.model` 为 `gpt-5.4`，`llm.baseUrl` 为 `http://127.0.0.1:8317/v1`，API key 仅属于 OpenAI 兼容配置；环境变量中没有 `ANTHROPIC_API_KEY` 或 `CLAUDE_API_KEY`，仅有 `ANTHROPIC_BASE_URL`。配置文件没有可用的 Anthropic key 或 Anthropic 模型；在没有用户提供真实 Anthropic 配置前，不能验证 Anthropic streaming 与 tool call 回灌，本项不归档为通过。

最近阻塞记录：2026-06-06 修复 `Anthropic AI SDK provider 错误流被落成空 assistant` 后，继续使用 Anthropic provider、`llm.api = "chat"`、`llm.model = "claude-3-5-haiku-20241022"`、`llm.baseUrl = "https://anyrouter.top/v1"` 与 `ANTHROPIC_AUTH_TOKEN` 真实模式回归。提交 `Use plain text only. Reply exactly: ANTHROPIC_QA_TEXT_AFTER_FIX_20260606` 后，ThreadWindow 不再静默写空 assistant，而是显示红色错误 `Failed after 3 attempts...ssl/tls alert handshake failure`；thread 记录只有 user message，并记录同名 `error` event。当前 anyrouter endpoint 对 Node/AI SDK streaming TLS 握手失败，因此仍未获得 assistant 文本或 Anthropic tool call 回灌证据，本项不能归档为通过。

## agent-server thread 主链路 smoke（P2）

1. 从当前 worktree 执行 `bash ./scripts/swiftw run HandAgentDesktop`。
1. 确认 desktop 成功派生 agent-server，`ps -o pid,ppid,command -p <agent-server-pid>` 中命令路径指向 `apps/agent-server/src/server/server.ts`。
1. 提交一个普通文本 prompt，确认 thread 视图能收到 assistant 回复或明确的模型配置错误气泡，不出现 `agent-server` 入口文件缺失。
1. 在同一 thread 触发一次需要 workspace 或 permission 回流的工具场景，确认权限 / workspace 选择气泡仍能回到当前 thread。
1. 打开对应的 thread 持久化文件，确认本轮 user / assistant 或 tool / event 按预期落盘。

## ThreadWindow WebView + split WebSocket smoke（P2）

1. 从当前 worktree 执行 `bash ./scripts/swiftw run HandAgentDesktop`。
   - 说明：该命令现在会先自动执行 `pnpm --filter handagent-thread-window-web build`，确保开发态 `WKWebView` 加载的 `apps/thread-window-web/dist/index.html` 已存在。
1. 通过 PromptPanel 提交一个普通 prompt，确认打开的是 WKWebView ThreadWindow，React 页面显示新 tab。
1. 确认 React 建立到 `ws://127.0.0.1:4317/api/thread` 的 WebSocket，Swift 建立到 `ws://127.0.0.1:4317/api/platform` 的 WebSocket。
1. 在当前 tab 继续追问，确认消息进入同一个 thread。
1. 打开历史列表，确认 `thread.list`、历史恢复、删除确认可用。
1. 恢复 thread A，确认 React client 发送的是 `thread.resume`，并收到 `thread.snapshot`；不依赖显式 unsubscribe 协议。
1. 触发 permission 或 workspace 请求，确认 React 内联面板可回执，且 `permission.requested` / `workspace.requested` 只回到当前 `threadId` 对应视图。
1. 触发平台能力 tool，例如 `clipboard.read`、`app.frontmost`、`screen.capture` 或 `accessibility.snapshot`，确认 agent-server 通过 `/api/platform` 发出 `platform_request`，Swift 回写 `platform_response`。
1. 暂停或关闭 platform socket 后确认 platform tool 明确失败，但 thread socket 不因此中断。

## PromptPanel initial prompt bridge smoke（P2）

1. 从当前 worktree 执行 `bash ./scripts/swiftw run HandAgentDesktop`。
1. 通过全局快捷键打开 PromptPanel，输入 `PROMPTPANEL_INITIAL_PROMPT_QA_20260608` 后按 Return。
1. 确认 ThreadWindow 打开后不是停留在空的"准备开始"状态，而是创建新 tab，并显示这条 user message。
1. 再次打开 PromptPanel，连续提交第二条不同 prompt，确认复用同一个 ThreadWindow 但创建新的 tab/thread，而不是写入当前 active tab 的 composer thread。
1. 在 `~/.spotAgent/threads/` 找到对应两个 thread 文件，确认每个文件都包含各自的首条 user message。

## PromptPanel ThreadWindow 预热 smoke（P2）

1. 从当前 worktree 执行 `bash ./scripts/swiftw run HandAgentDesktop`。
1. 通过全局快捷键打开 PromptPanel，先不要提交，确认没有 ThreadWindow 跳出，App 不因为隐藏预热额外切到前台窗口。
1. 等待约 1 秒后提交普通 prompt，确认复用已预热的 WKWebView 打开 ThreadWindow，并创建新的 tab/thread。
1. 关闭 ThreadWindow，再次打开 PromptPanel；确认打开 PromptPanel 本身不卡住输入焦点，仍可立即输入。
1. 暂停或断开 agent-server 后打开 PromptPanel，确认只显示 server 不可用提示，不创建隐藏 ThreadWindow，也不丢草稿。

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
3. 确认 workspace 分组按字母顺序排列，"默认对话"分组固定在最下方
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
- [ ] 操作按钮（复制/编辑/重新生成）hover 时显示（user 消息始终显示）
- [ ] assistant/user 消息字号 15px，tool 消息字号 13px

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
2. hover assistant 或 tool 消息，确认操作按钮显示
3. 确认 user 消息的操作按钮始终显示（不需要 hover）
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
4. 触发 permission 或 workspace 请求，确认请求面板是 dark product card，主动作使用 coral，参数 JSON 区域使用 monospace dark code block。

## 开发脚本依赖与打包反馈 smoke（P2）

1. 在缺少根目录 `node_modules` 的干净 worktree 中执行 `bash ./scripts/swiftw run HandAgentDesktop`，确认脚本先输出 `[swiftw] node_modules missing, running pnpm install...`，再执行 ThreadWindow web build 和 Swift run。
1. 在缺少根目录 `node_modules` 的干净 worktree 中执行 `bash ./scripts/package-app.sh --mock-llm`，确认脚本先自动执行 `pnpm install`。
1. 确认打包脚本依次输出 `Building thread-window-web...`、`Building HandAgentDesktop release binary...`、`Code signing app bundle...`，release Swift build 阶段不再表现为 web build 后静默卡住。
1. 确认最终生成 `dist/HandAgentDesktop.app` 并输出 `success`。

## Thread 历史路径与状态气泡 smoke（P2）

1. 提交一个普通 prompt，确认本轮历史写入 `~/.spotAgent/threads/<threadId>.json`，不会写入旧历史目录。
1. 重启 desktop 后打开历史列表，确认刚才的 thread 可恢复，且旧历史目录文件不会作为 AppServices 主历史来源出现。
1. 在一个 thread 运行中观察状态气泡，确认气泡展示最新摘要 / running 状态，点击后回到当前活跃 thread 对应窗口。

## PromptPanel 输入框视觉与拖动 smoke（P2）

1. 从当前 worktree 执行 `bash ./scripts/swiftw run HandAgentDesktop`。
1. 先聚焦任意其他前台 App（例如 TextEdit）。
1. 通过全局快捷键打开 PromptPanel，确认面板出现后无需再点输入框即可直接输入；首行输入区域左侧没有独立图标，也没有独立输入框卡片、背景或边框。
1. 在空输入框状态下，从 placeholder 文字区域右侧到设置按钮左侧的空白区域拖动面板，确认窗口可移动。
1. 输入一段普通文本，确认输入框占满设置按钮左侧剩余空间，不再保留中间拖动空隙。
1. 继续输入多行文本，确认输入框随文本自动增高；达到 5 行后停止增高，并在继续输入时出现垂直滚动条。
1. 按 Return 确认仍会提交 prompt；按 Shift + Return 或 Option + Return 确认可在输入框内插入换行。
1. 点击 PromptPanel 外侧任意区域关闭面板，确认焦点回到唤起前的前台 App。
1. 再次通过全局快捷键打开 PromptPanel，按 `Esc` 或同一全局快捷键收起，确认焦点同样回到唤起前的前台 App。
1. 将 macOS 系统切到深色模式后再次打开 PromptPanel，确认输入文字与 placeholder 仍保持深色高对比显示。

## 全前端 DESIGN.md 视觉一致性 smoke（P2）

1. 从当前 worktree 执行 `bash ./scripts/swiftw run HandAgentDesktop`。
1. 打开 PromptPanel，确认面板是 warm cream canvas，边界是浅 cream hairline，hover action 使用 warm card，强调色为 coral，不再出现旧暗色玻璃或 Mango Amber。
1. 打开 Settings，确认 Tab 区是 cream/surface-soft，顶部导航按钮等分铺满整行，选中态有 coral 强调线；模型、工具、Plugin、Append Prompt、MCP、权限、快捷键、工作区各页字段和分隔线都使用同一套 warm-canvas token。
1. 将 macOS 系统切到深色模式后打开 Settings，确认 Provider / 接口 segmented picker 与文本输入框内容仍保持深色高对比显示。
1. 观察 StatusBubble，确认空闲态是 cream 小浮窗；运行态状态点为 teal，文字强调为 coral，描边和 glow 不遮挡文本。
1. 提交 prompt 打开 ThreadWindow，确认 React 左侧历史栏仍是 cream surface，右侧 workspace 仍是 dark product surface，coral primary 与 SwiftUI 原生界面一致。
1. 将 PromptPanel、Settings、ThreadWindow 都缩到最小可用尺寸附近，确认按钮文字、tab 标题、输入框、状态气泡文本没有重叠、截断到不可读或溢出容器。

## 懒加载工具激活（P1）

最近阻塞记录：2026-05-24 使用真实 LLM 模式重试 `HANDAGENT_LAZY_TOOL_QA_20260524`。首轮已验证 `use_tools` 激活后会调到真实工具链；在允许 `screen.capture` / `accessibility.snapshot` 之前，工具先被判定为拒绝。随后在权限弹窗中选择 `始终允许` 再重试 `HANDAGENT_LAZY_TOOL_QA_20260524_RETRY`，旧版窗口已显示 `window.list` 与 `screen.capture` 的工具结果，但最终仍落到 UI 告警 `AI SDK stream finished without assistant content or tool calls.`，对应旧版 thread 记录也写入了同名 error 事件，因此本项当前仍不能归档为通过。

最近阻塞记录：2026-06-06 复查当前 bug 清单，`docs/bugs.md` 仍保留 P1 缺陷 `AI SDK stream finished without assistant content or tool calls`。该缺陷正覆盖本项场景 2–4 的真实 provider 工具调用收尾链路：工具结果已能进入 ThreadWindow，但最终 assistant 总结无法稳定产生。因此在该 P1 缺陷修复前，本项仍不能归档为通过。

最近阻塞记录：2026-05-23 在 `main` 合并 `feat/lazy-tool-activation` 后完成基线验证：`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build` 均通过。实机 QA 先用 `bash ./scripts/package-app.sh --mock-llm` 验证 App 可打包启动，但 mock LLM 不写真实 network log，也不会生成 `use_tools` 激活调用，因此不能作为本项通过证据。随后使用 settings/真实 LLM 模式重新打包启动，纯聊天首轮请求成功返回，网络日志 `/Users/mu9/.spotAgent/log/2026-05-23/network-001.jsonl` 显示请求体 `tools` 只包含 `use_tools`，且 thread 只有 user/assistant 消息，没有 tool message。继续在同一 thread 发送 `Please read my screen. HANDAGENT_LAZY_TOOL_QA_20260523` 后，日志写入第二轮 request，`tools` 仍只包含 `use_tools`，但超过 1 分钟没有对应 response 行，thread 文件仍只有 3 条消息且 `events: []`。因此场景 1 的“纯聊天不激活真实工具”已有证据，场景 2–4 受真实 LLM 流未返回阻塞，暂不能归档通过。QA 后已停止 `HandAgentDesktop`，`agent-server` 随父进程退出。

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



- 本文件中对应条目的用户可见行为、持久化记录、错误文案和隔离边界均符合预期。
- 所有错误路径均有明确文案，不出现静默失败。
- 每个通过的条目都已从本文件删除，并在 [archive.md](./archive.md) 保留完整验证记录。
