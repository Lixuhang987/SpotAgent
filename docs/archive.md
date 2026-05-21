# 已验证归档

本文记录经过实机 QA 验证通过的功能。每项保留验证日期、验证环境、验证过程与证据。

新条目从 [待验收.md](./待验收.md) 或 [manual-qa.md](./manual-qa.md) 验证通过后移入此处。

最后更新日期：2026-05-21。

---

## 主链路基础（2026-05-19 实机验证）

- **验证日期**：2026-05-19
- **验证环境**：real LLM / macOS / worktree `codex/real-launch-qa-report`
- **验证过程**：
  1. 原生全局热键（⌘⇧Space via `System Events` key code 49）可唤出 PromptPanel。
  2. PromptPanel 文本框自动聚焦。
  3. TextField Return 可提交 prompt。
  4. 提交后 PromptPanel 关闭并创建 SessionWindow（760x560）。
  5. 用户消息写入 `~/.spotAgent/sessions/<session-id>.json`。
  6. agent-server 错误（Gateway Timeout）最终可在 SessionWindow 中以 `failed` 状态 + 错误文案显示。
- **证据**：
  - 窗口数从 1（status bubble 280x62）变为 2（新增 PromptPanel 640x448），提交后变为 2（status bubble + SessionWindow 760x560）。
  - Session 文件 `~/.spotAgent/sessions/B843D86F-9F97-4002-8F38-AAE39A861B5F.json` 包含 user message 和 error event。
- **结论**：通过。主链路从热键唤起到会话创建到错误展示均可用。

## Mock LLM 主链路基础（2026-05-19 实机验证）

- **验证日期**：2026-05-19
- **验证环境**：mock-llm / macOS / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 执行基线命令：`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`，均通过。
  2. 执行 `bash ./scripts/package-app.sh --mock-llm` 后启动 `dist/HandAgentDesktop.app`。
  3. 初始状态只有状态气泡窗口，窗口尺寸为 `280x62`，气泡文案为 `Idle 点击开始`。
  4. 通过原生事件 `System Events` 发送 `key code 49 using {command down, shift down}`，PromptPanel 弹出，窗口尺寸为 `640x448`，输入框自动聚焦。
  5. 输入 `[mock:assistant-ok] QA 主链路验证` 并通过 Return 提交，PromptPanel 关闭并创建 SessionWindow，窗口尺寸为 `760x560`。
  6. SessionWindow 显示用户消息与 `Mock assistant response: main chain is reachable.`。
- **证据**：
  - `lsof -nP -iTCP:4317 -sTCP:LISTEN` 显示 `node` 监听 `*:4317`。
  - `ps -o pid,ppid,command -p <node-pid>` 显示 agent-server 命令为 `/Users/mu9/proj/handAgent/apps/agent-server/src/server.ts`。
  - Session 文件：`~/.spotAgent/sessions/7DEAFB2B-BB2C-46AF-8B3E-8150A417DF96.json`，包含 user message 与 mock assistant message。
- **结论**：通过。mock LLM 环境可稳定验证热键唤起、输入聚焦、提交、新建会话窗口和 assistant 回复展示。

## PromptPanel 文本选区附件（2026-05-19 实机验证）

- **验证日期**：2026-05-19
- **验证环境**：mock-llm / macOS / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. Settings → 快捷键页确认 `captureSelection` 当前为 `⇧⌘2`。
  2. 在 TextEdit 中选中 `HANDAGENT_QA_SELECTED_TEXT_20260519`，发送 `key code 19 using {command down, shift down}`。
  3. PromptPanel 弹出并显示 textSelection chip；点击 chip 的关闭按钮后 chip 可移除。
  4. 重新触发 `captureSelection` 后提交 `[mock:assistant-ok] QA 文本附件提交`。
  5. SessionWindow 用户气泡显示 `附件 ×1 · text_selection`，并展示选区内容。
  6. 在 TextEdit 仅保留光标、不选中文本时再次触发 `captureSelection`，PromptPanel 弹出但无 chip。
- **证据**：
  - SessionWindow 可见文本：`附件 ×1 · text_selection`、`HANDAGENT_QA_SELECTED_TEXT_20260519`。
  - Session 文件：`~/.spotAgent/sessions/95D4FDEC-3A59-4156-84BA-69A8D74926EC.json`，user content 包含 `[选区]` 与选区文本。
- **结论**：通过。文本选区采集、空选区、chip 移除、提交后用户气泡摘要和持久化链路均可用。

## PromptPanel 区域截图附件（2026-05-19 实机验证）

- **验证日期**：2026-05-19
- **验证环境**：mock-llm / macOS / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. Settings → 快捷键页确认 `captureRegion` 当前为 `⇧⌘1`。
  2. 发送 `key code 18 using {command down, shift down}` 后，系统启动 `/usr/sbin/screencapture -i -x ...`。
  3. 用 CGEvent 注入鼠标拖拽完成矩形选择，PromptPanel 弹出并显示 `区域截图` image chip。
  4. 点击 image chip，Quick Look 打开截图预览；关闭 Quick Look 后提交 `[mock:image-summary] QA 图片附件提交`。
  5. SessionWindow 用户气泡显示 `附件 ×1 · image` 和 `image/png`。
  6. 再次触发 `captureRegion` 后按 ESC 取消，HandAgentDesktop 窗口数量不增加。
- **证据**：
  - `pgrep -fl screencapture` 曾显示 `/usr/sbin/screencapture -i -x /var/folders/.../handagent-region-....png`。
  - Quick Look 窗口标题为 `区域截图`，可见截图预览。
  - Session 文件：`~/.spotAgent/sessions/179F2D7B-B509-42EB-B056-C51ECCB298B1.json`，user content 中图片为 `[STUB id=blob-8b127e30-a551-4969-ae85-9f80c567de32 kind=image ...]`。
  - Blob 文件：`~/.spotAgent/blobs/2026-05-19/8b127e30-a551-4969-ae85-9f80c567de32.png`。
- **结论**：通过。区域截图入口、Quick Look 预览、取消路径、图片附件摘要和 blob 持久化均可用。真实 vision 描述能力仍需 real LLM 环境单独验证。

## Workspace 设置与文件 Tool 基础链路（2026-05-19 实机验证）

- **验证日期**：2026-05-19
- **验证环境**：mock-llm / macOS / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. Settings → 工作区页通过原生目录选择器新增 `~/Desktop/handagent-test`，列表立即出现 `handagent-test`。
  2. 编辑该 workspace 的 description 为 `测试工作区` 并保存，UI 立即显示更新后的描述。
  3. 提交 `[mock:workspace-list] QA workspace.list`，授权气泡出现后选择「仅本次」，runtime 执行 `workspace.list`。
  4. 提交 `[mock:file-write] QA 写 hello.txt`，授权 `file.write` 后写入 `~/.spotAgent/qa-workspace/hello.txt`。
  5. 提交 `[mock:file-read] QA 读取 hello.txt`，授权 `file.read` 后 tool 返回读取结果。
  6. 提交 `[mock:path-escape] QA 越狱写入拦截`，授权后 tool 返回 `Path escapes workspace root: ../../etc/passwd`，未创建外部文件。
- **证据**：
  - `~/.spotAgent/workspaces.json` 包含 `handagent-test`，`rootPath` 为 `/Users/mu9/Desktop/handagent-test`，`description` 为 `测试工作区`。
  - `~/.spotAgent/qa-workspace/hello.txt` 内容为 `hello from MockLLMClient`。
  - Session 文件：
    - `~/.spotAgent/sessions/FC95D6F1-415C-41A8-89A8-FAB137DBDEDA.json`：`workspace.list` tool_result 包含 `default`、`tmp`、`qa-workspace`、`handagent-test`。
    - `~/.spotAgent/sessions/9F4D9D4C-9115-4C77-9361-1023B8B5AA3E.json`：`file.write` tool_result 为 `bytesWritten: 24`。
    - `~/.spotAgent/sessions/A2F9E136-2F60-4001-BAD6-700DB001A7CF.json`：`file.read` 链路完成。
    - `~/.spotAgent/sessions/AC07B7E0-9852-48A0-B38D-DC8016DE3352.json`：越狱路径 tool_result status 为 `error`。
- **结论**：通过。Workspace 管理 UI、workspace.list、file.write、file.read 和相对路径越狱拦截可用。`workspace.list → file.write` 由 mock 场景分步验证，真实 LLM 自主串联仍需 real LLM 再测。

## 权限审批「仅本次」路径（2026-05-19 实机验证）

- **验证日期**：2026-05-19
- **验证环境**：mock-llm / macOS / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. QA 前备份 `~/.spotAgent/settings.json`、`permissions.json`、`workspaces.json` 到 `~/.spotAgent/qa-backup-20260519/`。
  2. 临时清理会影响本轮判断的 `file.write`、`file.read`、`workspace.list`、`screen.capture`、`clipboard.read` 旧权限规则。
  3. 触发 `workspace.list`、`file.write`、`file.read`、越狱 `file.write` 四类 tool 调用，SessionWindow 均出现内联授权气泡。
  4. 选择「仅本次」后，本轮 tool 调用继续执行，session event 写入 `permission_request`。
- **证据**：
  - 授权气泡文案包含 `授权调用 workspace.list`、`授权调用 file.write`、`授权调用 file.read`。
  - Session 文件 `9F4D9D4C-9115-4C77-9361-1023B8B5AA3E.json`、`FC95D6F1-415C-41A8-89A8-FAB137DBDEDA.json`、`AC07B7E0-9852-48A0-B38D-DC8016DE3352.json` 均包含 `permission_request` event，`action` 为 `allow`。
- **结论**：通过。首次询问与「仅本次」允许路径可用。`本会话`、`始终允许`、拒绝、超时、关闭窗口取消挂起请求仍需继续验证。

## 权限审批记忆、拒绝、超时与撤销（2026-05-19 实机验证）

- **验证日期**：2026-05-19
- **验证环境**：mock-llm / macOS / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 重启 mock app 清理窗口状态，确认启动后只有状态气泡窗口，agent-server 重新监听 `*:4317`。
  2. 提交 `[mock:permission-write] QA 本会话允许 1`，在授权气泡选择「本会话」，`file.write` 执行成功。
  3. 在同一个 SessionWindow 继续提交 `[mock:permission-write] QA 本会话允许 2`，未再次出现授权气泡，`file.write` 自动执行成功。
  4. 新建会话提交 `[mock:permission-write] QA 新会话重新询问并拒绝`，授权气泡重新出现；点击「拒绝」后 UI 显示 `file.write: 用户拒绝执行该 tool`，会话继续完成。
  5. 对 `[mock:permission-write] QA 始终允许快速点击` 保持沉默超过 60 秒，session event 记录 `action: deny`。
  6. 新建会话提交 `[mock:permission-write] QA 始终允许并撤销`，点击「始终允许」，`~/.spotAgent/permissions.json` 写入 `file.write` 的永久 allow 规则和 arguments 摘要。
  7. 打开 Settings → 权限，确认 `file.write` 规则展示 `content`、`relativePath`、`workspaceId` 摘要；点击「撤销」后 UI 移除该规则，`permissions.json` 中也只剩旧的 `app.frontmost` 与 `window.list` 规则。
- **证据**：
  - Session 文件 `~/.spotAgent/sessions/38FBC4E0-FCE6-4611-AC37-E99E50CA0D8B.json`：第一次 `file.write` 有 `permission_request`，第二次同 session 只有 `tool_call/tool_result`，没有第二条 `permission_request`。
  - Session 文件 `~/.spotAgent/sessions/F564E045-01CD-4D20-BAC6-A89B6822A06E.json`：拒绝后 tool message 为 `用户拒绝执行该 tool`，event 中 `action: deny`、`granted: false`。
  - Session 文件 `~/.spotAgent/sessions/8BC789C5-C704-4A00-B9C2-1FC9365D2389.json`：创建时间与 `permission_request` 时间相差约 60 秒，event 中 `action: deny`、`granted: false`，证明超时按 deny 处理。
  - Session 文件 `~/.spotAgent/sessions/8DB9EC61-3486-4AA1-9FDE-07A31AC08319.json`：点击「始终允许」后 `file.write` 执行成功。
  - `~/.spotAgent/permissions.json`：撤销后不再包含 `file.write` 规则。
- **结论**：通过。权限审批的「本会话」、跨新会话重新询问、拒绝、超时 deny、「始终允许」持久化、Settings 权限页展示与撤销均可用。关闭 SessionWindow 时取消挂起请求仍需单独验证。

## Tool 设置热加载（2026-05-19 实机验证）

- **验证日期**：2026-05-19
- **验证环境**：mock-llm / macOS / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 打开 Settings → Tools，滚动到 `file.write`，点击开关禁用。
  2. 确认 `~/.spotAgent/settings.json` 写入 `tools.denylist: ["file.write"]`。
  3. 不重启 App，提交 `[mock:file-write] QA tool disabled`，SessionWindow 状态变为 `failed`，可见错误为 `Unknown tool: file.write`。
  4. 回到 Settings → Tools，重新启用 `file.write`，确认 `tools.denylist` 变回空数组。
  5. 不重启 App，提交 `[mock:file-write] QA tool enabled again`，授权后 `file.write` 执行成功并写入 `hello.txt`。
- **证据**：
  - Session 文件 `~/.spotAgent/sessions/C00946D6-B9C9-49C5-9D35-701525888062.json`：events 中记录 `Unknown tool: file.write`。
  - Session 文件 `~/.spotAgent/sessions/87A181B1-DA13-4CAA-AD2E-03605D0ED39F.json`：`file.write` 有 `tool_call` 与 success `tool_result`，输出 `bytesWritten: 24`。
  - `~/.spotAgent/settings.json` 最终状态为 `tools.denylist: []`。
- **结论**：通过。工具开关写入设置文件后，agent-server 可在下一轮 LLM 请求前热加载 registry，无需重启 App。

## 会话历史入口与删除确认（2026-05-19 实机验证）

- **验证日期**：2026-05-19
- **验证环境**：mock-llm / macOS / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 生成临时会话 `[mock:assistant-ok] QA_HISTORY_DELETE_TARGET_20260519`，确认 `~/.spotAgent/sessions/81E29F64-2AE1-422F-8661-7E4D5FEA3745.json` 存在。
  2. PromptPanel 输入 `QA_HISTORY_DELETE`，最近会话 action 只过滤出目标会话；输入 `87A181B1` 时也能按 sessionId 过滤出对应会话。
  3. 点击最近会话 action 恢复目标 session；再次从 PromptPanel 恢复同一 session 时只聚焦已有窗口，窗口数量没有增加。
  4. 点击 PromptPanel 的「会话历史」action，独立历史窗口打开；搜索 `QA_HISTORY_DELETE` 后左侧只剩目标会话，右侧预览同步显示 user 与 assistant 消息。
  5. 在独立历史窗口点击「恢复」可聚焦目标 SessionWindow。
  6. 在独立历史窗口对目标会话右键删除，先弹出 `删除会话？` 二次确认；点击「取消」后文件仍存在，再次删除并确认后文件被移除，列表刷新为空。
  7. 生成临时会话 `[mock:assistant-ok] QA_SIDEBAR_DELETE_TARGET_20260519`，在 SessionWindow 左侧历史侧栏右键删除，确认弹出二次确认；点击「删除」后 `~/.spotAgent/sessions/6AEA0A2A-D794-43F1-9F61-0CEAF37D0E66.json` 被移除，侧栏列表同步删除该项。
- **证据**：
  - PromptPanel action：`最近会话：[mock:assistant-ok] QA_HISTORY_DELETE_TARGET_20...` 可按 keyword 过滤出现；`87A181B1` 可按 sessionId 过滤出现对应会话。
  - 独立历史窗口搜索后只显示 `81E29F64-2AE1-422F-8661-7E4D5FEA3745`，右侧预览显示 `Mock assistant response: main chain is reachable.`。
  - 删除取消后：`test -f ~/.spotAgent/sessions/81E29F64-2AE1-422F-8661-7E4D5FEA3745.json` 仍为真。
  - 删除确认后：`test ! -f ~/.spotAgent/sessions/81E29F64-2AE1-422F-8661-7E4D5FEA3745.json` 为真。
  - 侧栏删除确认后：`test ! -f ~/.spotAgent/sessions/6AEA0A2A-D794-43F1-9F61-0CEAF37D0E66.json` 为真。
- **结论**：通过。PromptPanel 最近会话 action、独立历史窗口搜索 / 预览 / 恢复 / 删除确认、同一 sessionId 恢复聚焦、SessionWindow 左侧历史侧栏删除确认均可用。

## agent-server 崩溃恢复（2026-05-20 实机验证）

- **验证日期**：2026-05-20
- **验证环境**：mock-llm / macOS / worktree `codex/manual-qa-live-qa` / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 在 worktree 中执行 `pnpm install`、`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`，均通过；其中 vitest 为 30 个测试文件、164 个测试通过。
  2. 执行 `bash ./scripts/package-app.sh --mock-llm` 并启动 `dist/HandAgentDesktop.app`。
  3. 初始状态只有状态气泡窗口，尺寸为 `280x62`；agent-server 子进程监听 `*:4317`，命令路径为 `/Users/mu9/proj/handAgent/.worktrees/manual-qa-live-qa/apps/agent-server/src/server.ts`。
  4. 通过原生事件 `System Events` 发送 `key code 49 using {command down, shift down}` 唤出 PromptPanel，输入 `[mock:assistant-ok] QA agent-server crash recovery baseline` 并提交，创建 SessionWindow（`760x560`）并显示 mock assistant 回复。
  5. 对 agent-server 子进程 `98572` 执行 `kill -9`；桌面 App 保持运行，SessionWindow 保持打开，随后自动启动新的 agent-server 子进程 `10894` 并重新监听 `*:4317`。
  6. 在同一个 SessionWindow 中提交 `[mock:assistant-ok] QA post-crash reconnect follow-up`，同一个 session 文件追加到 4 条消息，证明重启后现有窗口可继续使用原 session。
  7. 继续连续杀死 agent-server 子进程，观察到约 `3s / 5s / 9s / 17s` 的递增重启间隔；第 6 次 kill 后不再出现 `*:4317` listener，并弹出 `Agent Server 已停止` fatal alert，包含 `查看日志` 与 `确定` 按钮。
  8. 点击 `查看日志` 后 alert 关闭，回到 SessionWindow；窗口显示 `reconnecting`、`连接已断开，正在自动重连…` 和 `Could not connect to the server.`，符合达到重启上限后的可见失败状态。
- **证据**：
  - 初始 agent-server：`ps -o pid,ppid,command -p 98572` 显示 PPID 为 `98570`，命令路径为 worktree 下的 `apps/agent-server/src/server.ts`。
  - 重启后 agent-server：`ps -o pid,ppid,command -p 10894` 显示 PPID 仍为 `98570`，命令路径仍为 worktree 下的 `apps/agent-server/src/server.ts`。
  - 窗口状态：重启前后 `System Events` 返回窗口尺寸 `280, 62, 760, 560`，对应 status bubble 与 SessionWindow。
  - Session 文件：`~/.spotAgent/sessions/2C996710-C1E8-447D-9FA0-6CF5CA15692E.json`，`messageCount: 4`，包含 crash 前 prompt 和 post-crash follow-up 两组 user / assistant 消息。
  - 连续崩溃输出：`kill-2 pid=10894 at 17:19:49`、`restarted-2 pid=20586 at 17:19:52`、`restarted-3 pid=20622 at 17:19:57`、`restarted-4 pid=20705 at 17:20:06`、`restarted-5 pid=21357 at 17:20:23`、`kill-6 pid=21357 at 17:20:23`、`final-listener=`。
  - fatal alert 可见文案：`Agent Server 已停止 agent-server 多次崩溃（退出码 9）已停止重启。可在「检查日志」中排查。`
- **结论**：通过。agent-server 单次崩溃后可自动重启；现有 SessionWindow 可在重启后继续提交并追加同一 session；连续崩溃超过上限后停止重启并给出可见 fatal alert。

## 状态气泡失败状态同步（2026-05-20 实机验证）

- **验证日期**：2026-05-20
- **验证环境**：mock-llm / macOS / worktree `codex/manual-qa-status-bubble-failure` / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 在 worktree 中执行 `pnpm install`、`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`，均通过；其中 vitest 为 32 个测试文件、181 个测试通过。
  2. 执行 `bash ./scripts/package-app.sh --mock-llm` 并启动 `dist/HandAgentDesktop.app`，确认初始状态只有状态气泡窗口，尺寸为 `280x62`，Computer Use 可见文案为 `Idle 点击开始`。
  3. 通过原生事件 `System Events` 发送 `key code 49 using {command down, shift down}` 唤出 PromptPanel，窗口尺寸变为 `640x448` 与 `280x62`，输入框自动聚焦。
  4. 输入 `[mock:llm-error] QA status bubble failure sync` 并通过 Return 提交，创建 SessionWindow（`760x560`），窗口状态显示 `failed`，错误文案为 `MockLLMClient forced failure for QA.`。
  5. 失败后状态气泡窗口仍为 `280x62`，局部截图显示标题从 `Running` 回到 `Idle`，摘要显示 `MockLLMClient forced failure for QA.`，没有停留在原始 prompt。
  6. 关闭 SessionWindow 后只保留状态气泡，Computer Use 读取到 `Idle 点击开始`，证明失败会话已退出 running 聚合状态。
- **证据**：
  - agent-server：`ps -o pid,ppid,command -p 68895` 显示命令路径为 `/Users/mu9/proj/handAgent/.worktrees/manual-qa-status-bubble-failure/apps/agent-server/src/server.ts`。
  - 窗口状态：初始 `280, 62`；PromptPanel 唤起后 `640, 448, 280, 62`；失败后 `280, 62, 760, 560`。
  - SessionWindow 可见文本：`failed`、`[mock:llm-error] QA status bubble failure sync`、`MockLLMClient forced failure for QA.`。
  - Session 文件：`~/.spotAgent/sessions/A2433C65-E870-4E87-B82C-05058CC500C4.json`，包含 user message 与 `error` event，错误消息为 `MockLLMClient forced failure for QA.`。
  - 状态气泡截图：`/tmp/handagent-qa/status-bubble-failure.png`，可见 `Idle` 与 `MockLLMClient forced failure for QA.`。
- **结论**：通过。失败会话进入 `failed` 后，状态气泡可同步切回 `Idle`，并用失败文案替换原始 prompt 摘要。

## 缺少 apiKey 错误可见（2026-05-20 实机验证）

- **验证日期**：2026-05-20
- **验证环境**：real settings / macOS / worktree `codex/manual-qa-missing-apikey-error` / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 在 worktree 中执行 `pnpm install`、`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`，均通过；其中 vitest 为 32 个测试文件、181 个测试通过。
  2. 执行 `bash ./scripts/package-app.sh` 打包非 mock App，并确认 `dist/HandAgentDesktop.app/Contents/Resources/HandAgentRuntimeMode.json` 不存在。
  3. 将 `~/.spotAgent/settings.json` 备份到 `~/.spotAgent/settings.json.qa-missing-apikey-20260520024707.bak`，临时把 `llm.apiKey` 改为空字符串，保留原有 provider、model、api 与 baseUrl。
  4. 启动 App 后确认初始状态只有状态气泡窗口，尺寸为 `280x62`，Computer Use 可见文案为 `Idle 点击开始`；agent-server 子进程监听 `*:4317`。
  5. 通过原生事件 `System Events` 发送 `key code 49 using {command down, shift down}` 唤出 PromptPanel，窗口尺寸变为 `640x448` 与 `280x62`，输入框自动聚焦。
  6. 输入 `QA missing apiKey visible error` 并提交，创建 SessionWindow（`760x560`），窗口状态显示 `failed`，错误文案显示为 `Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。`。
  7. 取证后立即从备份恢复 `~/.spotAgent/settings.json`，确认 `llm.apiKey` 已恢复为非空，`tools.denylist` 仍为空数组。
- **证据**：
  - agent-server：`ps -o pid,ppid,command -p 80391` 显示命令路径为 `/Users/mu9/proj/handAgent/.worktrees/manual-qa-missing-apikey-error/apps/agent-server/src/server.ts`。
  - 窗口状态：初始 `280, 62`；PromptPanel 唤起后 `640, 448, 280, 62`；提交后 `280, 62, 760, 560`。
  - SessionWindow 可见文本：`failed`、`QA missing apiKey visible error`、`Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。`。
  - Session 文件：`~/.spotAgent/sessions/1DEAD87B-E546-4B95-BE43-922E5B6F9C5E.json`，包含 user message 与 `error` event，错误消息为 `Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。`。
  - 设置恢复检查：`~/.spotAgent/settings.json` 中 `apiKeyRestored: true`，`tools.denylist: []`；退出 App 后无 `HandAgentDesktop` 进程且无 `*:4317` listener。
- **结论**：通过。缺少 `apiKey` 时会话不会静默失败，SessionWindow 会进入 `failed` 并展示明确配置错误文案。

## showPromptPanel 不自动注入前台选区（2026-05-20 实机验证）

- **验证日期**：2026-05-20
- **验证环境**：mock-llm / macOS / worktree `codex/manual-qa-showprompt-selection-isolation` / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 在 worktree 中执行 `pnpm install`、`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`，均通过；其中 vitest 为 32 个测试文件、181 个测试通过。
  2. 执行 `bash ./scripts/package-app.sh --mock-llm` 并启动 `dist/HandAgentDesktop.app`，确认初始状态只有状态气泡窗口，尺寸为 `280x62`。
  3. 用 TextEdit 打开临时文件并全选唯一干扰文本 `HANDAGENT_SHOWPROMPT_SHOULD_NOT_CAPTURE_SELECTION_20260520`，通过 AX 确认前台 App 为 TextEdit，且 `AXSelectedText` 为该字符串。
  4. 通过原生事件 `System Events` 发送 `key code 49 using {command down, shift down}` 触发普通 `showPromptPanel`，窗口尺寸变为 `640x448` 与 `280x62`，输入框自动聚焦。
  5. Computer Use 观察 PromptPanel 只有输入框与 action 列表，没有 textSelection chip，也没有显示前台选区内容。
  6. 输入 `[mock:assistant-ok] QA showPromptPanel selection isolation` 并提交，创建 SessionWindow（`760x560`），窗口显示用户 prompt 与 `Mock assistant response: main chain is reachable.`。
  7. 退出 HandAgentDesktop 与 TextEdit，删除临时 TextEdit 文件，确认无 `HandAgentDesktop` 进程且无 `*:4317` listener。
- **证据**：
  - agent-server：`ps -o pid,ppid,command -p 89908` 显示命令路径为 `/Users/mu9/proj/handAgent/.worktrees/manual-qa-showprompt-selection-isolation/apps/agent-server/src/server.ts`。
  - TextEdit 选区：`AXSelectedText` 为 `HANDAGENT_SHOWPROMPT_SHOULD_NOT_CAPTURE_SELECTION_20260520`。
  - 窗口状态：初始 `280, 62`；PromptPanel 唤起后 `640, 448, 280, 62`；提交后 `280, 62, 760, 560`。
  - PromptPanel 可见状态：Computer Use 读取到聚焦输入框、设置按钮与 action 列表，没有 textSelection chip。
  - Session 文件：`~/.spotAgent/sessions/E97ACF99-34CE-4539-B94B-1723D692720F.json`，`messages` 仅包含用户 prompt 与 mock assistant 回复，`containsSelectionMarker: false`，`containsInterferenceText: false`。
- **结论**：通过。普通 `showPromptPanel` 不会把前台 App 的已选中文本作为初始上下文注入；只有用户主动触发 `captureSelection` 才会进入选区附件链路。

## 状态气泡焦点回跳（2026-05-20 实机验证）

- **验证日期**：2026-05-20
- **验证环境**：mock-llm / macOS / worktree `codex/manual-qa-status-bubble-focus` / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 在 worktree 中执行基线验证：`pnpm install`、`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`，均通过；其中 vitest 为 32 个测试文件、183 个测试通过。
  2. 执行 `bash ./scripts/package-app.sh --mock-llm` 并启动 `dist/HandAgentDesktop.app`，确认初始状态只有状态气泡窗口，尺寸为 `280x62`。
  3. agent-server 子进程监听 `*:4317`，`ps -o pid,ppid,command -p 6750` 显示命令路径为 `/Users/mu9/proj/handAgent/.worktrees/manual-qa-status-bubble-focus/apps/agent-server/src/server.ts`。
  4. 通过原生事件 `System Events` 发送 `key code 49 using {command down, shift down}` 唤出 PromptPanel，窗口尺寸变为 `640x448` 与 `280x62`，输入框自动聚焦。
  5. 输入 `[mock:assistant-ok] QA status bubble focus final fallback 20260520` 并提交，创建 `Session C08FD225`，Computer Use 可见窗口状态为 `idle`，显示 mock assistant 回复。
  6. 再次唤出 PromptPanel，输入 `[mock:slow-focus] QA status bubble focus final running 20260520` 并提交，创建 `Session 616C5A0E`，Computer Use 可见窗口状态为 `running`，右上角出现 Stop 控件。
  7. 将前台切回已完成的 `Session C08FD225`；状态气泡 AX 子树显示 `Running`，摘要为 `[mock:slow-focus] QA status bubble focus final running 20260520`。
  8. 用 CGEvent 对状态气泡可见区域发送真实鼠标点击后，AX 窗口顺序变为 `, Session 616C5A0E, Session C08FD225`，`AXMain/AXFocused` 对应 `Session 616C5A0E` 为 `true`，证明状态气泡优先回到当前 running session。
  9. 在 `Session 616C5A0E` 点击 Stop，窗口状态变为 `interrupted`，状态气泡切回 `Idle`，摘要仍指向最近活跃的 `Session 616C5A0E`。
  10. 将前台切到旧的 `Session C08FD225` 后再次 CGEvent 点击状态气泡，AX 窗口顺序再次变为 `, Session 616C5A0E, Session C08FD225`，`AXMain/AXFocused` 对应 `Session 616C5A0E` 为 `true`，证明没有 running session 时回到最近活跃窗口。
- **证据**：
  - agent-server：`ps -o pid,ppid,command -p 6750` 显示 PPID 为 `6741`，命令路径为当前 worktree 下的 `apps/agent-server/src/server.ts`。
  - 窗口状态：初始 `280, 62`；PromptPanel 唤起后 `640, 448, 280, 62`；两个会话打开后为 `280, 62, 760, 560, 760, 560`。
  - running 优先级：点击前前台为 `Session C08FD225`；状态气泡 AX 子树为 `Running` + `[mock:slow-focus] QA status bubble focus final running 20260520`；CGEvent 点击后 `Session 616C5A0E` 的 `AXMain/AXFocused` 为 `true`。
  - fallback：Stop 后 `Session 616C5A0E` 可见状态为 `interrupted`，状态气泡 AX 子树为 `Idle` + `[mock:slow-focus] QA status bubble focus final running 20260520`；从 `Session C08FD225` 点击气泡后 `Session 616C5A0E` 重新成为 `AXMain/AXFocused` 窗口。
  - Session 文件：
    - `~/.spotAgent/sessions/C08FD225-6046-4C77-8891-AA3BE3B3B92D.json` 包含 fallback prompt 与 `Mock assistant response: main chain is reachable.`。
    - `~/.spotAgent/sessions/616C5A0E-4340-4EB2-9B23-C770963D33F0.json` 包含 slow-focus prompt；Stop 后窗口状态进入 `interrupted`。
- **结论**：通过。状态气泡在存在 running session 时优先回到 running SessionWindow；没有 running session 时回到最近活跃的打开窗口。

## worktree 启动路径（2026-05-20 实机验证）

- **验证日期**：2026-05-20
- **验证环境**：mock-llm / macOS / worktree `manual-qa-status-bubble-focus` / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 在 worktree 中执行 `bash ./scripts/package-app.sh --mock-llm`。
  2. 使用 `open dist/HandAgentDesktop.app` 从 packaged App 启动桌面端。
  3. 确认 App 可见状态气泡，agent-server 正常监听 `*:4317`。
  4. 检查 agent-server 子进程命令路径，确认使用当前 worktree 下的源码。
- **证据**：
  - `lsof -nP -iTCP:4317 -sTCP:LISTEN` 显示 node pid `2398` 监听。
  - `ps -o pid,ppid,command -p 2398` 显示命令路径为 `/Users/mu9/proj/handAgent/.worktrees/manual-qa-status-bubble-focus/apps/agent-server/src/server.ts`。
  - 回归测试：`bash ./scripts/swiftw test --filter AgentServerRuntimeModeTests/testRepositoryRootLocatorFallsBackToBundleWhenCurrentDirectoryIsRoot` 通过。
- **结论**：通过。packaged App 从 `/` cwd 启动时，仓库根查找可有限终止并回退到 bundle 候选，agent-server 使用同一 worktree 下的源码路径。

## Tool completed UI 展示实际 result（2026-05-20 回归验证）

- **验证日期**：2026-05-20
- **验证环境**：Swift 单测 / 既有 mock-llm 实机证据
- **验证过程**：
  1. 复查既有 mock-llm 实机证据，确认 `workspace.list` 与越狱 `file.write` 的 session 持久化里已有真实 tool result。
  2. 增加并运行桌面端回归测试，覆盖同一 `messageID` 的 running tool message 被 completed / failed tool message 替换。
- **证据**：
  - `~/.spotAgent/sessions/FC95D6F1-415C-41A8-89A8-FAB137DBDEDA.json` 的 `workspace.list` `tool_result.output` 包含 workspace 列表。
  - `~/.spotAgent/sessions/AC07B7E0-9852-48A0-B38D-DC8016DE3352.json` 的 `file.write` `tool_result.output` 为 `Path escapes workspace root: ../../etc/passwd`。
  - 回归测试：`bash ./scripts/swiftw test --filter SessionViewModelTests/testTerminalToolMessageReplacesRunningArgumentsBubble` 通过。
- **结论**：通过。SessionWindow terminal tool 气泡会用真实 result 覆盖 running 阶段参数展示，不再停留在 `workspace.list: {}` 或 `file.write` 入参 JSON。

## 会话中断 / Stop（2026-05-20 实机验证）

- **验证日期**：2026-05-20
- **验证环境**：mock-llm / macOS / main branch / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 执行基线命令：`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`，均通过；其中 vitest 为 64 个测试文件、364 个测试通过。
  2. 执行 `bash ./scripts/package-app.sh --mock-llm` 并启动 `dist/HandAgentDesktop.app`，确认状态气泡窗口可见，agent-server 监听 `*:4317`。
  3. 通过原生事件 `System Events` 发送 `key code 49 using {command down, shift down}` 唤出 PromptPanel，输入 `[mock:slow-focus] QA stop interrupt manual 20260520` 并提交。
  4. SessionWindow `Session 6D439C8C` 打开后状态为 `running`，右上角出现 Stop 控件；点击 Stop 后窗口保持打开，状态变为 `interrupted`，socket 与 agent-server 仍保持运行。
  5. 检查 session 文件，确认中断后只写入该 user message，没有写入被中断 run 的 assistant 或 tool 消息；等待 5 秒后 messageCount 仍为 1。
  6. 在同一个 SessionWindow 继续提交 `[mock:assistant-ok] QA stop follow-up manual 20260520`，窗口状态回到 `idle`，并显示 mock assistant 回复。
- **证据**：
  - agent-server：`ps -o pid,ppid,command -p 42956` 显示 PPID 为 `42954`，命令路径为 `/Users/mu9/proj/handAgent/apps/agent-server/src/server.ts`。
  - 窗口状态：初始状态气泡 `280x62`；提交 slow run 后出现 `Session 6D439C8C`，窗口 `760x560`，状态 `running`；点击 Stop 后状态为 `interrupted`，窗口未关闭。
  - Session 文件：`~/.spotAgent/sessions/6D439C8C-ABE0-4380-8F66-9D619401FB7B.json`，中断后 `messageCount: 1`，仅包含 `[mock:slow-focus] QA stop interrupt manual 20260520`。
  - 继续追问后同一 session 文件 `messageCount: 3`，消息为 slow user、follow-up user、`Mock assistant response: main chain is reachable.`，没有 Stop 之后追加的 slow assistant / tool 消息。
- **结论**：通过。SessionWindow 运行态 Stop 控件可中断当前 run，窗口和 socket 不关闭；中断后的旧 run 不再写入消息，同一窗口可以继续发起新 run 并正常收到回复。

## Workspace 沙箱补充：默认工作区与 symlink 越界（2026-05-20 实机验证）

- **验证日期**：2026-05-20
- **验证环境**：mock-llm / macOS / worktree `codex/manual-qa-mock-tools` / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 在 worktree 中执行 `pnpm install`、`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`，均通过；补充 mock trigger 后 `bash ./scripts/test.sh` 为 32 个测试文件、184 个测试通过。
  2. 备份 `~/.spotAgent/workspaces.json` 与 `~/.spotAgent/workspace/`，临时删除后启动 mock App。
  3. 确认启动后自动创建 default workspace，`~/.spotAgent/workspaces.json` 只含 `default`，rootPath 为 `~/.spotAgent/workspace`，且目录存在；取证后恢复原 workspace 配置。
  4. 在 `~/.spotAgent/qa-workspace/outside-link` 创建指向 `/tmp/handagent-symlink-target` 的 symlink。
  5. 提交 `[mock:symlink-escape] QA symlink escape manual 20260520`，授权 `file.write` 后，tool 返回 `Path escapes workspace root: outside-link/escape.txt`。
- **证据**：
  - 默认 workspace 自动创建：`~/.spotAgent/workspaces.json` 包含 `id: 1b48d803-f8c8-4169-a63d-dbd23933de94`、`name: default`、`rootPath: /Users/mu9/.spotAgent/workspace`；`test -d ~/.spotAgent/workspace` 通过。
  - agent-server：`ps -o pid,ppid,command -p 48155` 显示命令路径为 `/Users/mu9/proj/handAgent/.worktrees/manual-qa-mock-tools/apps/agent-server/src/server.ts`。
  - Session 文件：`~/.spotAgent/sessions/56B2E9CF-3677-44B4-B543-479206CA5C84.json`，`file.write` 输入为 `outside-link/escape.txt`，`tool_result.status` 为 `error`，输出为 `Path escapes workspace root: outside-link/escape.txt`。
  - 外部目标：`/tmp/handagent-symlink-target/escape.txt` 不存在，证明未穿透写入 symlink 目标。
- **结论**：通过。默认 workspace 缺失时可自动重建；workspace 文件 tool 会在 realpath 后拦截 symlink 越界写入。

## workspace.askUser 内联选择与取消（2026-05-20 实机验证）

- **验证日期**：2026-05-20
- **验证环境**：mock-llm / macOS / worktree `codex/manual-qa-mock-tools` / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 使用现有 `qa-workspace` 与 `tmp` 两个候选 workspace，提交 `[mock:workspace-ask] QA workspace ask manual choose 20260520`。
  2. 授权 `workspace.askUser` 后，SessionWindow 弹出内联 workspace 选择气泡，展示 prompt `请选择 QA 要写入的 workspace` 与候选 `qa-workspace`。
  3. 点击 `qa-workspace`，tool result 返回 `{"workspaceId":"qa-workspace"}`，会话继续完成。
  4. 再次提交 `[mock:workspace-ask] QA workspace ask manual cancel 20260520`，授权后点击内联气泡的「取消」。
  5. tool result 返回 `{"cancelled":true}`，会话继续完成。
- **证据**：
  - Session 文件 `~/.spotAgent/sessions/AD2880EF-E8C4-4B23-BB76-6924908672D4.json`：`workspace.askUser` 输入包含 `candidateIds: ["qa-workspace", "tmp"]`，tool result 为 `{"workspaceId":"qa-workspace"}`。
  - Session 文件 `~/.spotAgent/sessions/006049B8-5389-4150-B810-901BDC9A4058.json`：同一输入下点击取消，tool result 为 `{"cancelled":true}`。
  - 两个 session 均在 `tool_result` 后追加 `Mock workspace.askUser completed.`，证明选择和取消路径都能回灌给 LLM 并继续推进。
- **结论**：通过。`workspace.askUser` 可在 SessionWindow 内联请求用户选择 workspace；用户选择或取消都会作为 tool result 回灌给 runtime，且会话不阻塞。

## 用户自定义 tool / 本地插件基础链路与热禁用（2026-05-20 实机验证）

- **验证日期**：2026-05-20
- **验证环境**：mock-llm / macOS / worktree `codex/manual-qa-mock-tools` / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 在 `~/.spotAgent/plugins/echo/` 准备 `plugin.json` 与可执行 `echo.js`，声明 tool `plugin.echo`，脚本从 stdin 读取 JSON 并输出 `{ echoed, context }`。
  2. 不重启 App，触发下一轮 user message：`[mock:plugin-echo] QA plugin echo manual 20260520`。
  3. SessionWindow 出现 `授权调用 plugin.echo` 权限气泡；选择「仅本次」后，插件收到 `{ input, context }`，tool result 回到 UI 和 session event。
  4. 将 `~/.spotAgent/settings.json` 写入 `tools.denylist: ["plugin.echo"]`，不重启 App，再提交 `[mock:plugin-echo] QA plugin echo denylist manual 20260520`。
  5. 下一轮请求热加载设置后返回 `Unknown tool: plugin.echo`；取证后恢复 settings。
- **证据**：
  - 插件 manifest：`~/.spotAgent/plugins/echo/plugin.json`，脚本：`~/.spotAgent/plugins/echo/echo.js`。
  - Session 文件 `~/.spotAgent/sessions/5B6DF2FA-A274-4141-9CC2-832B7B0B68E2.json`：`tool_result.status` 为 `success`，输出包含 `echoed.message: "hello from MockLLMClient"`、`context.pluginId: "echo"`、`context.toolName: "plugin.echo"`。
  - Session 文件 `~/.spotAgent/sessions/A94C0D17-D697-45AC-A4F7-0552BF2C5545.json`：denylist 生效后 session 状态为 `failed`，event 为 `Unknown tool: plugin.echo`。
  - settings 恢复后 `~/.spotAgent/settings.json` 中 `tools.denylist` 为空数组。
- **结论**：通过。本地插件 tool 可在下一轮请求中热加载、进入统一权限审批与 tool result/event 链路；`tools.denylist` 可不重启热禁用插件 tool。

## 用户自定义 tool / 本地插件异常边界（2026-05-21 验证）

- **验证日期**：2026-05-21
- **验证环境**：mock-llm / macOS 15.5 / worktree `codex/fix-delete-running-session-tab`；进程异常路径使用 `dist/HandAgentDesktop.app` 派生的 agent-server（`*:4317`），冲突与 workspace 路径边界使用同一 worktree 生产模块启动的一次性 WebSocket harness（`*:4318`）。
- **验证过程**：
  1. 备份 `~/.spotAgent/plugins/echo/` 与 `~/.spotAgent/settings.json` 到 `~/.spotAgent/qa-backup-plugin-20260521035655/`。
  2. 依次把 `plugin.echo` 的 `command` 指向非 0 exit、非 JSON stdout、短超时脚本、超过 1 MiB 输出脚本，以及指向插件目录外的 symlink 命令；每次通过 WebSocket 发送 `[mock:plugin-echo]`，收到 `permission_request` 后回 `allow once`。
  3. 每个失败都作为 `tool_result.status: "error"` 写入 session，assistant 最终消息继续完成；每轮后 `lsof -nP -iTCP:4317 -sTCP:LISTEN` 均显示 agent-server 仍在监听。
  4. 从备份恢复 `~/.spotAgent/plugins/echo/` 与 `settings.json`，确认 `plugin.echo.command` 恢复为 `echo.js`，`tools.denylist` 为空。
  5. 在 `/tmp/handagent-plugin-qa-root/` 创建一次性插件目录：一个插件声明 builtin 同名 `file.read`，两个插件重复声明 `plugin.duplicate`，一个插件声明 `plugin.workspaceRead` / `plugin.workspaceWrite` 并带 `permissions.workspace: "read" | "write"`。
  6. 用生产 `SettingsBackedToolRegistry + AgentRuntime + SessionRouter` 启动一次性 harness 到 `*:4318`，确认日志记录 builtin 冲突与重复插件 tool 的 disabled reason，且注册表仍保留 builtin `file.read`。
  7. 通过 `*:4318` WebSocket 触发 workspace 插件 tool：合法 read/write 路径收到校验后的 `workspaceRoot` 与 `absolutePath`；`../../escape.txt` 与 workspace 内 symlink 指向外部目录的 `link-out/escape.txt` 均被拦截。
- **证据**：
  - 进程异常 session：
    - `~/.spotAgent/sessions/session-1779307628772-t80wb4.json`：非 0 exit 返回 `plugin tool plugin.echo exited with code 7: qa non-zero exit`。
    - `~/.spotAgent/sessions/session-1779308097500-iidybt.json`：非 JSON stdout 返回 `plugin tool plugin.echo returned invalid JSON`。
    - `~/.spotAgent/sessions/session-1779308181300-vpg3tk.json`：超时返回 `plugin tool plugin.echo timed out after 100ms`，`durationMs: 103`。
    - `~/.spotAgent/sessions/session-1779308283211-y77qm6.json`：输出超限返回 `plugin tool plugin.echo exceeded output limit (1048576 bytes)`。
    - `~/.spotAgent/sessions/session-1779308389321-hjgcp8.json`：symlink command 返回 `plugin command escapes plugin directory: escape-link.js`。
  - 恢复状态：`~/.spotAgent/plugins/echo/plugin.json` 恢复为 `command: "echo.js"`，`~/.spotAgent/settings.json` 中 `tools.denylist` 为空数组；`*:4317` 仍由 worktree agent-server 监听。
  - 冲突日志：一次性 harness stdout 显示 `disabled tool file.read: plugin tool conflicts with builtin` 与 `disabled tool plugin.duplicate: duplicate plugin tool name`，注册工具列表仍包含 builtin `file.read`。
  - workspace session：
    - `/tmp/handagent-plugin-qa-root/sessions/session-1779309054108-w8f7vi.json`：`plugin.workspaceRead` 成功，`workspace.absolutePath` 为 `/private/tmp/handagent-plugin-qa-root/workspace/notes/input.txt`，`access: "read"`。
    - `/tmp/handagent-plugin-qa-root/sessions/session-1779309054583-swgibv.json`：`plugin.workspaceWrite` 成功，`workspace.absolutePath` 为 `/private/tmp/handagent-plugin-qa-root/workspace/notes/output.txt`，`access: "write"`。
    - `/tmp/handagent-plugin-qa-root/sessions/session-1779309054614-mpidaa.json`：`../../escape.txt` 返回 `Path escapes workspace root: ../../escape.txt`。
    - `/tmp/handagent-plugin-qa-root/sessions/session-1779309054617-g3aczg.json`：`link-out/escape.txt` 返回 `Path escapes workspace root: link-out/escape.txt`。
- **结论**：通过。插件异常退出、非 JSON 输出、超时、输出超限、command symlink 越界、builtin/重复 tool 禁用、workspace read/write 参数解析与路径越界拦截均可返回明确错误或校验后数据，不会拖垮 agent-server。workspace 验证只证明传给插件的路径边界，不代表插件进程具备 OS 级沙箱。

## 真实 provider 流式输出（2026-05-21 实机验证）

- **验证日期**：2026-05-21
- **验证环境**：real LLM / macOS 15.5 / worktree `codex/fix-delete-running-session-tab` / 非 mock `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 使用 real provider 配置启动重新打包的 App，确认 `HandAgentRuntimeMode.json` 不存在，agent-server 子进程来自当前 worktree。
  2. 修复前用 `QA real streaming visible 20260521...` 复现到 UI 在 `运行中` 状态只显示空 assistant 占位；`network-004.jsonl` 中有 `6542` 个 content delta，说明失败点不是 provider 未返回 SSE，而是本地 fetch 日志包装器缓冲 streamed response。
  3. 修复 `createLoggingFetch()` 后执行自动化验证：`pnpm vitest run packages/core/tests/logging/logging-fetch.test.ts`、`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build` 均通过。
  4. 重新 `bash ./scripts/package-app.sh` 打包非 mock App 并启动，提交 `QA real streaming fixed 20260521: Begin immediately with STREAM_START...`。
  5. Computer Use 第一次运行态采样显示标题区 `运行中`、Stop 按钮可见，assistant 气泡已显示 `STREAM_START` 与 `1.`。
  6. 同一 run 第二次运行态采样仍显示 `运行中`，assistant 气泡已增长到至少第 86 条，证明 SessionWindow 在真实 provider SSE 到达时逐段追加文本，而非完成后一次性渲染。
  7. 处理 code review 后再次执行自动化验证并重新打包非 mock App；提交 `QA real streaming exact-code smoke 20260521...`，运行态采样仍显示 `运行中` 且 assistant 气泡已从 `EXACT_STREAM_START` 增长到第 250 条。
  8. 两次 real provider run 完成后 session 持久化均写入 user + assistant 两条消息，assistant 内容完整。
- **证据**：
  - 进程：最终 smoke 中 `HandAgentDesktop` pid `27106`，agent-server pid `27108`，命令路径为 `/Users/mu9/proj/handAgent/.worktrees/delete-running-session-tab/apps/agent-server/src/server.ts`。
  - UI：Computer Use 运行态采样可见 `STREAM_START`、`1.`；后续运行态采样可见条目 `1` 到 `86`，窗口仍为 `运行中`。
  - 最终 smoke UI：Computer Use 运行态采样可见 `EXACT_STREAM_START` 与条目 `1` 到 `250`，窗口仍为 `运行中`，Stop 按钮可见。
  - 网络日志：`~/.spotAgent/log/2026-05-21/network-005.jsonl`，request 包含 `QA real streaming fixed 20260521` 与 `QA real streaming exact-code smoke 20260521`，对应 response 均为 `status: 200`、`body: "[streaming response: text/event-stream]"`，证明日志层不再完整读取 SSE body。
  - Session 文件：`~/.spotAgent/sessions/session-1779311685828-kaqr5f.json`，完成后 `messages: 2`，assistant 内容长度约 `8353`。
  - 最终 smoke session：`~/.spotAgent/sessions/session-1779312326930-rilxsi.json`，完成后 `messages: 2`，assistant 内容长度约 `2597`。
- **结论**：通过。真实 provider streaming 可在 SessionWindow 中以可见增量渲染；网络日志不再为了记录 response 而缓冲 SSE body。

## Tool 运行时基础（2026-05-20 实机验证）

- **验证日期**：2026-05-20
- **验证环境**：mock-llm / macOS / main branch / `dist/HandAgentDesktop.app` + standalone agent-server
- **验证过程**：
  1. 执行 `bash ./scripts/package-app.sh --mock-llm` 并启动 `dist/HandAgentDesktop.app`，确认状态气泡 `280x62` 可见，agent-server 监听 `*:4317`，子进程命令路径为主仓库 `apps/agent-server/src/server.ts`。
  2. 备份 `~/.spotAgent/settings.json`，写入 `tools.denylist: ["clipboard.read"]`，不重启 App。
  3. 通过 PromptPanel 提交 `[mock:clipboard-read] QA clipboard denylist manual 20260520`，确认下一轮请求热加载设置后 SessionWindow 进入 `failed`，显示 `Unknown tool: clipboard.read`。
  4. 恢复 `settings.json` 后停止桌面 App，单独以 `HANDAGENT_LLM_MODE=mock node --experimental-transform-types --experimental-specifier-resolution=node apps/agent-server/src/server.ts` 启动 agent-server，不连接 desktop platform bridge。
  5. 通过 WebSocket 客户端发送 `[mock:screen-display] QA desktop offline manual 20260520`，收到 `permission_request` 后回 `allow once`，确认 `screen.capture` 立即返回 platform bridge offline 错误而非超时。
- **证据**：
  - App 启动：`ps -o pid,ppid,command -p 52625` 显示命令路径为 `/Users/mu9/proj/handAgent/apps/agent-server/src/server.ts`。
  - 注册工具列表：standalone agent-server stdout 打印 `[agent-server] registered tools: clipboard.read, app.frontmost, window.list, screen.capture, ocr.read, accessibility.snapshot, accessibility.action, workspace.list, file.read, file.write, workspace.askUser, plugin.echo`。
  - denylist session：`~/.spotAgent/sessions/E1082024-BAEC-4CE9-A081-76106C3F3B22.json`，events 包含 `Unknown tool: clipboard.read`。
  - desktop offline session：`~/.spotAgent/sessions/QA-OFFLINE-1779259054383.json`，`screen.capture` tool result `status: error`，output 为 `Platform bridge is not connected (method: screen.capture)`，`durationMs: 1`。
  - settings 恢复后 `~/.spotAgent/settings.json` 中 `tools.denylist` 为空数组；验证结束后 `*:4317` 无 listener。
- **结论**：通过。agent-server 启动时注册当前可用工具列表；tool denylist 可在下一轮请求前热加载；desktop 未连接 platform bridge 时平台 tool 会立即返回明确 offline 错误，不会静默超时。

## 权限审批关闭窗口取消挂起请求（2026-05-21 实机验证）

- **验证日期**：2026-05-21
- **验证环境**：mock-llm / macOS 15.5 / main branch / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 执行基线命令：`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`，均通过；其中 vitest 为 37 个测试文件、210 个测试通过、1 个 integration 跳过。
  2. 执行 `bash ./scripts/package-app.sh --mock-llm` 并启动 `dist/HandAgentDesktop.app`，确认状态气泡可见，agent-server 监听 `*:4317`。
  3. 临时清理会影响本轮判断的 `file.write` 等旧权限规则，保留备份 `~/.spotAgent/qa-backup-20260521-0231/`。
  4. 通过原生事件 `System Events` 发送 `key code 49 using {command down, shift down}` 唤出 PromptPanel，输入 `[mock:permission-write] QA close pending permission 20260521` 并提交。
  5. SessionWindow 出现 `授权调用 file.write` 内联权限气泡，参数为 `workspaceId: "qa-workspace"`、`relativePath: "permission-check.txt"`、`content: "permission scenario content"`。
  6. 不点击任何授权按钮，直接关闭 SessionWindow；关闭后只剩状态气泡。
  7. 关闭后短延迟检查与超过旧 60 秒超时窗口后复查，session 文件都只保留 1 条 user message，没有 `permission_request`、`tool_result` 或 final assistant 迟到写入。
  8. 随后新建 `screen.capture` 会话仍能出现新的授权气泡，说明权限审批桥没有整体卡死。
- **证据**：
  - agent-server：`ps -o pid,ppid,command -p 41306` 显示命令路径为 `/Users/mu9/proj/handAgent/apps/agent-server/src/server.ts`。
  - 窗口状态：关闭权限气泡所在 SessionWindow 后，`System Events` 只剩状态气泡窗口 `280x62`。
  - Session 文件：`~/.spotAgent/sessions/session-1779302211552-4n30ke.json`，`messageCount: 1`，`events: []`，仅包含 `[mock:permission-write] QA close pending permission 20260521`。
  - 后续权限链路：提交 `[mock:screen-display] QA screen display 20260521` 后仍出现 `授权调用 screen.capture` 气泡。
  - 清理状态：验证结束后退出 `HandAgentDesktop`，`*:4317` 无 listener；`~/.spotAgent/permissions.json` 已从备份恢复。
- **结论**：通过。关闭带有挂起权限请求的 SessionWindow 会立即中断该会话 run，不再等待超时后向已关闭 session 写入 permission/tool/assistant 消息；后续新会话权限审批仍可正常出现。

## 单窗口多 Tab 会话历史（2026-05-21 实机验证）

- **验证日期**：2026-05-21
- **验证环境**：mock-llm / macOS / worktree `codex/manual-qa-audit` / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 使用原生事件 `System Events` 发送 `key code 49 using {command down, shift down}` 唤出 PromptPanel，连续提交两个 `[mock:assistant-ok]` prompt，确认同一个 SessionWindow 内复用窗口并创建多个完成态 tab。
  2. 提交 `[mock:slow-focus] QA delete running regression fixed 20260521 target`，创建 10 分钟 running tab，SessionWindow 标题显示 `运行中 4 个已打开标签页`，左侧历史行显示 `已打开, 1 条消息, 运行中`。
  3. 切回完成态 tab `[mock:assistant-ok] QA delete baseline completed fixed 20260521 B`，确认 active tab 变为 `空闲`，running tab 仍在后台保持运行标记。
  4. 在左侧历史列表对 running session 右键选择「删除」，二次确认弹窗显示 `删除会话？ 删除后无法恢复本地历史文件。`。
  5. 点击确认删除后，窗口回到完成态 tab，标题显示 `空闲 3 个已打开标签页`，顶部 slow-focus tab 消失，历史列表条数从 120 变为 119。
  6. 检查持久化和 socket：目标 session 文件已删除，`lsof -nP -iTCP:4317` 中对应 running tab 的 WebSocket 连接消失，agent-server 仍保持监听。
- **证据**：
  - desktop / server 进程：`HandAgentDesktop` pid `47574`，agent-server pid `47575`，node 命令路径为 `/Users/mu9/proj/handAgent/.worktrees/manual-qa-audit/apps/agent-server/src/server.ts`。
  - 完成态 session 文件：`~/.spotAgent/sessions/session-1779319776666-woatof.json` 与 `~/.spotAgent/sessions/session-1779319896180-i0gqm1.json`，均为 2 条消息。
  - running 删除目标：`~/.spotAgent/sessions/session-1779320015436-9bdfno.json`，删除前 `messageCount: 1`，只包含 `[mock:slow-focus] QA delete running regression fixed 20260521 target`；删除后 `test -f` 返回 missing，按 prompt 搜索 `~/.spotAgent/sessions/` 无残留。
  - UI：删除前 Computer Use 可见 `运行中 4 个已打开标签页` 与 running 历史行；删除后可见 `空闲 3 个已打开标签页`，顶部只剩 screen tab 与两个 `[mock:assistant-ok]` tab。
  - socket：删除前 `lsof -nP -iTCP:4317` 有 desktop fd `17` / node fd `17` 的 session 连接；删除后该连接消失。
- **结论**：通过。SessionWindow 可复用单窗口承载多个 session tab；PromptPanel 新提交不会打到当前 active tab；历史项可激活已有 tab；后台 running tab 标记可见；删除 running session 后 server 删除文件、历史刷新、对应 open tab 关闭并断开 socket。

## 真实 provider 流式输出（2026-05-21 实机验证）

- **验证日期**：2026-05-21
- **验证环境**：real LLM / macOS / worktree `codex/manual-qa-audit` / 非 mock `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 确认 `dist/HandAgentDesktop.app/Contents/Resources/HandAgentRuntimeMode.json` 不存在，启动非 mock App。
  2. 确认桌面进程 `53098` 与 agent-server 进程 `53099` 运行，agent-server 命令路径为 `/Users/mu9/proj/handAgent/.worktrees/manual-qa-audit/apps/agent-server/src/server.ts`。
  3. 通过原生事件 `System Events` 发送 `key code 49 using {command down, shift down}` 唤出 PromptPanel。
  4. 提交 `QA real streaming ui evidence 20260521. Start with LIVE_STREAM_START. Then write 900 numbered lines exactly: Line N: visible streaming proof. Do not call tools. Do not summarize.`。
  5. SessionWindow 进入 `运行中`，同一个 assistant 气泡先为空，再逐步显示 `LIVE_STREAM_START`、第 1-7 行、第 1-14 行，证明 UI 在运行中增量渲染，而不是响应结束后一次性出现。
  6. 运行结束后 session 文件写入 2 条消息，assistant 内容包含 `LIVE_STREAM_START` 与 900 行输出。
- **证据**：
  - 网络日志：`~/.spotAgent/log/2026-05-21/network-005.jsonl` 第 13-14 行，`2026-05-21T00:07:31.103Z` 请求真实 `chat/completions`，`2026-05-21T00:07:33.759Z` 响应为 `[streaming response: text/event-stream]`。
  - Session 文件：`~/.spotAgent/sessions/session-1779322051046-px8urh.json`，`messageCount: 2`，assistant 长度 `35801`，共 `901` 行，末尾为 `900. Line 900: visible streaming proof.`。
  - 截图序列：`/tmp/handagent-qa/streaming/clean-real-ui-20260521/frame-05-w52241.png` 为空 assistant 气泡，`frame-07-w52241.png` 显示 `LIVE_STREAM_START`，`frame-08-w52241.png` 显示第 1-7 行并正在输出第 8 行，`frame-09-w52241.png` 显示第 1-14 行并正在输出第 15 行。
  - 截图文件大小同一窗口从 `529187` bytes 增长到 `661084` bytes，随后稳定在约 `691KB`，与可见文本增长一致。
- **结论**：通过。真实 provider 的 SSE 响应不会再被网络日志包装器阻塞；agent-server 可把真实 token delta 推送到桌面端，SessionWindow 在运行中逐段更新 assistant 气泡。

## 协议拆分与多会话绑定（2026-05-21 实机验证）

- **验证日期**：2026-05-21
- **验证环境**：mock-llm / macOS / worktree `codex/manual-qa-audit` / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 清理重复 bundle-id 进程后，从当前 worktree 重新执行 `bash ./scripts/package-app.sh --mock-llm` 并启动 `dist/HandAgentDesktop.app`。
  2. 确认桌面进程 `91223` 与 agent-server 进程 `91231` 运行，agent-server 命令路径为 `/Users/mu9/proj/handAgent/.worktrees/manual-qa-audit/apps/agent-server/src/server.ts`，`HandAgentRuntimeMode.json` 为 `{"llmMode":"mock"}`。
  3. 使用原生事件 `System Events` 发送 `key code 49 using {command down, shift down}` 唤出 PromptPanel，创建 `[mock:clipboard-read] QA protocol binding pass A 20260521` tab；点击「仅本次」后，tool result 返回当前剪贴板 `HANDAGENT_MULTI_TAB_PASS_CLIPBOARD_20260521`。
  4. 再次通过 PromptPanel 创建 `[mock:ocr-invalid] QA protocol binding pass B 20260521` tab；点击「仅本次」后，tool result 返回缺少 `imageBase64` 的明确 invalid input 错误。
  5. 同一 SessionWindow 显示多个已打开 tab，A/B 两个 session 的 `permission_request`、`tool_call`、`tool_result` 分别写入各自 session 文件，未串到对方 tab。
  6. 关闭 B tab 后自动切回 A tab，A tab 仍显示 `clipboard.read` 的成功结果与 final assistant，不受 B tab 关闭影响。
- **证据**：
  - 进程：`HandAgentDesktop` pid `91223`，agent-server pid `91231`，node 命令路径为当前 worktree 的 `apps/agent-server/src/server.ts`。
  - socket：`lsof -nP -iTCP:4317` 显示桌面端和 node 通过多个 session socket 连接同一个 `*:4317` listener。
  - A session：`~/.spotAgent/sessions/session-1779346917128-r4ih2m.json`，messages 为 user、`tool_call(clipboard.read)`、tool result、`Mock clipboard.read completed.`；events 记录 `permission_request(action: allow)`、`tool_call(clipboard.read)`、`tool_result(status: success)`，输出包含 `HANDAGENT_MULTI_TAB_PASS_CLIPBOARD_20260521`。
  - B session：`~/.spotAgent/sessions/session-1779346994265-fetghw.json`，messages 为 user、`tool_call(ocr.read)`、tool result、`Mock ocr invalid scenario finished.`；events 记录 `permission_request(action: allow)`、`tool_call(ocr.read)`、`tool_result(status: error)`，输出为 `Invalid input for tool "ocr.read": imageBase64: Invalid input: expected string, received undefined`。
  - UI：关闭 B tab 后 Computer Use 可见 active tab 回到 `[mock:clipboard-read] QA protocol binding pass A 20260521`，仍显示 `clipboard.read` 成功结果。
- **结论**：通过。SessionWindow 内多个 session tab 通过各自 socket/session id 隔离 platform tool 请求；不同 tool result 不串 tab，关闭一个已完成 tab 不影响另一个已打开 session 的结果与可激活状态。

## 用户自定义 tool / 本地插件系统后续边界（2026-05-21 实机验证）

- **验证日期**：2026-05-21
- **验证环境**：mock-llm / macOS / worktree `codex/manual-qa-audit` / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 将用户现有插件目录备份到 `~/.spotAgent/qa-backup-plugins-20260521-152503`，随后在 `~/.spotAgent/plugins` 准备冲突、重复、错误输出、超时、输出超限、命令 symlink 越界与 workspace 权限边界插件。
  2. 创建声明 builtin 同名 tool `file.read` 的插件，以及两个同名 `plugin.echo` 插件；触发插件注册刷新后，agent-server 记录 `disabled tool file.read: plugin tool conflicts with builtin` 与 `disabled tool plugin.echo: duplicate plugin tool name`。
  3. 提交 `[mock:plugin-echo] QA plugin duplicate disabled 20260521`，确认重复插件 tool 被禁用后会话返回 `Unknown tool: plugin.echo`。
  4. 提交 `[mock:file-read] QA plugin builtin conflict file.read fast 20260521`，确认 `file.read` 仍执行 builtin 文件读取，返回 `BUILTIN_FILE_READ_CONTENT_20260521`，没有执行插件侧 `PLUGIN_SHOULD_NOT_RUN`。
  5. 分别触发非 0 exit、输出非 JSON、超时、输出超过 1 MiB 与 command symlink 越界插件，确认错误作为 tool result 返回，agent-server 未崩溃。
  6. 补充 mock 触发器 `[mock:plugin-workspace-read]`、`[mock:plugin-workspace-write]`、`[mock:plugin-workspace-escape]`、`[mock:plugin-workspace-symlink]`，验证插件 workspace 参数会收到校验后的 `workspaceRoot/absolutePath`，`../../` 与 symlink 越界会被拦截。
  7. 检查 symlink 外部目标 `/tmp/handagent-plugin-workspace-outside-20260521`，未生成 `plugin.txt`。
- **证据**：
  - 进程：`HandAgentDesktop` pid `99472`，agent-server pid `99480`，node 命令路径为当前 worktree 的 `apps/agent-server/src/server.ts`；`HandAgentRuntimeMode.json` 为 `{"llmMode":"mock"}`。
  - 注册冲突日志：agent-server 输出 `disabled tool file.read: plugin tool conflicts with builtin` 与 `disabled tool plugin.echo: duplicate plugin tool name`。
  - 重复插件禁用：`~/.spotAgent/sessions/session-1779348520355-bz0a94.json` 返回 `Unknown tool: plugin.echo`。
  - builtin 未被覆盖：`~/.spotAgent/sessions/session-1779348772751-h0q238.json` 返回 `BUILTIN_FILE_READ_CONTENT_20260521`，不包含 `PLUGIN_SHOULD_NOT_RUN`。
  - 非 0 exit：`~/.spotAgent/sessions/session-1779348933225-zlixfd.json` 返回 `plugin tool plugin.echo exited with code 7: QA_NONZERO_STDERR_20260521`。
  - 非 JSON 输出：`~/.spotAgent/sessions/session-1779348935385-f1m4yk.json` 返回 `plugin tool plugin.echo returned invalid JSON`。
  - 超时：`~/.spotAgent/sessions/session-1779348854386-2yopnf.json` 返回 `plugin tool plugin.echo timed out after 50ms`。
  - 输出超限：`~/.spotAgent/sessions/session-1779348856792-u1z96d.json` 返回 `plugin tool plugin.echo exceeded output limit (1048576 bytes)`。
  - command symlink 越界：`~/.spotAgent/sessions/session-1779348859235-rgx7qm.json` 返回 `plugin command escapes plugin directory: outside-link`。
  - workspace 合法读取：`~/.spotAgent/sessions/session-1779349419779-mom3om.json` 返回 `workspaceRoot: /Users/mu9/.spotAgent/qa-workspace`、`absolutePath: /Users/mu9/.spotAgent/qa-workspace/plugin-input.txt`、`access: read`。
  - workspace 合法写入：`~/.spotAgent/sessions/session-1779349514445-gu1s7x.json` 返回 `relativePath: plugin-output.txt`、`absolutePath: /Users/mu9/.spotAgent/qa-workspace/plugin-output.txt`、`access: write`。
  - workspace `../../` 越界：`~/.spotAgent/sessions/session-1779349517050-fd23yu.json` 返回 `Path escapes workspace root: ../../etc/passwd`。
  - workspace symlink 越界：`~/.spotAgent/sessions/session-1779349519661-c5bdhw.json` 返回 `Path escapes workspace root: outside-link/plugin.txt`；`find /tmp/handagent-plugin-workspace-outside-20260521 -maxdepth 2 -type f -print` 无输出。
- **结论**：通过。本地插件系统会禁用 builtin 冲突与重复 tool name；插件进程非 0 exit、非 JSON、超时、输出超限和 command 越界均以明确 tool result 暴露；插件 workspace 参数会做 root、`../../` 与 symlink 越界校验。该验证只覆盖传给插件的路径边界，不代表插件进程拥有 OS 级沙箱。

## OCR 平台能力（2026-05-21 实机验证）

- **验证日期**：2026-05-21
- **验证环境**：mock-llm / macOS / worktree `codex/manual-qa-audit` / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 新增并验证 mock 触发器 `[mock:ocr-sample]`，让 LLM 调用 `ocr.read`，参数为显式传入的 PNG `imageBase64`、`mimeType: "image/png"`、`language: "en-US"`。
  2. 用原生事件 `System Events` 发送 `key code 49 using {command down, shift down}` 唤出 PromptPanel，提交包含 `OCR PASS 20260521` 的 PNG base64 prompt。
  3. SessionWindow 出现 `ocr.read` 权限气泡后选择「仅本次」，tool 经真实 PlatformBridge 进入桌面 Vision OCR provider。
  4. 复用协议拆分与多会话绑定 QA 中的 `[mock:ocr-invalid]` 会话，确认缺少 `imageBase64` 时返回明确输入校验错误，不会隐式读取屏幕、剪贴板或文件。
- **证据**：
  - 进程：`HandAgentDesktop` pid `7656`，agent-server pid `7660`，node 命令路径为 `/Users/mu9/proj/handAgent/.worktrees/manual-qa-audit/apps/agent-server/src/server.ts`。
  - 正向 OCR session：`~/.spotAgent/sessions/session-1779352440918-172nal.json`，events 记录 `permission_request(action: allow)`、`tool_call(ocr.read)`、`tool_result(status: success)`；tool output 为 `{"lines":[{"confidence":1,"text":"OCR PASS 20260521"}],"resolution":"best_effort","text":"OCR PASS 20260521"}`。
  - 缺参错误 session：`~/.spotAgent/sessions/session-1779346994265-fetghw.json`，events 记录 `tool_result(status: error)`，输出为 `Invalid input for tool "ocr.read": imageBase64: Invalid input: expected string, received undefined`。
  - UI：Computer Use 可见 OCR session 完成后 SessionWindow 回到 `空闲`，历史中该 session 为已完成会话。
- **结论**：通过。`ocr.read` 只消费显式传入的图片参数，能返回识别文本与 `lines[].confidence`；缺少 `imageBase64` 时返回明确校验错误，不会默认抓取额外上下文。

## OpenAI 兼容 provider completion 降级边界（2026-05-21 实机验证）

- **验证日期**：2026-05-21
- **验证环境**：real LLM / macOS / worktree `codex/manual-qa-audit` / 非 mock `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 退出 mock App，执行 `bash ./scripts/package-app.sh` 重新打包非 mock App，确认 `dist/HandAgentDesktop.app/Contents/Resources/HandAgentRuntimeMode.json` 不存在。
  2. 启动非 mock App，确认桌面进程 `12225` 与 agent-server 进程 `12235` 运行，agent-server 命令路径为 `/Users/mu9/proj/handAgent/.worktrees/manual-qa-audit/apps/agent-server/src/server.ts`。
  3. 备份 `~/.spotAgent/settings.json` 到 `~/.spotAgent/settings.json.qa-completion-20260521.bak`，临时将 `llm.provider` 设为 `openai-compatible`、`llm.api` 设为 `completion`，保留原 model、baseUrl 与 apiKey。
  4. 通过 agent-server WebSocket 创建带 PNG 图片附件的会话 `QA completion multimodal reject 20260521...`，确认本地能力层在请求 provider 前拒绝多模态。
  5. 再创建会话 `QA completion tool downgrade 20260521... Use file.read...`，让真实 provider 走 `/v1/completions`；该会话确认未暴露工具列表，同时发现 provider 404 被静默保存为空 assistant 的错误传播缺陷。
  6. 修复 `VercelClient` 错误传播后，再用 WebSocket 与 PromptPanel UI 各回归一次同类 prompt，确认 provider 404 会进入 session `error` event 和 UI 失败态，不再保存空 assistant。
- **证据**：
  - 设置恢复后检查：`~/.spotAgent/settings.json` 已回到 `provider: "openai-compatible"`、`api: "chat"`、`model: "gpt-5.3-codex"`、`baseUrl: "https://lpgpt.us/v1"`，API key 未输出。
  - 多模态拒绝 session：`~/.spotAgent/sessions/session-1779353652009-cgajcz.json`，events 记录 `error`，message 为 `LLM provider 'openai-compatible' does not support multimodal for this request.`；该 session 只持久化用户消息和 image STUB，没有发起 provider 网络请求。
  - tool 降级原始 session：`~/.spotAgent/sessions/session-1779353692180-irv7zb.json`，messages 为 user 与空 assistant，events 为空；没有任何 `tool_call` 或 `tool_result`，说明 runtime 未向模型提供可执行 tool 结果链路。该 session 同时暴露了 provider 404 静默完成缺陷，已修复并记录在 [bugs.md](./bugs.md)。
  - 网络日志：`~/.spotAgent/log/2026-05-21/network-005.jsonl` 最后两条新增记录中，`2026-05-21T08:54:52.214Z` 请求 URL 为 `https://lpgpt.us/v1/completions`，body 仅包含 `model`、`prompt`、`stop`、`stream`、`stream_options`，不包含 `tools`、`tool_choice` 或点号风格 tool name；`2026-05-21T08:54:54.535Z` 响应为 provider 404。
  - 修复后 WebSocket 回归：`~/.spotAgent/sessions/session-1779354423036-68vu3t.json` 只保留 user message，events 记录 `error`，message 为 `openai_error`，不再持久化空 assistant。
  - 修复后 UI 回归：`~/.spotAgent/sessions/session-1779354494947-a0uwtr.json` 只保留 user message，events 记录 `error: openai_error`；Computer Use 可见 SessionWindow 标题进入 `失败` 并显示 `openai_error`。
- **结论**：通过。`openai-compatible + completion` 会在多模态输入上返回明确不支持错误；需要 tool 的 prompt 会降级成纯文本 completions 请求，不向 provider 暴露 tool 列表。当前 `lpgpt.us` 对该 model 的 `/v1/completions` 返回 404，属于当前 provider/model 配置限制；修复后该 404 会作为用户可见错误传播，不再静默保存空 assistant。

## 多模态图片附件与区域截图入口（2026-05-21 实机验证）

- **验证日期**：2026-05-21
- **验证环境**：real LLM / macOS / worktree `codex/manual-qa-audit` / 非 mock `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 通过 agent-server WebSocket 直接创建带 PNG image STUB 的真实 provider 会话，确认进入 provider 前会把本地 image STUB 展开成多模态 `image_url` 请求。
  2. provider 返回文本准确读出图片中的 `VISION_PASS_20260521`，证明真实 `openai-compatible` chat provider 能理解图片内容。
  3. 复核既有 PromptPanel 区域截图附件实机记录：`captureRegion` 快捷键会触发用户主动圈选，成功后 PromptPanel 显示 `区域截图` image chip，提交后 SessionWindow 显示 `附件 ×1 · image`，session 文件持久化 image STUB。
  4. 2026-05-21 后续自动化重试中，PromptPanel UI 会话 `session-1779355056379-ss0d3g.json`、`session-1779355342676-03v1x6.json`、`session-1779355661086-flo5nm.json` 均证明 UI 提交会持久化 image STUB 并发起真实多模态 provider 请求；其中自动化圈选坐标未命中 TextEdit 文本，blob 实际是桌面壁纸区域，因此不作为 vision 识别失败证据。
  5. 用户同日手动确认当前机器上重新授予权限后，区域圈选路径可正常工作；重打包后权限不通用的问题已单独记录到 [bugs.md](./bugs.md) 当前 bug。
- **证据**：
  - 真实 vision 成功 session：`~/.spotAgent/sessions/session-1779350388296-2gmta1.json`，assistant 回复包含 `VISION_PASS_20260521`。
  - 网络日志：`~/.spotAgent/log/2026-05-21/network-005.jsonl` 中对应真实 `chat/completions` request 包含脱敏后的 `image_url`，response 为 `text/event-stream`。
  - 区域截图附件历史实机记录：2026-05-19 `PromptPanel 区域截图附件` 归档，session `~/.spotAgent/sessions/179F2D7B-B509-42EB-B056-C51ECCB298B1.json` 与 blob `~/.spotAgent/blobs/2026-05-19/8b127e30-a551-4969-ae85-9f80c567de32.png`。
  - UI 多模态提交记录：`~/.spotAgent/sessions/session-1779355056379-ss0d3g.json`、`~/.spotAgent/sessions/session-1779355342676-03v1x6.json`、`~/.spotAgent/sessions/session-1779355661086-flo5nm.json` 均有 `附件 ×1 · image` 对应的 image STUB。
- **结论**：通过。多模态图片附件从 PromptPanel 到 session 持久化、image STUB 展开、真实 provider vision 理解的关键链路已验证；区域圈选是否拿到前台窗口内容取决于当前 packaged app 的 macOS 屏幕录制权限状态，权限身份问题不再放在本条 manual QA 中重复追踪。

## Action Plugin / MCP 会话绑定（2026-05-21 实机验证）

- **验证日期**：2026-05-21
- **验证环境**：mock-llm / macOS / worktree `codex/action-plugin-mcp-qa` / `dist/HandAgentDesktop.app`
- **验证过程**：
  1. 在最新 `main` 基础上新增并验证 mock 触发器 `[mock:mcp-echo]`，让 mock LLM 调用 `mcp.qa_echo.echo`，参数为 `{ "text": "hello from MockLLMClient" }`。
  2. 备份当前 `~/.spotAgent/plugins` 和 `~/.spotAgent/mcp.json` 到 `~/.spotAgent/qa-backup-action-mcp-20260521-180251`，随后创建 `action-mcp-qa` Action Plugin、`action-mcp-missing` Action Plugin 与 stdio MCP server `~/.spotAgent/qa-mcp-echo-server.js`。
  3. 执行基线命令：`bash ./scripts/test.sh`、`bash ./scripts/swiftw build`、`bash ./scripts/swiftw test`，均通过；打包 `bash ./scripts/package-app.sh --mock-llm` 并启动 worktree 下的 `dist/HandAgentDesktop.app`。
  4. 用原生事件 `System Events` 发送默认快捷键后，Computer Use 确认 PromptPanel 显示 `QA MCP Echo /qa-mcp` 与 `QA MCP Missing /qa-mcp-missing` action row。
  5. 点击 `QA MCP Echo`，输入参数 `smoke` 并提交，SessionWindow 出现 `授权调用 mcp.qa_echo.echo` 权限气泡；选择「仅本次」后，tool 返回 `QA_MCP_ECHO:hello from MockLLMClient`，assistant 返回 `Mock MCP echo completed.`。
  6. 通过 WebSocket 创建不带 `actionBinding` 的普通 session，发送同样的 `[mock:mcp-echo]`，确认 session 记录 `Unknown tool: mcp.qa_echo.echo`，证明 MCP tool 未暴露给普通 prompt session。
  7. 通过 WebSocket 创建绑定 `action-mcp-missing` 的 action session，manifest 引用不存在的 `missing_qa_server`；runtime 仍正常返回 `Mock assistant response: main chain is reachable.`。
  8. 在同类缺失 MCP action session 中触发 builtin `workspace.list`，确认该 session 仍可执行 builtin tool 并返回 workspace 列表。
  9. 退出 GUI app 后从终端直接启动 mock agent-server，再触发缺失 MCP action session，捕获到日志 `[agent-server] skipped MCP server missing_qa_server: Unknown MCP server: missing_qa_server`。
- **证据**：
  - 进程：GUI 验证时 `HandAgentDesktop` pid `37753`，agent-server pid `37758`，node 命令路径为 `/Users/mu9/proj/handAgent/.worktrees/action-plugin-mcp-qa/apps/agent-server/src/server.ts`。
  - PromptPanel UI：Computer Use 可见 `QA MCP Echo, /qa-mcp` 与 `QA MCP Missing, /qa-mcp-missing`。
  - Action MCP 成功 session：`~/.spotAgent/sessions/session-1779358014324-8nxgrv.json`，metadata 记录 `actionBinding: { pluginId: "action-mcp-qa", promptName: "echo", mcpServerIds: ["qa_echo"] }`；messages 记录 `tool_call(mcp.qa_echo.echo)`、tool result `QA_MCP_ECHO:hello from MockLLMClient` 与 final assistant `Mock MCP echo completed.`。
  - 普通 session 隔离：`~/.spotAgent/sessions/session-1779358069149-hd7435.json` 没有 `metadata.actionBinding`，events 记录 `Unknown tool: mcp.qa_echo.echo`。
  - 缺失 MCP server action：`~/.spotAgent/sessions/session-1779358114294-v25fcp.json`，metadata 记录 `mcpServerIds: ["missing_qa_server"]`，messages 正常写入 user 与 assistant，events 为空。
  - 缺失 MCP server 下 builtin tool：`~/.spotAgent/sessions/session-1779358505604-ffayxx.json`，metadata 同样记录 `mcpServerIds: ["missing_qa_server"]`，events 记录 `tool_call(workspace.list)` 与 success `tool_result`，messages 最终返回 `Mock workspace.list completed.`。
  - skip 日志：终端运行 agent-server 后，触发 `session-1779358229825-j0v3wz` 时 stdout/stderr 捕获到 `[agent-server] skipped MCP server missing_qa_server: Unknown MCP server: missing_qa_server`。
- **结论**：通过。Action Plugin trigger row 可见；action 提交会创建带 `actionBinding` 的新 session；绑定 session 可调用对应 MCP tool；普通 prompt session 不暴露该 MCP tool；缺失 MCP server 会记录 skip 日志且不会中断 builtin/runtime 主链路。
### ScreenCaptureKit 反向 IPC

- **验证日期**：2026-05-21
- **验证环境**：mock-llm / macOS 15+ / `/Users/mu9/proj/handAgent` main / `dist/HandAgentDesktop.app`
- **验证过程**：基线 `bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build` 均通过后，执行 `bash ./scripts/package-app.sh --mock-llm` 并启动 packaged app。通过原生 `System Events` 发送 `⌘⇧Space` 唤起 PromptPanel，提交 `[mock:screen-display] QA screen capture display 20260521`，在权限气泡点「仅本次」，确认 display 截图返回；再取 `HandAgent` 窗口 `CGWindowID=53770`，提交 `[mock:screen-window] QA screen capture window windowId=53770 20260521` 并确认指定窗口截图返回。最后通过 3 个并发 WebSocket 会话快速触发 display、`windowId=53770`、`windowId=53759` 三个 `screen.capture` 请求，自动回 `permission_response allow/once`，确认每个会话返回的 `target`、尺寸和 PNG 内容均与各自请求匹配。
- **证据**：display session `/Users/mu9/.spotAgent/sessions/session-1779363313924-j9ofjx.json` 的 tool message 可解析为 `target.kind=display`、`width=1440`、`height=932`、PNG 签名 `89504e470d0a1a0a`；window session `/Users/mu9/.spotAgent/sessions/session-1779363541298-e712y2.json` 可解析为 `target.kind=window`、`windowId=53770`、`width=920`、`height=640`、PNG 签名 `89504e470d0a1a0a`。并发隔离 session 分别为 `/Users/mu9/.spotAgent/sessions/session-1779364143545-duan3e.json`、`/Users/mu9/.spotAgent/sessions/session-1779364143545-qpnoib.json`、`/Users/mu9/.spotAgent/sessions/session-1779364143545-uyezz6.json`，三者 `permission_request.action=allow`、`tool_result.status=success`，并分别返回 display `1440x932`、window `53770` `920x640`、window `53759` `280x64`。
- **结论**：ScreenCaptureKit display/window 截图、PlatformBridge 连通性、以及并发 platform request 的 request 隔离均通过。本轮同时回归确认 `docs/bugs.md` 中 ScreenCaptureKit 权限分类修复项已不再复现，当前 bug 清单已移除该项。
### 修复：Accessibility window target 不能复用 window.list 返回的 TextEdit 窗口 id

- **验证日期**：2026-05-21
- **验证环境**：非 mock LLM / macOS 15+ / `/Users/mu9/proj/handAgent` main / `dist/HandAgentDesktop.app`
- **验证过程**：先用真实 provider 会话复现：`window.list` 返回 TextEdit 窗口 `未命名2.rtf`、`id=52648`，随后 `accessibility.snapshot({ "kind": "window", "windowId": 52648 })` 返回 `No accessibility window found for windowId 52648`。根因定位为 TextEdit AX window 不暴露私有 `AXWindowNumber`，而 provider 只按 `AXWindowNumber` 匹配 CG window id。修复后 cherry-pick commit `6fe9ef9` 到 main，执行 `bash ./scripts/swiftw test --filter MacPlatformProviderParsingTests`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build` 均通过；重新打包非 mock App 后再次让 LLM 调 `window.list`、`accessibility.snapshot({ "kind": "window", "windowId": 52648 })` 和 `accessibility.snapshot({ "kind": "window", "windowId": 999999999 })`。
- **证据**：复现 session 为 `/Users/mu9/.spotAgent/sessions/session-1779364564002-3wqf7g.json`。修复后回归 session 为 `/Users/mu9/.spotAgent/sessions/session-1779366519673-yu9crt.json`，其中 `windowId=52648` 的 `tool_result.status=success`，返回 `role=AXWindow`、`title=未命名2.rtf`、`children=9`，包含 `AXTextArea` 与文本 `HANDAGENT_ACCESSIBILITY_SET_VALUE_20260521`；`windowId=999999999` 的 `tool_result.status=error`，输出 `No app found for windowId 999999999`，未退回 focused window。
- **结论**：已修复。显式 window id 现在先按 `AXWindowNumber` 匹配，失败时用同 pid 的 CG window title/bounds 与 AX title/frame 做唯一保守 fallback；匹配不到仍返回 not found，不回退 focused window。
### 修复回归：状态气泡不会随 SessionWindow 失败状态更新

- **验证日期**：2026-05-21
- **验证环境**：mock-llm / macOS 15+ / `/Users/mu9/proj/handAgent` main / `dist/HandAgentDesktop.app`
- **验证过程**：使用 `bash ./scripts/package-app.sh --mock-llm` 打包启动，通过原生 `⌘⇧Space` 唤起 PromptPanel，提交 `[mock:llm-error] QA status bubble failed sync 20260521`。SessionWindow 显示失败状态与错误文案 `MockLLMClient forced failure for QA.`，随后关闭 SessionWindow 观察状态气泡。
- **证据**：UI 中 SessionWindow 标题区显示 `失败`，底部错误条显示 `MockLLMClient forced failure for QA.`；关闭窗口后 Computer Use 观察状态气泡为 `Idle / 点击开始`，没有停留在 `Running`。session 文件 `/Users/mu9/.spotAgent/sessions/session-1779366760527-69r8zw.json` 记录 error event `MockLLMClient forced failure for QA.`。
- **结论**：通过，旧问题不再复现。

### 修复回归：Tool message UI 展示实际结果

- **验证日期**：2026-05-21
- **验证环境**：mock-llm / macOS 15+ / `/Users/mu9/proj/handAgent` main / `dist/HandAgentDesktop.app`
- **验证过程**：提交 `[mock:workspace-list] QA tool bubble workspace result 20260521`，确认完成态 tool 气泡展示 workspace 列表；再提交 `[mock:path-escape] QA tool bubble path escape result 20260521`，在权限气泡点「仅本次」，确认完成态 tool 气泡展示实际错误结果。
- **证据**：workspace session `/Users/mu9/.spotAgent/sessions/session-1779366862582-mpi5cf.json` 的 tool message 内容包含 `default`、`tmp`、`qa-workspace`、`handagent-test`。path escape session `/Users/mu9/.spotAgent/sessions/session-1779366917099-8y1h9x.json` 的 tool message 与 `tool_result.output` 均为 `Path escapes workspace root: ../../etc/passwd`；UI 同步显示 `file.write: Path escapes workspace root: ../../etc/passwd`，未显示入参 JSON。
- **结论**：通过，旧问题不再复现。

### 修复回归：关闭 SessionWindow 后挂起权限请求立即取消

- **验证日期**：2026-05-21
- **验证环境**：mock-llm / macOS 15+ / `/Users/mu9/proj/handAgent` main / `dist/HandAgentDesktop.app`
- **验证过程**：提交 `[mock:permission-write] QA close pending permission regression 20260521`，等待 `file.write` 权限审批气泡出现，不点击授权/拒绝，直接关闭 SessionWindow。关闭后立即检查 session 文件，再等待 66 秒后复查。
- **证据**：关闭前 UI 显示 `授权调用 file.write`，参数为 `workspaceId: "qa-workspace"`、`relativePath: "permission-check.txt"`、`content: "permission scenario content"`。session 文件 `/Users/mu9/.spotAgent/sessions/session-1779367083904-eo4eri.json` 在关闭后即时与 66 秒后均保持 `messageCount: 1`，messages 只有 user message，events 为空。
- **结论**：通过，旧的 60 秒后 late permission/tool/final assistant 写回问题不再复现。
### Accessibility 平台能力

- **验证日期**：2026-05-21
- **验证环境**：mock-llm + 非 mock LLM / macOS 15+ / `/Users/mu9/proj/handAgent` main / `dist/HandAgentDesktop.app`
- **验证过程**：在允许 HandAgent 辅助功能权限后，保持 TextEdit 前台，分别触发 `[mock:accessibility-frontmost]` 和 `[mock:accessibility-set-frontmost]`，验证 frontmost snapshot 与 `set_value` 动作；修复 CG window id 与 AX window 映射后，用真实 provider 会话调用 `window.list`、`accessibility.snapshot({ "kind": "window", "windowId": 52648 })` 和不存在的 `windowId=999999999`，验证窗口目标和 not found 边界。随后按用户授权执行 `tccutil reset Accessibility com.yourname.HandAgentDesktop`，重启 App 并触发 `[mock:accessibility-frontmost]`，验证 `permission_denied`；最后在系统设置「隐私与安全性 → 辅助功能」重新打开 `HandAgentDesktop` 开关，重启 App 后再次触发 snapshot 验证权限恢复。
- **证据**：frontmost snapshot session `/Users/mu9/.spotAgent/sessions/session-1779364328843-mryubj.json` 返回 TextEdit AX 树，包含 `AXTextArea`、可读 value 和 `elementId`；action session `/Users/mu9/.spotAgent/sessions/session-1779364361967-p3vtsm.json` 成功把 TextEdit 内容改为 `HANDAGENT_ACCESSIBILITY_SET_VALUE_20260521`；window target session `/Users/mu9/.spotAgent/sessions/session-1779366519673-yu9crt.json` 中 `windowId=52648` 返回 `AXWindow`、`children=9`，`windowId=999999999` 返回错误且未退回 focused window；permission denied session `/Users/mu9/.spotAgent/sessions/session-1779367658334-jrtx2p.json` 的 `tool_result.status=error`，输出 `HandAgent 没有辅助功能权限。请打开「系统设置 → 隐私与安全性 → 辅助功能」，允许 HandAgent 后重试。`；恢复权限 session `/Users/mu9/.spotAgent/sessions/session-1779367767232-gh3ned.json` 再次返回 TextEdit `AXApplication` / `AXWindow` / `AXTextArea`。
- **结论**：通过。正向 snapshot、action、window target、not found 边界、未授权 `permission_denied` 文案和权限恢复后正向调用均符合预期。

### 标准 MCP 接入（P1）

- **验证日期**：2026-05-21
- **验证环境**：real LLM / OpenAI-compatible `gpt-5.2` / `dist/HandAgentDesktop.app` / `@modelcontextprotocol/server-filesystem` stdio MCP server
- **验证过程**：先执行 `bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`，三项均通过。随后在 `~/.spotAgent/mcp.json` 配置真实 `filesystem` stdio MCP server：`npx --yes @modelcontextprotocol/server-filesystem /tmp/handagent-mcp-real-qa`，通过标准 `.app` 启动 agent-server。用 PromptPanel 新建普通 session，提交“请使用可用的 MCP filesystem 工具列出 /tmp/handagent-mcp-real-qa 目录下的文件名，只回答文件名。”；UI 先展示 `mcp.filesystem.list_directory` 权限请求，真实 server 返回 `/tmp` 与 `/private/tmp` 规范路径差异后，LLM 继续调用 `mcp.filesystem.list_allowed_directories`，再用 `/private/tmp/handagent-mcp-real-qa` 调用 `mcp.filesystem.list_directory`，最终 assistant 回复 `alpha.txt`、`beta.txt`。再创建 QA Action Plugin `qa-missing-mcp`，绑定不存在的 `missing-mcp-server`，提交 action session 后仍成功调用 builtin `workspace.list`；前台 agent-server 取证输出 `[agent-server] skipped MCP server missing-mcp-server: Unknown MCP server: missing-mcp-server`。`MCPServerRegistry` 的 `prompts/list` 与 `resources/list` 由本轮基线中的 `apps/agent-server/tests/actions/MCPServerRegistry.test.ts` 与 `packages/core/tests/mcp/mcp-full-protocol.test.ts` 覆盖。
- **证据**：真实 MCP 进程：`npm exec @modelcontextprotocol/server-filesystem /tmp/handagent-mcp-real-qa`、`mcp-server-filesystem /tmp/handagent-mcp-real-qa`；QA 目录 `realpath /tmp/handagent-mcp-real-qa` 为 `/private/tmp/handagent-mcp-real-qa`，包含 `alpha.txt`、`beta.txt`。UI 可见 `授权调用 mcp.filesystem.list_directory`、`mcp.filesystem.list_allowed_directories`、最终回复 `alpha.txt beta.txt`。Session 文件 `~/.spotAgent/sessions/session-1779376873035-3o8x2p.json` 记录 `toolCalls`：`mcp.filesystem.list_directory`、`mcp.filesystem.list_allowed_directories`、`mcp.filesystem.list_directory`，最终 assistant 内容为 `alpha.txt\nbeta.txt`；同文件 events 记录对应 `permission_request`、`tool_call`、`tool_result`。网络日志 `~/.spotAgent/log/2026-05-21/network-005.jsonl` 的 request `tools` 列表包含 `mcp_filesystem_read_file`、`mcp_filesystem_list_directory`、`mcp_filesystem_list_allowed_directories` 等 MCP tools。缺失 MCP id 降级 UI 可见 `workspace.list` 返回工作区列表，前台 server 日志可见 `[agent-server] skipped MCP server missing-mcp-server: Unknown MCP server: missing-mcp-server`。
- **结论**：标准 MCP 接入 P1 通过。真实 stdio MCP server 能被拉起并完成 initialize / tools list / tool call；MCP tools 被注入普通 session 的 LLM 可用 tool 列表；tool result 能回灌并驱动后续 tool call 与最终回答；`MCPServerRegistry` prompts/resources 能力有自动化基线覆盖；缺失 MCP server id 会记录 skip 日志且不影响 builtin tools。

### Computer Use MCP 真实工具调用

- **验证日期**：2026-05-22
- **验证环境**：`main` 分支 `bb06b44`，`bash ./scripts/package-app.sh --mock-llm`，macOS 15.5 (24F74)，`~/.spotAgent/mcp.json` 注册 `computer_use` stdio server。
- **验证过程**：基线 `bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build` 均通过；启动 `dist/HandAgentDesktop.app` 后用 `Command+Shift+Space` 打开 PromptPanel，分别提交 `run [mock:computer-use-list-apps]` 与 `run [mock:computer-use-get-finder]`，均在权限气泡中选择“仅本次”。
- **证据**：`~/.spotAgent/sessions/session-1779390954501-12s3hk.json` 中 `mcp.computer_use.list_apps` 的 `tool_result.status: success`、`durationMs: 35`，无 `MCP stdio request timed out after 10000ms: tools/call`；`~/.spotAgent/sessions/session-1779391010292-bihy2f.json` 中 `mcp.computer_use.get_app_state { "app": "Finder" }` 的 `tool_result.status: success`、`durationMs: 1627`，返回 `bundleId: "com.apple.finder"`、`name: "访达"`、窗口截图元数据与 `AXApplication` accessibility tree。
- **修复结论**：Computer Use MCP 兼容层不再依赖 Codex 私有 `tools/call` 执行路径；`Finder` 英文别名会优先解析到 `com.apple.finder`，不会再被 `Keka Finder Integration` 抢先匹配。本次 mock App 已停止，未发现残留 HandAgentDesktop / agent-server 进程。

### MVP 主链路 mock-LLM 回归

- **验证日期**：2026-05-22
- **验证环境**：mock-llm / macOS 15+ / `/Users/mu9/proj/handAgent` main / `dist/HandAgentDesktop.app`
- **验证过程**：在 main 分支先通过 `bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build` 基线；随后用 `bash ./scripts/package-app.sh --mock-llm` 打包并启动 App。通过原生 `⌘⇧Space` 唤起 PromptPanel，提交 `[mock:workspace-list] QA_MAIN_CHAIN_TOOL_20260522_0330`，SessionWindow 打开并展示用户消息、`workspace.list` tool 输出和最终 `Mock workspace.list completed.`。再次从已有 SessionWindow 前台唤起 PromptPanel，提交 `[mock:assistant-ok] QA_MAIN_CHAIN_ASSISTANT_20260522_0332`，新 tab 展示普通 assistant 回复。最后提交 `[mock:slow-focus] QA_MAIN_CHAIN_STATUS_20260522_0335`，观察 Stop 按钮进入运行态，点击 Stop 后 UI 回到可发送状态。
- **证据**：agent-server 进程为桌面 App 派生的 `/opt/homebrew/bin/node --experimental-transform-types .../apps/agent-server/src/server.ts`，监听 `*:4317`。tool 链路 session `/Users/mu9/.spotAgent/sessions/session-1779391773599-hlq8vg.json` 中 `messageCount: 4`，包含 user、空 assistant、tool、最终 assistant，并记录 `tool_call workspace.list` 与 `tool_result status=success`。普通回复 session `/Users/mu9/.spotAgent/sessions/session-1779391865618-ubhjul.json` 中 `messageCount: 2`，assistant 内容为 `Mock assistant response: main chain is reachable.`。中断 session `/Users/mu9/.spotAgent/sessions/session-1779392104136-ttdxp6.json` 中 `messageCount: 1`，未落入慢响应 assistant 消息。
- **结论**：通过。PromptPanel → SessionWindow → agent-server → MockLLMClient → builtin tool 调用 → session 持久化 → UI 状态反馈主链路在本轮回归中可用。
