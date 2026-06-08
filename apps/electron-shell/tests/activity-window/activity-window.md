# activity-window

`tests/activity-window` 覆盖 Electron ActivityWindow renderer 的纯 browser/React 状态逻辑。

## 文件

| 文件 | 覆盖对象 |
|------|------|
| `activitySocketClient.test.ts` | `src/activity-window/activitySocketClient.ts` 的 event parser、非法消息忽略、断线重连和手动关闭 |
| `activityState.test.ts` | `src/activity-window/activityState.ts` 的 snapshot/change reducer 与展示文案 |

## 测试前提

- 测试只使用 fake WebSocket 和 fake timer，不启动真实 Electron、真实 WebSocket server 或 React renderer。
- fixture 只构造 `AgentActivityEvent`；不要把 `/api/thread` 的完整消息放进本目录。
- 新增 activity status 或 waiting request 时，这里必须和 `packages/core/src/protocol/AgentActivity.ts`、renderer parser/display 同步。
