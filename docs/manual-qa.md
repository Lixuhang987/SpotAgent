# 手工验收清单

## 维护规则

本文件只保留尚未通过实机 QA 的手工验收项。验证通过后，必须从本文件删除对应内容，并把完整验证日期、环境、过程、证据与结论移动到 [archive.md](./archive.md)(永远不要读取archive.md的内容，仅在最后追加)。

## 验收目标

确认桌面 Agent MVP 仍未归档的端到端路径可用，并把新通过的条目及时移入归档：ScreenCaptureKit 反向 IPC、Accessibility、多 provider LLM。

## 验收前提

- 已完成依赖安装。
- 已通过 `bash ./scripts/test.sh`。
- 已通过 `bash ./scripts/swiftw test`。
- 已通过 `bash ./scripts/swiftw build`。

## 开发验证记录

### ThreadWindow workspace 分组标题展开修复

- 完成日期：2026-06-09
- 实现位置：`apps/thread-window-web/src/store/threadWindowStore.ts`、`apps/thread-window-web/tests/threadWindowStore.test.ts`、`apps/thread-window-web/tests/threadWindowStorePersistence.test.ts`
- 链路证明：已知 live 证据证明 `/api/thread thread.list -> thread.listed -> ThreadWindow 历史侧栏显示 workspace 分组` 成立，但 `default` trigger 点击、AXPress 和 Space 后 `AXExpanded=false`、region 子项数为 0。此次按 `$trace-and-verify-call-chain` 继续验证 `WorkspaceGroup trigger -> toggleWorkspaceExpanded -> expandedWorkspaceIds -> Accordion value -> Accordion.Content`，新增 RED 测试 `toggles workspace expansion ids` 在 `toggleWorkspaceExpanded` 抛出 `[Immer] The plugin for 'MapSet' has not been loaded into Immer`，失败 hop 定位为 store action 直接通过 Immer draft 读取/修改 `Set`。
- 修复结论：`toggleWorkspaceExpanded` 改为基于当前状态创建新的 `Set` 并返回局部状态更新，不再让 Immer 代理 `Set`；同时补齐 `expandedWorkspaceIds` 的 `localStorage` 轻量持久化，满足刷新或重开同一 ThreadWindow 前端后保持展开状态的产品预期。该持久化是 UI 展开状态，不进入 thread 协议或 `~/.spotAgent/threads/`。
- 自动化验证：`pnpm --filter handagent-thread-window-web exec vitest run tests/groupThreads.test.ts tests/threadWindowStore.test.ts tests/threadWindowStorePersistence.test.ts tests/historySidebar.test.ts` 覆盖 workspace 分组排序、Accordion context、展开/收起 store 状态、持久化写入和初始化读取；`pnpm --filter handagent-thread-window-web build` 覆盖 ThreadWindow Web 类型检查与生产构建。
- 主仓库 live 回归结果：2026-06-09 合入 `42860fe` 后重新执行 `pnpm --filter handagent-thread-window-web exec vitest run tests/groupThreads.test.ts tests/threadWindowStore.test.ts tests/threadWindowStorePersistence.test.ts tests/historySidebar.test.ts`、`pnpm --filter handagent-thread-window-web test`、`pnpm --filter handagent-thread-window-web build`、`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build` 与 `bash ./scripts/package-app.sh --mock-llm`。默认 WKWebView packaged app 提交 `THREADWINDOW_SCENE4_EXPAND_FIX_QA_20260609 [mock:assistant-ok]` 生成 `~/.spotAgent/threads/thread-1780955175109-a0tl2r.json`；`/api/thread thread.list` 返回四个 fixture：`qa-scene4-default-workspace`、`qa-scene4-handagent-workspace`、`qa-scene4-qa-workspace`、`qa-scene4-tmp-workspace`，workspaceId 分别匹配真实 registry id。CoreGraphics 点击 workspace 标题后，`default`、`handagent-test`、`qa-workspace`、`tmp` 均可展开并显示对应 `SCENE4_*` 历史项；再次点击 `default` 可收起；点击 `SCENE4_DEFAULT...` 历史项后右侧激活该 thread/tab。关闭 ThreadWindow 后重新提交 `THREADWINDOW_SCENE4_PERSISTENCE_QA_20260609 [mock:assistant-ok]` 生成 `~/.spotAgent/threads/thread-1780955402861-qedb4a.json`，新建 WKWebView 仍恢复 `handagent-test`、`qa-workspace`、`tmp` 展开和 `default` 收起状态，证明 `expandedWorkspaceIds` 持久化生效。截图：`/tmp/handagent-qa/threadwindow-scenario4-expand-fix-initial.png`、`/tmp/handagent-qa/threadwindow-scenario4-expand-fix-default-expanded.png`、`/tmp/handagent-qa/threadwindow-scenario4-expand-fix-all-expanded.png`、`/tmp/handagent-qa/threadwindow-scenario4-expand-fix-qa-expanded.png`、`/tmp/handagent-qa/threadwindow-scenario4-expand-fix-default-collapsed.png`、`/tmp/handagent-qa/threadwindow-scenario4-expand-fix-reopen-persisted.png`。退出 QA app 后无 HandAgent / agent-server 残留，`127.0.0.1:4317` 无监听。结论：ThreadWindow workspace 分组标题展开缺陷已通过主仓库 packaged live 回归，已从 `docs/bugs.md` 移除并追加到 `docs/archive.md`。

### Electron StatusBubble 关闭 ThreadWindow 后重建 ActivityWindow 修复

- 完成日期：2026-06-09
- 实现位置：`apps/electron-shell/src/main/windows/activityWindowController.ts`、`apps/electron-shell/src/main/electronShellRuntime.ts`、`apps/electron-shell/tests/windows/activityWindowController.test.ts`、`apps/electron-shell/tests/main/electronShellRuntime.test.ts`
- 链路证明：`a030945` 主仓库 packaged 回归证明 `BrowserWindow.blur()` 不释放当前问题里的 AXMain 状态；`b4af5ef` / `db8f917` 主仓库 packaged 回归继续证明 `hide()` 后 `showInactive()` 也不足。packaged 产物已包含 `releaseNativeFocusForNextClick()`、`window.hide()`、`window.showInactive()`，但关闭 visible Electron ThreadWindow 后 ActivityWindow 仍为 `AXMain=true` / `AXFocused=false`，立即点击中心后 `HandAgentDesktop` 窗口数为 0，Swift PromptPanel 未出现，Electron 仍只有 `HandAgent Activity`。失败边界进一步收敛为旧 ActivityWindow 的 native window / hit testing / event delivery 状态没有被 Electron 状态切换释放。
- 修复结论：visible ThreadWindow 关闭时，runtime 仍只请求 ActivityWindow host 释放下一次点击状态；ActivityWindowController 现在销毁旧 `BrowserWindow`，清空 loaded 状态，再创建一个新的 `showInactive()` ActivityWindow。该修复直接改变 native window identity，而不是继续在旧 AXMain 窗口上追加 renderer/webContents 监听或状态切换。hidden prewarm close 不处理 ActivityWindow；该动作不直接请求 PromptPanel，因此不会导致 ActivityWindow 展示时立即打开 PromptPanel，也不会在 visible ThreadWindow 可聚焦时误开 PromptPanel。
- 自动化验证：`pnpm --filter handagent-electron-shell exec vitest run tests/windows/activityWindowController.test.ts tests/main/electronShellRuntime.test.ts` 覆盖 visible ThreadWindow close 调用释放、hidden prewarm close 不调用释放、ActivityWindow release 销毁旧窗口并创建/加载/`showInactive()` 新窗口、无窗口时释放为 no-op。
- 主仓库 live 回归结果：2026-06-09 合入 `09ff7f2` 后重新执行 `pnpm --filter handagent-electron-shell exec vitest run tests/windows/activityWindowController.test.ts tests/main/electronShellRuntime.test.ts`、`pnpm --filter handagent-electron-shell test`、`pnpm --filter handagent-electron-shell build`、`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build` 与 `bash ./scripts/package-app.sh --mock-llm`；packaged app 已包含 `releaseNativeFocusForNextClick()`、`window.destroy()`、`this.hasLoaded = false` 和 visible ThreadWindow close 时的 `activityWindow.releaseNativeFocusForNextClick()`。提交 `ELECTRON_STATUSBUBBLE_REBUILD_QA_20260609 [mock:assistant-ok]` 后生成 `~/.spotAgent/threads/thread-1780953633259-tiygm2.json`，`/api/activity` snapshot 为 `activeThreadId: "thread-1780953633259-tiygm2"`、`status: "idle"`、`latestSummary: "点击开始"`。关闭 Electron `HandAgent ThreadWindow` 后只剩 `HandAgent Activity`，ActivityWindow 变为 `AXMain=false` / `AXFocused=false`；立即用 CGEvent 点击 `{1280,870}` 后，Swift `PromptPanel` 出现为 `HandAgentDesktop` 640x448 system dialog，截图 `/tmp/handagent-qa/statusbubble-rebuild-after-click.png`。结论：销毁并重建 ActivityWindow 已通过主仓库 packaged live 回归；退出 QA app 后无 HandAgent / Electron / agent-server 残留，`127.0.0.1:4317` 无监听。

### Electron StatusBubble 已 AXMain 后 mouse down 回退 PromptPanel 修复

- 完成日期：2026-06-09
- 实现位置：`apps/electron-shell/src/main/windows/activityWindowController.ts`、`apps/electron-shell/src/main/electronShellRuntime.ts`、`apps/electron-shell/src/main/main.ts`、`apps/electron-shell/tests/windows/activityWindowController.test.ts`、`apps/electron-shell/tests/main/electronShellRuntime.test.ts`
- 链路证明：`366a706` 主仓库 packaged 回归证明 native focus 兜底只覆盖“从 Finder 等其他前台 App 点击回来”的路径；当关闭 visible Electron ThreadWindow 后只剩 ActivityWindow，ActivityWindow 已是 `AXMain=true / AXFocused=false`，立即点击同一窗口中心时没有 renderer IPC，也不会再次触发 focus event。失败 hop 进一步收敛为 `ActivityWindow 已 native focused/AXMain -> 同窗口 mouseDown -> 无 main 侧兜底事件 -> prompt_panel.show_requested 未发送`。
- 修复结论：ActivityWindow 现在监听 Electron `webContents.before-mouse-event` 的左键 `mouseDown`，作为已 AXMain 后重复点击的 main 侧兜底；该兜底复用 runtime 的“先聚焦 visible ThreadWindow，否则发送 `prompt_panel.show_requested`”语义，并 `preventDefault()` 阻止同一次 page mouse event 继续触发 renderer click IPC 造成重复请求。`showInactive()` 展示不会触发该兜底，visible ThreadWindow 可聚焦时不会误开 PromptPanel。
- 自动化验证：`pnpm --filter handagent-electron-shell exec vitest run tests/windows/activityWindowController.test.ts tests/main/electronShellRuntime.test.ts` 覆盖 left mouseDown、button 缺失 mouseDown、忽略 mouseMove/right click、无 visible ThreadWindow 时发送 PromptPanel 请求、有 visible ThreadWindow 时只聚焦 ThreadWindow。
- 主仓库 live 回归结果：2026-06-09 合入 `e6901d2` 后重新执行 `pnpm --filter handagent-electron-shell test`、`pnpm --filter handagent-electron-shell build`、`bash ./scripts/test.sh` 与 `bash ./scripts/package-app.sh --mock-llm`；packaged app 已包含 `onNativeMouseDown`、`runtime.handleActivityWindowNativeMouseDown()`、`before-mouse-event`、`event.preventDefault()` 和 `onNativeMouseDown?.()`。提交 `ELECTRON_STATUSBUBBLE_MOUSEDOWN_QA_20260609 [mock:assistant-ok]` 后生成 `~/.spotAgent/threads/thread-1780951095354-dk65li.json`，关闭 Electron `HandAgent ThreadWindow` 后只剩 `HandAgent Activity`，agent-server 仍监听 `127.0.0.1:4317`，ActivityWindow 为 `AXMain=true` / `AXFocused=false`。立即用 CGEvent 点击 `{1280,870}` 后，Swift `PromptPanel` 仍未出现，截图 `/tmp/handagent-qa/electron-statusbubble-mousedown-after-click.png`。结论：Electron `webContents.before-mouse-event` 也没有可靠收到该同 App / AXMain ActivityWindow 点击；缺陷已继续写入 `docs/bugs.md`，退出 QA app 后无 HandAgent / Electron / agent-server 残留，`127.0.0.1:4317` 无监听。

### Electron StatusBubble native focus 回退 PromptPanel 修复

- 完成日期：2026-06-09
- 实现位置：`apps/electron-shell/src/main/windows/activityWindowController.ts`、`apps/electron-shell/src/main/electronShellRuntime.ts`、`apps/electron-shell/src/main/main.ts`、`apps/electron-shell/tests/windows/activityWindowController.test.ts`、`apps/electron-shell/tests/main/electronShellRuntime.test.ts`
- 链路证明：期望链路是 `CGEvent 点击 ActivityWindow -> renderer onClick -> activity-window:focus-thread IPC -> ElectronShellRuntime.handleActivityWindowFocusRequest -> prompt_panel.show_requested -> Swift PromptPanel`。上一轮主仓库 packaged 回归已证明 `/api/activity`、ActivityWindow 可见、packaged 产物中的 `focusable: true` / `acceptFirstMouse: true`、agent-server 常驻和 Swift downstream prompt request 测试均成立；真实 CGEvent 点击后 ActivityWindow 变为 `AXMain=true` 但 PromptPanel 未出现，失败边界收敛在 renderer click / IPC 上游。此次修复新增 ActivityWindow native `focus` 兜底：若真实点击只让 native 窗口获得 focus / AXMain 而未送达 renderer IPC，Electron main 仍按同一语义先聚焦 visible ThreadWindow，失败则发送 `prompt_panel.show_requested`。
- 自动化验证：先运行 `pnpm --filter handagent-electron-shell exec vitest run tests/windows/activityWindowController.test.ts tests/main/electronShellRuntime.test.ts`，新增测试在修复前失败：ActivityWindow focus 未上报，runtime 无 `handleActivityWindowNativeFocus()`。修复后同命令通过，覆盖 native focus 上报、无 visible ThreadWindow 时发送 `prompt_panel.show_requested`、有 visible ThreadWindow 时只聚焦 ThreadWindow。
- 主仓库 live 回归结果：2026-06-09 合入 `366a706` 后重新执行 `pnpm --filter handagent-electron-shell test`、`pnpm --filter handagent-electron-shell build`、`bash ./scripts/test.sh` 与 `bash ./scripts/package-app.sh --mock-llm`；packaged app 已包含 `focusable: true`、`acceptFirstMouse: true`、`onNativeFocus?.()` 和 `runtime.handleActivityWindowNativeFocus()`。提交 `ELECTRON_STATUSBUBBLE_NATIVE_FOCUS_QA_20260609 [mock:assistant-ok]` 后生成 `~/.spotAgent/threads/thread-1780950395783-sxe1nw.json`，关闭 Electron `HandAgent ThreadWindow` 后只剩 `HandAgent Activity`，agent-server 仍监听 `127.0.0.1:4317`。立即用 CGEvent 点击 `{1280,870}` 后，Swift `PromptPanel` 仍未出现，截图 `/tmp/handagent-qa/electron-statusbubble-native-focus-after-click.png`；先激活 Finder 再点击同一坐标时 Swift `PromptPanel` 出现，截图 `/tmp/handagent-qa/electron-statusbubble-native-focus-after-finder-click.png`。结论：native focus 兜底只覆盖从其他前台 App 点击回来的路径；ActivityWindow 已是 `AXMain=true` 时，同 App 内后续点击仍不触发 PromptPanel。该缺陷已重新写入 `docs/bugs.md`，退出 QA app 后无 HandAgent / Electron / agent-server 残留，`127.0.0.1:4317` 无监听。

### Electron StatusBubble 无可聚焦 ThreadWindow 回退 PromptPanel 二次修复

- 完成日期：2026-06-09
- 实现位置：`apps/electron-shell/src/main/windows/activityWindowController.ts`、`apps/electron-shell/tests/windows/activityWindowController.test.ts`
- 修复结论：`acceptFirstMouse: true` 只能允许 inactive first mouse 传入，但 ActivityWindow 仍是 `focusable: false` 时，主仓库 packaged app 的 CGEvent 点击仍不能稳定触发 renderer click。ActivityWindow 现在改为 `focusable: true` + `acceptFirstMouse: true`，并继续用 `showInactive()` 做初始非激活展示；后续链路仍是 renderer click -> preload IPC -> Electron main sender 校验 -> runtime focus fallback -> Swift PromptPanel。
- 自动化验证：`pnpm --filter handagent-electron-shell exec vitest run tests/windows/activityWindowController.test.ts tests/preload/activityWindowPreload.test.ts tests/main/activityWindowIpc.test.ts tests/main/electronShellRuntime.test.ts` 覆盖 ActivityWindow window options、preload 发 `activity-window:focus-thread`、main IPC sender 校验与 runtime fallback。
- 主仓库 live 回归结果：2026-06-09 合入 `412e1e9` 后重新执行 `bash ./scripts/package-app.sh --mock-llm`，packaged app 已包含 `focusable: true` 与 `acceptFirstMouse: true`；提交 `ELECTRON_STATUSBUBBLE_FOCUSABLE_QA_20260609 [mock:assistant-ok]` 后生成 `~/.spotAgent/threads/thread-1780949594500-gba8h6.json`，关闭 Electron `HandAgent ThreadWindow` 后只剩 `HandAgent Activity`，agent-server 仍监听 `127.0.0.1:4317`。使用 CGEvent 点击 `{1280,870}`、`{1165,870}`、`{1235,870}`、`{1320,870}` 后，Swift `PromptPanel` 仍未出现；ActivityWindow 为 `AXMain=true` / `AXFocused=false`。截图：`/tmp/handagent-qa/electron-statusbubble-focusable-before-retry.png`、`/tmp/handagent-qa/electron-statusbubble-focusable-after-clicks.png`。该失败由上一条 native focus 修复记录接续，退出 QA app 后无 HandAgent / Electron / agent-server 残留，`127.0.0.1:4317` 无监听。

### Electron StatusBubble 无可聚焦 ThreadWindow 回退 PromptPanel 修复

- 完成日期：2026-06-09
- 实现位置：`apps/electron-shell/src/main/windows/activityWindowController.ts`、`apps/electron-shell/tests/windows/activityWindowController.test.ts`、`apps/electron-shell/tests/main/electronShellRuntime.test.ts`、`apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronBackedAppServerTests.swift`
- 修复结论：失败 hop 定位在 `ActivityWindow renderer click`。Electron ActivityWindow 使用 `showInactive()` 且 `focusable: false`，macOS inactive first mouse 可能只激活 Electron，不稳定传给 renderer；这一轮只加入 `acceptFirstMouse: true`。主仓库实机回归后证明该修复不足，二次修复见上一条。
- 自动化验证：`pnpm --filter handagent-electron-shell exec vitest run tests/windows/activityWindowController.test.ts tests/main/electronShellRuntime.test.ts` 覆盖 ActivityWindow `BrowserWindow` options 包含 `acceptFirstMouse: true`，以及 `ThreadWindowPrewarmer.focus()` 返回 false 时发送 `prompt_panel.show_requested`；`bash ./scripts/swiftw test --filter ElectronBackedAppServerTests/testPromptPanelShowRequestStillInvokesCallbackAfterVisibleThreadWindowClosed` 覆盖 visible ThreadWindow 关闭后的 Swift bridge prompt request 不被 availability gate 吞掉。
- 主仓库 live 回归结果：2026-06-09 合入 `2af9ba0` 并重新执行 `pnpm --filter handagent-electron-shell build && bash ./scripts/package-app.sh --mock-llm` 后，packaged app 已包含 `acceptFirstMouse: true`，但关闭 visible Electron ThreadWindow 后点击 ActivityWindow 仍未打开 Swift `PromptPanel`。该失败已作为二次修复输入，当前待主仓库 packaged app 实机回归确认。

### Electron flag supervisor description 启动日志修复

- 完成日期：2026-06-09
- 实现位置：`apps/desktop/Sources/AppServices/ElectronShell/ElectronShellProcess.swift`、`apps/desktop/TestsSwift/AppServices/ElectronShell/ElectronShellProcessTests.swift`
- 修复结论：失败 hop 定位为 `Electron main process.stderr.write -> Swift Process.standardError Pipe` 之后，Swift `ElectronShellProcess` 的 stderr readability handler 读取非空 data 后直接丢弃。修复后 stderr 数据在确认仍来自当前 Electron 子进程后原样写入宿主 stderr；stdout 仍只进入 `ElectronShellOutputDecoder` 解析 newline-delimited JSON event，不承载 diagnostic。
- 自动化验证：`bash ./scripts/swiftw test --filter ElectronShellProcessTests/testForwardsChildStderrToHostStderrAndKeepsStdoutEventsDecodable` 覆盖子进程 stderr 会转发到宿主 stderr，且同一子进程 stdout 的 `electron.ready` event 仍可被解码；`bash ./scripts/swiftw test --filter ElectronShellProcessTests` 覆盖 ElectronShellProcess 既有 stdin EOF、command socket 与 stdout decoder 行为不回退。
- 手工回归结果：2026-06-09 合入主仓库后重新执行 `bash ./scripts/package-app.sh --mock-llm`，使用 `HANDAGENT_ELECTRON_SHELL=1` 与 Electron `v42.3.3` 启动 packaged app，并把 app stdout/stderr 重定向到 `/tmp/handagent-qa/electron-log-description-main-20260609.log`。日志命中 `[electron-shell] agent-server supervisor: {"mode":"node_child","entry":"apps/agent-server/src/server/server.ts","coreRuntimeHost":"agent-server","utilityProcessBlocker":"apps/agent-server/dist/server/server.js 不存在；当前 agent-server 仍依赖 TypeScript 源码入口和 Node --experimental-transform-types"}`；同一日志还包含 agent-server stderr warning、registered tools 与 `llm mode: mock`；`lsof -nP -iTCP:4317 -sTCP:LISTEN` 显示 node 监听 `127.0.0.1:4317`；`ws://127.0.0.1:4317/api/activity` 首条消息为 `activity.snapshot` 且 `status:"idle"`；退出后无 Electron main、renderer 或 agent-server 残留，`127.0.0.1:4317` 无监听。
- 边界确认：本修复只改变 Electron stderr diagnostic 的可观察性，不把 supervisor description、agent-server stdout/stderr 或任何 diagnostic 写入 stdout JSON event 协议。

### Electron flag 退出回收修复

- 完成日期：2026-06-09
- 实现位置：`apps/desktop/HandAgentApp.swift`、`apps/desktop/TestsSwift/HandAgentAppTests.swift`
- 修复结论：失败 hop 已定位为 `macOS quit -> HandAgentApp/AppCoordinator.shutdown` 未接线；`HandAgentApplicationDelegate` 现在在 `applicationShouldTerminate` / `applicationWillTerminate` 中幂等调用 `AppCoordinator.shutdown()`，后续沿既有链路执行 `AgentServerHealth.stop -> ElectronBackedAppServer.stop -> ElectronShellProcess shutdown command -> Electron main stopSupervisor/app.quit -> agent-server stop`。
- 自动化验证：`bash ./scripts/swiftw test` 覆盖 macOS termination delegate 会触发 coordinator shutdown，既有 ElectronBackedAppServer 测试覆盖 shutdown command 与 shell stop，`pnpm --filter handagent-electron-shell test` 覆盖 Electron runtime 收到 `shutdown` 后 ack、停止 supervisor 并 quit，以及 Node supervisor stop 不重启。
- 后续 live 验证方式：合入主仓库后在 `main` 执行 `bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`、`pnpm --filter handagent-electron-shell build`、`bash ./scripts/package-app.sh --mock-llm`；用 `HANDAGENT_ELECTRON_SHELL=1` 与 packaged mock app 启动，提交任意 mock prompt 确认 Electron ThreadWindow、ActivityWindow 与 agent-server 正常运行，再执行 `osascript -e 'tell application id "com.yourname.HandAgentDesktop" to quit'`；退出后用 `ps` 确认无 `ElectronShell/dist/main/main.js`、Electron Helper renderer、`apps/agent-server/src/server/server.ts` 残留，并用 `lsof -nP -iTCP:4317 -sTCP:LISTEN` 确认端口未监听。
- 手工回归结果：2026-06-09 重新执行 `bash ./scripts/package-app.sh --mock-llm` 后启动 Electron flag packaged app，提交 `ELECTRON_SHUTDOWN_CLEANUP_QA_20260609 [mock:assistant-ok]`；`~/.spotAgent/threads/thread-1780946798569-bwztm6.json` 包含 user prompt 与 `Mock assistant response: main chain is reachable.`。随后执行 `osascript -e 'tell application id "com.yourname.HandAgentDesktop" to quit'`；4 秒后 `ps` 未发现 `ElectronShell/dist/main/main.js`、Electron Helper renderer 或 `apps/agent-server/src/server/server.ts` 残留，`lsof -nP -iTCP:4317 -sTCP:LISTEN` 无监听输出。

### Electron flag `/api/platform` bridge 连接修复

- 完成日期：2026-06-09
- 实现位置：`apps/desktop/Sources/AppServices/AgentServer/AppServer.swift`、`apps/desktop/Sources/AppServices/ElectronShell/ElectronBackedAppServer.swift`、`apps/agent-server/src/server/server.ts`
- 自动化验证：`bash ./scripts/swiftw test --filter PlatformBridgeConnectionClientTests` 覆盖 `/api/platform` 连接后立即 hello 与短延迟 hello 重试；`bash ./scripts/swiftw test --filter ElectronBackedAppServerTests` 覆盖 Electron flag runtime 在 `agent_server.health available=true` 后启动 platform bridge client；`pnpm --filter handagent-agent-server exec vitest run tests/server/server.test.ts` 覆盖同一 `/api/platform` socket 重复 hello 幂等，不替换已绑定 bridge。
- 手工回归步骤：使用 mock LLM packaged app + `HANDAGENT_ELECTRON_SHELL=1` + `HANDAGENT_ELECTRON_BINARY` 启动 Electron flag 路径；允许 `clipboard.read {}` 后提交 `ELECTRON_PLATFORM_TOOL_ALLOW_QA_20260609 [mock:clipboard-read]`；确认 `~/.spotAgent/threads/<threadId>.json` 中 `clipboard.read` tool result 不再是 `Platform bridge is not connected (method: clipboard.read)`，而是 Swift `/api/platform` 回写的剪贴板结果。
- 手工回归结果：2026-06-09 重新执行 `bash ./scripts/package-app.sh --mock-llm` 后启动 Electron flag packaged app，提交 `ELECTRON_PLATFORM_BRIDGE_FIXED_QA_20260609 [mock:clipboard-read]`；`~/.spotAgent/threads/thread-1780946481700-4m0hzp.json` 中 `clipboard.read` tool result 为 `{"text":{"text":"ELECTRON_PLATFORM_BRIDGE_FIXED_QA_20260609 [mock:clipboard-read]"}}`，确认 platform bridge 已由 Swift 回写。
- 边界确认：修复只覆盖 Electron flag 路径下 Swift `/api/platform` hello 可靠发送与 agent-server 同 socket hello 幂等；不改变 Electron ThreadWindow、ActivityWindow、权限策略或 platform tool 业务实现。

### 默认路径 Swift StatusBubble activity 回归修复

- 完成日期：2026-06-09
- 实现位置：`apps/desktop/Sources/AppServices/AgentServer/AgentActivityConnectionClient.swift`、`apps/desktop/Sources/AppServices/AgentServer/AppServer.swift`、`apps/desktop/Sources/AppServices/Thread/ThreadRegistry.swift`、`apps/desktop/Sources/AppServices/AppServices.swift`
- 自动化验证：`bash ./scripts/swiftw test` 覆盖 `/api/activity` snapshot 更新 `ThreadRegistry`、默认 StatusBubble tap 使用 activity threadId 聚焦 ThreadWindow、默认 `AppServer` 同时启动 `/api/platform` 与 `/api/activity` 连接。
- 手工回归步骤：使用 `bash ./scripts/package-app.sh --mock-llm` 打包默认 WKWebView 路径，提交 `THREAD_HISTORY_STATUS_QA_20260609_MINIMIZE [mock:slow-focus]` 并保持 ThreadWindow 打开；运行中观察 Swift StatusBubble 应显示 running 与 `正在回复`，点击气泡应聚焦当前 ThreadWindow，不应打开 PromptPanel。
- 边界确认：默认 Swift 只消费 `/api/activity` 的轻量 `AgentActivityEvent` 更新 `ThreadRegistry`；不解析 `/api/thread`，不同步完整 React ThreadWindow 状态。Electron flag 路径仍由 Electron ActivityWindow 承载 React StatusBubble。

### Thread 输入队列与 input.submit 破坏性迁移

- 完成日期：2026-06-07（后端队列）；2026-06-08（输入协议破坏性迁移、running 输入显示顺序修正）
- 关键 commit：`b0893c5`（后端队列）；`3e562e1`（输入协议迁移）
- 实现位置：`packages/core/src/protocol/ThreadCommand.ts`、`apps/agent-server/src/thread/ThreadInputQueue.ts`、`apps/agent-server/src/thread/ThreadRuntimeOrchestrator.ts`、`apps/agent-server/src/thread/ThreadCommandRouter.ts`、`apps/agent-server/src/server/server.ts`、`apps/thread-window-web/src/protocol/threadProtocol.ts`、`apps/thread-window-web/src/thread/threadSocketClient.ts`、`apps/thread-window-web/src/store/threadWindowStore.ts`、`apps/thread-window-web/src/App.tsx`、`apps/thread-window-web/src/components/Composer.tsx`
- 验收结果：外部用户输入命令统一为 `input.submit`，旧输入命令已从当前 `ThreadCommand` 移除；ThreadWindow composer 在 running 状态下仍可提交输入并保留 Stop，但 running 输入先进入前端本地 FIFO 队列并显示在 Composer 上方，等 thread 离开 running 后逐条发送，避免两个 user input 连续显示；后端公开 `/api/thread input.submit` 在 running 时返回 `thread.error(code: "thread_running")`，普通用户 follow-up 不走后端排队。已通过 `bash ./scripts/test.sh`、`pnpm --filter handagent-thread-window-web test -- tests/threadWindowStore.test.ts`、`pnpm --filter handagent-thread-window-web build`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`。

### ThreadWindow workspace 分组排序修复

- 完成日期：2026-06-09
- 实现位置：`apps/thread-window-web/src/utils/groupThreads.ts`、`apps/thread-window-web/tests/groupThreads.test.ts`、`apps/thread-window-web/tests/historySidebar.test.ts`、`apps/thread-window-web/tests/threadWindowStore.test.ts`
- 验收结果：`workspace.listed` 仍按后端 registry 原序写入 store；ThreadWindow 历史侧栏在 `groupThreadsByWorkspace` 层按 workspace 名称排序，名为 `default` 的 workspace 参与正常字母序，`workspaceId: null` 的"默认对话"仍独立固定在最下方。已通过 `pnpm --filter handagent-thread-window-web exec vitest run tests/groupThreads.test.ts tests/threadWindowStore.test.ts tests/historySidebar.test.ts`。


## Electron UI Shell 最终态验收（P2）

**实施状态**：未通过实机 QA；本节为待验收项，不得归档为已通过。

**2026-06-09 已验证子项**：

- Electron flag packaged app 在 mock LLM 下可启动为 Swift / Electron main / agent-server 各一份进程，`127.0.0.1:4317` 由 Electron 监督的 agent-server 监听；启动后只显示 Electron `HandAgent Activity`，PromptPanel show/toggle 不展示 ThreadWindow。
- `open_history` command 聚焦 Electron `HandAgent ThreadWindow` 并显示历史侧栏；`HandAgentDesktop` 无 Swift WKWebView 标准窗口。
- `ELECTRON_PLATFORM_BRIDGE_FIXED_QA_20260609 [mock:clipboard-read]` 已证明 Electron flag 路径下 platform tool 通过 Swift `/api/platform` 回写，thread 文件为 `~/.spotAgent/threads/thread-1780946481700-4m0hzp.json`。
- Electron ActivityWindow 状态截图：idle `/tmp/handagent-qa/electron-status-idle-after-waiting.png`；running `/tmp/handagent-qa/status-bubble-activity-fixed.png`；completed `/var/folders/m7/6b3swwk92mb0zthbzy5pfjvc0000gn/T/codex-shot-2026-06-09_03-11-19.png`；error `/tmp/handagent-qa/electron-error-activity.png`。
- `ELECTRON_ERROR_STATUS_QA_20260609 [mock:llm-error]` 已验证 `/api/activity` 返回 `status: "error"` / `latestSummary: "运行失败"`，ThreadWindow 显示红色错误气泡，截图 `/tmp/handagent-qa/electron-error-threadwindow.png`，thread 文件 `~/.spotAgent/threads/thread-1780946934566-sz2ewd.json`。
- `ELECTRON_WORKSPACE_WAITING_QA_20260609 [mock:workspace-ask]` 已验证 permission waiting 与 workspace waiting：ActivityWindow 截图 `/tmp/handagent-qa/electron-permission-waiting-activity.png`、`/tmp/handagent-qa/electron-workspace-waiting-activity.png`，ThreadWindow 内联面板截图 `/tmp/handagent-qa/electron-permission-waiting-threadwindow.png`、`/tmp/handagent-qa/electron-workspace-waiting-threadwindow.png`。
- 关闭 visible Electron ThreadWindow 后，agent-server 保持运行；再次 PromptPanel submit 可复用后台服务创建新的 Electron ThreadWindow。
- kill agent-server 后 Electron supervisor 会重启新的 agent-server，`/api/activity` 新连接立即收到 snapshot，`/api/thread` 可继续处理新 prompt。
- `ELECTRON_SHUTDOWN_CLEANUP_QA_20260609 [mock:assistant-ok]` 已验证标准 quit 后无 Electron main / Electron Helper renderer / agent-server 残留，`127.0.0.1:4317` 无监听输出，thread 文件 `~/.spotAgent/threads/thread-1780946798569-bwztm6.json`。
- `ELECTRON_STARTING_SEQUENCE_QA_20260609_C [mock:assistant-ok]` 已验证 Electron ActivityWindow activity 流包含 `starting` / `running` / `completed` / `idle` 序列，thread 文件 `~/.spotAgent/threads/thread-1780947483869-t8ou50.json` 包含同一 user prompt 与 mock assistant。
- 点击 Electron StatusBubble 的可见 ThreadWindow 分支已验证：先激活 Finder，再用 CGEvent 点击 ActivityWindow 中心，前台切到 Electron，`HandAgent ThreadWindow` 的 `AXMain=true`，`HandAgent Activity` 的 `AXMain=false`。
- Electron ActivityWindow 非 key 行为曾在 `focusable:false` 版本验证：点击气泡后 `HandAgent Activity` 的 `AXMain=false` / `AXFocused=false`，CoreGraphics 只显示 owner 为 `Electron` 的 `HandAgent Activity` 小窗，layer 为 3，bounds 为 `{X: 1144, Y: 832, Width: 272, Height: 76}`。二次修复改为 `focusable:true` 后，2026-06-09 packaged 回归中 ActivityWindow 为 `AXMain=true` / `AXFocused=false`，最终非 key 行为需随下一次 StatusBubble 修复重新确认。
- supervisor 最大重启诊断已验证：先退出 QA app，用 Python 端口占用器监听 `127.0.0.1:4317`，再启动 Electron flag packaged app；超过 5 次 restart attempt 后，agent-server 不再残留，PromptPanel 可见错误文案 `agent-server stopped after 5 restart attempts: agent-server exited with code 1`，截图 `/tmp/handagent-qa/electron-supervisor-max-prompt.png`。清理后无 HandAgent / Electron / agent-server 残留，`127.0.0.1:4317` 无监听。
- packaged app 产物与 mock LLM 路径已验证：`dist/HandAgentDesktop.app/Contents/Resources/ElectronShell/dist/main/main.js` 存在；`HANDAGENT_ELECTRON_BINARY` 指向的 Electron binary 可执行且版本为 `v42.3.3`；`~/.spotAgent/threads/thread-1780947483869-t8ou50.json` 中 assistant 内容为 `Mock assistant response: main chain is reachable.`，确认 mock packaged app 未访问真实 LLM。
- PromptPanel 连续提交已验证复用同一个 Electron ThreadWindow 并创建不同 thread/tab：第一次提交 `ELECTRON_MULTI_PROMPT_QA_20260609_A [mock:assistant-ok]` 生成 `~/.spotAgent/threads/thread-1780948156864-2ttk2d.json`；第二次提交 `ELECTRON_MULTI_PROMPT_QA_20260609_B [mock:assistant-ok]` 生成 `~/.spotAgent/threads/thread-1780948177419-qwq8of.json`；两次提交后 `HandAgent ThreadWindow` 的 CoreGraphics window number 均为 `43975`，截图 `/tmp/handagent-qa/electron-two-prompt-tabs.png` 显示同一 Electron ThreadWindow 内有两个 tab，当前内容为 B prompt。
- Electron flag 启动日志 supervisor description 已验证：主仓库 packaged mock app stdout/stderr 重定向到 `/tmp/handagent-qa/electron-log-description-main-20260609.log` 后，日志包含 `mode:"node_child"`、`coreRuntimeHost:"agent-server"` 与 Node child fallback 的 `utilityProcessBlocker`；同轮 `lsof` 显示 `127.0.0.1:4317` 由 node 监听，`/api/activity` WebSocket 首条消息为 idle `activity.snapshot`，退出后无残留。

**2026-06-09 待回归修复项**：

- 关闭可见 Electron ThreadWindow 后，ActivityWindow 仍显示且 agent-server 继续监听 `127.0.0.1:4317` 时，用 CGEvent 点击 ActivityWindow 中心应打开 Swift `PromptPanel`。`09ff7f2` 已通过主仓库 packaged live 回归：visible ThreadWindow close 后销毁并重建 ActivityWindow，关闭后 ActivityWindow 为 `AXMain=false` / `AXFocused=false`，点击中心会打开 Swift PromptPanel。该子项不再阻塞 Electron UI Shell 最终态；保留本条历史说明用于追溯此前 `2af9ba0`、`412e1e9`、`366a706`、`e6901d2`、`a030945`、`b4af5ef` 的失败边界。

**2026-06-09 阻塞子项**：

- “关闭 Electron StatusBubble” 暂无稳定产品路径：ActivityWindow 是 frameless 小窗，AX `close window "HandAgent Activity"` 返回 `-1708`（窗口不理解 close 信息），也没有可见关闭按钮；本轮只确认关闭尝试后 agent-server 仍监听 `127.0.0.1:4317`，未把该子项判为通过。

1. 运行 `pnpm --filter handagent-electron-shell build`。
1. 设置 `HANDAGENT_ELECTRON_SHELL=1` 后运行桌面 App，确认 Electron shell 和 agent-server 只有各一份进程，`127.0.0.1:4317` 没有第二份 server 冲突。
1. 使用 packaged app + `HANDAGENT_ELECTRON_BINARY` 启动 Electron flag 路径，确认 Electron main 不因 Swift command bridge 阻塞在 stdin，启动后能上报 `electron.ready` 并继续拉起 agent-server。
1. 确认启动日志包含 agent-server supervisor description，并明确 `mode`、`coreRuntimeHost: "agent-server"` 与 `utilityProcessBlocker`；如果走 Node child fallback，日志必须说明 utilityProcess 的具体 blocker。
1. 启动完成前 PromptPanel 不允许提交；收到 `agent_server.health available=true` 与 `thread_window.prepared` 后 PromptPanel 才恢复可提交。
1. 通过全局快捷键打开或切换 PromptPanel 多次，确认不会显示 ThreadWindow，也不会发送 `thread_window.prepare` command；hidden ThreadWindow 预热只由 Electron main 在 app-server ready 后完成。
1. 提交 `ELECTRON_UI_SHELL_FINAL_QA_20260608`，确认打开的是 Electron ThreadWindow，创建新 tab/thread，并显示该首条 user message；`~/.spotAgent/threads/` 中对应 thread 文件包含同一 user message。
1. 再次打开 PromptPanel 连续提交第二条不同 prompt，确认复用同一个 Electron ThreadWindow，但创建新的 tab/thread，不写入当前 active tab 的 composer thread。
1. 触发 `openHistory`，确认聚焦 Electron ThreadWindow 并显示历史侧栏，不创建 Swift WKWebView host。
1. 触发 platform tool，例如 `clipboard.read`、`app.frontmost`、`screen.capture` 或 `accessibility.snapshot`，确认 agent-server 仍通过 `/api/platform` 请求 Swift 回写结果。
1. 确认不再显示 Swift StatusBubble，右下角显示 Electron React StatusBubble；提交 prompt 后 Electron StatusBubble 能展示 `starting` / `running` / `completed`。
1. 触发 tool、permission/workspace request、模型配置错误或 provider 错误，确认 Electron StatusBubble 分别展示 tool running、waiting、error 状态，ThreadWindow 内联请求面板和错误气泡仍正常可见。
1. 点击 Electron StatusBubble，若 Electron ThreadWindow 可见，确认聚焦 ThreadWindow；若无可聚焦 ThreadWindow，确认 Swift PromptPanel 打开。
1. 断开并重连 `/api/activity` subscriber，确认新连接立即收到 `activity.snapshot`，不会影响 `/api/thread` 消息流。
1. 确认 ActivityWindow 非激活展示：点击气泡不把 ActivityWindow 变成 key window，且不会出现在 Cmd+Tab。
1. 关闭 visible Electron ThreadWindow，确认 agent-server 进程仍存在；再次打开 PromptPanel 并提交，确认仍通过同一后台服务执行。
1. 关闭 Electron StatusBubble，确认 agent-server 进程仍存在，ThreadWindow 仍可继续对话。
1. 模拟 agent-server 非零退出，确认 supervisor 按退避重启；超过最大次数后 Swift 显示明确 fatal/diagnostic 文案。
1. 执行 `bash ./scripts/package-app.sh --mock-llm`，确认 `.app/Contents/Resources/ElectronShell/dist/main/main.js` 存在。
1. 确认 PATH 中存在 `electron`，或设置 `HANDAGENT_ELECTRON_BINARY` 指向可用 Electron binary。
1. 使用 mock LLM packaged app 路径启动 Electron flag，确认 prompt 返回 mock assistant，不访问真实 LLM。
1. 退出 HandAgent 后确认 Electron、agent-server 和 renderer 进程不残留。

## ThreadWindow UI 重构完整验收（P2）

**实施状态**：Phase 1-4 已 100% 完成（2026-06-07 合并到 main）

**2026-06-09 进行中验证证据**：

- 场景 1 已验证构建与主题产物：`pnpm --filter handagent-thread-window-web build` 通过，生成 `apps/thread-window-web/dist/index.html`、`apps/thread-window-web/dist/assets/index-BQgOjT3d.css`、`apps/thread-window-web/dist/assets/index-B5G0hv59.js`；CSS 产物包含 Tailwind utilities、`bg-canvas`、`bg-surface-dark`、`bg-primary`、`rounded-lg`，以及 warm-canvas 色值 `#faf9f5` / `rgb(24 23 21)` / `rgb(239 233 222)` / `rgb(204 120 92)`。
- 场景 1 已完成默认 WKWebView 路径可视检查：重新执行 `bash ./scripts/package-app.sh --mock-llm` 后启动 packaged app，提交 `THREADWINDOW_SCENARIO1_THEME_QA_20260609 [mock:assistant-ok]`，生成 `~/.spotAgent/threads/thread-1780949983762-ki8lb7.json`；截图 `/tmp/handagent-qa/threadwindow-scenario1-theme.png` 显示左侧 warm cream sidebar、右侧 dark Thread workspace、coral primary 新建对话按钮、cream user bubble、透明 assistant 文本和 pill composer。退出后无 HandAgent / agent-server 残留，`127.0.0.1:4317` 无监听。
- 场景 1 暂不归档：运行时 DevTools DOM class 检查尚未完成，下一轮需补充确认实际 DOM 使用 `bg-canvas`、`bg-surface-dark`、`rounded-lg` 等类名。
- 场景 2 已验证旧 thread `workspaceId` 向后兼容：创建 `~/.spotAgent/threads/test-old-thread.json`，其 `metadata` 不含 `workspaceId`；启动默认 WKWebView packaged mock app 并提交 `THREADWINDOW_SCENARIO2_NEW_THREAD_QA_20260609 [mock:assistant-ok]` 后，搜索 `测试旧版本` 可见旧 thread 出现在“默认对话”分组，截图 `/tmp/handagent-qa/threadwindow-scenario2-old-thread-search.png`；旧文件仍不含 `workspaceId` 且 `updatedAt` 未变化。新建 thread `~/.spotAgent/threads/thread-1780950632340-na2sg4.json` 包含 `metadata.workspaceId: null`、同一 user prompt 与 mock assistant。测试旧文件已删除；退出清理时 AppleScript quit 被系统对话取消，改用 `kill` 终止 QA 进程，最终无 HandAgent / agent-server 残留，`127.0.0.1:4317` 无监听。
- 场景 3 已完成协议与自动化证据：审查 `packages/core/src/protocol/ThreadCommand.ts` 确认 `workspace.list` 命令存在，`packages/core/src/protocol/ThreadNotification.ts` 确认 `workspace.listed` 通知包含 `workspaces[].id/name/rootPath`，`apps/thread-window-web/src/protocol/threadProtocol.ts` 的 `isThreadNotification` 校验 `workspace.listed` 与 `rootPath` 字符串，`apps/thread-window-web/src/thread/threadSocketClient.ts` 在 WebSocket open 后发送 `encodeWorkspaceList()` 再 `thread.list()`；`pnpm --filter handagent-thread-window-web exec vitest run tests/threadProtocol.test.ts tests/threadSocketClient.test.ts tests/threadWindowStore.test.ts tests/historySidebar.test.ts` 通过，4 个文件 33 个用例。live UI 侧，场景 2 截图 `/tmp/handagent-qa/threadwindow-scenario2-old-thread.png` 与搜索截图可见 `default`、`handagent-test`、`qa-workspace`、`tmp` workspace 分组和“默认对话”分组，说明 workspace 列表已进入历史侧栏渲染。场景 3 暂不归档：尚未用 DevTools Network 直接观察 `/api/thread` WebSocket 上的 `workspace.list` / `workspace.listed` 帧。
- 场景 4 已通过默认 WKWebView packaged live 回归：`~/.spotAgent/workspaces.json` registry 原序为 `default -> tmp -> qa-workspace -> handagent-test`，历史侧栏显示排序为 `default -> handagent-test -> qa-workspace -> tmp -> 默认对话`。已验证“新建对话”按钮、搜索框、搜索过滤和清空、创建空白 thread；修复 `42860fe` 后再次打包提交 `THREADWINDOW_SCENE4_EXPAND_FIX_QA_20260609 [mock:assistant-ok]` 与 `THREADWINDOW_SCENE4_PERSISTENCE_QA_20260609 [mock:assistant-ok]`。`/api/thread thread.list` 返回 56 个 thread，其中四个 `qa-scene4-*` fixture 分别匹配真实 workspaceId；CoreGraphics 点击 `default`、`handagent-test`、`qa-workspace`、`tmp` 标题后均可展开并显示对应 `SCENE4_*` 历史项，`default` 再次点击可收起；点击 `SCENE4_DEFAULT...` 历史项会激活该 thread/tab。关闭 ThreadWindow 并重新提交 prompt 后，新建 WKWebView 恢复 `handagent-test`、`qa-workspace`、`tmp` 展开和 `default` 收起状态。证据截图：`/tmp/handagent-qa/threadwindow-scenario4-expand-fix-all-expanded.png`、`/tmp/handagent-qa/threadwindow-scenario4-expand-fix-qa-expanded.png`、`/tmp/handagent-qa/threadwindow-scenario4-expand-fix-default-collapsed.png`、`/tmp/handagent-qa/threadwindow-scenario4-expand-fix-reopen-persisted.png`；thread 文件：`~/.spotAgent/threads/thread-1780955175109-a0tl2r.json`、`~/.spotAgent/threads/thread-1780955402861-qedb4a.json`。退出后无 HandAgent / agent-server 残留，`127.0.0.1:4317` 无监听。结论：场景 4 分组交互已通过，workspace 展开缺陷已从 `docs/bugs.md` 移除并归档。
- 场景 5 已完成默认 WKWebView packaged live 验证：提交 `THREADWINDOW_SCENE5_RESPONSIVE_QA_20260609 [mock:assistant-ok]` 后生成 `~/.spotAgent/threads/thread-1780954592680-hdn67v.json`。用 AX 调整 `HandAgent` 窗口尺寸并读取 sidebar `complementary` 区域：窗口 920x640 时 sidebar 为 276x612，接近 30%，截图 `/tmp/handagent-qa/threadwindow-scenario5-width-920.png`；窗口放大到实际 1280x640 时 sidebar 为 320x612，达到最大宽度上限，截图 `/tmp/handagent-qa/threadwindow-scenario5-width-1300.png`；窗口 800x640 时 sidebar 为 240x612，仍接近 30% 且高于 220，截图 `/tmp/handagent-qa/threadwindow-scenario5-width-800.png`；窗口 740x640 时 main 只有右侧 region，sidebar 隐藏，截图 `/tmp/handagent-qa/threadwindow-scenario5-width-740.png`；重新放回 920x640 后 main 恢复为 2 个区域，sidebar 为 276x612，搜索框仍存在且为空，截图 `/tmp/handagent-qa/threadwindow-scenario5-width-920-restored.png`。退出后无 HandAgent / agent-server 残留，`127.0.0.1:4317` 无监听。
- 场景 5A 已启动但未完成动态滚动验证：默认 WKWebView packaged mock app 提交 `THREADWINDOW_SCENE5A_SCROLL_QA_20260609 [mock:assistant-ok]`，生成 `~/.spotAgent/threads/thread-1780955664655-r0vptz.json`，其中 user prompt 包含 80 行长文本，ThreadWindow 右侧出现独立纵向滚动条，顶部 TabBar 和底部 Composer 可见且位于固定区域，截图 `/tmp/handagent-qa/threadwindow-scenario5a-initial-long-message.png`。但本轮用 CoreGraphics wheel（line / pixel、正反方向）、鼠标点击后 Page Down、方向键、窗口级 `AXScrollDown` 均未能驱动 WKWebView 内部滚动；AX 子树枚举 `window "HandAgent"` 仍返回 `-10000`，窗口级 `AXScrollDown` 返回 `-1728`。因此本轮只记录静态布局证据，不把场景 5A 判为通过，也不判为产品缺陷；需下一轮使用可操作 WKWebView 滚动的输入路径继续验证左侧列表滚动、右侧消息滚动、TabBar 横向滚动和最小尺寸横向溢出。退出后无 HandAgent / agent-server 残留，`127.0.0.1:4317` 无监听。
- 场景 6 已启动但因产品缺陷阻塞：默认 WKWebView packaged mock app 提交 `THREADWINDOW_SCENE6_VISUAL_QA_20260609 [mock:workspace-list]`，生成 `~/.spotAgent/threads/thread-1780956268767-2n3fjt.json`。thread 文件包含 user、assistant tool call、`workspace.list` tool result、assistant final 四条消息，tool result success；截图 `/tmp/handagent-qa/threadwindow-scenario6-visual-workspace-list-final.png` 显示左侧 warm cream sidebar、coral 新建对话按钮、dark right workspace、cream user bubble、dark monospace tool bubble、pill composer。截图取样：sidebar `#eee9df`，user bubble 主色 `#eee9df`，tool bubble 主色 `#1b1b18`，right workspace `#181715`，composer 主色 `#252320`，新建按钮主色约 `#c07c62`。但同一 thread 文件的最终 assistant content 是 `Mock workspace.list completed.`，UI 终态和裁剪图 `/tmp/handagent-qa/threadwindow-scenario6-assistant_final_crop.png` 只显示 `Mock`；缺陷已写入 `docs/bugs.md`，并分发子 agent `019ea947-5f2d-7982-b734-77dcf5ce7f63` 使用 `$trace-and-verify-call-chain` 定位修复。退出后无 HandAgent / agent-server 残留，`127.0.0.1:4317` 无监听。

### 前提条件
- 已通过 `bash ./scripts/test.sh`
- 已通过 `bash ./scripts/swiftw build`
- 已执行 `pnpm --filter handagent-thread-window-web build`

### 验收场景

#### 场景 1: Tailwind CSS 构建与主题验证

1. 执行 `pnpm --filter handagent-thread-window-web build`
2. 确认 `apps/thread-window-web/dist/` 生成包含 Tailwind utilities 的 CSS
3. 确认构建输出无 PostCSS 或 Tailwind 配置错误
4. 检查 `dist/assets/*.css` 文件，确认包含 Claude warm-canvas theme tokens 对应的 CSS（如 `bg-canvas`、`bg-surface-dark`、`bg-primary`、`bg-user-bubble`）
5. 启动 desktop app，用开发者工具检查 DOM，确认组件使用 Tailwind 类名（如 `bg-canvas`、`bg-surface-dark`、`rounded-lg`）

#### 场景 2: workspaceId 向后兼容验证

1. 创建测试用旧版本 thread 文件（不含 `workspaceId` 字段）：
   ```bash
   cat > ~/.spotAgent/threads/test-old-thread.json <<'EOF'
   {
     "version": 1,
     "metadata": {
       "id": "test-old-thread",
       "preview": "测试旧版本 thread",
       "createdAt": "2026-06-01T10:00:00.000Z",
       "updatedAt": "2026-06-01T10:00:00.000Z",
       "messageCount": 0
     },
     "messages": [],
     "events": []
   }
   EOF
   ```
2. 启动 desktop app：`bash ./scripts/swiftw run HandAgentDesktop`
3. 打开 ThreadWindow 历史列表
4. 确认旧 thread 出现在"默认对话"分组（最下方），不出现解析错误或崩溃
5. 用 `cat ~/.spotAgent/threads/test-old-thread.json` 确认文件未被意外修改
6. 创建新 thread，用 `cat ~/.spotAgent/threads/<新threadId>.json | jq .metadata.workspaceId` 确认新文件包含 `"workspaceId": null` 字段
7. 清理测试文件：`rm ~/.spotAgent/threads/test-old-thread.json`

#### 场景 3: workspace.list 协议与 workspace 分组刷新验证

1. 审查 `packages/core/src/protocol/ThreadCommand.ts`，确认 `workspace.list` 命令类型存在
2. 审查 `packages/core/src/protocol/ThreadNotification.ts`，确认 `workspace.listed` 通知类型存在
3. 审查 `apps/thread-window-web/src/protocol/threadProtocol.ts`，确认 `isThreadNotification` 已覆盖 `workspace.listed`，并校验 `workspaces[].id/name/rootPath`
4. 启动 desktop app，打开浏览器开发者工具 Network 标签
5. 打开 ThreadWindow，确认 WebSocket 连接后自动发送 `workspace.list` 命令
6. 确认 Network 中收到 `workspace.listed` 后，历史边栏按返回的 workspace 列表刷新分组；若没有配置 workspace，至少应保留"默认对话"分组且不丢弃通知

#### 场景 4: 左侧边栏 workspace 分组交互

1. 确认历史边栏顶部显示"新建对话"按钮
2. 确认显示搜索输入框
3. 准备一个 registry 原序不是字母序的 `~/.spotAgent/workspaces.json`，例如 `default -> tmp -> qa-workspace -> handagent-test`；确认历史侧栏显示为 `default -> handagent-test -> qa-workspace -> tmp -> 默认对话`，即 workspace 分组按字母顺序排列，名为 `default` 的 workspace 不等同于"默认对话"，"默认对话"分组固定在最下方。
4. 点击 workspace 分组标题，确认可展开/收起，图标有旋转动画
5. 在搜索框输入关键词，确认过滤所有分组的 thread（按 preview 字段匹配）
6. 清空搜索，确认恢复完整列表
7. 展开/收起若干分组后刷新页面，确认展开状态保持（持久化到 store）
8. 点击"新建对话"按钮，确认创建空白 thread 并自动切换到新 tab
9. 点击历史项，确认激活或创建对应 tab

#### 场景 5: 左侧边栏响应式缩放与隐藏

1. 打开 ThreadWindow，保持默认窗口宽度，确认左侧历史边栏可见且宽度接近窗口宽度的 30%。
2. 横向放大窗口，确认左侧历史边栏随窗口变宽，但达到约 320px 后不再继续变宽。
3. 横向缩小窗口到约 760px 以上，确认左侧历史边栏随窗口变窄，且不会窄到低于约 220px。
4. 继续缩小窗口到 760px 以下，确认左侧历史边栏隐藏，右侧对话区占满窗口宽度。
5. 从窄窗口重新放大到 760px 以上，确认左侧历史边栏重新出现，历史项、搜索框和 workspace 展开状态仍正常。

#### 场景 5A: ThreadWindow 滚动容器验证

1. 准备足够多的历史 thread，使左侧列表高度超过窗口；滚动左侧边栏时，HandAgent 标题、新建对话按钮和搜索框保持固定，只有对话列表滚动。
2. 打开一个包含多轮消息的 thread，使右侧消息超过窗口高度；滚动右侧时，顶部 TabBar 和底部 Composer 保持固定，只有消息区域滚动。
3. 打开多个 tab，使 tab 总宽度超过右侧可视宽度；确认只有 TabBar 内部出现横向滚动，ThreadWindow 页面本身没有底部横向滚动条。
4. 将 ThreadWindow 缩到最小可用尺寸附近，确认消息、Composer、请求面板和历史项不撑出页面横向滚动。

#### 场景 6: ThreadWindow Claude warm-canvas 视觉验证

1. 创建新 thread，发送若干消息（user / assistant / tool）
2. 确认左侧历史栏是 warm cream surface：整体为 `#efe9de`，搜索框和选中 thread 为 `#faf9f5`，边线为浅 cream hairline。
3. 确认右侧 thread workspace 是 dark product surface：主背景为 `#181715`，顶部 tab bar 和 composer 区域为更深/更高的 dark surface。
4. 确认 "新建对话" 与 "发送" 是 coral primary（`#cc785c`），hover/active 会变深，不再使用 Mango Amber。
5. 确认 user 消息是 coral-tinted cream card，assistant 消息是 cream card，tool 消息是 dark code-style card 并使用 monospace。
6. 将窗口缩到最小尺寸附近，确认历史标题、tab 标题、消息、按钮文字没有互相遮挡或溢出容器。

#### 场景 7: GPT 风格布局验证

**验收目标**: 确认 ThreadWindow React 前端已按 `apps/thread-window-web/thread-window-web.md` 的 GPT 风格布局实现，同时保留 DESIGN.md 配色。

**前提条件**:
- 已执行 `pnpm --filter handagent-thread-window-web build`
- 启动 desktop app：`bash ./scripts/swiftw run HandAgentDesktop`
- 提交一个 prompt，打开 ThreadWindow

**消息展示 (MessageBubble)**:
- [ ] assistant 消息完全透明无背景，文本直接铺在 `surface-dark` (#181715) 背景上
- [ ] user 消息右对齐，最大宽度约 85%，带圆角背景（warm cream 色 `surface-card` #efe9de）
- [ ] tool 消息左对齐，半透明深色背景，使用代码字体
- [ ] 操作按钮（复制/编辑/重新生成）hover 时显示（不hover时也占位，不要发生hover后下面的所有消息移位）

**内容区布局 (MessageList)**:
- [ ] 消息区域水平居中，最大宽度 720pt
- [ ] 消息间距统一（12px / gap-sm）

**输入栏 (Composer)**:
- [ ] pill 形大圆角容器（24pt / rounded-3xl）
- [ ] 边框 `border-white/10`，聚焦时变为 `border-white/20`
- [ ] 输入栏与消息区同宽（720pt），水平居中
- [ ] 右侧内嵌按钮：附件按钮（占位 disabled）+ 发送/停止按钮
- [ ] 空闲时显示发送按钮（箭头向上图标），运行时显示停止按钮（方形图标）

**Tab 栏 (TabBar)**:
- [ ] 浏览器风格 tab：活跃 tab 与内容区背景融合（`bg-surface-dark` #181715）
- [ ] 非活跃 tab 视觉下沉（`bg-surface-dark-soft` #1f1e1b）
- [ ] tab 顶部圆角（8px / rounded-t-lg）
- [ ] 关闭按钮 hover 时显示（group-hover:opacity-100）
- [ ] 去除状态点，只保留标题

**运行状态指示器 (TypingIndicator)**:
- [ ] 提交一个需要 LLM 响应的 prompt
- [ ] 运行中时，最后一条 assistant 消息底部显示三个跳动的点
- [ ] 点的动画错峰延迟（0ms / 150ms / 300ms）
- [ ] 运行完成后打字指示器消失

**配色验证（保留 DESIGN.md）**:
- [ ] 主背景使用 `#181715` (surface-dark)，不是 spec 中的 `#212121`
- [ ] 侧边栏使用 `#efe9de` (surface-card, warm cream)，不是 spec 中的 `#2F2F2F`
- [ ] user 消息背景使用 `#efe9de` (surface-card, warm cream)，不是 spec 中的 `#3A3A3A`
- [ ] 主按钮使用 `#cc785c` (primary, coral)

#### 场景 8: 消息操作按钮验证（GPT 风格）

1. 确认 assistant 和 tool 消息的操作按钮默认不显示
2. hover assistant 消息，确认操作按钮显示
3. 确认 hover后 tool下面不显示操作按钮
4. 点击"复制"按钮，确认消息内容复制到剪贴板
5. 确认"编辑"和"重新生成"按钮显示但禁用，hover 时显示 tooltip "即将推出"
6. 确认操作按钮栏在深色 workspace 上使用低对比度 cream 文本，不干扰阅读

#### 场景 9: Composer 自动增高输入框验证（GPT 风格）

1. 在输入框输入单行文本，确认高度为最小值（52px）
2. 按 Shift+Return 插入换行，继续输入到第 2、3、4、5 行
3. 确认输入框随内容自动增高，最大 5 行（120px）
4. 继续输入第 6 行，确认输入框停止增高，出现垂直滚动条
5. 按 Return（无修饰键）确认提交消息，输入框清空并恢复最小高度
6. 确认输入栏保持 pill 形，居中，最大宽度 720pt

#### 场景 10: 视觉一致性验证

1. 确认 ThreadWindow 整体不再是 dark-only Raycast Glass 风格，而是 cream sidebar + dark product workspace 的双 surface 节奏。
2. 确认顶部工具栏不再显示 connection pill（已移除），TabBar 不显示状态点；running / failed / interrupted / idle 不要求通过 tab 状态点区分，应由消息流、发送/停止按钮、错误提示或状态气泡表达。
3. 确认历史项的 hover / focus / active 视觉边界与点击边界一致：点击 row 空白区域会打开 thread，点击删除图标只触发删除确认。
4. 触发 permission  请求，确认请求面板是 


### 场景 0：并发 thread 工具激活隔离

1. 使用真实 LLM 模式启动桌面 App，打开两个不同 thread。
1. 在 thread A 中提交需要工具的 prompt（例如"看一下我屏幕"），等待出现 `use_tools` 或真实工具调用。
1. 在 thread B 中提交普通聊天 prompt，确认 thread B 不出现 thread A 的真实工具列表或 tool call 气泡。
1. 继续回到 thread A 发送需要工具的第二轮 prompt，确认 thread A 仍可继续使用真实工具，不会退回只暴露 `use_tools`。
1. 打开 `~/.spotAgent/log/<YYYY-MM-DD>/network-NNN.jsonl`，对比两条 thread 的请求体：thread A 激活后应包含完整工具集，thread B 未激活时仍只包含 `use_tools`。

### 场景 1：纯聊天问题不触发工具激活

1. 新建 thread，输入一个不需要工具的普通问题（例如"今天天气怎么样"或"帮我写一首诗"）。
1. 确认模型直接回复，ThreadWindow 中不出现任何 tool call 气泡。
1. 打开 `~/.spotAgent/log/<YYYY-MM-DD>/network-NNN.jsonl`，找到本次请求对应的条目，确认请求体中 `tools` 数组只包含一个名为 `use_tools` 的 tool，不含任何 builtin tool。

### 场景 2：需要工具的 prompt 触发激活并完成调用

1. 新建 thread，输入"看一下我屏幕"或类似需要读取屏幕的 prompt。
1. 确认模型先调用 `use_tools`（ThreadWindow 中出现对应 tool call 气泡），随后调用真实工具（如 `screen.capture`）。
1. 确认 ThreadWindow 中 tool messages 完整出现：`use_tools` 的结果与真实工具的结果均可见。
1. 确认最终 assistant 回复包含对屏幕内容的描述。

### 场景 3：同一 thread 激活后不再重复出现 use_tools

1. 接场景 2，在同一 thread 中再次输入"再读一次桌面前台"或类似 prompt。
1. 确认 ThreadWindow 中本轮不再出现 `use_tools` tool call 气泡，模型直接调用真实工具。
1. 打开 `~/.spotAgent/log/` 中本轮对应的网络日志条目，确认请求体 `tools` 数组已包含完整工具集，不再只有 `use_tools`。

### 场景 4：agent-server 重启后激活状态可恢复

1. 完成场景 2（触发过工具激活的 thread），记录该 thread id。
1. 在终端 kill agent-server 进程，再重新启动（或重启桌面 App）。
1. 在 ThreadWindow 中打开同一 thread，发送新的 user message（例如"再截一次屏"）。
1. 打开 `~/.spotAgent/log/` 中本轮对应的网络日志条目，确认请求体 `tools` 数组直接是完整工具集，不出现新的 `use_tools` 调用（验证 agent-server 通过历史 tool message 正确推断了激活状态）。

### 对于每个可交互的点，都验证一遍，看是否符合预期，这里不当做硬性bug，而是记录下可能不符合的行为，事无巨细

- 本文件中对应条目的用户可见行为、持久化记录、错误文案和隔离边界均符合预期。
- 所有错误路径均有明确文案，不出现静默失败。
- 每个通过的条目都已从本文件删除，并在 [archive.md](./archive.md) 保留完整验证记录。
