# settings

## 目录职责

`settings/` 把 `~/.spotAgent/settings.json` 变成运行期依赖：LLM client 和 builtin tool registry。它的共同策略是按文件 `mtimeMs + size` 生成 stamp，stamp 未变化时复用缓存，stamp 变化时重新读取设置。

## 文件

| 文件 | 职责 |
|------|------|
| `SettingsBackedLLMClient.ts` | 在每次 `complete()` / `stream()` 前检查模型设置 stamp，按 provider/model/apiKey/baseUrl/api 创建或复用 core `LLMClientFactory` client；支持 `purpose: "summarizer"` 读取 `summarizerModel` |
| `SettingsBackedToolRegistry.ts` | 按工具设置 stamp 热刷新 builtin tools，复用同一个 `ToolRegistry` 实例，让已注入 runtime 的 registry 可以原地更新 |

## LLM client 热加载

```ts
const settingsStamp = this.readSettingsStamp();
const client = this.clientForStamp(settingsStamp);
return streamLLM(client, messages, tools, options);
```

每次 LLM 请求前都会检查 settings stamp。stamp 一样时直接复用 `cachedClient`；stamp 变化后读取 settings，但只有有效 client 配置真的变化时才重建 provider client。

```ts
private toClientSettings(settings: ModelSettings): SettingsBackedLLMClientSettings {
  return {
    provider: settings.provider,
    model: this.purpose === "summarizer" ? settings.summarizerModel : settings.model,
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl,
    api: settings.api,
    networkLogger: this.networkLogger,
  };
}
```

chat 与 summarizer 共用同一个类。`purpose: "summarizer"` 只改变模型选择，不改变 provider、API key、base URL 或 network logger。

## Tool registry 热加载

```ts
const result = await registerTools({
  registry: this.registry,
  platform: this.options.platform,
  workspaceRegistry: this.options.workspaceRegistry,
  workspaceAskResolver: this.options.workspaceAskResolver,
  settings: this.loadToolSettings(),
});
this.cachedStamp = settingsStamp;
```

`SettingsBackedToolRegistry` 持有一个长期存在的 `ToolRegistry`。刷新时调用 core `registerTools()` 原地替换 builtin tools；`actions/SessionScopedToolRegistry` 会在每轮 user message 前基于这个 builtin registry 重新组合 session 级工具表。

## 上下游关系

- 上游：`server/startDefaultServer` 创建 `SettingsBackedLLMClient` 和 `SettingsBackedToolRegistry`。
- 下游：core `LLMClientFactory`、`registerTools()`、`ToolRegistry`。
- 旁路：LLM client 可注入 `FileNetworkLogger`，把请求/响应 JSONL 写到 `~/.spotAgent/log/`。

## 编辑约束

- settings 文件 watcher 不在本目录引入；保持当前 stamp-on-demand 策略，避免长驻 watcher 生命周期问题。
- 新增会影响 provider client 的配置字段时，必须同步 `toClientSettings()` 和 `sameClientSettings()`。
- 新增 builtin tool 依赖时，优先通过 `SettingsBackedToolRegistry` 构造参数注入，不在 tool registry 内部创建平台或 workspace 实例。

## 下一步阅读

- LLM 配置模型：[packages/core/src/config/config.md](/Users/mu9/proj/handAgent/packages/core/src/config/config.md)
- core LLM 适配：[packages/core/src/llm/llm.md](/Users/mu9/proj/handAgent/packages/core/src/llm/llm.md)
- 工具组合：[actions/actions.md](/Users/mu9/proj/handAgent/apps/agent-server/src/actions/actions.md)
