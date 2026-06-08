# swiftBridge

`swiftBridge/` 是 Swift host 与 Electron main 的 JSON line 传输层。Electron -> Swift event 使用 stdout；Swift -> Electron command 在桌面 flag 路径下使用本地 Unix domain socket，直接运行 Electron main 时仍可从 stdin 读取 command。

## 文件

| 文件 | 职责 |
|------|------|
| `jsonLineBridge.ts` | 从 stdin 按换行切 command line，向 stdout 写一行 JSON event；stdin command 只作为直接运行 Electron main 的兼容入口 |
| `commandSocketServer.ts` | 监听 `HANDAGENT_ELECTRON_COMMAND_SOCKET` 指向的 Unix domain socket，接收 Swift 写入的 command JSON line |

## 传输约束

- 输入是 newline-delimited JSON；chunk 可能被拆分或合并，必须通过 buffer 按 `\n` 切行。
- Swift flag 路径不能依赖 Electron 子进程 stdin 保持打开；Electron CLI 在 stdin pipe 未 EOF 时会阻塞加载 main entry。
- command socket server 必须在 `app.whenReady()` 之后构造并启动监听；Electron main 不要用 top-level await 等 ready，应让模块先完成加载，再在异步 bootstrap 中等待 ready。
- command socket 路径必须保持短路径，避免超过 macOS Unix socket path 长度限制。
- 空行被忽略；非空行原样交给上层 `parseCommand()`，本目录不做协议语义校验。
- 输出必须是单行 JSON + `\n`；Swift `ElectronShellOutputDecoder` 依赖换行切 event。
- stdout 只允许写 bridge event。日志、diagnostic、agent-server 输出都必须写 stderr。

## 修改约束

- 不在本目录处理 command ack；解析失败 ack 由 `main.ts` 根据原始 line 中的 `commandId` 兜底发送。
- 不引入重试、队列或文件轮询；bridge 只负责流切分和写出。
- 修改切行、socket command 或写出格式时，同步更新 `tests/swiftBridge/jsonLineBridge.test.ts`、`tests/swiftBridge/commandSocketServer.test.ts` 和 Swift output/socket 相关测试。
