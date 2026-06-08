# 后端常驻 Thread 输入队列设计

## 背景

旧实现的输入主路径是 `turn.start -> ThreadRuntimeOrchestrator.handleUserMessage -> AgentRuntime.runWithMessages`。同一 thread 收到新一轮输入时，orchestrator 会 abort 旧 run，再启动新 run。这个模型能支撑普通多轮对话，但不能表达 Codex 风格的“活跃 turn 运行中继续接收输入”：用户补充输入或子 agent 消息应优先进入当前活跃 turn，由当前 turn 在下一次模型请求前消费，而不是强行中断旧 run。

Codex 参考模型中，Session 持有 `active_turn` 与 `input_queue`。输入先尝试 steer 到 active turn；没有 active turn 时才启动新 turn。`TurnInput` 统一用户输入与程序化 `ResponseInputItem`，active turn 在模型请求之间 drain pending input，并据此决定是否继续 follow-up。

## 本次范围

本次已从兼容改造升级为破坏性迁移：外部输入协议、后端路由和 React ThreadWindow 都迁移到显式 input item 语义，不再保留旧 `turn.start` 输入入口。

- 外部接收 `input.submit` 和 `turn.interrupt`；`turn.start` 不再属于当前 `ThreadCommand`。
- `input.submit` 在后端内部转为 `ThreadInputItem(kind: "user")`。
- thread 运行中收到 `input.submit` 时，不再 abort 当前 run，而是优先 steer 到 active turn 的输入队列。
- thread idle 时收到输入，启动一个新的后台 turn worker。
- 输入 item 抽象覆盖用户输入与未来子 agent 输入，但本次不实现子 agent 工具。
- React ThreadWindow 已从 `encodeTurnStart` / `startTurn` 迁移到 `encodeInputSubmit` / `submitInput`；运行中 composer 不再禁用输入提交。
- Swift 宿主仍只注入 initial prompt，不直接发送 thread 命令。
- Codex-style `item.*` 事件模型仍不在本次范围。

## 推荐方案

在 `apps/agent-server/src/thread` 增加 thread 级常驻 session 控制层，保持 `AgentRuntime` 的 LLM/tool 循环尽量不被大改。

核心对象：

- `ThreadInputItem`
  - `kind: "user"`：来自 `input.submit`，包含 `messageId`（由 `inputId` 映射）、`timestamp`、`text`、`attachments`。
  - `kind: "response"`：未来子 agent / runtime 注入项预留，包含结构化 payload。
- `ThreadInputQueue`
  - 维护 active turn pending items 和 idle pending items。
  - 提供 `enqueue`、`waitForItems`、`takeAll`、`hasPending`、`clear`。
- `ThreadRuntimeOrchestrator`
  - 公开入口为 `submitInput`。
  - 若 thread 正在运行：持久化并通知用户消息，然后把 item 加入当前 active run 的 pending queue，返回。
  - 若 thread 未运行：持久化并通知用户消息，创建 active run，启动后台 drain loop。
  - drain loop 每次从持久化历史构造 runtime messages，调用 `runWithMessages`；如果运行期间产生了 pending input，则继续下一次 runtime follow-up；否则完成 turn 并把 thread 状态置为 idle。

## 数据流

1. React ThreadWindow 发送 `input.submit`。
2. `ThreadCommandRouter` 校验 thread 存在后调用 `orchestrator.submitInput`。
3. Orchestrator 将输入归一化为 `ThreadInputItem(kind: "user")`。
4. 用户消息立即持久化，并发送 `user.message.recorded`。
5. 如果 thread 有 active run：
   - item 进入 active run pending queue。
   - 不发送新的 `turn.started`。
   - 不中断当前 AbortController。
6. 如果 thread idle：
   - 创建 active run，发送 `turn.started`。
   - 后台执行 runtime。
7. runtime 完成后，如果 pending queue 非空，继续下一次 runtime follow-up；否则发送 `turn.completed(status: "completed")` 和 `thread.status.changed(value: "idle")`。

## 事件语义

现阶段继续使用既有 turn 运行通知：

- `user.message.recorded`：每条用户输入都会发送，包含原始 `messageId`。
- `turn.started`：只在 idle thread 被唤醒时发送一次，`turnId` 使用启动 worker 的第一条输入 `messageId`。
- `assistant.delta` / `tool.started` / `tool.finished`：仍归属 active turnId。
- `turn.completed`：active worker 真正结束时发送一次。

运行中 steer 的用户输入不会产生新的 `turn.started`，因为 active turn 已经存在。UI 至少能看到新增用户消息；后续更精确的 input ack / item lifecycle 放到 Codex-style `item.*` 协议改造。

## 错误与中断

- `turn.interrupt` 仍中断当前 active run，并清理 active pending queue。
- 删除运行中 thread 时仍走 `interruptAndWait`。
- runtime 抛非 abort 错误时，active worker 发送 `thread.error`、`turn.completed(status: "failed")`、`thread.status.changed(value: "failed")`，并持久化错误。
- 被中断或清理的旧 active run 的晚到事件仍由 generation 校验隔离。

## 测试策略

优先补后端 Vitest：

- active thread 收到第二条 `input.submit` 时不 abort 当前 run，而是排队，并立即持久化用户消息。
- 当前 run 结束后如果有 pending input，orchestrator 会继续 follow-up，并最终只发送一次 completed。
- idle thread 收到输入时仍保持原有一轮运行行为。
- `turn.interrupt` 清理 active run 与 pending input，并保持现有 interrupted 事件。
- `ThreadCommandRouter` 只接受 `input.submit` 作为用户输入命令，不再兼容旧 `turn.start`。

## 非目标

- 不新增 `turn.steer` 命令。
- 不切换到 Codex-style `item.*` 通知。
- 不实现子 agent 工具，只为子 agent 输入预留 `ThreadInputItem(kind: "response")`。

## 自审

- 无 TBD / TODO 占位。
- 范围已升级为破坏性迁移，旧输入入口已删除。
- 事件兼容策略明确说明了运行中 steer 不产生新 `turn.started`。
- Codex-style `item.*` 事件模型仍进入 `docs/TODO.md`。
