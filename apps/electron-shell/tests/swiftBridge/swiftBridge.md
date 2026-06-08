# swiftBridge

`tests/swiftBridge` 覆盖 Swift bridge 的 JSON line transport。

## 文件

| 文件 | 覆盖对象 |
|------|------|
| `jsonLineBridge.test.ts` | chunk 切行、空行忽略和单行 JSON event 写出 |
| `commandSocketServer.test.ts` | Unix domain socket command server 的 chunk 切行和多 client 输入拼接 |

## 测试前提

- 使用 `PassThrough` 模拟 stdin/stdout，不启动 Swift 或 Electron。
- command socket 测试使用临时目录下的 Unix socket，不占用 TCP 端口。
- 输入测试要覆盖 JSON 被拆成多个 chunk 的情况；bridge 不能假设每次 data 都是一整行。
- 输出测试只验证一行 JSON + `\n`；协议字段语义属于 `tests/protocol`。
