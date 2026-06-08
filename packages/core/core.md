# core

## 目录职责

`packages/core` 是 `@handagent/core` workspace 包，承载跨平台 Agent 核心：thread / turn 数据模型、runtime、LLM 抽象、tool 协议、platform adapter、protocol、storage、workspace 与 permission。

core 不依赖 AppKit，不实现 UI，不直接读取屏幕、窗口、剪贴板或 macOS 状态；这些能力只能通过 tool 调 `PlatformAdapter`，再由应用层接入具体平台实现。

## 直接子节点

- [src/src.md](/Users/mu9/proj/handAgent/packages/core/src/src.md)：core 源码模块索引与跨模块架构约束。
- `package.json`：包名为 `@handagent/core`，`exports` 当前为 `"./*": "./src/*"`。
- `tests/`：按 `src/` 模块分组的 core 测试目录。

## 包级边界

- 应用层 TypeScript 代码通过 `@handagent/core/...` exports 引用 core，不使用跨包相对路径进入 `packages/core/src/...`。
- core 可以定义 `PlatformAdapter` / `PlatformBridge` / `PlatformBridgeMessage`，但不能实现 macOS 平台细节；Swift desktop 通过 `/api/platform` 处理平台 RPC。
- core 可以定义 `ThreadCommand`、`ThreadNotification`、`ServerRequest`、`ClientResponse` 等协议 DTO，但 WebSocket 连接管理、thread 路由、UI 状态和平台 socket 分流属于应用层。
- core 的持久化模型只描述 thread、workspace、permission、blob 等数据结构和文件实现；不要把窗口状态、设置页临时态或宿主生命周期写入 core。
- 新增源码子目录时，同步更新 [src/src.md](/Users/mu9/proj/handAgent/packages/core/src/src.md)；本文件只列 core 的直接子节点，不平铺 `src/` 下的孙目录。
