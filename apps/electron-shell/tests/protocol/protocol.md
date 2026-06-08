# protocol

`tests/protocol` 覆盖 Swift <-> Electron TypeScript 协议层。

## 文件

| 文件 | 覆盖对象 |
|------|------|
| `electronShellProtocol.test.ts` | `parseCommand()`、`isSwiftToElectronCommand()`、`encodeEvent()` |

## 测试前提

- 每个 Swift command 类型至少要有 parse 或 reject 用例；每个 Electron event 的关键字段至少要有 encode 用例。
- `thread_window.prepare` 必须持续被拒绝，因为预热属于 Electron main 启动阶段，不是 Swift command。
- 改协议字段时，要同时检查 Swift `ElectronShellProtocolTests.swift`，避免 TS 和 Swift decoder 漂移。
