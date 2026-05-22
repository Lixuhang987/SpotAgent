# 懒加载工具激活（Lazy Tool Activation）设计

## 背景与目标

HandAgent 是随时唤起的桌面助手，定位是"对话优先、需要时自然过渡到工具调用"。当前实现里，每个 session 的每一轮 LLM 调用都会把全部 builtin tool 与 MCP tool 的定义传给模型，无论用户是想纯聊天还是想触发工具。

这带来两个具体痛点：

1. **Token 成本**：纯聊天场景也要为 tool definitions 付费。当前 builtin 约 11 个 tool，加上 MCP 扩展后 input tokens 持续上涨。
2. **首 token 延迟**：tool definitions 进入 prompt 前缀会拖慢简单对话的响应速度。

目标是：**纯聊天零工具开销，需要工具时无缝过渡，用户无感知**。在不改变现有"chat 与 tool-use 同一对话流"的产品形态下，把工具上下文从"默认全量注入"改成"用户首次需要时按需注入"。

设计明确不解决：

- 模型注意力质量问题（工具太多导致误调用）— 当前不是优化目标。
- 用户主动区分 chat 与 agent 模式 — 用户不应感知这一差异。

## 总体方案

引入一个 **meta-tool `use_tools`** 作为初始 session 唯一可见的工具。

- 新 session 启动时，`SessionScopedToolRegistry` 只包含 `use_tools`。System prompt 不包含 tool-use-policy section（因为没有真实工具）。
- 用户消息进入 LLM 时，模型只看到 `use_tools` 的 schema 与对应描述。
- 模型判断不需要工具 → 直接返回文本回复。本轮 LLM 调用结束，session 工具集保持 `[use_tools]`。
- 模型判断需要工具 → 调用 `use_tools` → runtime 把 registry 扩展为 `[use_tools] + 完整工具集（builtin + MCP）`，并在同一轮内继续 LLM 循环。后续轮次直接基于扩展后的工具集调用，缓存稳定。
- `use_tools` 在激活后仍保留在 registry 中（重复调用走幂等路径，避免历史记忆引发的 `Unknown tool` 边界）。
- 激活状态在 session 生命周期内持久。后续 turn 永远基于已激活后的工具集，不再降级。
- 用户开新 session（重新唤起热键）时回到初始的纯 chat 状态。

唯一真源：`SessionScopedToolRegistry` 当前持有的 tool 集合。不引入额外的 `activationState` 枚举或字段。

## 关键判断与权衡

### 为什么是单级激活而不是 read / write 两级？

最初考虑过 read（只读工具）/ write（写入工具）两级激活，分别对应不同 meta-tool。但深入推演 cache 行为后放弃：

- 用户用只读工具读取大段文件（30–50K tokens 不是少见）后，再触发写入工具时，整段 messages 上下文需要重新进 cache，造成一次大 cache miss。
- HandAgent 的 session 通常较短，多数走纯聊天或纯只读路径，少数才升级到写入。两级激活的额外 cache miss 与控制粒度收益不成比例。
- 工具的"权限敏感性"由 `PermissionPolicy` 单独负责，不需要在工具激活层重复处理。

单级激活：整个 session 最多一次 cache miss（在激活那一轮），实现简单，缓存行为可预测。

### 为什么把 MCP tools 也归入同一次激活？

MCP server 的工具是原子的、不可拆分。一个 server 暴露的多个 tool 可能既有读也有写，由 server 自身决定，agent-server 无法在不调用 `tools/list` 之前判断副作用边界。

把"是否需要工具"统一到一个二值开关上，避免在 `mcp.json` 引入"是否只读"这类不可靠的元数据。

### Meta-tool 的命名、描述与生命周期

工具名固定为 `use_tools`。描述（schema 的 `description` 字段）建议文案：

> "Activate the full set of tools (file access, screen capture, app control, MCP integrations, etc.). Call this whenever you need to perform any action beyond plain conversation. Once activated, the tools become available immediately in the same turn. Optional `reason` argument: a one-line note for audit logs."

输入 schema：`{ reason?: string }`，allow additional properties = false。
输出（首次激活）：`"Tools activated. The full tool catalog is now available."`
输出（重复调用 / 已激活）：`"Tools are already active."`

`use_tools` 在 registry 中**始终保留**（包括激活之后），不从 tool list 中移除。理由：

- 避免"模型从历史记忆里再次调用 use_tools 但 registry 已不含该工具"导致 runtime 抛 `Unknown tool` 的边界。
- meta-tool schema 本身只占 ~50 tokens，激活后保留它对 prompt cache 的稳态成本可忽略。
- 重复调用走幂等路径，只返回简短文本，不触发任何 registry 重建。

激活的具体效果只是"在 registry 里追加真实工具集"，不是"替换 registry"。

### Cache 行为分析

| 场景 | 当前实现 | 新方案 |
|------|----------|--------|
| 纯聊天 N 轮 | 每轮带全量 tool defs，缓存正常 | 每轮只带 meta-tool，缓存正常，**节省 ~95% tool defs token** |
| 第一轮就需要工具 | tools 不变，缓存正常 | 第 1 次 LLM call 仅含 meta-tool；激活后 tools 集合扩展，第 2 次 LLM call cache miss 一次；后续轮次 tools 集合稳定，缓存恢复 |
| 聊几轮后才需要工具 | tools 不变，缓存正常 | 激活时 tools 集合扩展，cache miss 一次（含此前的 chat messages）；后续轮次稳定 |
| 工具任务多轮 | 缓存正常 | 工具集稳定，缓存正常 |

总结：新方案在"激活那一轮"会承担一次 cache miss，但所有纯聊天场景持续节省 token，过渡后续也保持缓存命中。

## 系统改动范围

### `packages/core/src/tools/`

1. 新增 `MetaToolUseTool.ts`（暂定名）：定义 `use_tools` 这个 AgentTool。
   - 不需要平台依赖，纯 schema 工具。
   - 执行体本身不做任何 registry 变更 — 真正的副作用由 `AgentRuntime` 在识别到该 tool 调用后通过 `onMetaToolActivate` 回调触发。AgentTool.call 只返回固定文案。
   - 输入参数：可选 `reason: string`，让模型简单说明为什么需要工具，便于审计。允许为空对象。
   - 输出：固定字符串。AgentTool.call 不知道 session 是否已激活（执行体没有 sessionId 状态判断责任），它统一返回 `"Tools activated. The full tool catalog is now available."`。runtime 在激活回调返回后可覆盖为 `"Tools are already active."` 字符串作为 tool message 内容。
   - 导出常量 `META_TOOL_NAME = "use_tools"`，供 runtime / SystemPrompt / SessionScopedToolRegistry 共用。

2. `registerBuiltins.ts` 不变：仍然按 platform / workspace 能力组装 builtin tool 列表。Meta-tool 不进入 builtin 列表。

### `apps/agent-server/src/SessionScopedToolRegistry.ts`

`SessionScopedToolRegistry` 是当前唯一拥有"完整 tool 集合"知识的地方，是激活逻辑的合适落点。改动：

1. `refreshForSession` 拆成两种模式：
   - **未激活**：`registry.replaceAll([metaUseTool])`。
   - **已激活**：`registry.replaceAll([metaUseTool, ...builtin, ...各 MCP server tools 去重])`，meta-tool 始终在列表前部。
2. 新增 `activate(sessionId)` 方法：把当前 session 标记为已激活，并立刻执行一次"已激活"模式的 refresh。激活后保留持久态。
3. 激活状态在 `SessionScopedToolRegistry` 内部以 `Set<sessionId>` 持有（按 sessionId 隔离，因为该 registry 实例在 agent-server 进程内全局共享）。这只是性能缓存，公开 API 不暴露这个集合 — `refreshForSession` 内部通过查 set 决定走哪条路径。
4. `SessionRuntimeOrchestrator` 在每轮 user message 进入 runtime 前调用 `refreshForSession`；激活的后续 turn 自动得到完整工具集。
5. session 删除时（`SessionRouter` 删除会话路径）需要清理 `Set` 里对应的 sessionId，避免内存泄漏。新增 `forgetSession(sessionId)` 方法。

### `packages/core/src/runtime/AgentRuntime.ts`

`AgentRuntime.handleToolCall` 是工具执行循环的入口。改动：

1. 在 `handleToolCall` 进入 `callTool` 之前识别 tool name === `META_TOOL_NAME`：
   - 若 runtime 持有的 sessionId 已激活（通过 `isSessionActivated?: (sessionId) => boolean` 回调判断），跳过激活回调，直接构造 tool message 内容为 `"Tools are already active."` 并入消息历史。
   - 否则先 `await onMetaToolActivate(sessionId)`，再执行 meta-tool 的 `call`（返回首次激活文案）。
2. 激活回调先于 tool result 入消息历史，确保下一轮 `completeTurn` 读取 `toolRegistry.list()` 时已经看到扩展后的工具集。
3. 权限检查（`resolveToolPermission`）对 meta-tool 跳过 — meta-tool 不是真实能力，不应弹审批。具体实现：在 `handleToolCall` 入口判断到 meta-tool 时直接跳过权限分支，但保留 abort 检查。
4. Tool message 正常写入；runtime 不为 meta-tool 做特殊持久化处理 — 它对历史而言就是一次普通的 tool call + tool result，参与 prompt cache 与 turn 计数。

新增构造选项：

```ts
options?: {
  // 现有字段...
  onMetaToolActivate?: (sessionId: string) => Promise<void>;
  isSessionActivated?: (sessionId: string) => boolean;
}
```

两个回调都可选；若未提供，runtime 退化为"无激活机制"路径（meta-tool 调用直接返回固定文案，registry 不变），便于 core 包独立测试与无 agent-server 场景使用。

`agent-server` 在构造 runtime 时把激活动作绑定到 `SessionScopedToolRegistry`：

```ts
new AgentRuntime(client, scopedRegistry.registry, {
  // 现有选项...
  onMetaToolActivate: async (sessionId) => {
    await scopedRegistry.activate(sessionId);
  },
  isSessionActivated: (sessionId) => scopedRegistry.isActivated(sessionId),
});
```

激活回调失败时（例如 MCP server 全挂），回调内部按现有 `listMcpTools` 失败容错策略处理（log + skip）；激活仍然认为成功，registry 至少包含 `[use_tools, ...builtin]`。

### `packages/core/src/runtime/SystemPrompt.ts`

`buildToolUsePolicySection` 当前已经在 `tools.length === 0` 时返回 null。新方案下：

- 未激活：`tools = [use_tools]`，`tools.length === 1`，会触发 tool-use-policy section。
- 这是不期望的 — 纯聊天场景不应承担 tool-use-policy 的 prompt 成本。

改动：tool-use-policy section 的判定从 `tools.length === 0` 改成"是否存在非 meta-tool"。**决定采用工具名常量方案**，不在 `AgentTool` 上加 `meta?: boolean` 标记 — 当前只有一个 meta-tool，未来也不预期大量增加，加标记是过度抽象。统一在 `tools/MetaToolUseTool.ts` 导出 `META_TOOL_NAME = "use_tools"`，runtime 与 SystemPrompt 复用：

```ts
import { META_TOOL_NAME } from "../tools/MetaToolUseTool.ts";

function hasRealTools(tools: RegisteredTool[]): boolean {
  return tools.some((t) => t.name !== META_TOOL_NAME);
}
```

`buildToolUsePolicySection` 改为基于 `hasRealTools` 判断 — 仅在存在真实工具时返回策略文本，未激活的纯聊天 session 该 section 返回 null。

### `apps/agent-server/src/SettingsBackedToolRegistry.ts`

`SettingsBackedToolRegistry` 按 settings stamp 刷新 builtin tools。改动：

- Meta-tool 不进入 builtin 注册流程，也不受 `~/.spotAgent/settings.json` 的 allowlist/denylist 影响（用户不应能"禁用"激活机制）。
- 该模块的现有逻辑保持不变。

### 协议与持久化

不改动：

- `SessionMessage` 协议帧不变。`use_tools` 调用与其他工具调用走同一个 `tool_message`。
- `SessionPersistence` 保存 messages / events 的逻辑不变。
- 桌面端 SwiftUI 渲染：`use_tools` 在历史里就是一个普通的 tool call。可选增强：未来在 UI 上对该 tool 做更友好的折叠展示（例如不显示，或者显示为"启用工具"小气泡），但**不在本期范围内**。

## 失败与边界场景

1. **激活回调中所有 MCP server 都失败**：`activate` 内部走现有 `listMcpTools` 容错（log + skip），仍标记激活并刷新 registry。runtime 后续 turn 正常工作，registry 至少含 `[use_tools, ...builtin]`。
2. **模型在已激活 session 里再次调用 `use_tools`**：meta-tool 仍在 registry 中。`AgentRuntime.handleToolCall` 识别到该 tool call 时，先查激活集合：若已激活则直接返回 `"Tools are already active."` 字符串，不再触发回调；否则触发 `onMetaToolActivate`。无论哪条路径，tool call 与 tool result 都正常入消息历史，避免上下文断裂。
3. **session 恢复（agent-server 重启）**：`SessionRuntimeOrchestrator` 在新一轮 user message 进入 runtime 前，先从 `SessionPersistence` 拉取该 session 的 messages，若存在 `name === "use_tools"` 且 `status === "success"` 的 tool message，调用 `scopedRegistry.activate(sessionId)` 后再 `refreshForSession`。这样恢复路径与正常激活路径走同一个真源（`Set<sessionId>`），不需要双写。该判定逻辑放在 `SessionRuntimeOrchestrator`，因为它已经持有 persistence 与 scopedRegistry 两个依赖，是天然的胶合点。
4. **AbortSignal 在激活回调中触发**：回调返回后 runtime 自然进下一轮 abort 检查，无需特殊处理。
5. **MCP plugin binding 的 session**：plugin binding 表示用户主动选择了带工具的 action（例如点击某个 plugin prompt），这类 session 应该跳过 meta-tool 阶段。`SessionRuntimeOrchestrator` 在 `binding != null` 时直接调用 `scopedRegistry.activate(sessionId)`，让其进入已激活集合。这样后续 `refreshForSession` 自动走完整工具集路径，无需在 `refreshForSession` 内部分叉判断。
6. **session 删除**：`SessionRouter` 的删除会话路径调用 `scopedRegistry.forgetSession(sessionId)` 清理激活集合，避免长生进程内存泄漏。

## 测试范围

`apps/agent-server/tests/` 与 `packages/core/tests/`（按现有目录约定）：

1. **core / tools / use-tools-meta**：`use_tools` 的 schema 与执行体单测。
2. **core / runtime / lazy-activation**：`AgentRuntime` 在 `use_tools` 调用后会调激活回调，且后续 turn 看到新 registry 内容。用 mock LLMClient 模拟两轮：第一轮回 `use_tools` 调用，第二轮回普通文本。
3. **core / runtime / system-prompt-meta-only**：当 registry 仅含 `use_tools` 时，`buildToolUsePolicySection` 返回 null。
4. **agent-server / session / SessionScopedToolRegistry**：
   - 未激活时 `refreshForSession` 只暴露 meta-tool。
   - `activate(sessionId)` 后 `refreshForSession` 暴露完整 builtin + MCP tools。
   - 多个 sessionId 之间激活状态隔离。
   - plugin binding 的 session 跳过 meta-tool。
5. **agent-server / session / activation-recovery**：从 messages 推断已激活的恢复路径。

`bash ./scripts/test.sh` 应当全部通过。Swift 侧无改动，但仍需 `bash ./scripts/swiftw build` 确认链路打包。

## 文档同步

实施完成后需要更新：

- [packages/core/src/tools/tools.md](/Users/mu9/proj/handAgent/packages/core/src/tools/tools.md)：登记 `use_tools` meta-tool，说明它不是普通 builtin，而是激活机制的入口。
- [packages/core/src/runtime/runtime.md](/Users/mu9/proj/handAgent/packages/core/src/runtime/runtime.md)：在主循环说明里补充 meta-tool 激活分支与 tool-use-policy section 触发条件变化。
- [apps/agent-server/agent-server.md](/Users/mu9/proj/handAgent/apps/agent-server/agent-server.md)：更新 `SessionScopedToolRegistry` 的描述，说明未激活 / 已激活两种模式以及 plugin binding 的快路径。
- [docs/manual-qa.md](/Users/mu9/proj/handAgent/docs/manual-qa.md)：增加新 session 纯聊天 / 触发工具激活 / 激活后续轮 / 重启恢复四个场景。
- [docs/llm-api-integration.md](/Users/mu9/proj/handAgent/docs/llm-api-integration.md)：若 mock 场景涉及 meta-tool，补 mock 触发词。

## 不在本期范围

- 桌面端 UI 对 `use_tools` 的特殊渲染（折叠 / 隐藏 / 改名）。
- 让用户在 settings 里手动选择"始终激活工具"模式（如果未来发现某些重度用户嫌过渡延迟，可补这一项 settings 开关）。
- 工具子分类（read / write / dangerous）的多级激活。
- 基于历史使用习惯的"自动预激活"。
- LLM provider 层面的 prompt cache breakpoint 优化（虽然有助于本设计，但属于独立优化，不耦合）。
