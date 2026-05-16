# AgentServer 模块

管理本地 agent-server 进程的生命周期。

## 文件

| 文件 | 职责 |
|------|------|
| `AgentServerService.swift` | 定位仓库根目录与 Node.js，启动 / 停止 agent-server 子进程；记录启动错误 |

## 职责

1. 从 Bundle 路径向上查找仓库根目录（双重验证：`Package.swift` + `apps/agent-server/src/server.ts` 同时存在）。
2. 在 PATH、`/opt/homebrew/bin`、`/usr/local/bin` 中定位 `node` 可执行文件。
3. 设置 `NODE_PATH`，确保 `node_modules` 与 `apps/agent-server/node_modules` 都被解析。
4. 启动 `node --experimental-transform-types --experimental-specifier-resolution=node apps/agent-server/src/server.ts`。
5. 记录 `lastStartupError` 供 UI 展示。

## 设计备注

- 非 `@MainActor`，进程管理在后台执行。
- 使用 `--experimental-transform-types` 直接运行 TypeScript，无需编译步骤。
- 进程 stdout/stderr 通过 Pipe 捕获但当前未暴露到 UI（仅防止 fd 泄漏）。
- 进程意外退出无自动重启机制。

## 编辑此目录的约束

- 不要在此处 `import SwiftUI` 或 `import AppKit`。
- 启动错误对外只暴露 `lastStartupError: String?`；不要直接调 UI。
- 修改 TS 源码后必须重启 desktop app 才能生效（无 hot reload）。

## 与其他模块的关系

- [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) 在 `bootstrap()` 调 `start()`，在 `shutdown()` 调 `stop()`。
- [SessionWindow](/Users/mu9/proj/handAgent/apps/desktop/Sources/SessionWindow/session-window.md) 通过 `ws://127.0.0.1:4317/api/session` 连接子进程。
- 启动错误传递给首个 `SessionViewModel.start(startupError:)`，作为 error 气泡展示。
