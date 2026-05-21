# mcp

标准 MCP client 与 tool adapter。第一版支持 `stdio` 和 `Streamable HTTP`，按 MCP `2025-11-25` 稳定规范实现。HandAgent session scope 不依赖 MCP transport session，而是由 session metadata 的 `actionBinding` 决定。

| 文件 | 职责 |
|------|------|
| `MCPConfig.ts` | 解析 `~/.spotAgent/mcp.json` |
| `MCPClient.ts` | 最小 MCP client 接口 |
| `StdioMCPClient.ts` | JSON-RPC over stdio |
| `StreamableHttpMCPClient.ts` | JSON-RPC over Streamable HTTP，支持 JSON 和 SSE 响应 |
| `MCPToolAdapter.ts` | 把 MCP tool 包装为 `AgentTool`，暴露名为 `mcp.<serverId>.<toolName>` |

## 配置形状

```json
{
  "version": 1,
  "servers": [
    {
      "id": "github",
      "title": "GitHub",
      "transport": "stdio",
      "command": "node",
      "args": ["server.js"],
      "env": { "TOKEN": "..." }
    },
    {
      "id": "docs",
      "title": "Docs",
      "transport": "streamableHttp",
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer ${DOCS_TOKEN}" }
    }
  ]
}
```

## 约束

- MCP exposed tool name 统一为 `mcp.<serverId>.<toolName>`。
- `MCPConfig.ts` 只解析配置；client 生命周期和缓存由 agent-server 的 `MCPServerRegistry` 管理。
- Streamable HTTP headers 支持 `${ENV_NAME}` 插值，未设置的环境变量会替换为空字符串。
