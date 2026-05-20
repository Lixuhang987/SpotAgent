# AgentSettings 模块

LLM 模型配置与 tool allowlist / denylist 的读写。

## 文件

| 文件 | 职责 |
|------|------|
| `AgentSettingsStore.swift` | `@Observable` + `@MainActor`，从 `~/.spotAgent/settings.json` 读写 LLM 配置与 tool allowlist / denylist，500ms 轮询热加载 |
| `AgentSettingsView.swift` | 模型设置的 SwiftUI 表单（provider / model / api / baseURL / apiKey），使用 `settingsCard()` + `SettingsFieldStyle` + 自定义 segmented picker，由 [Settings/SettingsView](/Users/mu9/proj/handAgent/apps/desktop/Sources/Settings/settings.md) 嵌入 |

## 数据模型

```jsonc
// ~/.spotAgent/settings.json
{
  "llm": {
    "provider": "openai-compatible", // openai-compatible | anthropic；缺失时默认 openai-compatible
    "model": "gpt-5-mini",
    "apiKey": "sk-...",
    "baseUrl": "https://api.openai.com/v1",
    "api": "responses"   // responses | chat | completion
  },
  "tools": {
    "allowlist": ["file.read", "clipboard.read"], // 可选；为 null 时表示不启用白名单模式
    "denylist": ["screen.capture"]                // 已禁用工具
  }
}
```

## 设计备注

- 文件路径固定为 `~/.spotAgent/settings.json`（`AgentSettingsStore.settingsFileURL(homeDirectoryURL:)`）。
- `AgentLLMProvider` 与 core 的 `ModelSettings.provider` 字符串保持一致；新增 provider 时需要同步 core factory、agent-server 设置读取与桌面 settings UI。
- 写入用 `JSONEncoder([.prettyPrinted, .sortedKeys])` + `Data.write(.atomic)`，避免半截文件。
- 500ms 轮询比较 raw `Data` 字节，避免相同内容触发无意义刷新。
- `update(_:)` 是唯一写入入口，写后立即 persist 并刷新 `lastLoadedData`。

## 编辑此目录的约束

- **写入路径只一条**：`update { ... }` → `persist()`；不要绕过 `update` 直接改 `settings`。
- **轮询间隔修改需配套测试**：当前 500ms 是 UX/IO 折中值，改动须更新 `AgentSettingsStoreTests`。
- **AgentSettingsView 不直接持有 Store**：通过 [AgentSettingsViewModel](/Users/mu9/proj/handAgent/apps/desktop/Sources/Settings/settings.md) 代理；Store 只作为 ViewModel 的依赖。
- **不要在 Store 里加 LLM 调用 / runtime 状态**：Store 只是 settings.json 的配置镜像；agent-server 侧自行 `readFileSync` 读同一个文件。tool allowlist/denylist 现在已由桌面 Settings UI 接入，tool 热加载在 agent-server 侧按文件戳刷新。
- **测试**：[AgentSettingsStoreTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/AppServices/AgentSettings/AgentSettingsStoreTests.swift) 必须通过临时 home 目录验证 IO + 轮询。

## 与其他模块的关系

- [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 持有 `AgentSettingsStore` 单例，并通过 `makeSettingsViewModel()` 暴露给 Settings 窗口。
- agent-server（TypeScript 侧）每次 LLM 请求会按文件戳读取同一个 JSON 文件里的模型配置；每次新一轮 LLM 请求前也会按文件戳刷新 tool registry。
