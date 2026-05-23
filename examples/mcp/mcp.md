# mcp

本目录包含一个本地 stdio MCP server 示例和可复制的 MCP 配置。

## 直接子节点

- `mcp.example.json`：示例 MCP 配置，声明 `handagent_demo` server。
- `handagent-demo/server.mjs`：最小 MCP stdio server，提供 `echo`、`extract_tasks`、`make_checklist` 三个 tool。

## 示例 tool

- `echo`：回显输入文本，用于验证 tools/list 与 tools/call 链路。
- `extract_tasks`：从文本中抽取简单待办行，适合配合会议纪要 plugin。
- `make_checklist`：把标题和条目生成 Markdown checklist，适合配合代码审查或发布说明 plugin。

## 运行边界

示例 server 只依赖 Node.js 标准库，不读取屏幕、剪贴板、文件或网络。它通过 newline-delimited JSON-RPC 与 `StdioMCPClient` 通信，适合本地开发和测试，不作为生产 MCP server 模板。
