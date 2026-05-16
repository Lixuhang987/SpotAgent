# AgentSettings 模块

LLM 模型配置的读写与 UI。

## 文件

| 文件 | 职责 |
|------|------|
| `AgentSettingsStore.swift` | 从 `~/.spotAgent/settings.json` 读写 LLM 配置，500ms 轮询热加载 |
| `AgentSettingsView.swift` | SwiftUI 设置界面（模型名、API 类型、baseURL、apiKey） |

## 数据模型

```swift
// settings.json 结构
{
  "llm": {
    "model": "gpt-5-mini",
    "apiKey": "sk-...",
    "baseUrl": "https://api.openai.com/v1",
    "api": "responses"  // responses | chat | completion
  }
}
```

## 设计备注

- 文件路径固定为 `~/.spotAgent/settings.json`
- 500ms 轮询检测外部修改（对比 raw Data 避免无意义刷新）
- `AgentSettingsView` 直接嵌入 Settings Scene，与 `ShortcutSettingsView` 并列
- `AgentAPIType` 枚举决定 agent-server 使用哪种 API 格式调用 LLM

## 与其他模块的关系

- `HandAgentApp` 持有 `AgentSettingsStore` 作为 `@StateObject`
- agent-server（TypeScript 侧）也读取同一个 settings.json 文件
