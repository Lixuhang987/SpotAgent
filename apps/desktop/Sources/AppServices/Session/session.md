# Session 模块

会话状态注册表与本地历史读取，分别跟踪当前宿主内存状态与 `~/.spotAgent/sessions/` 下的持久化会话文件。

## 文件

| 文件 | 职责 |
|------|------|
| `SessionRegistry.swift` | `@Observable` + `@MainActor`，维护 `summaries: [String: SessionSummary]`，按 `lastActiveAt` 排序，提供 `primarySessionID` |
| `SessionHistoryStore.swift` | 读取 / 删除 `~/.spotAgent/sessions/*.json`，把 `PersistedSession` 解析为 `SessionHistoryEntry` / `SessionHistoryDetail`，供 PromptPanel 最近会话 action 与独立 HistoryWindow 使用 |

## 数据模型

```swift
SessionSummary {
    sessionId: String
    isRunning: Bool
    latestSummary: String
    lastActiveAt: Date
    windowIsOpen: Bool
}
```

## 设计备注

- `@Observable` 替代 `ObservableObject`；属性直接被 SwiftUI 订阅，无需 `@Published`。
- `primarySessionID` 优先返回正在运行且窗口打开的会话；其次返回任意打开窗口的会话。
- 纯内存状态，不持久化（app 重启后清空）。
- `SessionHistoryStore` 是本地只读视图，不参与 agent-server runtime 编排；它只读取已经由 core `FileSessionStore` 写入的 JSON 文件，按 `updatedAt` 倒序返回，损坏文件会跳过。
- 历史 preview 优先取第一条非空消息文本；多模态 `content` 只抽取 `type: "text"` 的片段，不展开图片 blob。

## 编辑此目录的约束

- 新增 summary 字段先看能否从已有字段派生；不要为 UI 单一展示需求加缓存。
- 新增历史展示字段优先从 `PersistedSession.metadata` 或 `messages` 派生；跨进程持久化格式变更必须同步 [packages/core storage 文档](/Users/mu9/proj/handAgent/packages/core/src/storage/storage.md) 或对应协议文档。
- 排序与 primary 选择是纯函数，便于测试 — 新规则保持纯函数风格。
- 不要把 `SessionViewModel` 引用塞进 Registry，避免循环。
- 测试：[SessionRegistryTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/SessionRegistryTests.swift)、[SessionHistoryViewModelTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/SessionHistoryViewModelTests.swift)。

## 与其他模块的关系

- [SessionLifecycle](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 在 `open / close` 以及 `SessionViewModel` 状态 / 消息变化回调中调用 `upsert(_:)`，保持状态气泡使用的 `isRunning` 与 `latestSummary` 同步。
- [StatusBubble ViewModel](/Users/mu9/proj/handAgent/apps/desktop/Sources/StatusBubble/status-bubble.md) 派生 `isRunning` / `latestSummary`。
- [AppCoordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 用 `SessionHistoryStore.list()` 生成 PromptPanel 最近会话 action，用 `SessionHistoryViewModel` 打开独立历史窗口。
