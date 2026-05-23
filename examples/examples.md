# examples

本目录提供可直接复制到本机配置目录的 Action Plugin 与 MCP 示例，用于验证 HandAgent 的 plugin prompt 与 session-scoped MCP tool 注入链路。

## 直接子节点

- `plugins/`：Action Plugin manifest 示例。复制到 `~/.spotAgent/plugins/` 后，PromptPanel 会读取其中的 trigger 与 prompt template。
- `mcp/`：MCP server 与 `mcp.example.json` 示例。复制配置到 `~/.spotAgent/mcp.json` 后，agent-server 会通过 stdio 拉起示例 server。

## 使用方式

从仓库根目录执行：

```bash
mkdir -p ~/.spotAgent/plugins
cp -R examples/plugins/* ~/.spotAgent/plugins/
cp examples/mcp/mcp.example.json ~/.spotAgent/mcp.json
```

`mcp.example.json` 使用仓库相对路径，默认要求从仓库根目录启动 desktop / agent-server。若从其他目录启动，把配置里的 `cwd` 改成仓库根目录绝对路径。
