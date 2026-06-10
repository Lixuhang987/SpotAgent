# Core Agent 运行时模型重构设计

> **状态：设计稿，待实现。**
> 本文定义 core 运行时从一次性 `runWithMessages(...)` 调用迁移到常驻 `Agent + Op` 模型的目标形态。当前代码事实以 `handAgent.md`、`packages/core/src/runtime/runtime.md`、`apps/agent-server/src/thread/thread.md` 和 `apps/thread-window-web/thread-window-web.md` 为准。

## 背景

当前主路径仍以 `ThreadCommandRouter -> ThreadRuntimeOrchestrator -> runtime.runWithMessages(...)` 为中心。`ThreadRuntimeOrchestrator` 已经有 thread-local session、输入队列和 active run 的雏形，但真正驱动 ReAct loop 的接口仍是一次性函数：

```ts
type RuntimeLike = {
  runWithMessages(
    messages: AgentMessage[],
    onEvent: (event: AgentRuntimeEvent) => void,
    runOptions?: AgentRuntimeRunOptions,
  ): Promise<AgentRunResult>;
  waitForPendingSummaries?(messages?: AgentMessage[]): Promise<void>;
};
```

这个接口把“构造历史消息、运行一轮、回传结果”暴露给 app-server。结果是 app-server thread 层需要知道过多 runtime 细节：什么时候取 messages、什么时候等待 summary、什么时候把 runtime event 翻译成 notification、什么时候落盘、什么时候更新 status。

目标模型应当反过来：`thread.start` 创建并启动一个持续运行的 `Agent`，app-server 后续只向该 Agent 投递运行期 `Op`，Agent 内部持续运行 ReAct loop。ReAct loop 不直接处理 WebSocket、持久化、ThreadNotification 或 agent status 细节，这些职责由包装过的 `thread` 端口承担。

## 已确认边界

`Op` 只替代运行期输入，不替代 thread 生命周期命令。

保留为 thread 生命周期命令：

- `thread.start`
- `thread.resume`
- `thread.list`
- `thread.delete`
- `workspace.list`

迁移为运行期 `Op`：

- 当前 `input.submit`
- 当前 `turn.interrupt`

最终形态中，React ThreadWindow 仍通过 `/api/thread` 管理 thread 生命周期，但向已有 thread 发送用户输入或中断时，只发送 `Op`。

## 目标

1. 在 core 运行时模型中建立明确的 `Agent` 结构：
   - `tx_sub`：app-server 向 Agent 发送运行期 `Op` 的入口。
   - `rx_event`：Agent 产生、交给 app-server/thread 外层消费的事件流。
   - `agent_status`：Agent 最后已知状态，和 thread status 共享语义。
   - `session`：本次 thread 运行的配置与服务容器。
2. 将运行期输入统一为 `Op = Interrupt | UserInput`。
3. 将用户输入统一为 `UserInput.items: InputItem[]`，PromptPanel 和 React composer 不再在多个字段之间分散表达文本、图片、选区和 skill action。
4. app-server 收到 `thread.start` 后加载静态配置与 thread 配置，创建常驻 Agent，并让 Agent 的持续函数消费 `rx_sub`。
5. ReAct loop 只依赖包装后的 `thread` 端口发事件，不直接暴露持久化、status 更新和 ThreadNotification 复杂度。
6. 破坏性删除旧的运行期公开语义，不长期保留 `RuntimeLike.runWithMessages(...)` 作为 app-server thread 主路径。

## 非目标

- 不把 `thread.start`、`thread.resume`、`thread.list`、`thread.delete` 改成 `Op`。
- 不引入跨进程断线恢复协议。当前 ThreadWindow 非主动断开后不恢复订阅的约束不在本次改变。
- 不切换到完整 Codex `item.*` 事件模型。
- 不实现子 agent 工具，只让 `Op` 和 `InputItem` 为后续子 agent 输入留出结构位置。
- 不改变 `/api/platform` 的 `PlatformBridgeMessage` 协议。
- 不改变 plugin action binding 的安全边界。plugin action 仍只在 `thread.start.payload.actionBinding` 中传 `{ pluginId, promptName }`，server 端继续重新读取 manifest 校验。

## 方案比较

### 方案 A：只把 `input.submit` 改名成 `op.submit`

优点：

- 改动最小。
- React 和 app-server 协议迁移快。

缺点：

- app-server 仍直接驱动 `runWithMessages(...)`。
- `Op` 只停留在协议层，不能解决 runtime 主接口泄漏 thread 复杂度的问题。
- `Interrupt` 仍可能被当作路由命令处理，而不是 Agent 输入流的一部分。

### 方案 B：保留生命周期命令，运行期切到常驻 Agent

优点：

- 与已确认边界一致。
- `thread.start` 成为加载配置与创建 Agent 的唯一入口。
- `input.submit` 和 `turn.interrupt` 都收敛为投递 `Op`。
- ReAct loop 和 thread 持久化边界清晰，后续子 agent / response item 更容易接入。

缺点：

- `ThreadRuntimeOrchestrator` 需要拆分，测试迁移量较大。
- React 初始 prompt 流程需要从“text + attachments”改成“UserInput”。

### 方案 C：把所有 `/api/thread` 出站消息都改成 `Op`

优点：

- 协议表面最统一。

缺点：

- 生命周期命令和运行期输入混在一个 union，`thread.resume`、`workspace.list` 这类查询命令会污染 Agent 输入通道。
- 与“`Op` 只替代运行期输入”的确认边界冲突。

### 结论

采用方案 B：保留 thread 生命周期命令，运行期输入切到常驻 `Agent + Op`。

## 目标类型

### 运行期输入

`Op` 是运行期输入的唯一语义。建议在 `packages/core/src/protocol/Op.ts` 中定义跨 React、Electron、agent-server 和 core 可复用的 DTO。

```ts
export type Op = UserInputOp | InterruptOp;

export type UserInputOp = {
  type: "user_input";
  opId: string;
  timestamp: string;
  payload: UserInput;
};

export type InterruptOp = {
  type: "interrupt";
  opId: string;
  timestamp: string;
  payload: {
    reason: "user" | "system";
  };
};

export type UserInput = {
  items: InputItem[];
};

export type InputItem =
  | TextInputItem
  | ImageInputItem
  | SkillInputItem
  | TextSelectionInputItem;

export type TextInputItem = {
  type: "text";
  id: string;
  text: string;
};

export type ImageInputItem = {
  type: "image";
  id: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
};

export type SkillInputItem = {
  type: "skill";
  id: string;
  actionId: string;
  title: string;
  prompt: string;
};

export type TextSelectionInputItem = {
  type: "text_selection";
  id: string;
  text: string;
};
```

约束：

- `UserInput.items` 至少包含一个可进入 runtime 的 item。
- 普通文本来自 `TextInputItem`。
- 当前 `PromptAttachmentResult.imageRegion` 映射为 `ImageInputItem`。
- 当前 `PromptAttachmentResult.textSelection` 映射为 `TextSelectionInputItem`。
- 当前 skill action 映射为 `SkillInputItem`，其中 `prompt` 是 desktop 本地渲染后的 prompt。
- plugin action 不映射为 `SkillInputItem`。plugin action 的工具 scope 仍通过 `thread.start.payload.actionBinding` 建立，渲染后的用户内容作为 `TextInputItem` 进入 `UserInput.items`。
- 当前 `PromptAttachmentResult.selectionError` 继续只作为 PromptPanel UI 错误展示，不进入 `UserInput.items`。
- 当前 `PromptAttachmentResult.textToken` 作为额外 `TextInputItem` 进入 `UserInput.items`，不再拼接进单个 composed string。

### Thread 命令

`ThreadCommand` 最终保留生命周期命令，并新增一个运行期 op envelope：

```ts
export type ThreadCommand =
  | ThreadStartCommand
  | ThreadResumeCommand
  | ThreadListCommand
  | ThreadDeleteCommand
  | WorkspaceListCommand
  | ThreadOpCommand;

export type ThreadOpCommand = {
  type: "op.submit";
  threadId: string;
  commandId: string;
  timestamp: string;
  payload: {
    op: Op;
  };
};
```

最终状态删除 `input.submit` 和 `turn.interrupt` 两个运行期命令。中断 UI 发送：

```json
{
  "type": "op.submit",
  "threadId": "thread-1",
  "commandId": "cmd-1",
  "timestamp": "2026-06-10T00:00:00.000Z",
  "payload": {
    "op": {
      "type": "interrupt",
      "opId": "op-1",
      "timestamp": "2026-06-10T00:00:00.000Z",
      "payload": { "reason": "user" }
    }
  }
}
```

普通用户输入发送：

```json
{
  "type": "op.submit",
  "threadId": "thread-1",
  "commandId": "cmd-2",
  "timestamp": "2026-06-10T00:00:01.000Z",
  "payload": {
    "op": {
      "type": "user_input",
      "opId": "op-2",
      "timestamp": "2026-06-10T00:00:01.000Z",
      "payload": {
        "items": [
          { "type": "text", "id": "item-1", "text": "总结这段内容" },
          { "type": "text_selection", "id": "item-2", "text": "被用户选中的文本" }
        ]
      }
    }
  }
}
```

## Agent 结构

### 顶层结构

```ts
export type Agent = {
  tx_sub: AgentOpSender;
  rx_event: AsyncIterable<AgentRuntimeEvent>;
  agent_status: SharedAgentStatus;
  session: AgentSession;
  close(): Promise<void>;
};

export type AgentOpSender = {
  send(op: Op): Promise<void>;
};

export type SharedAgentStatus = {
  get(): RunStatus;
  set(value: RunStatus): void;
};
```

`tx_sub` 是 app-server 唯一可以调用的运行期入口。`rx_event` 是 Agent 内部事件流，app-server 可以用它观察 runtime 事件，但事件落盘、notification 分发和 status 更新仍应优先经 `thread.emit(...)` 完成。

### Session 容器

```ts
export type AgentSession = {
  threadId: string;
  config: AgentRunConfig;
  services: AgentServices;
};

export type AgentRunConfig = {
  model: string;
  provider: string;
  workspaceId: string | null;
  actionBinding: ThreadActionBinding | null;
  maxTimes: number;
};

export type AgentServices = {
  llmClient: LLMClient;
  toolRegistry: ToolRegistry;
  permissionPolicy: PermissionPolicy;
  blobStore: BlobStore;
  turnSummarizer: TurnSummarizer | null;
};
```

`AgentSession` 是大结构，承载静态配置和运行期服务。`mcp`、`shell`、workspace、permission、blob、summarizer 等服务都通过这里注入，不从 ReAct loop 内部临时读取全局配置。

### 持续运行函数

`runWithMessages(...)` 的 app-server 主路径语义替换为持续运行函数：

```ts
export type RunAgentArgs = {
  config: AgentRunConfig;
  thread: AgentThreadPort;
  rx_sub: AsyncIterable<Op>;
};

export type AgentRunner = {
  run(args: RunAgentArgs): Promise<void>;
};
```

`run(args)` 在 thread 删除、Agent close 或不可恢复错误时结束。平时它持续等待 `rx_sub`：

1. 收到 `user_input`：
   - 调 `thread.recordUserInput(op)` 持久化用户消息并发 `user.message.recorded`。
   - idle 时启动 active turn，并发 `turn.started` 与 `thread.status.changed(running)`。
   - running 时把输入排入当前 active turn 的 pending queue。
2. 收到 `interrupt`：
   - abort 当前 active turn。
   - 清理 pending queue。
   - 经 `thread.emit(...)` 发 `turn.completed(interrupted)` 与 `thread.status.changed(interrupted)`。
3. active turn 自然结束：
   - 如果 pending queue 非空，继续下一次 ReAct follow-up。
   - 如果 pending queue 为空，发 `turn.completed(completed)` 与 `thread.status.changed(idle)`。

## Thread 端口

ReAct loop 不直接知道持久化和 WebSocket 协议。它只依赖 `AgentThreadPort`：

```ts
export type AgentThreadPort = {
  threadId: string;
  getMessages(): Promise<AgentMessage[]>;
  recordUserInput(op: UserInputOp): Promise<RecordedUserInput>;
  emit(event: AgentRuntimeEvent | AgentThreadLifecycleEvent): Promise<void>;
  waitForPendingSummaries(messages?: AgentMessage[]): Promise<void>;
};
```

`thread.emit(...)` 内部负责：

- 将 runtime event 翻译为 `ThreadNotification`。
- 将可审计事件写入 `ThreadStore.events`。
- 将 assistant/tool 结果追加到 `ThreadStore.messages`。
- 更新 `agent_status` 和 thread status。
- 通过 `ThreadNotificationPublisher` 分发 notification。
- 旁路给 `AgentActivityPublisher` 派生活动状态。

这个包装是本次重构的关键边界：ReAct loop 不再暴露持久化、status 更新和 notification 复杂度。

## app-server 设计

### `thread.start`

`ThreadCommandRouter` 收到 `thread.start` 后仍只负责生命周期路由：

1. 调 `ThreadPersistence.createThread(...)` 创建 thread。
2. 解析并持久化 `actionBinding`。
3. 调新的 `AgentManager.startThreadAgent(...)`。
4. 订阅当前连接到该 thread。
5. 返回 `thread.started`。

`thread.start` 不直接提交首轮用户输入。首轮输入由 React 在收到 `thread.started` 后发送 `op.submit`，payload 内是 `UserInputOp`。

### `op.submit`

`ThreadCommandRouter` 收到 `op.submit` 后：

1. 校验 thread 存在。
2. 从 `AgentManager` 取该 thread 的 Agent。
3. 若 Agent 不存在，按 thread metadata 和当前 settings 重新启动 Agent。
4. 调 `agent.tx_sub.send(command.payload.op)`。

router 不再判断 running 时是否拒绝用户输入。running 输入是否排队由 Agent 持续函数负责。

### `AgentManager`

新增 `apps/agent-server/src/agent/AgentManager.ts`，作为 app-server 组合层的 Agent 生命周期 owner：

- `startThreadAgent(threadId, threadConfig)`：创建 Agent、启动 runner。
- `get(threadId)`：返回当前 Agent。
- `ensure(threadId)`：缺失时按持久化 metadata 与 settings 重建 Agent。
- `submit(threadId, op)`：投递 `Op`。
- `interrupt(threadId)`：投递 `InterruptOp` 的便捷方法。
- `delete(threadId)`：关闭 Agent 并释放资源。

`ThreadRuntimeOrchestrator` 的现有职责将被拆分：输入队列和 active turn 管理由 Agent runner 接管；生命周期命令路由仍归 `ThreadCommandRouter`；持久化仍归 `ThreadPersistence`。

## core runtime 设计

`AgentRuntime` 不再作为 app-server 直接调用的 thread 主接口。建议拆为两层：

- `ReActLoop`：执行一次“基于当前 messages 调 LLM、处理 tool calls、返回新增消息和 runtime event”的内部循环。
- `AgentRunner`：持续消费 `Op`，管理 active turn、pending input、abort controller、summary 等 thread 运行语义。

最终 app-server 只依赖 `AgentRunner` 或 `AgentFactory`，不依赖 `runWithMessages(...)`。

`waitForPendingSummaries(...)` 不再暴露在 app-server 的 `RuntimeLike` 上，由 `AgentRunner` 在每次 LLM 请求前通过 `thread.waitForPendingSummaries(...)` 或 `session.services.turnSummarizer` 调用。

## 前端与 Electron 设计

### Swift PromptPanel

`PromptSubmission.compose(...)` 迁移为 `PromptSubmission.makeUserInput(...)`：

- draft 非空时生成一个 `TextInputItem`。
- `.textToken` 生成额外 `TextInputItem`。
- `.textSelection` 生成 `TextSelectionInputItem`。
- `.imageRegion` 生成 `ImageInputItem`。
- skill action 生成 `SkillInputItem`。
- plugin action 生成 `TextInputItem`，同时保留 `actionBinding` 给 `thread.start`。

Swift 到 Electron 的 initial prompt payload 从：

```ts
{
  clientRequestId: string;
  text: string;
  attachments: ThreadAttachment[];
  actionBinding: ActionBindingPayload | null;
}
```

改为：

```ts
{
  clientRequestId: string;
  userInput: UserInput;
  actionBinding: ActionBindingPayload | null;
}
```

### Electron shell

Electron main 和 preload 只做 DTO 校验与转发：

- `thread_window.open_initial_prompt.payload.userInput` 必须通过 `UserInput` guard。
- Electron 不拼接 text，不解释 skill，不写入 attachments 兼容字段。

### React ThreadWindow

React 收到 initial prompt 后：

1. 发送 `thread.start`，携带 `actionBinding`。
2. 收到匹配 `commandId` 的 `thread.started` 后，发送 `thread.resume` 拉 snapshot。
3. 发送 `op.submit`，payload 是 `UserInputOp`。

Composer 后续提交也走同一条 `sendOp(threadId, userInput)`。Stop 控件发送 `InterruptOp`。React store 仍可以保留运行中 composer 本地队列显示，但最终进入 app-server 的运行期消息必须是 `Op`。

## 持久化与消息归一化

`UserInput.items` 到持久化 user message 的映射规则：

- `TextInputItem` 和 `SkillInputItem.prompt` 进入 user message 文本内容，按 item 顺序排列。
- `TextSelectionInputItem` 以独立文本块进入 user message，并保留 item id 供审计或 UI 预览使用。
- `ImageInputItem` 仍写入 `BlobStore`，持久化 user message 只保存 image STUB。
- `UserInputOp.opId` 映射为当前 `user.message.recorded.payload.messageId`，替代旧 `inputId`。

LLM 侧 `AgentMessage` 仍可以保持 `user / assistant / tool / system` 判别联合。`UserInput` 是 thread 输入 DTO，不要求 LLM adapter 直接消费它。

## 事件语义

现有 `ThreadNotification` 先保持不变：

- `user.message.recorded`
- `turn.started`
- `assistant.delta`
- `tool.started`
- `tool.finished`
- `turn.completed`
- `thread.status.changed`
- `thread.error`

运行中收到第二条 `UserInputOp`：

- 立即发 `user.message.recorded`。
- 不发新的 `turn.started`。
- 当前 active turn 结束一轮 LLM/tool 后，如果 pending queue 非空，继续下一次 follow-up。
- active worker 最终真正 drain 完才发一次 `turn.completed`。

`InterruptOp`：

- 对当前 active turn 生效。
- 清理 pending queue。
- 发 `turn.completed(status: "interrupted")`。
- 发 `thread.status.changed(value: "interrupted")`。

## 错误处理

- `op.submit` 指向不存在的 thread：返回 `thread.error(code: "thread_not_found")`。
- `UserInput.items` 为空：返回 `thread.error(code: "invalid_user_input")`，不创建 user message。
- `ImageInputItem.mimeType` 不在允许集合内：返回 `thread.error(code: "invalid_user_input")`。
- Agent runner 不可恢复错误：发 `thread.error`、`turn.completed(status: "failed")`、`thread.status.changed(value: "failed")`，并关闭该 Agent。
- 已关闭 Agent 收到 `Op`：`AgentManager.ensure(threadId)` 重建 Agent 后再投递；thread 已删除时返回 `thread_not_found`。

## 测试策略

优先按 TDD 增加 TypeScript 测试：

1. `packages/core/tests/protocol`：
   - `Op` 支持 `user_input` 和 `interrupt`。
   - `InputItem` 支持 text、image、skill、text_selection。
   - `ThreadCommand` 支持 `op.submit`，不再支持 `input.submit` 和 `turn.interrupt`。
2. `apps/thread-window-web/tests`：
   - initial prompt payload 使用 `userInput`。
   - 首轮流程为 `thread.start -> thread.resume -> op.submit`。
   - composer 提交发送 `UserInputOp`。
   - Stop 控件发送 `InterruptOp`。
3. `apps/electron-shell/tests`：
   - `thread_window.open_initial_prompt` 校验 `userInput`。
   - 拒绝旧 `text + attachments` payload。
4. `apps/desktop/TestsSwift`：
   - PromptPanel draft、textToken、textSelection、imageRegion、skill action 能组装成 `UserInput.items`。
   - plugin action 仍保留 `actionBinding`，渲染后 prompt 作为 text item。
5. `apps/agent-server/tests/thread`：
   - `op.submit(UserInputOp)` 投递到 Agent。
   - running thread 收到 `UserInputOp` 不返回 `thread_running`。
   - `op.submit(InterruptOp)` 中断 active turn。
   - thread delete 会关闭对应 Agent。
6. `packages/core/tests/runtime`：
   - Agent runner idle 时收到 user input 启动 turn。
   - running 时收到 user input 排入 pending queue。
   - pending queue drain 后只发一次 completed。
   - interrupt 清理 active turn 和 pending queue。

## 文档更新范围

实现完成后必须同步更新：

- `handAgent.md`
- `packages/core/src/src.md`
- `packages/core/src/runtime/runtime.md`
- `packages/core/src/protocol/protocol.md`
- `apps/agent-server/agent-server.md`
- `apps/agent-server/src/thread/thread.md`
- 新增 `apps/agent-server/src/agent/agent.md`
- `apps/thread-window-web/thread-window-web.md`
- `apps/desktop/Sources/PromptPanel/prompt-panel.md`
- `apps/desktop/Sources/Coordinator/coordinator.md`
- `apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md`
- `docs/manual-qa.md`

## 验证标准

完成实现后至少通过：

```bash
bash ./scripts/test.sh
bash ./scripts/swiftw test
bash ./scripts/swiftw build
```

手工 QA 至少覆盖：

- PromptPanel 普通文本创建新 thread 并得到回复。
- PromptPanel 携带文本选区创建新 thread。
- PromptPanel 携带图片区域创建新 thread。
- Skill action 创建新 thread，输入以 skill item 进入运行期。
- Plugin action 创建新 thread，action binding 生效，MCP scope 由 server 重新校验。
- ThreadWindow composer 后续提问仍能追加到同一 thread。
- running 状态点击 Stop 能中断当前 turn。

## 自审

- 没有把 `thread.start`、`thread.resume`、`thread.list`、`thread.delete` 或 `workspace.list` 放入 `Op`。
- `Op` 只表达运行期 `UserInput` 与 `Interrupt`。
- `input.submit` 与 `turn.interrupt` 在最终状态中删除，不保留长期兼容入口。
- Plugin action binding 仍由 `thread.start` 建立，不被 `SkillInputItem` 混淆。
- ReAct loop 不直接承担持久化、status 更新或 ThreadNotification 分发职责。
- 没有留下待定字段或占位实现。
