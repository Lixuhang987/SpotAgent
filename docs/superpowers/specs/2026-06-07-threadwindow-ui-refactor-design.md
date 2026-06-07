# ThreadWindow UI 重构设计文档

## 文档元信息

- **日期**: 2026-06-07
- **范围**: apps/thread-window-web 完整 UI 重构
- **目标**: 采用 ChatGPT 风格的布局密度和交互模式，保留 Raycast Glass 视觉风格

## 背景

当前 ThreadWindow 使用原生 CSS 实现，布局密度和交互模式与用户期望的现代 AI 对话界面有差距。用户提供了 ChatGPT 官方页面作为参考，要求重构 UI 以达到类似的视觉完成度和交互体验。

## 设计目标

1. **视觉升级**: 采用 ChatGPT 的布局密度（更宽松的消息间距、更舒适的行高）
2. **功能增强**: 按 workspace 分组历史、消息操作按钮、自动增高输入框
3. **技术现代化**: 引入 Tailwind CSS + Radix UI，建立可维护的主题系统
4. **保持一致性**: 严格遵守现有 Raycast Glass + Mango Amber 设计语言
5. **渐进式实施**: 分 4 个 phase，每个 phase 独立可验证

## 核心约束

- **不改变**: Raycast Glass 玻璃质感、Mango Amber 强调色、dark-only 主题
- **必须兼容**: 现有协议层、WebSocket 通信、状态管理架构
- **向后兼容**: 旧版本持久化文件必须能正常读取
- **测试要求**: 每个 phase 完成后 `bash ./scripts/test.sh` 必须通过

## 技术栈选型

### 新增依赖

```json
{
  "dependencies": {
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "@radix-ui/react-accordion": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.0.0",
    "@radix-ui/react-scroll-area": "^1.0.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0"
  }
}
```

### 技术选择理由

- **Tailwind CSS**: 快速实现设计 token，工具类优先的方式便于维护
- **Radix UI**: 无样式组件库，提供完整的可访问性和键盘导航
- **clsx + tailwind-merge**: 条件样式组合和类名冲突解决

### Tailwind 主题配置

将现有 Raycast Glass design token 映射为 Tailwind 主题：

```js
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0B0B0F',
        surface: 'rgba(255, 255, 255, 0.04)',
        border: 'rgba(255, 255, 255, 0.08)',
        'text-primary': '#F2F2F5',
        'text-secondary': '#9A9AA8',
        accent: {
          DEFAULT: '#FFA947',
          hover: '#FF9420',
          pressed: '#E07F0A',
          subtle: 'rgba(255, 169, 71, 0.14)',
          ring: 'rgba(255, 169, 71, 0.40)',
        },
        error: '#FF5E5E',
        'user-bubble': 'rgba(255, 169, 71, 0.12)',
        'assistant-bubble': 'rgba(255, 255, 255, 0.04)',
        'tool-bubble': 'rgba(255, 255, 255, 0.06)',
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        xxl: '24px',
      },
      borderRadius: {
        panel: '12px',
        bubble: '8px',
      },
    },
  },
};
```

## 协议扩展

### ThreadMetadata 扩展

```typescript
// packages/core/src/storage/threadStore.ts
export interface ThreadMetadata {
  id: string;
  preview: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  workspaceId: string | null;  // 新增字段
}
```

### 新增协议命令

```typescript
// ThreadCommand - workspace 列表查询
export interface WorkspaceListCommand {
  channel: "thread";
  type: "workspace.list";
  commandId: string;
  timestamp: string;
}

// ThreadNotification - workspace 列表响应
export interface WorkspaceListNotification {
  channel: "thread";
  type: "workspace.listed";
  commandId: string;
  workspaces: Array<{
    id: string;
    name: string;
    rootPath: string;
  }>;
}

// ThreadStartCommand - 添加 workspaceId 参数
export interface ThreadStartCommand {
  channel: "thread";
  type: "thread.start";
  commandId: string;
  timestamp: string;
  prompt: string;
  attachments?: ThreadAttachment[];
  workspaceId?: string | null;  // 新增可选字段
}
```

### 向后兼容策略

1. **旧文件读取**: 缺失 `workspaceId` 字段时自动补充为 `null`
2. **旧客户端**: 不发送 `workspaceId` 的命令视为 `workspaceId: null`
3. **默认行为**: `workspaceId: null` 的 thread 归入"默认对话"分组，显示在最下方

## 左侧历史边栏设计

### 组件层级

```
HistorySidebar
├── Header（新建按钮 + 标题）
├── SearchInput
└── WorkspaceGroups（Radix Accordion）
    ├── WorkspaceGroup[]（可展开/收起）
    │   ├── WorkspaceHeader（名称 + 折叠图标）
    │   └── ThreadList
    │       └── ThreadItem（标题 + 删除按钮）
    └── DefaultGroup（固定在最下方，默认展开）
        └── ThreadList
```

### 功能特性

1. **新建对话按钮**: 位于顶部，点击创建空白 thread（发送 `thread.start` 命令）
2. **搜索功能**: 输入框过滤所有分组的 thread（按 `preview` 字段匹配）
3. **Workspace 分组**: 
   - 使用 Radix Accordion 实现折叠/展开
   - 展开状态持久化到 `threadWindowStore`
   - 每个分组显示 workspace 名称
4. **默认分组**: 
   - `workspaceId: null` 的 thread 归入此组
   - 固定在所有 workspace 组下方
   - 默认展开状态
   - 显示名称为"默认对话"

### 状态管理

扩展 `threadWindowStore.ts`：

```typescript
interface ThreadWindowState {
  // 现有字段...
  history: ThreadMetadata[];
  
  // 新增
  workspaces: Array<{ id: string; name: string; rootPath: string }>;
  expandedWorkspaceIds: Set<string>;
  searchQuery: string;
}

// 派生状态：分组逻辑
function groupThreadsByWorkspace(
  threads: ThreadMetadata[],
  workspaces: Workspace[],
  searchQuery: string
) {
  const filtered = searchQuery
    ? threads.filter(t => t.preview?.toLowerCase().includes(searchQuery.toLowerCase()))
    : threads;
  
  const grouped = new Map<string | null, ThreadMetadata[]>();
  for (const thread of filtered) {
    const key = thread.workspaceId ?? null;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(thread);
  }
  
  return {
    workspaceGroups: workspaces.map(ws => ({
      workspace: ws,
      threads: grouped.get(ws.id) ?? [],
    })),
    defaultGroup: grouped.get(null) ?? [],
  };
}
```

## 右侧对话区设计

### 组件层级

```
ThreadWorkspace
├── TabBar（保持现有逻辑，样式用 Tailwind 重写）
├── MessageList
│   └── MessageBubble（新组件）
│       ├── BubbleContent（消息内容 + markdown 渲染）
│       └── MessageActions（操作按钮栏，始终显示）
│           ├── CopyButton（首版实现）
│           ├── EditButton（预留，暂不实现）
│           └── RegenerateButton（预留，暂不实现）
└── Composer
    └── AutoResizeTextarea
```

### 视觉规格（基于 ChatGPT 布局密度）

- **消息气泡内边距**: `px-6 py-4`（24px 水平，16px 垂直）
- **消息之间间距**: `space-y-3`（12px）
- **操作按钮栏**: 高度 32px，`flex gap-1`，始终显示在消息下方
- **消息行高**: `leading-relaxed`（1.625）
- **消息最大宽度**: `max-w-3xl`（768px），居中显示
- **输入框自动增高**: 最小 52px，最大 6 行（约 144px），超出后滚动

### MessageBubble 接口

```typescript
interface MessageBubbleProps {
  message: ThreadMessage;
  onCopy: (text: string) => void;
  onEdit?: (messageId: string) => void;  // 预留
  onRegenerate?: (messageId: string) => void;  // 预留
}
```

### Composer 输入框实现

```typescript
const MAX_ROWS = 6;
const LINE_HEIGHT = 24;

<textarea
  className="resize-none overflow-y-auto"
  style={{
    minHeight: '52px',
    maxHeight: `${MAX_ROWS * LINE_HEIGHT}px`,
  }}
  onInput={(e) => {
    e.currentTarget.style.height = 'auto';
    e.currentTarget.style.height = `${Math.min(
      e.currentTarget.scrollHeight,
      MAX_ROWS * LINE_HEIGHT
    )}px`;
  }}
/>
```

### 移除的元素

- **Connection pill**: 顶部工具栏右侧的连接状态指示器，不再显示

## 实施计划

### Phase 1: 基础设施层（1-2 天）

**目标**: 引入 Tailwind + Radix UI，建立主题系统

**交付物**:
- 安装依赖：`tailwindcss`, `postcss`, `autoprefixer`, Radix UI 组件
- 配置 `tailwind.config.js` 和 `postcss.config.js`
- 创建 `src/styles/tailwind.css` 替换现有 CSS
- 映射 Raycast Glass token 到 Tailwind 主题
- 配置 Vite 集成 PostCSS

**验收标准**:
- `pnpm --filter handagent-thread-window-web build` 成功
- 生成的 CSS 包含 Tailwind utilities
- 现有 UI 可以正常显示（样式可能暂时不完美）

---

### Phase 2: 协议扩展和数据层（2-3 天）

**目标**: 扩展协议支持 workspace 关联

**交付物**:
- `ThreadMetadata` 添加 `workspaceId: string | null` 字段
- `ThreadStartCommand` 添加可选 `workspaceId` 参数
- 新增 `WorkspaceListCommand` 和 `WorkspaceListNotification`
- agent-server 实现 `workspace.list` 命令处理
- `FileThreadStore` 读取时兼容旧文件（自动补 `workspaceId: null`）
- 前端 store 添加 `workspaces` 状态和分组逻辑
- WebSocket 连接后自动请求 workspace 列表

**验收标准**:
- 创建新 thread 时可携带 `workspaceId`
- 旧 thread 文件读取不报错，缺失字段自动补全
- 前端能接收 `workspace.listed` 并存入 store
- `bash ./scripts/test.sh` 通过
- `bash ./scripts/swiftw build` 通过

---

### Phase 3: 左侧边栏重写（3-4 天）

**目标**: 实现 workspace 分组的历史边栏

**交付物**:
- 使用 Radix Accordion 重写 `HistorySidebar` 组件
- 实现 workspace 分组和折叠/展开（状态持久化）
- 默认分组固定在底部
- 搜索功能（过滤跨所有分组）
- 顶部新建对话按钮（创建空白 thread）
- 应用 Tailwind 样式，符合 Raycast Glass 风格

**验收标准**:
- 历史列表按 workspace 正确分组
- 展开/收起状态存入 store，刷新后保持
- 搜索能过滤所有分组的 thread
- 新建按钮创建空 thread 并自动切换到新 tab
- 视觉风格与现有 Swift UI 层协调一致

---

### Phase 4: 右侧对话区重写（4-5 天）

**目标**: 重写消息列表和输入区，达到 ChatGPT 级别的视觉完成度

**交付物**:
- 重写 `MessageList` 和 `MessageBubble` 组件
- 实现固定显示的操作按钮栏
- 实现复制按钮功能（复制消息内容到剪贴板）
- 预留编辑和重新生成按钮（UI 可见但禁用）
- 重写 `Composer`，实现自动增高输入框
- 移除顶部工具栏的 connection pill
- 调整消息密度和间距（符合 ChatGPT 布局）
- 应用 Tailwind 样式

**验收标准**:
- 消息气泡内边距、行高、间距符合设计规格
- 复制按钮能正确复制消息内容
- 输入框自动增高，6 行后出现滚动条
- 预留按钮显示但禁用，有 tooltip 提示"即将推出"
- 视觉完整度达到 ChatGPT 级别
- 所有现有交互功能正常（发送、停止、tab 切换、权限请求）
- `bash ./scripts/test.sh` 通过

---

## 总体时间估算

**10-14 天**，每个 phase 独立提交，保持代码库始终可构建和运行。

---

## 风险和缓解

### 风险 1: Tailwind 构建产物过大

**缓解**: 
- 使用 `content` 配置正确扫描 `.tsx` 文件
- 启用 PurgeCSS（Tailwind 默认集成）
- 生产构建启用压缩

### 风险 2: 旧 thread 文件迁移失败

**缓解**:
- 读取时使用 try-catch 包裹
- 缺失字段自动补全默认值
- 保留原始文件，写入时创建备份

### 风险 3: workspace 分组性能问题（大量 thread）

**缓解**:
- 使用虚拟滚动（Radix ScrollArea 支持）
- 搜索使用防抖（300ms）
- 分组计算使用 useMemo 缓存

### 风险 4: 消息操作按钮影响可读性

**缓解**:
- 按钮栏使用低对比度颜色
- 图标大小适中（16px）
- 间距固定 12px，刚好容纳操作栏

---

## 后续迭代

Phase 4 完成后，以下功能可作为后续迭代：

1. **编辑用户消息**: 点击编辑按钮，消息变为可编辑状态，提交后重新发送
2. **重新生成**: 从当前消息分支，创建新的 turn
3. **消息分支导航**: UI 显示多个分支，可切换查看
4. **历史分组时间段**: 今天、昨天、最近 7 天、更早
5. **右键菜单**: 历史项支持重命名、置顶、归档
6. **快捷键**: 消息操作支持键盘快捷键
7. **Markdown 渲染**: 消息内容支持语法高亮、表格、图片
