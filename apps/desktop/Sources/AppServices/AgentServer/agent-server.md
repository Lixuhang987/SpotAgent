# AgentServer 模块

管理本地 agent-server 进程的生命周期。

## 文件

| 文件 | 职责 |
|------|------|
| `AgentServerService.swift` | 定位仓库根目录和 Node.js，启动/停止 agent-server 子进程 |

## 职责

1. 从 Bundle 路径向上查找仓库根目录（通过 `Package.swift` + server 入口文件双重验证）
2. 在 PATH 和常见路径中定位 `node` 可执行文件
3. 设置 `NODE_PATH` 环境变量，确保模块解析正确
4. 启动 `apps/agent-server/src/server.ts`（使用 `--experimental-transform-types`）
5. 记录启动错误供 UI 展示

## 设计备注

- 非 `@MainActor`，进程管理不需要主线程
- 使用 `--experimental-transform-types` 直接运行 TypeScript，无需编译步骤
- `lastStartupError` 暴露给 `AppDelegate`，在 SessionWindow 中展示给用户
- 进程输出通过 Pipe 捕获但当前未做处理（仅防止 broken pipe）

## 与其他模块的关系

- `AppServices.swift` 持有实例，`AppDelegate` 调用 `start()`/`stop()`
- SessionWindow 通过 WebSocket 连接到 agent-server（`ws://127.0.0.1:4317/api/session`）
