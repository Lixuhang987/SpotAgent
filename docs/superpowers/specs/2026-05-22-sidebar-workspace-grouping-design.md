# 侧边栏 Workspace 分组设计

> **状态：历史设计。**
> 本文使用旧 `SessionWindow` / `Session*` 命名和旧 Swift 侧边栏方案，仅用于追溯 workspace 分组诉求。当前实现依据是 React ThreadWindow、`Thread*` 协议和 `workspace.list` / `workspace.listed`。

## 概述

重构 SessionWindow 左侧对话列表，将会话按 workspace 分组展示，替代当前的平铺列表。

## 视觉结构（自上而下）

```
┌─────────────────────────┐
│ ⊕ 新会话            🔍  │  ← header（不变）
├─────────────────────────┤
│ 📁 My Project       [+] │  ← workspace 行（可展开，右侧 + 按钮）
│   ├ session title 1     │  ← 展开后显示该 workspace 下的会话
│   └ session title 2     │
│ 📁 Work Repo        [+] │  ← 另一个 workspace
├─────────────────────────┤
│ ── 默认 ──              │  ← 无 workspace 的会话（默认分组）
│   session title 3       │
│   session title 4       │
├─────────────────────────┤
│ ⚙ 设置                  │  ← footer（不变）
└─────────────────────────┘
```

## 数据层变更

### 1. SessionMetadata 增加 workspaceId

文件：`packages/core/src/storage/SessionRecord.ts`

```typescript
export type SessionMetadata = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  workspaceId?: string | null;  // 新增：关联的 workspace ID，null 表示默认
  actionBinding?: SessionActionBinding;
};
```

### 2. SessionListEntry 增加 workspaceId

文件：`packages/core/src/protocol/SessionMessage.ts`

```typescript
export type SessionListEntry = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  workspaceId?: string | null;  // 新增
};
```

### 3. CreateSessionInput 增加 workspaceId

文件：`packages/core/src/storage/SessionStore.ts`

```typescript
export type CreateSessionInput = {
  id: string;
  title?: string | null;
  createdAt?: string;
  workspaceId?: string | null;  // 新增
  actionBinding?: SessionActionBinding;
};
```

### 4. create_session_request payload 增加 workspaceId

文件：`packages/core/src/protocol/SessionMessage.ts`

```typescript
type: "create_session_request";
payload: {
  initialText?: string;
  attachments?: UserMessageAttachment[];
  actionBinding?: { pluginId: string; promptName: string };
  workspaceId?: string | null;  // 新增
};
```

## 服务端变更

### SessionPersistence.createSession

接受 `workspaceId` 参数，写入 metadata。

### SessionRouter.handleCreateSession

从 `message.payload.workspaceId` 读取并传递给 persistence。

### toSessionListEntry

将 `workspaceId` 包含在返回的 entry 中。

## Swift 客户端变更

### 1. SessionListItem 增加 workspaceId

```swift
struct SessionListItem: Equatable, Identifiable {
    let id: String
    let title: String?
    let updatedAt: String
    let messageCount: Int
    let workspaceId: String?  // 新增
}
```

### 2. SessionSocketClient 解码 workspaceId

在 `list_sessions_response` 解码时读取 `workspaceId` 字段。

### 3. sendCreateSession 增加 workspaceId 参数

```swift
func sendCreateSession(
    initialText: String? = nil,
    attachments: [UserMessageAttachmentPayload] = [],
    actionBinding: ActionBindingPayload? = nil,
    workspaceId: String? = nil  // 新增
)
```

### 4. SessionHistorySidebarView 重构

替换当前的 `LazyVStack(ForEach(filteredItems))` 为分组结构：

- 注入 `workspaces: [WorkspaceEntry]`（从 WorkspaceSettingsViewModel 获取）
- 按 `workspaceId` 对 sessions 分组
- 每个 workspace 渲染为可折叠的 section：
  - 左侧：文件夹图标 + workspace name
  - 右侧：hover 时显示 "+" 按钮，点击触发 `onNewSessionInWorkspace(workspaceId)`
  - 展开/折叠状态用 `@State private var expandedWorkspaces: Set<String>`
- workspace sections 下方渲染默认分组（workspaceId == nil 的 sessions）

### 5. SessionWindowViewModel 变更

- `createNewSession()` → `createNewSession(workspaceId: String? = nil)`
- `createTabWithInitialPrompt` 增加 `workspaceId` 参数
- 新增回调 `onNewSessionInWorkspace`

### 6. SessionWindowView 注入 WorkspaceSettingsViewModel

SessionWindowView 需要将 workspace 列表传递给 sidebar。可通过 Environment 或直接参数注入。

## 交互细节

- workspace 行默认折叠，点击行本身展开/折叠
- workspace 行右侧 "+" 按钮：在该 workspace 下创建新对话（不触发展开/折叠）
- 顶部 "新会话" 按钮：在默认 workspace 下创建新对话（行为不变）
- 搜索模式下忽略分组，平铺显示所有匹配结果
- 会话行的样式、hover、active 指示器、右键菜单保持不变
- 空 workspace（无会话）仍然显示在列表中，方便用户通过 "+" 创建首个对话

## 兼容性

- `workspaceId` 为 optional，旧 session 文件无此字段时视为 `null`（归入默认分组）
- 无需迁移脚本，JSON 反序列化自然兼容
