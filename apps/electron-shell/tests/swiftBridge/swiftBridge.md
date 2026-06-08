# swiftBridge

`tests/swiftBridge` 覆盖 stdio JSON line bridge。

## 文件

| 文件 | 覆盖对象 |
|------|------|
| `jsonLineBridge.test.ts` | chunk 切行、空行忽略和单行 JSON event 写出 |

## 测试前提

- 使用 `PassThrough` 模拟 stdin/stdout，不启动 Swift 或 Electron。
- 输入测试要覆盖 JSON 被拆成多个 chunk 的情况；bridge 不能假设每次 data 都是一整行。
- 输出测试只验证一行 JSON + `\n`；协议字段语义属于 `tests/protocol`。
