# mcp

标准 MCP client 与 tool adapter。第一版支持 `stdio` 和 `Streamable HTTP`，按 MCP `2025-11-25` 稳定规范实现完整客户端能力：`tools`、`prompts`、`resources` 三类 server-side primitive 全部覆盖。HandAgent session scope 不依赖 MCP transport session，而是由 session metadata 的 `actionBinding` 决定。

| 文件 | 职责 |
|------|------|
| `MCPConfig.ts` | 解析 `~/.spotAgent/mcp.json`，含 stdio elicitation 策略 |
| `MCPClient.ts` | MCP client 接口：`initialize` / `tools/*` / `prompts/*` / `resources/*` |
| `StdioMCPClient.ts` | JSON-RPC over stdio，含 `notifications/initialized` 握手与空表单 elicitation 自动响应 |
| `StreamableHttpMCPClient.ts` | JSON-RPC over Streamable HTTP，支持 JSON 和 SSE 响应，跟踪 `Mcp-Session-Id` |
| `MCPToolAdapter.ts` | 把 MCP tool 包装为 `AgentTool`，暴露名为 `mcp.<serverId>.<toolName>` |

## Client 接口

`MCPClient` 接口覆盖 server 的三类 primitive：

- `initialize() => MCPServerInfo`：握手并返回 `protocolVersion`、`serverInfo`、`capabilities`。完成后立即发送 `notifications/initialized`。
- `listTools()` / `callTool(name, args)`：tool 列表与调用，结果为 `MCPCallToolResult { content, isError? }`。
- `listPrompts()` / `getPrompt(name, args?)`：prompt 模板列表与展开，返回 `messages: { role, content }[]`。
- `listResources()` / `readResource(uri)`：资源列表与读取，内容为 `text` 或 base64 `blob`。
- `serverInfo()`：本地缓存的 capabilities，`refreshForSession` 等上层逻辑可按 capability 决定是否调用对应 endpoint。

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
      "cwd": "/path/to/server",
      "requestTimeoutMs": 60000,
      "env": { "TOKEN": "..." },
      "elicitation": { "autoAcceptEmptyForm": true }
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

- `mcp.json` 中配置的所有 server 默认作为**全局** MCP server，会被注入每个 session 的 tool registry，无需依赖 plugin 触发；plugin 的 `mcpServerIds` 与全局列表合并并去重。
- MCP exposed tool name 统一为 `mcp.<serverId>.<toolName>`，避免与 builtin tool 冲突。
- `computer_use` / `computer-use` server id 是兼容例外：agent-server 保留 `mcp.<serverId>.*` 的注入形态，但 client 由 HandAgent 原生 `ComputerUseMCPClient` 接管，底层通过 PlatformBridge 调用本机能力。这样可以兼容 Codex bundled Computer Use 的配置，同时避免直接 spawn Codex 私有 Computer Use MCP 后在 `tools/call` 阶段挂起。
- stdio server 可配置 `cwd`，用于兼容插件原始配置中的相对 command 路径；也可配置 `requestTimeoutMs`，默认 60s，避免外部 server 卡死时拖挂整个会话。
- stdio server 可配置 `elicitation.autoAcceptEmptyForm: true`。该选项只自动接受 `requestedSchema` 为空对象且无必填字段的 form-mode `elicitation/create`，用于 Computer Use 这类本地 App 授权握手；带字段表单或 URL mode 仍返回 decline，不代替用户填写敏感信息或打开外部 URL。
- `MCPConfig.ts` 只解析配置；client 生命周期、capability 缓存与 prompt/resource 调用由 agent-server 的 `MCPServerRegistry` 管理。
- Streamable HTTP headers 支持 `${ENV_NAME}` 插值，未设置的环境变量会替换为空字符串。

## 测试

- [stdio-mcp-client.test.ts](/Users/mu9/proj/handAgent/packages/core/tests/mcp/stdio-mcp-client.test.ts) / [streamable-http-mcp-client.test.ts](/Users/mu9/proj/handAgent/packages/core/tests/mcp/streamable-http-mcp-client.test.ts) — 基础链路。
- [mcp-full-protocol.test.ts](/Users/mu9/proj/handAgent/packages/core/tests/mcp/mcp-full-protocol.test.ts) — 自建 stdio mock server，覆盖 tools + prompts + resources 完整协议。
- [mcp-real-server.integration.test.ts](/Users/mu9/proj/handAgent/packages/core/tests/mcp/mcp-real-server.integration.test.ts) — 通过 `npx @modelcontextprotocol/server-filesystem` 拉起真实参考实现做端到端验证。
