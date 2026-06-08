# Sources

`apps/desktop/Sources` 存放 macOS 宿主源码模块。这里是 Swift 源码层的索引，具体职责由各子目录自己的文档继续展开。

## 子目录索引

| 子目录 | 子文档 | 职责 |
|------|------|------|
| `AppServices/` | [app-services.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/app-services.md) | 跨模块共享服务、AppServer/ElectronShell 运行时选择、平台桥、设置、热键和 Thread 摘要注册表 |
| `Coordinator/` | [coordinator.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) | `AppCoordinator` 单向事件流、窗口生命周期协调和 Electron command lifecycle 接入 |
| `PromptPanel/` | [prompt-panel.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/PromptPanel/prompt-panel.md) | 全局快捷键唤起的输入面板、用户主动附件采集入口和提交 UI |
| `Settings/` | [settings.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/Settings/settings.md) | 原生设置窗口 UI 与各设置页 ViewModel |
| `StatusBubble/` | [status-bubble.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/StatusBubble/status-bubble.md) | 默认路径 Swift 状态气泡；Electron flag 路径由 Electron ActivityWindow 承载 React StatusBubble |
| `Theme/` | [theme.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/Theme/theme.md) | SwiftUI 原生界面 theme token 与样式约束 |
| `ThreadWindow/` | [thread-window.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/ThreadWindow/thread-window.md) | 默认路径 Swift `NSWindow/WKWebView` host 与 initial prompt 注入；Electron flag 路径不使用本目录创建 ThreadWindow |

## 边界

- Swift 宿主负责 PromptPanel、Settings、Hotkey、焦点恢复、默认路径 Swift StatusBubble、默认路径 `/api/activity` 轻量状态订阅和 `/api/platform` 平台能力。
- 默认路径由 Swift `ThreadWindow/` 承载 React ThreadWindow；`HANDAGENT_ELECTRON_SHELL=1` 路径由 `apps/electron-shell` 承载 Electron ThreadWindow 和 React StatusBubble。
- Swift 不持有 thread client，不解析 `/api/thread` 的 `ThreadNotification`；默认路径只消费 `/api/activity` 的轻量 `AgentActivityEvent` 更新 StatusBubble。
