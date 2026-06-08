# swiftBridge

`swiftBridge/` 是 Swift host 与 Electron main 的 stdio JSON line 传输层。

## 文件

| 文件 | 职责 |
|------|------|
| `jsonLineBridge.ts` | 从 stdin 按换行切 command line，向 stdout 写一行 JSON event |

## 传输约束

- 输入是 newline-delimited JSON；chunk 可能被拆分或合并，必须通过 buffer 按 `\n` 切行。
- 空行被忽略；非空行原样交给上层 `parseCommand()`，本目录不做协议语义校验。
- 输出必须是单行 JSON + `\n`；Swift `ElectronShellOutputDecoder` 依赖换行切 event。
- stdout 只允许写 bridge event。日志、diagnostic、agent-server 输出都必须写 stderr。

## 修改约束

- 不在本目录处理 command ack；解析失败 ack 由 `main.ts` 根据原始 line 中的 `commandId` 兜底发送。
- 不引入重试、队列或文件轮询；bridge 只负责流切分和写出。
- 修改切行或写出格式时，同步更新 `tests/swiftBridge/jsonLineBridge.test.ts` 和 Swift output decoder 相关测试。
