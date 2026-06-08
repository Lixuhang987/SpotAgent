# Thread 模块

thread 状态注册表与本地历史读取，分别跟踪当前宿主内存状态与 `~/.spotAgent/threads/` 下的持久化 thread 文件。

## 文件

| 文件 | 职责 |
|------|------|
| `ThreadRegistry.swift` | `@Observable` + `@MainActor`，维护 `summaries: [String: ThreadSummary]`，按 `lastActiveAt` 排序，提供 `primaryThreadID`，并接收默认路径 `/api/activity` 轻量状态更新 |
| `ThreadHistoryStore.swift` | 读取 / 删除 `~/.spotAgent/threads/*.json`，把持久化 thread 解析为 `ThreadHistoryEntry` / `ThreadHistoryDetail`；保留给本地历史文件调试与后续工具使用 |

## 数据模型

```swift
ThreadSummary {
    threadId: String
    isRunning: Bool
    latestSummary: String
    lastActiveAt: Date
    windowIsOpen: Bool
}
```

## 设计备注

- `@Observable` 替代 `ObservableObject`；属性直接被 SwiftUI 订阅，无需 `@Published`。
- `primaryThreadID` 优先返回正在运行且窗口打开的 thread；其次返回任意打开窗口的 thread。
- 纯内存状态，不持久化（app 重启后清空）。
- 默认路径下，`AgentActivityConnectionClient` 只把 `/api/activity` 的 `activeThreadId`、`status`、`latestSummary`、`updatedAt` 写入 `ThreadRegistry`；它不解析 `/api/thread`，不保存完整消息、tabs 或历史。
- `ThreadHistoryStore` 是本地只读视图，不参与 agent-server runtime 编排；它只读取已经由 agent-server 主链路写入的 JSON 文件，按 `updatedAt` 倒序返回，损坏文件会跳过。
- React ThreadWindow 的历史列表由 agent-server 的 `/api/thread` 协议读取；`ThreadHistoryStore` 不参与主 UI 历史流。
- 历史 preview 优先取第一条非空消息文本；多模态 `content` 只抽取 `type: "text"` 的片段，不展开图片 blob。

## 编辑此目录的约束

- 新增 summary 字段先看能否从已有字段派生；不要为 UI 单一展示需求加缓存。
- 新增历史展示字段优先从 `PersistedThread.metadata` 或 `messages` 派生；跨进程持久化格式变更必须同步 [packages/core storage 文档](/Users/mu9/proj/handAgent/packages/core/src/storage/storage.md) 或对应协议文档。
- 排序与 primary 选择是纯函数，便于测试 — 新规则保持纯函数风格。
- 不要把 view model 引用塞进 Registry，避免循环。
- 测试：[ThreadRegistryTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/AppServices/Thread/ThreadRegistryTests.swift)、[ThreadHistoryStoreTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/AppServices/Thread/ThreadHistoryStoreTests.swift)。

## 与其他模块的关系

- 当前 `ThreadWindowLifecycle` 只管理全局 `NSWindow/WKWebView` 生命周期与 initial prompt 队列，不依赖 `ThreadRegistry`，也不维护 React ThreadWindow 的 tabs、消息或运行态。
- [StatusBubble ViewModel](/Users/mu9/proj/handAgent/apps/desktop/Sources/StatusBubble/status-bubble.md) 从 `ThreadRegistry` 派生 `isRunning` / `latestSummary`；注册表只代表 StatusBubble 所需的轻量 activity 状态，不能代表 React ThreadWindow 的完整运行状态。
- [ThreadWindow](/Users/mu9/proj/handAgent/apps/desktop/Sources/ThreadWindow/thread-window.md) 只接收 initial prompt 与 web 配置，不从本模块读取历史。
