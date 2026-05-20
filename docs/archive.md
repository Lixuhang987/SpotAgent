# 已验证归档

本文记录经过实机 QA 验证通过的功能。每项保留验证日期、验证环境、验证过程与证据。

新条目从 [待验收.md](./待验收.md) 或 [manual-qa.md](./manual-qa.md) 验证通过后移入此处。

最后更新日期：2026-05-20。

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
