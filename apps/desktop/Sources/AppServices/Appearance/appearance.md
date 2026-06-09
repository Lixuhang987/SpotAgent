# Appearance 模块

Swift 宿主的主题偏好模型。`AppearanceThemePreference` 只允许 `system` / `light` / `dark`，由 `AgentSettingsStore` 持久化到 `~/.spotAgent/settings.json` 的 `appearance.themePreference`。

## 文件

| 文件 | 职责 |
|------|------|
| `AppearanceChangeObserver.swift` | `AppearanceChangeObserving` 协议与生产 `SystemAppearanceChangeObserver`；生产实现监听 `NSApplication.effectiveAppearance` 变化，并把系统外观变化回调给 Coordinator；启动早期如果 `NSApplication` 尚不可用，`start()` 必须安全返回并允许后续再次启动 |
| `AppearanceTheme.swift` | 定义用户偏好、解析后的主题枚举、`AppearanceSettings` 和传给 Electron/React 的 `HostThemePayload` |
| `AppearanceThemeService.swift` | 从 `AgentSettingsStore` 读取偏好，解析 `system`，提供当前 `AppTheme`，并在偏好变化时回调跨进程同步；`systemAppearanceDidChange()` 由 Coordinator 的系统外观监听回调触发，用于重新下发 resolved theme |

## 边界

- Swift 是主题偏好的唯一写入端；React 只接收宿主传入的 resolved theme，不自行持久化主题。
- `system` 只表示用户偏好，跨进程传递时必须同时带上 Swift 解析后的 `light` 或 `dark`。
- `system` 模式下 macOS 外观变化由 `SystemAppearanceChangeObserver` 监听；Coordinator 只把事件转给 `AppearanceThemeService`，不自行解析颜色 token。
- `AppearanceSettings` 与 LLM / tool 设置共享 `~/.spotAgent/settings.json`，更新其中任一字段必须保留其他顶层字段。
