# Sources

`apps/desktop/Sources` 存放 macOS 宿主源码模块。这里是 Swift 源码层的索引，具体职责由各子目录自己的文档继续展开。

## 子目录索引

| 子目录 | 子文档 | 职责 |
|------|------|------|
| `AppServices/` | [app-services.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/app-services.md) | 跨模块共享服务、ElectronShell 运行时、平台桥、设置和热键 |
| `Coordinator/` | [coordinator.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) | `AppCoordinator` 单向事件流、Settings 生命周期和 Electron command lifecycle 接入 |
| `PromptPanel/` | [prompt-panel.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/PromptPanel/prompt-panel.md) | 全局快捷键唤起的输入面板、用户主动附件采集入口和提交 UI |
| `Settings/` | [settings.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/Settings/settings.md) | 原生设置窗口 UI 与各设置页 ViewModel |
| `Theme/` | [theme.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/Theme/theme.md) | SwiftUI 原生界面 theme token 与样式约束 |

## 边界

- Swift 宿主负责 PromptPanel、Settings、Hotkey、焦点恢复、Swift <-> Electron command bridge 和 `/api/platform` 平台能力。
- ThreadWindow 与 StatusBubble 由 `apps/electron-shell` 承载；Swift 不创建 `WKWebView` host，不显示 Swift StatusBubble。
- Swift 不持有 thread client，不解析 `/api/thread` 的 `ThreadNotification`，不订阅 `/api/activity`。
