# agent

## 目录职责

`agent/` 负责 agent-server 进程内的持久 Agent owner。它维护 `threadId -> Agent` 映射，把 `/api/thread` 收到的运行期 `Op` 转发到对应 Agent 的 `tx_sub`；删除 thread 时关闭 Agent，socket close 只触发当前运行中断与临时权限清理。

本目录不定义跨进程 DTO；运行期输入类型来自 `@handagent/core/protocol/Op.ts`。

## 文件

| 文件 | 职责 |
|------|------|
| `AgentManager.ts` | `AgentManager`、`Agent` 结构、共享运行状态，以及 `UserInput` 到现有 runtime bridge 输入的转换 |

## Agent 结构

当前 server 侧 Agent 包含四个稳定边界：

- `tx_sub`：app-server 向 Agent 提交运行期 `Op` 的入口。
- `rx_event`：预留的 Agent 事件流边界；现阶段 ThreadWindow 事件仍经 `ThreadNotificationPublisher` 发布。
- `agent_status`：进程内共享运行状态，供 `thread.resume` snapshot 判断 running/idle。
- `session`：thread 级静态配置与服务容器；生产路径当前至少持有 `threadId`，runtime 服务仍由 `server/` 组合根注入。

`AgentManager` 只负责进程内 owner 语义：`register/get/submit/interrupt/delete/isRunning`。它不直接读写 thread 文件，也不执行 LLM/tool loop。

## 当前 bridge

生产路径中，`server/startDefaultServer` 创建 Agent 时仍复用 `thread/ThreadRuntimeOrchestrator` 作为内部 ReAct turn 执行器：

1. `op.submit(UserInput)` 先在 Agent bridge 里转换为 runtime text + attachments，再调用 orchestrator。
2. `op.submit(Interrupt)` 调用 orchestrator 的中断等待逻辑。
3. orchestrator 继续负责 append-only 持久化、runtime event 翻译、中断补帧和 summary 等细节。

这个 bridge 是旧 turn 执行器与新持久 Agent owner 之间的过渡层；公开 `/api/thread` 输入已经只剩 `op.submit`。
