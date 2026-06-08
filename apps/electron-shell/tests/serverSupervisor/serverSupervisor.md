# serverSupervisor

`tests/serverSupervisor` 覆盖 agent-server supervisor 的 entry 选择、health、restart 和 stop 语义。

## 文件

| 文件 | 覆盖对象 |
|------|------|
| `agentServerEntry.test.ts` | utilityProcess JS entry 判断与 Node fallback blocker |
| `agentServerSupervisorFactory.test.ts` | factory 对 utilityProcess / Node fallback 的选择 |
| `nodeAgentServerSupervisor.test.ts` | Node child process supervisor 的 spawn、readiness、输出 drain、restart、stop |
| `utilityProcessAgentServerSupervisor.test.ts` | utilityProcess supervisor 的 fork、readiness、输出 drain、restart、stop |

## 测试前提

- 测试用 fake `EventEmitter` process，不启动真实 agent-server。
- readiness 相关用 `Deferred` 控制 promise resolve/reject，必须覆盖 late resolve 不影响已 stop generation。
- restart 测试要显式检查最大重启次数和指数退避调度，不依赖真实 timer。
- 新增 supervisor mode 时，要更新 `AgentServerSupervisorDescription` 断言，保持 `coreRuntimeHost: "agent-server"`。
