# tests

`apps/electron-shell/tests` 是 Electron shell 的 Vitest 测试集合。测试按源码职责分组，运行在 Node test environment；Electron API 通过 fake objects 或 `vi.doMock("electron", ...)` 注入。

## 直接子节点

| 子节点 | 子文档 | 职责 |
|------|------|------|
| `activity-window/` | [activity-window/activity-window.md](/Users/mu9/proj/handAgent/apps/electron-shell/tests/activity-window/activity-window.md) | Activity renderer 的 activity event parser、重连和展示状态 |
| `main/` | [main/main.md](/Users/mu9/proj/handAgent/apps/electron-shell/tests/main/main.md) | `ElectronShellRuntime` command / health / prewarm 状态机，以及 ActivityWindow IPC sender 校验 |
| `preload/` | [preload/preload.md](/Users/mu9/proj/handAgent/apps/electron-shell/tests/preload/preload.md) | preload 注入的 main-world globals 和 IPC bridge |
| `protocol/` | [protocol/protocol.md](/Users/mu9/proj/handAgent/apps/electron-shell/tests/protocol/protocol.md) | Swift <-> Electron command/event 解析、编码和拒绝旧 `thread_window.prepare` command |
| `serverSupervisor/` | [serverSupervisor/serverSupervisor.md](/Users/mu9/proj/handAgent/apps/electron-shell/tests/serverSupervisor/serverSupervisor.md) | supervisor entry 选择、Node fallback、utilityProcess 语义、readiness、restart 和 stop |
| `swiftBridge/` | [swiftBridge/swiftBridge.md](/Users/mu9/proj/handAgent/apps/electron-shell/tests/swiftBridge/swiftBridge.md) | newline-delimited JSON bridge 与 command socket 的 chunk 切行和 event 写出 |
| `windows/` | [windows/windows.md](/Users/mu9/proj/handAgent/apps/electron-shell/tests/windows/windows.md) | ThreadWindow hidden prewarm、initial prompt 注入、ActivityWindow 非激活展示 |
| `smoke.test.ts` | 无独立文档 | Electron shell test runtime 基础 smoke |

## 运行方式

```bash
pnpm --filter handagent-electron-shell test
pnpm --filter handagent-electron-shell build
```

单文件示例：

```bash
pnpm --filter handagent-electron-shell exec vitest run tests/windows/threadWindowPrewarmer.test.ts
```

## 新增测试约束

- 新增 `src/main/*` 行为时，优先把 Electron API 抽成 fakeable interface，避免启动真实 Electron。
- 新增 Swift bridge command/event 时，必须同时覆盖 protocol parser/encoder 和 runtime ack 语义。
- 新增 preload global 时，使用 `vi.doMock("electron", ...)` 验证 `contextBridge` 调用，不依赖真实 renderer。
- 新增 supervisor 行为时，覆盖用户主动 stop、readiness late resolve、非零退出 restart、最大重启次数四类边界。
- ActivityWindow renderer 测试只验证 `/api/activity` 和 UI state，不引入 `/api/thread` fixture。
