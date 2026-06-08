# serverSupervisor

`serverSupervisor/` 负责在 Electron flag 路径下监督唯一的 agent-server 后台服务。agent-server 是唯一承载 core runtime、tool、LLM 循环的进程；Electron main 和 renderer 都不能直接承载这些运行时对象。

## 文件

| 文件 | 职责 |
|------|------|
| `agentServerSupervisor.ts` | supervisor 抽象、health event、description 和日志 sink 类型 |
| `agentServerEntry.ts` | 判断是否存在可供 `utilityProcess` 使用的构建后 JS entry，并给出 Node fallback blocker |
| `agentServerSupervisorFactory.ts` | 根据 entry 判断创建 `UtilityProcessAgentServerSupervisor` 或 `NodeAgentServerSupervisor` |
| `nodeAgentServerSupervisor.ts` | 当前开发态 fallback：用 Node child process 启动 TypeScript agent-server 源码入口 |
| `utilityProcessAgentServerSupervisor.ts` | 构建后 JS entry 存在时的 Electron `utilityProcess` supervisor |

## 启动入口

- Node fallback 固定启动 `apps/agent-server/src/server/server.ts`，参数为 `--experimental-transform-types --experimental-specifier-resolution=node`。
- utilityProcess 候选入口是 `apps/agent-server/dist/server/server.js`。该文件不存在时必须记录具体 `utilityProcessBlocker`，不要静默 fallback。
- 两种 supervisor 的 `describe()` 都必须声明 `coreRuntimeHost: "agent-server"`，用于日志和架构不变量核对。

## Health 与重启语义

- `available: true` 只能在 readiness check 成功后发送；Node fallback 默认轮询 `127.0.0.1:4317`。
- 非用户主动 stop 的非零退出、进程错误或 readiness 失败都先发 unavailable health，再指数退避重启。
- 默认最多 5 次重启；超过后发最终 unavailable 诊断，不继续调度。
- `stop()` 是用户主动停机：必须递增 generation、停止当前进程、发 `"agent-server stopped"`，并阻止旧 readiness / restart 回调复活进程。
- stdout/stderr 必须被 drain 到 `logSink` 或 stderr，避免子进程缓冲堵塞。

## 修改约束

- 不在 supervisor 内 import `@handagent/core/runtime`、`@handagent/core/tools` 或 LLM client；它只负责进程生命周期。
- 新增环境变量时通过 factory/main 注入 `env`，不要直接在下游类里散读 Electron renderer 状态。
- 改 readiness、restart 或 entry 选择时，同步更新 `tests/serverSupervisor/*`。
