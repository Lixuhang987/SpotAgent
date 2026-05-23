# plugins

本目录包含三个 Action Plugin manifest 示例。每个子目录都可以原样复制到 `~/.spotAgent/plugins/<plugin-id>/`。

## 直接子节点

- `code-review/plugin.json`：代码审查 prompt 示例，绑定 `handagent_demo` MCP server。
- `meeting-notes/plugin.json`：会议纪要整理 prompt 示例，绑定 `handagent_demo` MCP server。
- `release-notes/plugin.json`：发布说明生成 prompt 示例，绑定 `handagent_demo` MCP server。

## 约束

- 示例只声明 prompt template 与 `mcpServerIds`，不包含私有 tool 执行协议。
- `mcpServerIds` 必须能在 `examples/mcp/mcp.example.json` 或用户自己的 `~/.spotAgent/mcp.json` 中找到。
