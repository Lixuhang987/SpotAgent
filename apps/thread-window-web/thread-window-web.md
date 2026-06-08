# thread-window-web

`apps/thread-window-web` 是 ThreadWindow 的 React 前端。它由 Swift `WKWebView` 加载，直接连接 `ws://127.0.0.1:4317/api/thread`，管理 thread 历史、tabs、消息、请求回执和 composer。

## 技术栈

- **UI 框架**: React + TypeScript
- **样式系统**: Tailwind CSS 3.4+（遵循 Claude warm-canvas / coral / dark product surface 设计语言）
- **组件库**: Radix UI（当前仅部分组件接入；workspace 折叠尚未形成完整 Accordion.Root 结构）
- **状态管理**: Zustand + Immer
- **构建工具**: Vite + PostCSS

## 目录职责

| 路径 | 职责 |
|------|------|
| `src/` | React Web 前端实现。内部再细分 `protocol/`、`thread/`、`store/`、`components/`、`styles/`、`native/`、`utils/` 等目录；这些是实现细分，不作为本层 DFS 索引。 |
| `tests/` | Vitest 测试，覆盖协议编码/类型守卫、socket client、store 行为与设计 token。 |
| `package.json` | `handagent-thread-window-web` 包元信息、脚本与依赖声明。 |
| `vite.config.ts` | Vite 构建与测试配置入口。 |
| `tailwind.config.js` | Tailwind 主题 token、动画与内容扫描配置。 |
| `postcss.config.js` | PostCSS / Tailwind 处理配置。 |
| `tsconfig.json` | TypeScript 编译配置。 |
| `index.html` | Vite HTML 入口，由开发服务器或构建产物提供给 WebView。 |
| `dist/` | 构建输出目录，属于生成产物。 |
| `node_modules/` | 本地依赖安装目录，属于生成/安装产物。 |
| `thread-window-web.md` | 本文档。 |

## 组件架构

### 左侧历史边栏

```
HistorySidebar
├── Header（新建按钮 + 标题）
├── SearchInput（搜索框，过滤所有分组）
└── WorkspaceGroups（workspace 分组列表；当前父级未接入 Accordion.Root）
    ├── WorkspaceGroup[]（分组触发区与内容区已拆分；完整折叠受 Accordion.Root 缺口限制）
    │   ├── WorkspaceHeader（workspace 名称 + 折叠图标）
    │   └── ThreadList
    │       └── ThreadItem（thread 预览 + 删除按钮）
    └── DefaultGroup（workspaceId: null 的 thread，固定在最下方，默认展开）
```

左侧历史边栏由 `src/utils/sidebarLayout.ts` 根据 ThreadWindow 当前宽度计算：

- 窗口宽度 `>= 760px` 时显示历史边栏，宽度为窗口宽度的 30%，并限制在 220px 到 320px 之间。
- 窗口宽度 `< 760px` 时隐藏历史边栏，右侧对话区切到单列布局。
- 全局 `body` 最小宽度保持低于隐藏阈值，确保缩窄窗口时可以进入隐藏侧栏状态。

### 右侧对话区（GPT 风格布局）

```
ThreadWorkspace
├── TabBar（浏览器风格 tab 切换）
├── MessageList（720pt 居中）
│   └── MessageBubble（GPT 风格消息展示）
│       ├── BubbleContent（消息内容）
│       │   ├── assistant: 透明无背景，全宽
│       │   ├── user: 右对齐，85% 宽，圆角背景
│       │   └── tool: 低调半透明，代码字体
│       ├── TypingIndicator（运行中最后一条 assistant 消息底部）
│       └── MessageActions（hover 显示：复制；编辑/重新生成为禁用占位）
└── Composer（pill 形大圆角输入栏）
    └── 内嵌布局：[附件按钮占位] [文本输入] [发送/停止按钮]
```

### 核心组件说明

- **MessageBubble (GPT 风格)**: 
  - assistant 消息完全透明融入背景，user 消息右对齐带 `surface-card` 背景
  - 操作按钮 hover 时显示（user 消息始终显示）
  - 字号：assistant/user 15px，tool 13px
- **TypingIndicator**: 三个跳动的点，错峰延迟动画，只在运行中的最后一条 assistant 消息显示
- **Composer (pill 形)**: 24pt 圆角容器，内嵌文本输入、发送/停止按钮，与消息区同宽（720pt）；附件按钮当前是禁用占位，标题标注"即将推出"。
- **TabBar (浏览器风格)**: 活跃 tab 与内容区融合（`bg-surface-dark`），非活跃 tab 视觉下沉，关闭按钮 hover 显示
- **MessageActions**: 复制按钮可用；编辑与重新生成按钮当前为禁用占位，标题标注"即将推出"。
- **WorkspaceGroup**: 组件内使用 Radix `Accordion.Item` / `Header` / `Trigger` / `Content`，store 里也有展开状态；但 `HistorySidebar` 当前没有包 `Accordion.Root`，因此不能视为完整可用的 Radix Accordion 折叠能力。

## 设计系统

遵循根目录 `DESIGN.md` 中的 **Claude warm-canvas editorial** 视觉语言：

- **配色**: 左侧历史栏使用 warm cream canvas（`#faf9f5` / `#efe9de`），右侧 thread workspace 使用 dark product surface（`#181715` / `#252320`），主按钮使用 coral primary（`#cc785c`）。
- **字体**: display 使用 `Tiempos Headline / Cormorant Garamond / EB Garamond` fallback，正文使用 `Inter / system`，tool 内容使用 `JetBrains Mono / ui-monospace`。
- **布局密度**: 保留桌面工具密度；历史 row 和 tab 使用 8px 圆角，消息卡使用 12px 圆角与 24px / 16px 级别内边距。
- **交互边界**: 历史项的 hover / focus / active 视觉边界与打开动作绑定在同一层；删除按钮阻止冒泡，避免误打开 thread。
- **状态色**: running / failed / interrupted / idle 对应的 `success` / `error` / `warning` / `on-dark-soft` token 已定义；当前 `TabBar` 已移除状态点，不按这些状态渲染 tab 状态点。

Tailwind 主题配置见 `tailwind.config.js`，关键 token 由 `tests/designTokens.test.ts` 校验，防止回退到旧 dark-only 配色。

## 协议扩展

相比初版协议，当前代码中已有以下协议与状态扩展：

- **ThreadMetadata** 扩展了 `workspaceId: string | null` 字段，用于 workspace 分组
- **ThreadCommand** 新增 `workspace.list` 命令（查询可用 workspace）
- **ThreadNotification** 新增 `workspace.listed` 响应（返回 workspace 列表）
- **ThreadStartCommand** 的 `workspaceId` 可选参数，用于创建关联到 workspace 的 thread

向后兼容策略：旧 thread 文件缺失 `workspaceId` 时自动补充为 `null`，归入"默认对话"分组。

已知实现缺口：`workspace.listed` 的协议类型和 store 处理分支已存在，但 Web 侧 `isThreadNotification` 类型守卫当前缺少 `workspace.listed` case，socket client 会丢弃该 notification。因此当前不能声明完整支持 workspace 分组列表刷新。

## Swift 初始 prompt 桥

Swift `ThreadWindowWebHost.configurationScript` 在 document start 注入 `/api/thread` URL，并安装一个临时 `window.handAgentReceiveInitialPrompt`。这个临时 receiver 只把早到的 payload 放进 `window.handAgentPendingInitialPrompts`。React `App` 挂载后通过 `installInitialPromptReceiver` 安装正式 receiver，立即 flush pending 队列，并调用 `ThreadSocketClient.startInitialPrompt(payload)`。这样即使 `WKNavigationDelegate.didFinish` 早于 React `useEffect`，PromptPanel 提交也不会只打开窗口而丢失新对话。

相关测试：

- `tests/nativeConfig.test.ts`：覆盖 early pending prompt flush。
- Swift 侧 `ThreadWindowWebHostTests`：覆盖配置脚本会安装可排队 receiver。

## 边界

- React 直接持有 `/api/thread` socket。
- socket client 只负责收发、重连和回调派发，不直接改 UI 状态。
- UI 状态以 `zustand + immer` store 为唯一状态源。
- 组件只调用明确 action 或上层 callback，不直接写 WebSocket。
- Swift 不解析 thread notification，不发送 thread command。
- platform tool 仍由 Swift 通过 `/api/platform` 处理。
- 首版不做 StatusBubble 摘要同步。

## 常用命令

```bash
pnpm --filter handagent-thread-window-web test
pnpm --filter handagent-thread-window-web build
```

## 相关文档

- Swift WebView host：[ThreadWindow](/Users/mu9/proj/handAgent/apps/desktop/Sources/ThreadWindow/thread-window.md)
- agent-server socket：[server](/Users/mu9/proj/handAgent/apps/agent-server/src/server/server.md)
- protocol DTO：[protocol](/Users/mu9/proj/handAgent/packages/core/src/protocol/protocol.md)
