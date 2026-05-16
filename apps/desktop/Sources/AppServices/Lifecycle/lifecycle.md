# Lifecycle 模块

应用生命周期相关的协调逻辑。

## 文件

| 文件 | 职责 |
|------|------|
| `AppActivationPolicyCoordinator.swift` | 根据打开的 SessionWindow 数量切换 activation policy |

## 行为

- 有 SessionWindow 打开时：`.regular`（显示 Dock 图标，出现在 Cmd+Tab）
- 无 SessionWindow 时：`.accessory`（纯后台应用，仅 StatusBubble 可见）

## 设计备注

- 通过 delta 增减计数，避免外部需要维护绝对计数
- `max(0, ...)` 防御性处理，防止计数变负
