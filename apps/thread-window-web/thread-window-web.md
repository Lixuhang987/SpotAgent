# thread-window-web

`apps/thread-window-web` 是 ThreadWindow 的 React 前端。它由 Swift `WKWebView` 加载，直接连接 `ws://127.0.0.1:4317/api/thread`，管理 thread 历史、tabs、消息、请求回执和 composer。

## 技术栈

- **UI 框架**: React + TypeScript
- **样式系统**: Tailwind CSS 3.4+（遵循 Claude warm-canvas / coral / dark product surface 设计语言）
- **组件库**: Radix UI (Accordion, DropdownMenu, ScrollArea 等无样式可访问组件)
- **状态管理**: Zustand + Immer
- **构建工具**: Vite + PostCSS

## 目录职责

| 路径 | 职责 |
|------|------|
| `src/protocol/` | ThreadCommand / ThreadNotification / ServerRequest / ClientResponse 的 TS 编码与类型守卫 |
| `src/thread/` | WebSocket client、重连、命令发送 |
| `src/store/` | `zustand + immer` ThreadWindow 状态源（包含 workspace 列表、展开状态、搜索查询） |
| `src/components/` | UI 组件层（见下方组件架构） |
| `src/styles/` | Tailwind CSS 样式入口（`tailwind.css`） |
| `src/native/` | Swift 注入配置和初始 prompt 接收 |
| `src/utils/` | 工具函数（如 `cn.ts` 用于 Tailwind 类名合并） |

## 组件架构

### 左侧历史边栏

```
HistorySidebar
├── Header（新建按钮 + 标题）
├── SearchInput（搜索框，过滤所有分组）
└── WorkspaceGroups（Radix Accordion）
    ├── WorkspaceGroup[]（可展开/收起）
    │   ├── WorkspaceHeader（workspace 名称 + 折叠图标）
    │   └── ThreadList
    │       └── ThreadItem（thread 预览 + 删除按钮）
    └── DefaultGroup（workspaceId: null 的 thread，固定在最下方，默认展开）
```

### 右侧对话区

```
ThreadWorkspace
├── TabBar（tab 切换，Tailwind 样式）
├── MessageList
│   └── MessageBubble（Claude warm-canvas 消息卡）
│       ├── BubbleContent（消息内容 + markdown 渲染）
│       └── MessageActions（操作按钮栏：复制/编辑/重新生成）
└── Composer
    └── AutoResizeTextarea（自动增高输入框，最大 6 行）
```

### 核心组件说明

- **WorkspaceGroup**: 使用 Radix Accordion 实现可折叠的 workspace 分组，展开状态持久化到 store
- **MessageBubble**: 在深色 product surface 上承载 cream assistant card、coral-tinted user card 与 dark code-style tool card，操作按钮栏始终显示
- **Composer**: 输入框自动增高（最小 52px，最大 6 行后滚动），支持 Shift+Return 换行

## 设计系统

遵循根目录 `DESIGN.md` 中的 **Claude warm-canvas editorial** 视觉语言：

- **配色**: 左侧历史栏使用 warm cream canvas（`#faf9f5` / `#efe9de`），右侧 thread workspace 使用 dark product surface（`#181715` / `#252320`），主按钮使用 coral primary（`#cc785c`）。
- **字体**: display 使用 `Tiempos Headline / Cormorant Garamond / EB Garamond` fallback，正文使用 `Inter / system`，tool 内容使用 `JetBrains Mono / ui-monospace`。
- **布局密度**: 保留桌面工具密度；历史 row 和 tab 使用 8px 圆角，消息卡使用 12px 圆角与 24px / 16px 级别内边距。
- **交互边界**: 历史项的 hover / focus / active 视觉边界与打开动作绑定在同一层；删除按钮阻止冒泡，避免误打开 thread。
- **状态色**: running / failed / interrupted / idle 使用 `success` / `error` / `warning` / `on-dark-soft` token。

Tailwind 主题配置见 `tailwind.config.js`，关键 token 由 `tests/designTokens.test.ts` 校验，防止回退到旧 dark-only 配色。

## 协议扩展

相比初版协议，当前版本支持：

- **ThreadMetadata** 扩展了 `workspaceId: string | null` 字段，用于 workspace 分组
- **ThreadCommand** 新增 `workspace.list` 命令（查询可用 workspace）
- **ThreadNotification** 新增 `workspace.listed` 响应（返回 workspace 列表）
- **ThreadStartCommand** 的 `workspaceId` 可选参数，用于创建关联到 workspace 的 thread

向后兼容策略：旧 thread 文件缺失 `workspaceId` 时自动补充为 `null`，归入"默认对话"分组。

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
