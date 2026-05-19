# plugins

本目录实现第一版本地目录插件 tool：从 `~/.spotAgent/plugins/<plugin-id>/plugin.json` 读取 manifest，把每个 tool 包装成 `AgentTool`，执行时通过本地受信任子进程 JSON stdin/stdout 调用。当前实现不提供 OS 级沙箱，插件代码与安装来源需要由用户信任。

## 文件

| 文件 | 职责 |
|------|------|
| `PluginManifest.ts` | 校验插件 manifest：`id / name / version / tools[] / enabled`，每个 tool 包含 `name / description / inputSchema / command / timeoutMs / permissions` |
| `PluginTool.ts` | `AgentTool` 包装器：按 manifest 启动本地可执行文件，向 stdin 写入 `{ input, context, workspace? }`，解析 stdout JSON，处理非 0 exit / invalid JSON / timeout / 输出超限 |
| `loadLocalPluginTools.ts` | 扫描本地插件目录，逐个读取 `plugin.json`，返回可注册 tool 与 disabled reason；坏 manifest 不会阻塞其它插件 |

## manifest 结构

```json
{
  "id": "example",
  "name": "Example Plugin",
  "version": "1.0.0",
  "enabled": true,
  "tools": [
    {
      "name": "plugin.example",
      "description": "执行本地示例能力",
      "inputSchema": {
        "type": "object",
        "properties": {
          "workspaceId": { "type": "string" },
          "relativePath": { "type": "string" }
        },
        "required": ["workspaceId", "relativePath"]
      },
      "command": "tool.js",
      "timeoutMs": 10000,
      "permissions": {
        "workspace": "read"
      }
    }
  ]
}
```

约定：

- 插件目录固定为 `~/.spotAgent/plugins/<plugin-id>/`，`plugin.json.id` 必须等于目录名。
- `command` 必须是相对插件目录的路径，不能是绝对路径、`..` 越界路径，真实路径也不能经 symlink 逃出插件目录。
- `enabled: false` 会禁用该 manifest 内所有 tool；运行时启停优先复用 `tools.allowlist / tools.denylist`。
- tool 名称仍使用点号风格；plugin tool 不允许覆盖 builtin，重复 plugin tool 名称会全部禁用并记录原因。

## 执行协议

插件进程从 stdin 读取单个 JSON：

```json
{
  "input": {},
  "context": {
    "sessionId": "s1",
    "toolCallId": "tc1",
    "pluginId": "example",
    "toolName": "plugin.example"
  },
  "workspace": {
    "workspaceId": "default",
    "relativePath": "notes/a.md",
    "workspaceRoot": "/abs/workspace",
    "absolutePath": "/abs/workspace/notes/a.md",
    "access": "read"
  }
}
```

插件必须向 stdout 写一个 JSON 值作为 tool 结果。stderr 只在失败时拼入错误信息；stdout / stderr 各自有 1 MiB 上限；非 0 exit、stdout 非 JSON、超时、输出超限都会作为 tool error 回到 runtime，不会拖垮 agent-server。超时或输出超限时会尝试终止插件进程组。

## workspace 与权限对齐

- 只有 manifest 声明 `permissions.workspace = "read" | "write"` 时，`PluginTool` 才会解析 `input.workspaceId / input.relativePath`。
- 解析路径复用 builtin 文件 tool 的 workspace 路径校验逻辑：拒绝绝对路径、`..` 越界，并在 `realpath` 后再次确认仍在 workspace root 内。
- 插件只收到经校验后的 `workspaceRoot / absolutePath`；不会从 LLM 入参直接信任任意主机路径。该校验限制的是传给插件的 workspace 路径，不是插件进程自身的文件系统沙箱。
- 权限审批仍由 `AgentRuntime → PermissionPolicy` 统一执行。`FilePermissionPolicy` 的记忆 hash 包含 `toolName`，因此 `file.write` 的 allow 规则不会静默放行 `plugin.*` tool。
