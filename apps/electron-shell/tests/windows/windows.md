# windows

`tests/windows` 覆盖 Electron main 的窗口控制器，不启动真实 Electron 窗口。

## 文件

| 文件 | 覆盖对象 |
|------|------|
| `threadWindowPrewarmer.test.ts` | hidden ThreadWindow prepare、load failure、initial prompt 注入、show/focus 和 close 状态 |
| `activityWindowController.test.ts` | ActivityWindow BrowserWindow options、右下角定位、showInactive、复用、关闭重建和 renderer crash |

## 测试前提

- 使用 fake `BrowserWindow` / fake `webContents`，通过事件手动触发 `did-finish-load`、`did-fail-load`、`closed`、`render-process-gone`。
- ThreadWindow 测试必须确认 initial prompt 在 show/focus 前注入，并覆盖窗口在注入期间关闭的 race。
- ActivityWindow 测试必须保持 `focusable: true`、`acceptFirstMouse: true`、`skipTaskbar: true`、`showInactive()` 这些点击与展示约束；`showInactive()` 用来非激活展示，`focusable` 和 `acceptFirstMouse` 用来保证 macOS packaged CGEvent 点击仍触发 renderer click。
