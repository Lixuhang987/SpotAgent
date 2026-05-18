# config

`~/.spotAgent/settings.json` 解析。当前拆成 `ModelSettings` + `ToolSettings` 两个独立 loader，共享同一个文件。

## 文件

| 文件 | 职责 |
|------|------|
| `AppConfig.ts` | `AppConfig` 类型 + `defaultAppConfig`；当前未在主链路使用，预留 |
| `ModelSettings.ts` | `loadModelSettings()`：每次同步 `readFileSync` 读 `settings.json` 的 `llm.{model, summarizerModel, apiKey, baseUrl, api}`；JSON 解析失败抛错（带文件路径），其它字段缺失走默认 |
| `ToolSettings.ts` | `loadToolSettings()` + `filterToolNames()`：解析 `tools.allowlist / tools.denylist`；`denylist` 优先；JSON 解析失败静默 fallback 到默认 |

## 配置文件结构

```
~/.spotAgent/settings.json
```

```json
{
  "llm": {
    "model": "gpt-5-mini",
    "summarizerModel": "claude-haiku-4-5-20251001",
    "apiKey": "sk-...",
    "baseUrl": "https://api.openai.com/v1",
    "api": "responses"
  },
  "tools": {
    "allowlist": ["file.read", "file.write", "workspace.list"],
    "denylist": ["clipboard.read"]
  }
}
```

## 当前实现特点

- **每次 LLM 请求都重读**：`SettingsBackedLLMClient.complete` 调 `loadModelSettings()`，配合 desktop 端 `AgentSettingsStore` 500ms 轮询写盘，达到"改完即生效"。摘要专用 client 读取 `summarizerModel`，缺省为 `claude-haiku-4-5-20251001`。代价是 LLM 热路径上的同步 IO（架构改进项）。
- **tool settings 只在启动时读取**：`startDefaultServer` 调一次 `loadToolSettings()` 后构造 registry；`tools.allowlist / tools.denylist` 手工修改后，需要重启 agent-server 才会影响已暴露 tool 列表。
- **`ModelSettings` vs `ToolSettings` 错误处理不一致**：前者 JSON 解析失败抛错（让用户看到明确反馈），后者静默回默认（避免阻塞启动）。当前是有意为之但未在文档中明示，本文件起统一约定。
- **默认 api 不一致**：`defaultModelSettings.api = "responses"`，`VercelClient` 构造默认 `api = "chat"`。生产路径全程透传 settings 故无冲突，但留下了一个潜在 footgun。

## 编辑此目录的约束

- 不要把 settings 缓存到模块作用域。若要优化读盘，必须引入 mtime / TTL 失效策略，并同时保持模型设置"改完下次请求生效"的语义。
- 新增配置组（例如 `permissions.cacheTtl`）请独立 `XxxSettings.ts` + `loadXxxSettings()`，不要塞回 `ModelSettings`。
- 字段类型要在 `normalizeOptionalString` / `normalizeApiType` 等函数里做防御式校验，未识别值要走默认而非抛错（除了顶层 JSON 解析失败）。
- 文件路径函数 `xxxSettingsFilePath(homeDir = homedir())` 必须保留 `homeDir` 参数，便于测试注入临时目录。

## 相关文档

- 调用方：[apps/agent-server/agent-server.md](/Users/mu9/proj/handAgent/apps/agent-server/agent-server.md)（`SettingsBackedLLMClient` + `startDefaultServer.loadToolSettings`）
- 设置 UI：[apps/desktop/Sources/AppServices/AgentSettings/agent-settings.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentSettings/agent-settings.md)
- LLM 适配：[llm/llm.md](/Users/mu9/proj/handAgent/packages/core/src/llm/llm.md)
