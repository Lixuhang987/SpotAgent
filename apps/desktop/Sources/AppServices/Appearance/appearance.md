# Appearance 模块

Swift 宿主的主题偏好模型。`AppearanceThemePreference` 只允许 `system` / `light` / `dark`，由 `AgentSettingsStore` 持久化到 `~/.spotAgent/settings.json` 的 `appearance.themePreference`。

## 文件

| 文件 | 职责 |
|------|------|
| `AppearanceTheme.swift` | 定义用户偏好、解析后的主题枚举、`AppearanceSettings` 和传给 Electron/React 的 `HostThemePayload` |

## 边界

- Swift 是主题偏好的唯一写入端；React 只接收宿主传入的 resolved theme，不自行持久化主题。
- `system` 只表示用户偏好，跨进程传递时必须同时带上 Swift 解析后的 `light` 或 `dark`。
- `AppearanceSettings` 与 LLM / tool 设置共享 `~/.spotAgent/settings.json`，更新其中任一字段必须保留其他顶层字段。
