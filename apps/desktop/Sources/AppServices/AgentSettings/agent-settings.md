# AgentSettings 模块

LLM 模型配置的读写与（旧址的）UI。

## 文件

| 文件 | 职责 |
|------|------|
| `AgentSettingsStore.swift` | `@Observable` + `@MainActor`，从 `~/.spotAgent/settings.json` 读写 LLM 配置，500ms 轮询热加载 |
| `AgentSettingsView.swift` | 模型设置的 SwiftUI 表单（model / api / baseURL / apiKey），使用 `settingsCard()` + `SettingsFieldStyle` + 自定义 segmented picker，由 [Settings/SettingsView](/Users/mu9/proj/handAgent/apps/desktop/Sources/Settings/settings.md) 嵌入 |

## 数据模型

```jsonc
// ~/.spotAgent/settings.json
{
  "llm": {
    "model": "gpt-5-mini",
    "apiKey": "sk-...",
    "baseUrl": "https://api.openai.com/v1",
    "api": "responses"   // responses | chat | completion
  }
}
```

## 设计备注

- 文件路径固定为 `~/.spotAgent/settings.json`（`AgentSettingsStore.settingsFileURL(homeDirectoryURL:)`）。
- 写入用 `JSONEncoder([.prettyPrinted, .sortedKeys])` + `Data.write(.atomic)`，避免半截文件。
- 500ms 轮询比较 raw `Data` 字节，避免相同内容触发无意义刷新。
- `update(_:)` 是唯一写入入口，写后立即 persist 并刷新 `lastLoadedData`。

## 编辑此目录的约束

- **写入路径只一条**：`update { ... }` → `persist()`；不要绕过 `update` 直接改 `settings`。
- **轮询间隔修改需配套测试**：当前 500ms 是 UX/IO 折中值，改动须更新 `AgentSettingsStoreTests`。
- **AgentSettingsView 不直接持有 Store**：通过 [AgentSettingsViewModel](/Users/mu9/proj/handAgent/apps/desktop/Sources/Settings/settings.md) 代理；Store 只作为 ViewModel 的依赖。
- **不要在 Store 里加 LLM 调用 / runtime 状态**：Store 只是 settings.json 的模型配置镜像；agent-server 侧自行 `readFileSync` 读同一个文件。tool allowlist/denylist 当前由 TypeScript loader 支持，但尚未接入桌面 Settings UI。
- **测试**：[AgentSettingsStoreTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/AgentSettingsStoreTests.swift) 必须通过临时 home 目录验证 IO + 轮询。

## 与其他模块的关系

- [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 持有 `AgentSettingsStore` 单例，并通过 `makeSettingsViewModel()` 暴露给 Settings 窗口。
- agent-server（TypeScript 侧）每次 LLM 请求会按文件戳读取同一个 JSON 文件里的模型配置；tool settings 目前只在 agent-server 启动时读取一次。
