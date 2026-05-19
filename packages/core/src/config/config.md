# config

`~/.spotAgent/settings.json` 解析。当前拆成 `ModelSettings` + `ToolSettings` 两个独立 loader，共享同一个文件。

## 文件

| 文件 | 职责 |
|------|------|
| `AppConfig.ts` | `AppConfig` 类型 + `defaultAppConfig`；当前未在主链路使用，预留 |
| `ModelSettings.ts` | `loadModelSettings()`：同步 `readFileSync` 读 `settings.json` 的 `llm.{provider, model, summarizerModel, apiKey, baseUrl, api}`；JSON 解析失败抛错（带文件路径），其它字段缺失走默认；调用方负责是否加缓存 |
| `ToolSettings.ts` | `loadToolSettings()` + `filterToolNames()`：解析 `tools.allowlist / tools.denylist`；`denylist` 优先；JSON 解析失败静默 fallback 到默认 |

## 配置文件结构

```
~/.spotAgent/settings.json
```

```json
{
  "llm": {
    "provider": "openai-compatible",
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

- **LLM 模型配置热加载 + mtime cache**：`SettingsBackedLLMClient.stream` / `complete` 每次先读取 `settings.json` 的 `mtimeMs + size` stamp；stamp 未变时复用上次解析出的有效配置与 `LLMClientFactory` 创建的 client，不调用 `loadModelSettings()`；stamp 变化后同步重读，若 `provider / model / apiKey / baseUrl / api`（摘要路径为 `summarizerModel`）等有效 client 配置变化才重建 client。配合 desktop 端 `AgentSettingsStore` 写盘，模型设置在下一次 LLM 请求可见。
- **tool settings 热加载 + mtime cache**：`SettingsBackedToolRegistry.refresh()` 每次新一轮 user message 进入 runtime 前读取同一个 `settings.json` stamp；stamp 未变时跳过，stamp 变化后重读 `tools.allowlist / tools.denylist`，并原地刷新同一个 `ToolRegistry` 实例，后续 LLM 请求立即看到最新工具列表。
- **`ModelSettings` vs `ToolSettings` 错误处理不一致**：前者 JSON 解析失败抛错（让用户看到明确反馈），后者静默回默认（避免阻塞启动）。当前是有意为之但未在文档中明示，本文件起统一约定。
- **默认 api 不一致**：`defaultModelSettings.api = "responses"`，`VercelClient` 构造默认 `api = "chat"`。生产路径全程透传 settings 故无冲突，但留下了一个潜在 footgun。
- **provider 默认兼容旧配置**：`provider` 缺失或非法时回退到 `openai-compatible`，旧版 `settings.json` 无需迁移即可继续走 OpenAI 兼容路径；当前可选值为 `openai-compatible` 与 `anthropic`。

## 编辑此目录的约束

- 不要把 settings 缓存到模块作用域。读盘优化必须是调用方实例级缓存，并引入 mtime / TTL 失效策略，同时保持模型设置"改完下次请求生效"的语义。
- 新增配置组（例如 `permissions.cacheTtl`）请独立 `XxxSettings.ts` + `loadXxxSettings()`，不要塞回 `ModelSettings`。
- 字段类型要在 `normalizeOptionalString` / `normalizeApiType` 等函数里做防御式校验，未识别值要走默认而非抛错（除了顶层 JSON 解析失败）。
- 文件路径函数 `xxxSettingsFilePath(homeDir = homedir())` 必须保留 `homeDir` 参数，便于测试注入临时目录。

## 相关文档

- 调用方：[apps/agent-server/agent-server.md](/Users/mu9/proj/handAgent/apps/agent-server/agent-server.md)（`SettingsBackedLLMClient` + `SettingsBackedToolRegistry`）
- 设置 UI：[apps/desktop/Sources/AppServices/AgentSettings/agent-settings.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/AgentSettings/agent-settings.md)
- LLM 适配：[llm/llm.md](/Users/mu9/proj/handAgent/packages/core/src/llm/llm.md)
