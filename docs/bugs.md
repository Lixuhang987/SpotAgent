# Bug 清单

本文记录当前已知但尚未修复的 bug。功能待办继续放在 [TODO.md](/Users/mu9/proj/handAgent/docs/TODO.md)

最后核对日期：2026-06-08。

## 修 bug 约束

- 修复跨 View / ViewModel / Coordinator / Service / 进程边界 / 系统 API 的 bug 时，必须遵循 [$trace-and-verify-call-chain](/Users/mu9/.agents/skills/trace-and-verify-call-chain/SKILL.md)。
- 修复完成后从当前文档中删除，并写入manual-qa文档中

##  测试备注

### mock-llm 不能证明真实 vision；真实 provider token streaming 已单独验证

- 2026-05-19 本轮实机 QA 使用 `bash ./scripts/package-app.sh --mock-llm` 打包启动。
- 图片附件链路可验证到 Quick Look、ThreadWindow 摘要、blob stub 持久化；早期 QA 记录中的 `SessionWindow` 是历史旧称。但 `[mock:image-summary]` 只返回固定文本，不能证明真实 LLM 基于图片内容描述。
- 2026-05-20 已补充 `MockLLMClient.stream()`；`[mock:assistant-ok]` 可验证 mock 模式下 agent-server 到 desktop 的多段 `assistant_message_delta` 渲染链路。
- mock delta 是本地确定性分片，不能证明真实 provider 的网络 streaming 或 token 到达节奏；该项已在 2026-05-21 使用非 mock App 与真实 `text/event-stream` 响应完成单独验证。
- 2026-05-21 直接向 agent-server 发送 PNG 附件的真实 provider thread 已证明 image STUB 会展开为多模态请求，provider 可读出图片 token `VISION_PASS_20260521`。该条历史证据原始文件位于旧目录 `~/.spotAgent/sessions/session-1779350388296-2gmta1.json`；当前持久化目录为 `~/.spotAgent/threads/`。
- 2026-05-21 PromptPanel 区域截图 UI 重试已证明 image chip、session image STUB 与真实多模态 provider 请求链路会打通；用户同日手动确认重新授予当前打包 App 权限后，区域圈选路径可正常工作。
- 结论：真实 provider token streaming、真实 vision 底层请求与区域截图附件路径均已归档到 [archive.md](./archive.md)。后续同类问题应按当前实现重新复现，不沿用旧 `sessions/` 证据作为当前 bug 依据。

### `System Events click at` 不适合作为状态气泡点击的唯一证据

- 2026-05-20 状态气泡焦点回跳 QA 中，状态气泡窗口是 `.nonactivatingPanel`，Computer Use 的 accessibility tree 只暴露当前 key ThreadWindow。早期 QA 记录中的 `SessionWindow` 是历史旧称，当前不再作为术语使用。
- 使用 `System Events` 的 `click at {x, y}` 点击状态气泡坐标后，AX 主窗口 / 焦点窗口未稳定切换；改用 CoreGraphics `CGEvent` 发送鼠标 down/up 后，状态气泡点击可稳定触发焦点回跳。
- 结论：验证状态气泡这类 non-activating panel 的真实点击时，应以 Computer Use 前后 UI 状态 + AX 状态为观察证据，实际点击输入优先使用 CGEvent；不要把 `System Events click at` 的失败单独判为产品 bug。

---

## 当前 bug

### ThreadWindow workspace 分组未按字母顺序排列

- **严重级别**：P2
- **发现日期**：2026-06-09
- **复现步骤**：
  1. 使用 mock-llm packaged app 启动默认 WKWebView 路径。
  1. 打开 `http://127.0.0.1:4317/thread-window/index.html` 或 WKWebView ThreadWindow。
  1. 查看左侧历史边栏的 workspace 分组顺序。
- **实际结果**：左侧 workspace 分组按 `~/.spotAgent/workspaces.json` / `workspace.listed` 返回顺序显示为 `default -> tmp -> qa-workspace -> handagent-test`，不是按名称字母顺序排列；这与 `docs/manual-qa.md` 中 `ThreadWindow UI 重构完整验收 / 场景 4` 的验收目标冲突。
- **期望结果**：workspace 分组应按名称字母顺序稳定排列，且“默认对话”分组固定在最下方。
- **证据**：Playwright snapshot 显示分组标题顺序为 `default /Users/mu9/.spotAgent/workspace`、`tmp /Users/mu9/tmp`、`qa-workspace /Users/mu9/.spotAgent/qa-workspace`、`handagent-test /Users/mu9/Desktop/handagent-test`，随后才是 `默认对话`；`jq -r '.workspaces[] | .name' ~/.spotAgent/workspaces.json` 输出同样顺序。源码 `apps/thread-window-web/src/utils/groupThreads.ts` 中 `groupThreadsByWorkspace()` 直接 `workspaces.map(...)` 渲染分组，没有排序；`apps/agent-server/src/thread/ThreadCommandRouter.ts` 也按 registry list 原序发出 `workspace.listed`。
- **初步调用链 / 根因边界**：失败边界位于 React ThreadWindow 历史分组构造层：`workspace.listed -> threadWindowStore.workspaces -> groupThreadsByWorkspace -> HistorySidebar render`。当前证据显示 UI 未对 workspace group 排序；具体应在前端分组函数排序还是后端 `workspace.listed` 排序，需要按 `$trace-and-verify-call-chain` 结合测试覆盖确认。

### Electron flag 路径下 Swift 启动 Electron 后未拉起 agent-server

- **严重级别**：P1
- **发现日期**：2026-06-09
- **复现步骤**：
  1. 执行 `pnpm --filter handagent-electron-shell build`，确认 Electron shell 构建通过。
  1. 确认 `dist/HandAgentDesktop.app/Contents/Resources/ElectronShell/dist/main/main.js` 存在。
  1. 设置 `HANDAGENT_ELECTRON_SHELL=1` 和 `HANDAGENT_ELECTRON_BINARY=/Users/mu9/proj/handAgent/node_modules/.pnpm/electron@42.3.3/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`，运行 `dist/HandAgentDesktop.app/Contents/MacOS/HandAgentDesktop`。
- **实际结果**：只出现 Swift `HandAgentDesktop` 进程和 Electron main 进程，没有 `apps/agent-server/src/server/server.ts` 子进程，`lsof -nP -iTCP:4317 -sTCP:LISTEN` 无监听；Computer Use 读取 `HandAgentDesktop` 状态超时，Electron UI Shell 最终态验收无法进入 PromptPanel / ThreadWindow / ActivityWindow 链路。
- **期望结果**：Electron main 应上报 `electron.ready`、记录 agent-server supervisor description，并拉起唯一 agent-server，使 `127.0.0.1:4317` 可用；随后 hidden ThreadWindow 预热并展示 Electron ActivityWindow。
- **证据**：Swift flag 启动后 `ps -axo pid,ppid,stat,command` 仅显示 `dist/HandAgentDesktop.app/Contents/MacOS/HandAgentDesktop` 与 `.../Electron.app/Contents/MacOS/Electron .../ElectronShell/dist/main/main.js`；同一时刻 `lsof -nP -iTCP:4317 -sTCP:LISTEN` 为空。直接运行同一个 Electron binary 和同一个 `main.js` 可输出 `{"channel":"electron_shell","type":"electron.ready",...}` 以及 `[electron-shell] agent-server supervisor: {"mode":"node_child","entry":"apps/agent-server/src/server/server.ts","coreRuntimeHost":"agent-server","utilityProcessBlocker":"apps/agent-server/dist/server/server.js 不存在；当前 agent-server 仍依赖 TypeScript 源码入口和 Node --experimental-transform-types"}`，说明 packaged Electron main 产物本身存在且能进入 supervisor 初始化。
- **初步调用链 / 根因边界**：失败边界位于 Swift Electron flag 启动路径到 Electron main supervisor 可观测事件之间。当前证据尚未证明是 Swift `ElectronBackedAppServer` stdio bridge 未读取/阻塞、Electron 子进程环境差异、Electron main 早期等待 stdin/事件循环，还是 Electron 启动参数处理差异；需要按 `$trace-and-verify-call-chain` 逐跳验证 `Swift launch -> Electron process -> electron.ready stdout -> Swift bridge receive -> supervisor start -> agent-server listen`。

### `AI SDK stream finished without assistant content or tool calls`

- **严重级别**：P1
- **发现日期**：2026-05-24
- **复现步骤**：
  1. 以真实 LLM 模式启动 `HandAgentDesktop`。
  1. 提交 `Please inspect my current screen with tools and summarize what you see. HANDAGENT_LAZY_TOOL_QA_20260524`。
  1. 在 `screen.capture` / `accessibility.snapshot` 授权弹窗中先经历一次拒绝，再点 `始终允许` 重试 `HANDAGENT_LAZY_TOOL_QA_20260524_RETRY`。
- **实际结果**：ThreadWindow 先显示 `use_tools`、`window.list`、`screen.capture` 等工具结果，但最终出现红色警告 `AI SDK stream finished without assistant content or tool calls.`，没有产出最终 assistant 总结。
- **期望结果**：工具执行完成后，流应正常收尾并输出 assistant 总结，thread 里应有可见 assistant 内容而不是空流错误。
- **证据**：这条 2026-05-24 历史证据原始文件位于旧目录 `~/.spotAgent/sessions/session-1779601103378-sa0wyo.json`，当前同类证据应查看 `~/.spotAgent/threads/<threadId>.json`。该历史记录包含初始 `use_tools`、`app.frontmost`、`screen.capture`、`accessibility.snapshot` 以及 `error` 事件 `AI SDK stream finished without assistant content or tool calls.`；`~/.spotAgent/log/2026-05-24/network-001.jsonl` 可见对应 `screen.capture` / `accessibility.snapshot` 请求与返回。UI 中也直接显示同名告警。进一步复查同一网络日志可见，第二轮 retry 后模型再次调用 `use_tools`，runtime 回灌 `Tools are already active.`，随后对 provider 的下一次 `responses` 请求返回 HTTP 200 streaming，但没有 assistant 文本或 tool call。
- **初步调用链 / 根因边界**：`ThreadScopedToolRegistry.refreshActivated()` 激活后仍把 `use_tools` 暴露给 provider，允许模型在已激活 thread 中重复调用 no-op meta-tool；这与 `docs/manual-qa.md` 场景 3 “同一 thread 激活后不再重复出现 use_tools，模型直接调用真实工具”的验收目标冲突。失败边界位于 thread-scoped tool registry 的激活后工具表，而不是 desktop 渲染、权限回灌或持久化层。
