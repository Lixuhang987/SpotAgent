# actions

Action Plugin manifest 与 session action binding 解析。Desktop 负责读取同形状 manifest 来渲染 prompt template；agent-server 在创建 session 时重新读取 manifest，校验 `{ pluginId, promptName }` 并解析 `mcpServerIds`。

| 文件 | 职责 |
|------|------|
| `PluginManifest.ts` | 解析 `~/.spotAgent/plugins/<plugin-id>/plugin.json` 的 `version / id / title / enabled / mcpServerIds / prompts[]` |
| `ActionBinding.ts` | 从 manifest 与 `{ pluginId, promptName }` 解析可持久化的 `SessionActionBinding` |

## 约束

- manifest 第一版只支持 `prompts[]`，不包含私有 tool 执行协议。
- `mcpServerIds` 属于 plugin 级别；session 创建后会写入 metadata，后续 runtime 按 session metadata 决定 MCP scope。
- agent-server 必须重新读取 manifest 校验 desktop 传来的 action binding，不能信任 desktop 传入 MCP server 列表。
