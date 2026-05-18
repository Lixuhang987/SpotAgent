# Session 模块

会话状态注册表，跟踪所有活跃 / 历史会话。

## 文件

| 文件 | 职责 |
|------|------|
| `SessionRegistry.swift` | `@Observable` + `@MainActor`，维护 `summaries: [String: SessionSummary]`，按 `lastActiveAt` 排序，提供 `primarySessionID` |

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

## 编辑此目录的约束

- 新增 summary 字段先看能否从已有字段派生；不要为 UI 单一展示需求加缓存。
- 排序与 primary 选择是纯函数，便于测试 — 新规则保持纯函数风格。
- 不要把 `SessionViewModel` 引用塞进 Registry，避免循环。
- 测试：[SessionRegistryTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/SessionRegistryTests.swift)。

## 与其他模块的关系

- [SessionLifecycle](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 在 `open / close` 中调用 `upsert(_:)`。
- [StatusBubble ViewModel](/Users/mu9/proj/handAgent/apps/desktop/Sources/StatusBubble/status-bubble.md) 派生 `isRunning` / `latestSummary`。
