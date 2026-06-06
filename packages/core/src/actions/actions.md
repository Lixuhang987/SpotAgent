# actions

Action manifest 与 thread action binding 解析。Desktop 负责读取 manifest prompts 来构建 `ActionDefinition`、渲染 prompt template 与注册 Action 全局快捷键；agent-server 在 plugin action 创建 thread 时重新读取 manifest，校验 `{ pluginId, promptName }` 并解析 `mcpServerIds`。

| 文件 | 职责 |
|------|------|
| `PluginManifest.ts` | 解析 `~/.spotAgent/plugins/<plugin-id>/plugin.json` 的 `version / id / title / enabled / mcpServerIds / prompts[]`；prompt 支持 `kind: "plugin" | "skill"` 与 `globalShortcut` |
| `ActionBinding.ts` | 从 plugin prompt manifest 与 `{ pluginId, promptName }` 解析可持久化的 action binding；当前类型会随 storage 迁移切到 `ThreadActionBinding`；拒绝 `kind: "skill"` 的 prompt 绑定工具 |

## 约束

- manifest 第一版只支持 `prompts[]`，不包含私有 tool 执行协议。
- prompt 默认 `kind` 是 `"plugin"`；显式 `kind: "skill"` 表示只渲染并提交 prompt，不创建 `actionBinding`，也不激活 plugin MCP scope。
- `globalShortcut` 是 prompt 级默认 Action 全局快捷键配置，只影响 desktop 宿主，不写入 thread metadata。
- `mcpServerIds` 属于 plugin 级别；plugin thread 创建后会写入 metadata，后续 runtime 按 thread metadata 决定 MCP scope。
- agent-server 必须重新读取 manifest 校验 desktop 传来的 action binding，不能信任 desktop 传入 MCP server 列表。
