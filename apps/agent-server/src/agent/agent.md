# agent

## 目录职责

`agent/` 负责 agent-server 进程内的持久 Agent owner。它维护 `threadId -> Agent` 映射，把 `/api/thread` 收到的运行期输入和 UI 回执统一转发到对应 Agent 的 `tx_sub`；Agent 产生的 thread notification 与待回执 request 统一通过 `rx_event` 交给 app-server 分发。删除 thread 时关闭 Agent，socket close 只触发当前运行中断与临时权限清理。

本目录不定义跨进程 DTO；Agent 输入来自 `@handagent/core/protocol/Op.ts`，Agent 输出来自 `@handagent/core/protocol/AgentEvent.ts`。

## 文件

| 文件 | 职责 |
|------|------|
| `AgentManager.ts` | `AgentManager`、`Agent` 结构、共享运行状态，以及 `UserInput` 到现有 runtime bridge 输入的转换 |
| `AgentEventQueue.ts` | Agent `rx_event` 的进程内 async queue，实现 server 侧事件泵消费 |
| `AgentRequestBroker.ts` | 权限审批与 workspace 选择的等待队列；把 core ask resolver 请求包装为 `server.request` Agent event，并用 `client_response` Op 唤醒 pending ask |

## Agent 结构

当前 server 侧 Agent 包含四个稳定边界：

- `tx_sub`：app-server 向 Agent 提交 `Op` 的入口；公开 `op.submit` 只允许 `UserInput | Interrupt`，但 app-server 内部会把 `ClientResponse` 包装为 `client_response` Op 投回这里。
- `rx_event`：Agent 向 app-server 输出的事件流，当前承载 `thread.notification` 与 `server.request`。app-server 从这里取出事件后再发布到 `/api/thread` 和 `/api/activity`。
- `agent_status`：进程内共享运行状态，供 `thread.resume` snapshot 判断 running/idle。
- `session`：thread 级静态配置与服务容器；生产路径当前至少持有 `threadId`，runtime 服务仍由 `server/` 组合根注入。

`AgentManager` 只负责进程内 owner 语义：`register/get/submit/interrupt/delete/isRunning`。它不直接读写 thread 文件，也不执行 LLM/tool loop。

## 当前 bridge

生产路径中，`server/startDefaultServer` 创建 Agent 时仍复用 `thread/ThreadRuntimeOrchestrator` 作为内部 ReAct turn 执行器：

1. `op.submit(UserInput)` 先在 Agent bridge 里转换为 runtime text + attachments，再调用 orchestrator。
2. `op.submit(Interrupt)` 调用 orchestrator 的中断等待逻辑。
3. `client_response` Op 交给 `AgentRequestBroker`，用于解析 permission/workspace UI 回执。
4. `interrupt` / `close` 会先取消该 thread 当前 pending 的 permission/workspace ask，避免旧请求等到 timeout。
5. orchestrator 产出的 `ThreadNotification` 不再直接 publish，而是先进入 Agent `rx_event`。
6. permission/workspace ask resolver 产出的 `ServerRequest` 也先进入 Agent `rx_event`，由 app-server 事件泵发布给 ThreadWindow。

这个 bridge 是旧 turn 执行器与新持久 Agent owner 之间的过渡层；公开 `/api/thread` 运行期输入已经只剩 `op.submit(UserInput | Interrupt)`。
