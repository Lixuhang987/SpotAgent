# Session 模块

会话状态注册表，跟踪所有活跃/历史会话。

## 文件

| 文件 | 职责 |
|------|------|
| `SessionRegistry.swift` | 维护会话摘要字典，按最近活跃时间排序，提供 primarySessionID |

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

- `@MainActor` + `ObservableObject`，供 StatusBubble 等 UI 组件观察
- `primarySessionID` 优先返回正在运行且窗口打开的会话，其次返回任意打开窗口的会话
- 纯内存状态，不持久化（app 重启后清空）

## 与其他模块的关系

- `AppDelegate` 在创建/关闭 SessionWindow 时调用 `upsert()`
- `StatusBubbleController` 观察 registry 决定气泡显示内容和点击行为
