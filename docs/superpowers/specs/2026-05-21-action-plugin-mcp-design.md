# 设计：Action Plugin 与 MCP 工具作用域

## 背景

当前 `PromptPanel` 里的 `PromptAction` 是宿主 UI 动作模型，主要承载“打开设置”“会话历史”等固定入口。它按 `title / keywords` 做过滤，点击后执行 Swift 闭包，不具备 Raycast 式 `触发词 + 参数` 的用户任务入口语义。

新的目标是让 `PromptPanel` 成为日常结构化任务入口：用户输入短触发词，按 `Tab` 在参数之间切换，提交后由本地 prompt 模板生成首条用户消息，并为这个新会话绑定一组 MCP tools。这里的“Plugin”不是旧的私有 tool 子进程协议，而是 HandAgent 产品层的本地 Action 包；MCP 是标准工具提供协议。

截至 2026-05-21，MCP 当前稳定规范为 `2025-11-25`，标准 transport 包括 `stdio` 和 `Streamable HTTP`。本设计按该稳定规范接入 MCP，不实现旧版 deprecated HTTP+SSE 兼容。MCP transport 的连接 session 只是协议细节，不能承载 HandAgent 的会话级 tool scope。

## 目标

- 将产品概念统一为 **Action**：用户主动触发的结构化 prompt 入口。
- Swift 实现类型使用 `ActionDefinition`，避免和 `AppCoordinator.Action` 混淆。
- 从 `PromptPanel` Action 列表中移除“打开设置”“会话历史”等宿主 UI 动作。
- 本地 Plugin 通过 `~/.spotAgent/plugins/<plugin-id>/plugin.json` 暴露 `prompts[]`。
- 每个 `prompt.trigger` 绑定一个 PromptPanel 触发词。
- PromptPanel 根据本地 Plugin manifest 渲染参数槽，并在前端用 `template + arguments` 拼出最终 prompt。
- Agent-server 只接收最终 `initialText` 与 `actionBinding`，不重新解释 prompt 参数。
- MCP tools 由 agent-server 按标准 MCP `tools/list / tools/call` 获取和调用。
- Plugin prompt 触发后强制创建新 session；该 session 才拥有对应 Plugin 绑定的 MCP tools。
- 普通 session 不加载未触发 Plugin 的 tools。
- 支持本地 `stdio` MCP server 和远程 `Streamable HTTP` MCP server。

## 非目标

- 不做 Settings UI 管理 Plugin 或 MCP 配置。
- 不保留现有 `packages/core/src/tools/plugins` 的私有 `tools[] + command` 插件协议。
- 不让 MCP `prompts/list` 决定 PromptPanel UI、trigger 或参数槽。
- 不实现 MCP OAuth 授权 UI；远程 MCP 第一版通过 headers / 环境变量配置认证。
- 不实现复杂模板语法；仅支持 `{{argumentName}}` 占位符替换。
- 不实现模型按需发现 / 激活 MCP server 的 broker 路径；第一版只做用户主动触发型 Plugin Action。
- 不把 Plugin Action 追加到已有 active tab；触发后只创建新 session。

## 术语

- **Action**：用户在 PromptPanel 中通过触发词主动启动的结构化任务入口。
- **ActionDefinition**：Swift 侧实现类型，表示从本地 Plugin prompt 解析出的可触发 Action。
- **Plugin**：HandAgent 本地 Action 包，强制声明 `prompts[]`，可选绑定 `mcpServerIds`。
- **MCP server**：标准 Model Context Protocol server，只作为工具提供方，配置在 `~/.spotAgent/mcp.json`。
- **Action binding**：创建 session 时附带的 `{ pluginId, promptName }`，用于让 agent-server 重新校验 Plugin 并为 session 绑定 MCP tools。

## 本地 Plugin Manifest

Plugin manifest 路径固定为：

```text
~/.spotAgent/plugins/<plugin-id>/plugin.json
```

结构：

```json
{
  "version": 1,
  "id": "review",
  "title": "Review",
  "description": "Review workflows",
  "enabled": true,
  "mcpServerIds": ["github"],
  "prompts": [
    {
      "name": "code_review",
      "trigger": "r",
      "title": "Request Code Review",
      "description": "Asks the LLM to analyze code quality and suggest improvements",
      "template": "你是严格的代码评审助手。请评审以下代码：\n\n{{code}}",
      "arguments": [
        {
          "name": "code",
          "description": "The code to review",
          "required": true
        }
      ],
      "icons": [
        {
          "src": "https://example.com/review-icon.svg",
          "mimeType": "image/svg+xml",
          "sizes": ["any"]
        }
      ]
    }
  ]
}
```

规则：

- `version` 当前只支持 `1`。
- `id` 必须等于目录名 `<plugin-id>`。
- `enabled: false` 时禁用该 Plugin 下全部 prompts。
- `prompts[]` 必须非空。
- `prompts[].name` 在同一个 Plugin 内唯一。
- `prompts[].trigger` 全局唯一，大小写不敏感，不能包含空白字符。
- `prompts[].title` 用于 PromptPanel 展示。
- `prompts[].template` 必填，由 Desktop 渲染成最终 prompt。
- `prompts[].arguments[]` 定义参数槽顺序、名称、描述和必填状态。
- `template` 引用未声明参数时，该 prompt 禁用。
- 参数声明了但 `template` 未引用时允许加载，并记录 warning。
- `icons[]` 第一版只作为 manifest 字段保留；UI 可先不渲染远程 icon。
- `mcpServerIds` 作用于该 Plugin 下所有 prompts；触发任意 prompt 后，该新 session 绑定这些 MCP servers 的 tools。
- 多个 Plugin 的加载顺序按 `<plugin-id>` 字典序稳定排序；trigger 冲突时保留先加载 prompt，禁用后加载冲突项。

## MCP Server 配置

MCP server 注册表路径固定为：

```text
~/.spotAgent/mcp.json
```

结构：

```json
{
  "version": 1,
  "servers": [
    {
      "id": "filesystem",
      "title": "Local Filesystem",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/mu9/work"]
    },
    {
      "id": "github",
      "title": "GitHub MCP",
      "transport": "streamableHttp",
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${GITHUB_MCP_TOKEN}"
      }
    }
  ]
}
```

规则：

- `servers[].id` 全局唯一，由 Plugin 的 `mcpServerIds` 引用。
- `transport: "stdio"` 使用本地命令启动 MCP server。
- `transport: "streamableHttp"` 使用 MCP `2025-11-25` 的 Streamable HTTP transport。
- HTTP headers 支持 `${ENV_NAME}` 环境变量插值。
- 远程认证失败时返回清晰错误，不在第一版弹 OAuth UI。
- 不把 MCP `prompts/list` 用作 Action UI 真源；MCP prompt 能力不参与第一版 Plugin Action 加载。

## PromptPanel 行为

PromptPanel 仍只有一个主输入入口，但输入状态分为普通 prompt 和 Action 参数模式。

### 普通 prompt

没有命中 trigger 时，保持现有普通 prompt 语义：

```text
帮我总结这段话
```

普通 prompt 继续走现有提交路径，可以复用当前 SessionWindow active tab。

### Action 触发

输入第一个 token 命中本地 Plugin prompt 的 `trigger` 后，进入 Action 语义：

```text
r <code>
```

触发后强制创建新 session，不追加到已有 active tab。

### 参数编辑

进入参数模式后，PromptPanel 展示参数槽：

```text
r  [code: ...]  [focus: ...]
```

键盘规则：

- `Tab` 切换到下一个参数。
- `Shift+Tab` 切换到上一个参数。
- 普通输入写入当前参数。
- `Enter` 校验必填参数并提交。
- `Esc` 保持现有关闭行为。
- 当前参数为空时按 `Backspace` 可回到上一个参数；所有参数为空时可退出参数模式回到 trigger 输入。

快速输入支持 positional parser：

```text
r foo bar
```

按 `arguments[]` 顺序填充：

```text
arguments[0] = "foo"
arguments[1] = "bar"
```

如果参数包含空格，可用引号：

```text
r "一段包含空格的代码" "关注并发风险"
```

第一版不做复杂 shell parser，只需要支持普通 token 和双引号字符串。

## 模板渲染

Desktop 在提交前渲染 `template`：

```text
template:
你是严格的代码评审助手。
代码：
{{code}}

关注点：
{{focus}}
```

规则：

- 只支持 `{{argumentName}}` 占位符替换。
- 必填参数为空时不提交，在参数槽显示错误。
- 可选参数为空时替换为空字符串。
- 不支持 `if`、循环、默认值表达式或函数调用。
- 渲染结果作为 `create_session_request.payload.initialText` 发给 agent-server。
- 选区和截图 attachment 仍走现有用户主动添加路径，不会被 template 自动隐式读取。

## 协议扩展

现有 `create_session_request.payload` 需要扩展：

```ts
{
  initialText?: string;
  attachments?: UserMessageAttachment[];
  actionBinding?: {
    pluginId: string;
    promptName: string;
  };
}
```

规则：

- 普通 prompt 不带 `actionBinding`。
- Plugin prompt 必须带 `initialText` 和 `actionBinding`。
- Desktop 不向后端传 `mcpServerIds`，避免执行层信任前端。
- Agent-server 收到 `actionBinding` 后重新读取对应 Plugin manifest，校验 Plugin enabled、prompt 存在、prompt 所属 manifest 仍然有效。
- 校验通过后创建 session metadata，并记录该 session 的 Plugin binding。

## Session Tool Scope

Plugin prompt 触发后，agent-server 为新 session 持久化 tool scope：

```json
{
  "actionBinding": {
    "pluginId": "review",
    "promptName": "code_review",
    "mcpServerIds": ["github"]
  }
}
```

该 metadata 必须写入 session store，而不是只放内存。用户关闭窗口或重启应用后重新打开该 session，它仍然保留当初的 Plugin tool scope。

每轮 runtime 组装可见 tools：

```text
可见 tools =
  builtin tools
  + 当前 session 绑定的 MCP server tools
  - 全局 denylist
  + 权限审批约束
```

规则：

- 普通 session 不加载任何未触发 Plugin 的 MCP tools。
- 一个 Plugin 可绑定多个 `mcpServerIds`。
- `tools/list` 结果可以缓存，但可见性必须按 HandAgent session 过滤。
- `tools/call` 必须校验当前 session 是否绑定该 MCP server。
- MCP transport 的协议 session 只作为连接层细节，不参与 HandAgent session scope 建模。

## Tool 命名与冲突

MCP tool 暴露给 LLM 时使用稳定前缀：

```text
mcp.<serverId>.<toolName>
```

冲突规则：

- builtin tool 优先。
- MCP tool 不覆盖 builtin tool。
- 不同 MCP server 的同名 tool 通过 `serverId` 前缀区分。
- 审计日志记录：
  - HandAgent 暴露名
  - MCP server id
  - MCP 原始 tool name
  - tool input / output / status

## 错误处理

### Plugin manifest 错误

坏 Plugin 不阻塞其他 Plugin：

- JSON 解析失败：禁用该 Plugin。
- `id` 与目录名不一致：禁用该 Plugin。
- `prompts[]` 为空：禁用该 Plugin。
- prompt 缺 `trigger / title / template`：禁用该 prompt。
- trigger 冲突：保留先加载 prompt，禁用后加载冲突项。
- template 引用未声明 argument：禁用该 prompt。

第一版可只记录禁用原因，不做 Settings 管理 UI。

### 提交与 MCP 错误

- template 渲染失败：保留 PromptPanel 参数输入，显示错误。
- agent-server 校验 `actionBinding` 失败：返回明确错误，不启动 runtime。
- MCP server 启动或连接失败：session 可以创建，首轮返回 error message，说明失败的 `mcpServerId`。
- MCP `tools/list` 失败：该 session 仍可用 prompt 继续对话，但不暴露该 server tools，并写入审计 / 状态日志。
- MCP `tools/call` 失败：按现有 tool error 路径返回给模型和 UI。

原则：本地 prompt 定义有效时，prompt 优先可运行；MCP tools 是该 session 的增强能力。

## 迁移

- `PromptAction` 产品语义改为 Action；Swift 实现类型使用 `ActionDefinition`。
- `PromptPanel` 的 Action 列表只展示本地 Plugin prompts。
- “打开设置”保留右上角齿轮按钮，不再作为 Action row。
- “会话历史”不再作为 Action row；本次不重新设计其入口。
- 现有 `packages/core/src/tools/plugins` 私有协议废弃，不作为后续运行路径。
- Agent-server 新增 MCP client adapter，替换现有私有 PluginTool loader。
- `~/.spotAgent/settings.json` 继续只负责模型配置和全局 tool allowlist / denylist。

## 测试

### Swift / PromptPanel

- Plugin manifest 解析：有效 Plugin、缺字段、trigger 冲突、template 引用未知参数。
- trigger 解析：空输入、普通 prompt、`r arg1 arg2`、双引号参数、大小写匹配。
- 参数编辑：`Tab / Shift+Tab` 切换、必填参数校验、`Enter` 提交。
- template 渲染：必填参数、可选空参数、未知占位符。
- 提交语义：普通 prompt 复用 active tab；Plugin prompt 强制新建 session 并带 `actionBinding`。

### Agent-server / Core

- `create_session_request.actionBinding` 校验：Plugin disabled、prompt missing、manifest 变更。
- session metadata 持久化：重启后打开 session 仍保留 Plugin tool scope。
- tool registry 组装：普通 session 不含 MCP tools；Plugin session 含绑定 MCP server tools。
- tool name 冲突：builtin 优先，MCP tools 用 `mcp.<serverId>.<toolName>` 暴露。
- `tools/call` 防越权：未绑定对应 MCP server 的 session 不能调用其 MCP tool。

### MCP client

- `stdio` transport：初始化、`tools/list`、`tools/call`、进程退出、超时。
- `Streamable HTTP` transport：初始化、headers/env 插值、JSON 响应、SSE 响应、连接错误。
- 协议版本：默认按 MCP `2025-11-25`。
- 远程 auth 失败：返回可读错误，不触发 OAuth UI。

## 验证命令

涉及实现时，提交前仍需执行：

```bash
bash ./scripts/test.sh
bash ./scripts/swiftw test
bash ./scripts/swiftw build
```
