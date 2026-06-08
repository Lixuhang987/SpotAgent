# preload

`tests/preload` 覆盖 preload scripts 暴露给 renderer main world 的受控 globals。

## 文件

| 文件 | 覆盖对象 |
|------|------|
| `threadWindowPreload.test.ts` | ThreadWindow preload 的 `/api/thread` config、pending initial prompt receiver 和既有 receiver 保留 |
| `activityWindowPreload.test.ts` | ActivityWindow preload 的 `/api/activity` config 与 `focusThread` IPC wrapper |

## 测试前提

- 使用 `vi.doMock("electron", ...)` mock `contextBridge` / `ipcRenderer`，不加载真实 Electron。
- ThreadWindow preload 测试要在 fake main world 中执行 `executeInMainWorld` 的 `func`，确认 globals 写入结果。
- 新增 preload API 时，必须测试它没有暴露原始 `ipcRenderer` 或 Node/Electron 对象。
