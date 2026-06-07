# 后端常驻 Thread 输入队列设计

## 背景

当前 `apps/agent-server` 的主路径是 `turn.start -> ThreadRuntimeOrchestrator.handleUserMessage -> AgentRuntime.runWithMessages`。同一 thread 收到新一轮输入时，orchestrator 会 abort 旧 run，再启动新 run。这个模型能支撑普通多轮对话，但不能表达 Codex 风格的“活跃 turn 运行中继续接收输入”：用户补充输入或子 agent 消息应优先进入当前活跃 turn，由当前 turn 在下一次模型请求前消费，而不是强行中断旧 run。

Codex 参考模型中，Session 持有 `active_turn` 与 `input_queue`。输入先尝试 steer 到 active turn；没有 active turn 时才启动新 turn。`TurnInput` 统一用户输入与程序化 `ResponseInputItem`，active turn 在模型请求之间 drain pending input，并据此决定是否继续 follow-up。

## 本次范围

本次只改 TypeScript 后端，兼容现有 Swift 协议。

- 外部仍接收 `turn.start` 和 `turn.interrupt`。
- `turn.start` 在后端内部转为输入 item。
- thread 运行中收到 `turn.start` 时，不再 abort 当前 run，而是优先 steer 到 active turn 的输入队列。
- thread idle 时收到输入，启动一个新的后台 turn worker。
- 输入 item 抽象覆盖用户输入与未来子 agent 输入，但本次不实现子 agent 工具和 Swift 新协议。
- Swift 前端协议改造、Codex-style `item.*` 事件模型、破坏性协议清理写入 `docs/TODO.md`。

## 推荐方案

在 `apps/agent-server/src/thread` 增加 thread 级常驻 session 控制层，保持 `AgentRuntime` 的 LLM/tool 循环尽量不被大改。

核心对象：

- `ThreadInputItem`
  - `kind: "user"`：现有 `turn.start` 输入，包含 `messageId`、`timestamp`、`text`、`attachments`。
  - `kind: "response"`：未来子 agent / runtime 注入项预留，包含结构化 payload。
- `ThreadInputQueue`
  - 维护 active turn pending items 和 idle pending items。
  - 提供 `enqueueUserInput`、`enqueueResponseItem`、`takePendingForRun`、`hasPendingInput`。
- `ThreadRuntimeOrchestrator`
  - `handleUserMessage` 保留公开方法名以兼容 router 测试和外部调用。
  - 若 thread 正在运行：持久化并通知用户消息，然后把 item 加入当前 active run 的 pending queue，返回。
  - 若 thread 未运行：持久化并通知用户消息，创建 active run，启动后台 drain loop。
  - drain loop 每次从持久化历史构造 runtime messages，调用 `runWithMessages`；如果运行期间产生了 pending input，则继续下一次 runtime follow-up；否则完成 turn 并把 thread 状态置为 idle。

## 数据流

1. Desktop 发送旧协议 `turn.start`。
2. `ThreadCommandRouter` 校验 thread 存在后调用 `orchestrator.handleUserMessage`。
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

为了兼容 Swift，现阶段继续使用既有通知：

- `user.message.recorded`：每条用户输入都会发送，包含原始 `messageId`。
- `turn.started`：只在 idle thread 被唤醒时发送一次，`turnId` 使用启动 worker 的第一条输入 `messageId`。
- `assistant.delta` / `tool.started` / `tool.finished`：仍归属 active turnId。
- `turn.completed`：active worker 真正结束时发送一次。

运行中 steer 的用户输入不会产生新的 `turn.started`，因为外部旧协议没有“输入已 steer”通知。UI 至少能看到新增用户消息；后续更精确的 input ack / item lifecycle 放到破坏性协议改造。

## 错误与中断

- `turn.interrupt` 仍中断当前 active run，并清理 active pending queue。
- 删除运行中 thread 时仍走 `interruptAndWait`。
- runtime 抛非 abort 错误时，active worker 发送 `thread.error`、`turn.completed(status: "failed")`、`thread.status.changed(value: "failed")`，并持久化错误。
- 旧 run 的晚到事件仍由 generation 校验隔离。

## 测试策略

优先补后端 Vitest：

- active thread 收到第二条 `turn.start` 时不 abort 当前 run，而是排队，并立即持久化用户消息。
- 当前 run 结束后如果有 pending input，orchestrator 会继续 follow-up，并最终只发送一次 completed。
- idle thread 收到输入时仍保持原有一轮运行行为。
- `turn.interrupt` 清理 active run 与 pending input，并保持现有 interrupted 事件。
- `ThreadCommandRouter` 继续兼容旧 `turn.start`。

## 非目标

- 不改 Swift `ThreadProtocolClient`。
- 不新增对外 `input.submit` / `turn.steer` 命令。
- 不切换到 Codex-style `item.*` 通知。
- 不实现子 agent 工具，只为子 agent 输入预留 `ThreadInputItem(kind: "response")`。
- 不做跨进程协议破坏性删除。

## 自审

- 无 TBD / TODO 占位。
- 范围限制为后端兼容改造，和用户确认一致。
- 事件兼容策略明确说明了运行中 steer 不产生新 `turn.started`。
- 前端和破坏性协议改造明确排除，并进入 `docs/TODO.md`。
