# example-review

## 目录职责

Plugin Action 示例。复制本目录到 `~/.spotAgent/plugins/example-review/` 后，PromptPanel 会出现 `review` trigger；该 action 会携带 `{ pluginId: "example-review", promptName: "review" }` 创建 session，并绑定 `filesystem` MCP server。

## 子节点

- `plugin.json`：Action manifest。
