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
