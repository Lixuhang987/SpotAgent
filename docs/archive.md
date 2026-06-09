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

### 侧边栏 Workspace 分组

- **验证日期**：2026-05-22
- **验证环境**：mock-llm / macOS 15+ / `/Users/mu9/proj/handAgent` main / `dist/HandAgentDesktop.app`
- **验证过程**：在 `~/.spotAgent/workspaces.json` 包含 `tmp`、`qa-workspace`、`handagent-test` 三个非默认 workspace 时打开 SessionWindow，左侧侧边栏显示 workspace 折叠列表和下方“默认”分隔线；点击 `qa-workspace` 行后箭头展开，展开状态下点击行右侧 `+` 创建空会话且未触发折叠；在搜索框输入 `QA_MAIN_CHAIN` 后侧边栏平铺展示 3 条匹配会话且不显示 workspace 分组。随后临时把 `workspaces.json` 缩减为仅 default，重启 mock App 并提交 `[mock:assistant-ok] QA_SIDEBAR_DEFAULT_ONLY_20260522_0344`，侧边栏退化为平铺历史列表且不显示“默认”分隔线，验证后恢复原 workspace 配置。
- **证据**：`qa-workspace` 加号创建的 session `/Users/mu9/.spotAgent/sessions/session-1779392370625-pj79kd.json` 中 `metadata.workspaceId` 为 `qa-workspace`、`messageCount: 0`。default-only 回归 session `/Users/mu9/.spotAgent/sessions/session-1779392614813-khh13t.json` 展示普通 assistant 回复；验证后 `~/.spotAgent/workspaces.json` 已恢复为 4 个 workspace：`default`、`tmp`、`qa-workspace`、`handagent-test`。
- **结论**：通过。侧边栏 workspace 分组、折叠展开、workspace 内新建、默认旧会话分隔、搜索平铺和 default-only 退化均符合预期。

### agent-server 异常退出后的会话恢复

- **验证日期**：2026-05-22
- **验证环境**：mock-llm / macOS 15+ / `/Users/mu9/proj/handAgent` main / `dist/HandAgentDesktop.app`
- **验证过程**：在 SessionWindow 已打开并显示会话 `/Users/mu9/.spotAgent/sessions/session-1779392614813-khh13t.json` 时，手动 `kill -TERM` 当前监听 4317 的 agent-server 子进程 `77113`，保留 HandAgentDesktop 进程运行。约 2 秒后确认 agent-server 自动重启为新 PID `77697`，父进程仍为 HandAgentDesktop。随后在同一个已恢复 tab 内发送 `[mock:assistant-ok] QA_RECONNECT_FOLLOWUP_20260522_0350`。
- **证据**：重启后 `lsof -nP -iTCP:4317 -sTCP:LISTEN` 显示 `node 77697` 监听，`ps -o pid,ppid,command -p 77697` 显示父进程为 `77112 /Users/mu9/proj/handAgent/dist/HandAgentDesktop.app/Contents/MacOS/HandAgentDesktop`。SessionWindow 没有停留在重连提示，原会话内容仍可见，follow-up 成功显示在同一消息区。同一 session 文件 `session-1779392614813-khh13t.json` 中 `messageCount: 4`，包含重启前的 user/assistant 和重启后的 user/assistant 两轮消息。
- **结论**：通过。agent-server 子进程异常退出后会自动重启；SessionWindow socket 可重新连接并通过 `session_snapshot` 保持当前会话，恢复后仍能继续提交新消息并写回同一持久化文件。

### 运行中 agent-server 重启中断恢复回归（P1）

- **验证日期**：2026-05-22
- **验证环境**：mock-llm / macOS 15+ / `/Users/mu9/proj/handAgent` main `2b7ef57`
- **验证过程**：在 main 上先通过 `bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`；随后 `bash ./scripts/package-app.sh --mock-llm` 打包并启动 `dist/HandAgentDesktop.app`。通过原生 `⌘⇧Space` 唤起 PromptPanel，提交 `[mock:slow-focus] QA_RUNNING_SERVER_RESTART_FIXED_20260522_044757`。Computer Use 确认 SessionWindow 进入运行态且停止按钮可见后，终止 agent-server node PID `614`；desktop 自动拉起新 node PID `795`。恢复后 UI 消息区和错误条均显示 `本轮运行因 agent-server 重启而中断，请重新发送请求。`，composer 恢复可发送。
- **证据**：新进程 `node 795` 监听 `*:4317`，`ps -o pid,ppid,command -p 795` 显示父进程为 HandAgentDesktop PID `613`。session 文件 `/Users/mu9/.spotAgent/sessions/session-1779396542090-wvgrbv.json` 包含 2 条消息：user prompt 与 assistant 错误文案；`events[0]` 为 `{ type: "error", code: "run_lost_after_restart" }`。
- **结论**：通过。运行中 agent-server 重启不再只留下通用连接错误或空事件历史，UI 与持久化均能恢复为明确失败状态。

### FileSessionStore 同 session 并发写回归

- **验证日期**：2026-05-22
- **验证环境**：main 分支，命令行回归验证。
- **验证过程**：先执行 `pnpm exec vitest run packages/core/tests/storage/file-session-store.test.ts`，发现 Vitest 会同时匹配 `.worktrees/` 下旧 worktree 的同名测试，不能作为本条验收的精确证据；随后执行 `pnpm exec vitest run packages/core/tests/storage/file-session-store.test.ts --exclude '.worktrees/**'`，只运行主仓库 storage 测试文件。
- **证据**：第二次命令输出 `packages/core/tests/storage/file-session-store.test.ts (14 tests)`，`Test Files 1 passed (1)`，`Tests 14 passed (14)`；其中包含 `preserves concurrent appends to the same session`、`preserves concurrent event appends to the same session` 与不同 session 写入不互相阻塞的回归用例。
- **结论**：FileSessionStore 同一 session 并发写入 messages/events 的回归验证通过；该项已从 `docs/manual-qa.md` 移除。

### runtime 错误历史恢复回归

- **验证日期**：2026-05-22
- **验证环境**：mock-llm / macOS 15.5 (24F74) / `dist/HandAgentDesktop.app`
- **验证过程**：基线 `bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build` 通过后，使用 `bash ./scripts/package-app.sh --mock-llm` 打包并启动 App。通过原生快捷键打开 PromptPanel，提交 `[mock:unknown-tool] QA_UNKNOWN_TOOL_HISTORY_RECOVERY_20260522_055505`。实时 SessionWindow 消息区和底部错误条显示 `Unknown tool: mock.missing_tool`。关闭当前 tab 后从左侧历史重新打开同一 session，恢复后的消息区和底部错误条仍显示 `Unknown tool: mock.missing_tool`，没有显示 `本轮运行因 agent-server 重启而中断，请重新发送请求。`
- **证据**：会话文件 `/Users/mu9/.spotAgent/sessions/session-1779400526701-e3a0j3.json`。首次运行后 messages 只有 user，events 只有 `{ type: "error", message: "Unknown tool: mock.missing_tool" }`；历史恢复后 messages 为 user + assistant `Unknown tool: mock.missing_tool`，events 仍只有原始 error，`hasRunLost false`。进程证据：`HandAgentDesktop` pid 28118，agent-server `node` pid 28125 监听 TCP 4317。
- **结论**：通过。已持久化 runtime error 的历史恢复会保留原始错误原因，不再误报 `run_lost_after_restart`。

### 权限 / tool 等待态 running 状态回归

- **验证日期**：2026-05-22
- **验证环境**：mock-llm / macOS 15+ / main 分支，`dist/HandAgentDesktop.app`，agent-server 监听 `4317`。
- **验证过程**：通过 PromptPanel 提交 `[mock:workspace-ask] QA_PERMISSION_RUNNING_STATUS_20260522_063515`。权限审批面板 `授权调用 workspace.askUser` 可见时，SessionWindow 底部 composer 显示 `stop.fill` Stop 按钮，状态气泡显示 `Running`。点击 `仅本次` 后，workspace 选择面板可见时 composer 仍显示 Stop，状态气泡仍显示 `Running`。选择 `qa-workspace` 后最终显示 `Mock workspace.askUser completed.`，composer 恢复 disabled `arrow.up`。
- **证据**：session 文件 `/Users/mu9/.spotAgent/sessions/session-1779402948136-rnhamm.json` 包含 `workspace.askUser` tool call、tool result `{\"workspaceId\":\"qa-workspace\"}`、最终 assistant 消息 `Mock workspace.askUser completed.`，events 包含 `permission_request allow`、`tool_call workspace.askUser`、`tool_result success`。权限审批阶段截图：`/var/folders/m7/6b3swwk92mb0zthbzy5pfjvc0000gn/T/codex-shot-2026-05-22_06-36-07.png`；workspace 选择阶段截图：`/var/folders/m7/6b3swwk92mb0zthbzy5pfjvc0000gn/T/codex-shot-2026-05-22_06-36-55.png`。
- **结论**：通过。`assistant_message_end(completed)` 后续权限等待态和 workspace 选择等待态均保持 running，SessionWindow 与 StatusBubble 状态一致。

### Stop 中断 running mock session 状态反馈

- **验证日期**：2026-05-23
- **验证环境**：mock-llm / main / `dist/HandAgentDesktop.app` / `HandAgentRuntimeMode.json` 为 `{"llmMode":"mock"}`。
- **验证过程**：重新确认主仓库在 `main`，清空运行进程但不删除任何 `~/.spotAgent/sessions/` 文件；通过 `bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build` 后重新打包并启动 mock App。使用真实 `⌘⇧Space` 唤起 PromptPanel，通过 AX 写入并提交 `[mock:slow-focus] QA_STOP_RUNNING_SESSION_STATUS_20260523_0006`，确认 SessionWindow 创建新会话后，对底部 `help=停止` 按钮执行 `AXPress`。
- **证据**：App PID `70498`，agent-server PID `70499`，`node` 监听 `*:4317`；会话文件 `/Users/mu9/.spotAgent/sessions/session-1779466152190-n3343e.json` 包含用户消息和事件 `{ "type": "error", "code": "run_interrupted", "message": "本轮运行已中断。" }`；中断后 SessionWindow 底部按钮 help 列表从 `停止` 恢复为 `发送消息`；截图 `/private/tmp/handagent-stop-before.png` 与 `/private/tmp/handagent-stop-after.png` 已保存。
- **结论**：PromptPanel → SessionWindow → agent-server → mock LLM slow-focus → interrupt → 持久化 → SessionWindow 可发送态反馈链路通过。状态气泡 AX 仅暴露 `help=打开最近会话或输入面板`，本次不把气泡可读文本作为强证据。

### workspace.list mock tool 主链路

- **验证日期**：2026-05-23
- **验证环境**：mock-llm / main / `dist/HandAgentDesktop.app` / App PID `70498` / agent-server PID `70499` / `node` 监听 `*:4317`。
- **验证过程**：在同一个 mock App 中使用真实 `⌘⇧Space` 唤起 PromptPanel，通过 AX 确认 `window 1` 存在 `text field 1`，写入并提交 `[mock:workspace-list] QA_TOOL_WORKSPACE_LIST_20260523_0015`。提交后等待 SessionWindow 完成运行，再核对底部按钮和 session 持久化内容。
- **证据**：会话文件 `/Users/mu9/.spotAgent/sessions/session-1779466633012-tii05w.json` 的 `messages` 包含 user prompt、assistant `toolCalls[0].name = "workspace.list"`、tool message `name = "workspace.list"`、最终 assistant `Mock workspace.list completed.`；`events` 包含 `tool_call workspace.list` 与 `tool_result success`，`durationMs = 2`；SessionWindow 底部按钮 help 列表为 `新会话, 搜索会话, 新标签页, 添加附件, 语音输入（即将推出）, 发送消息, 设置`。
- **结论**：PromptPanel → SessionWindow → agent-server → mock LLM → `workspace.list` tool 调用 → tool result 回灌 → 持久化 → UI 可发送态反馈链路通过。状态气泡 AX 仍只暴露 `help=打开最近会话或输入面板`，不能作为运行/空闲文本状态的强证据。

### AgentCore 消息输出回归

- **验证日期**：2026-05-24
- **验证环境**：mock-llm / macOS 15+ / `dist/HandAgentDesktop.app` / `HandAgentDesktop` pid `14538` / `agent-server` pid `14547` 监听 `*:4317`
- **验证过程**：在 `main` 执行 `bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build` 均通过；随后执行 `bash ./scripts/package-app.sh --mock-llm` 并打开 App。通过 `⌘⇧Space` 打开 PromptPanel，提交 `please [mock:file-write] QA_AGENTCORE_MESSAGES_ONLY_20260524_031518`。SessionWindow 先显示 `file.write` 权限气泡，选择“仅本次”后显示 `file.write` tool result 和最终 assistant 文案 `Mock file.write completed for hello.txt.`。
- **证据**：`dist/HandAgentDesktop.app/Contents/Resources/HandAgentRuntimeMode.json` 内容为 `{\"llmMode\":\"mock\"}`；`~/.spotAgent/sessions/session-1779563829474-y58j9v.json` 包含 user、assistant tool call、`file.write` tool message、最终 assistant 共 4 条 messages，并包含 `permission_request`、`tool_call`、`tool_result` events；`~/.spotAgent/qa-workspace/hello.txt` 内容为 `hello from MockLLMClient`。
- **结论**：通过。持久化只依赖 `messages` / `events` 等会话数据，不依赖 runtime 额外 UI 气泡字段。

### 已修复：mock file-write 回归返回 Unknown tool

- **修复日期**：2026-05-24
- **严重级别**：P1
- **根因**：引入懒加载工具激活后，普通未激活 session 默认只暴露 `use_tools`；mock LLM 固定场景会首轮直接返回 `file.write` tool call，导致 `AgentRuntime` 在 `ToolRegistry.get(\"file.write\")` 阶段抛出 `Unknown tool: file.write`。
- **修复内容**：`SessionScopedToolRegistry` 增加 `exposeBuiltinToolsBeforeActivation`，`startDefaultServer` 仅在 `HANDAGENT_LLM_MODE=mock` 时开启；mock 未激活 session 额外暴露 `use_tools + builtin tools`，但不标记为已激活、不提前加载 MCP，真实 settings 模式懒加载语义不变。
- **自动化验证**：`pnpm exec vitest run apps/agent-server/tests/session/SessionScopedToolRegistry.test.ts` 通过并覆盖 `[mock:file-write]` 跑通及 global MCP 不提前加载；`bash ./scripts/test.sh` 通过，50 个测试文件通过、1 个 integration 跳过；`bash ./scripts/swiftw test` 与 `bash ./scripts/swiftw build` 均通过。
- **实机回归证据**：`~/.spotAgent/sessions/session-1779563829474-y58j9v.json` 中 `file.write` tool result 为 `{\"workspaceId\":\"qa-workspace\",\"relativePath\":\"hello.txt\",\"bytesWritten\":24}`，最终 assistant 为 `Mock file.write completed for hello.txt.`；UI 未再出现 `Unknown tool: file.write`。
- **结论**：已修复并通过 mock App 实机回归。

### ActionDefinition 统一模型回归

- **验证日期**：2026-05-24
- **验证环境**：mock-llm / macOS 15+ / `dist/HandAgentDesktop.app` / `HandAgentDesktop` pid `19378` / `agent-server` pid `19380` 监听 `*:4317`
- **验证过程**：在 `~/.spotAgent/plugins/qa-action-definition/plugin.json` 写入 `kind: \"skill\"` 的 `weather` action 和 `kind: \"plugin\"` 的 `r` action。打开 PromptPanel 后可见 `Weather, weather` 与 `Review, r` 两个 Action rows。提交 `weather` 后创建 `查询当前天气` session；提交 `r [code: let x = 1] [focus: race conditions]` 后创建 `Review code:` session；提交 `r foo bar` 后 PromptPanel 保留草稿并显示 `缺少必填参数：code`。在 UserDefaults 中为 `weather` 写入 F13、为 `r` 写入 F14 后重启 App，Settings → 快捷键 → Action 快捷键显示 `Weather F13` 与 `Review F14`；F13 直接创建普通 prompt session，F14 打开 PromptPanel 并预填 `r [code: ] [focus: ]`，未提交空参数。
- **证据**：`~/.spotAgent/sessions/session-1779564440188-byk5de.json` 的 metadata 无 `actionBinding`，user content 为 `查询当前天气`；`~/.spotAgent/sessions/session-1779564547557-g3jq93.json` 的 metadata 写入 `{ \"pluginId\": \"qa-action-definition\", \"promptName\": \"review\", \"mcpServerIds\": [\"qa_missing_mcp\"] }`；F13 触发后新增 `~/.spotAgent/sessions/session-1779564925160-xnvgo6.json`，metadata 无 `actionBinding`；F14 触发前后最新 session 文件未变化，Computer Use 观察到 PromptPanel 输入框值为 `r [code: ] [focus: ]`。
- **结论**：通过。ActionDefinition 的 skill/plugin 统一模型、命名参数解析、缺参拦截、session metadata 写入和 Action 全局快捷键行为符合预期。

### Settings Plugin / Append Prompt / MCP 管理页（P1）

- **验证日期**：2026-05-24
- **验证环境**：mock-llm / `dist/HandAgentDesktop.app` / macOS 15+ / main `780a43f`
- **验证过程**：
  - 在 `/Users/mu9/proj/handAgent` 的 `main` 上执行 `bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`，三项均通过。
  - 使用 `bash ./scripts/package-app.sh --mock-llm` 打包并启动桌面 App，确认 bundle marker 为 `{"llmMode":"mock"}`，agent-server 进程为 `/Users/mu9/proj/handAgent/apps/agent-server/src/server.ts`，4317 端口监听正常。
  - Settings 顶部八个 tab 可见且不重叠：模型、工具、Plugin、追加、MCP、权限、快捷键、工作区。
  - Plugin 页点击“添加示例”后出现 `Example Review`；`~/.spotAgent/plugins/example-review/plugin.json` 可解析，prompt 为 `kind: "plugin"`、`trigger: "review"`，manifest `mcpServerIds: ["filesystem"]`；启用开关可写回 `enabled: false`，再切回 `enabled: true`。
  - 追加页点击“添加示例”后出现 `Explain Code` 与 `Summarize Text`；`~/.spotAgent/plugins/append-prompts/plugin.json` 可解析，两个 prompt 均为 `kind: "skill"`。提交 `explain [code: let x = 1]` 后创建普通 session `~/.spotAgent/sessions/session-1779565670291-o3gl1x.json`，metadata 无 `actionBinding`。
  - MCP 页点击“添加示例”后出现 `Filesystem` 与 `Computer Use`；`~/.spotAgent/mcp.json` 可解析，两个 server 均为 `transport: "stdio"`，`computer_use.elicitation.autoAcceptEmptyForm: true`。
  - 为闭环 filesystem MCP 权限气泡，先补充并合入 mock 场景 `[mock:mcp-filesystem-read]`（commit `780a43f`），再创建 QA 专用 plugin action `~/.spotAgent/plugins/qa-mcp-filesystem-read/plugin.json`，绑定 `mcpServerIds: ["filesystem"]`，trigger 为 `mcpfs`，模板内包含 `[mock:mcp-filesystem-read]`。重启桌面 App 后提交 `mcpfs [path: /tmp/handagent-mcp-example/hello.txt]`，SessionWindow 出现权限气泡“授权调用 mcp.filesystem.read_file”，参数为 `{ "path": "/tmp/handagent-mcp-example/hello.txt" }`。点击“仅本次”后 runtime 继续执行并写入 tool result 与最终 assistant 文本。
  - 错误表单路径已实机验证：Plugin 缺少 Trigger 显示“标题、Trigger 和 Template 不能为空”；追加页缺少 Template 显示同一错误；MCP stdio 缺少 Command 显示“标题和 Command 不能为空”；MCP HTTP 缺少 URL 显示“标题和 URL 不能为空”。上述错误均保留表单，且未写入临时项 `qa-plugin-missing-trigger`、`qa-append-missing-template`、`qa-mcp-missing-command`、`qa-mcp-missing-url`。
- **证据**：
  - `~/.spotAgent/mcp.json`：包含 `filesystem` 与 `computer_use` 两个 stdio server，`computer_use.elicitation.autoAcceptEmptyForm: true`。
  - `~/.spotAgent/plugins/example-review/plugin.json`、`~/.spotAgent/plugins/append-prompts/plugin.json`、`~/.spotAgent/plugins/qa-mcp-filesystem-read/plugin.json` 均可 JSON 解析。
  - `~/.spotAgent/sessions/session-1779565670291-o3gl1x.json`：append prompt 普通 session，metadata 无 `actionBinding`。
  - `~/.spotAgent/sessions/session-1779568071596-bbtt3l.json`：metadata `actionBinding.pluginId = "qa-mcp-filesystem-read"`、`promptName = "read"`、`mcpServerIds = ["filesystem"]`；messages 包含 `tool` message `name = "mcp.filesystem.read_file"`；events 包含 `permission_request`、`tool_call`、`tool_result`，toolName 均为 `mcp.filesystem.read_file`。
- **结论**：Settings Plugin / Append Prompt / MCP 管理页条目通过实机 QA，已从 `docs/manual-qa.md` 移除。
### 删除 running session 回归（P1）

- **验证日期**：2026-05-24
- **验证环境**：mock-llm / macOS；主仓库 `/Users/mu9/proj/handAgent`，分支 `main`；`dist/HandAgentDesktop.app/Contents/Resources/HandAgentRuntimeMode.json` 为 `{"llmMode":"mock"}`。
- **验证过程**：通过 PromptPanel 提交 `[mock:slow-focus] QA_DELETE_RUNNING_SESSION_TIMEOUT_20260524_043305`，生成 running 会话 `session-1779568466925-l2g7yi`；SessionWindow 底部出现停止按钮 `stop.fill`，会话文件最初仅包含 user message。随后在左侧历史列表对同一 session 执行删除，确认删除弹窗后窗口返回其他会话，目标 tab 不再打开，未卡在 running 或等待删除状态。
- **证据**：目标文件 `~/.spotAgent/sessions/session-1779568466925-l2g7yi.json` 已不存在；`rg -n "QA_DELETE_RUNNING_SESSION_TIMEOUT_20260524_043305|session-1779568466925-l2g7yi" ~/.spotAgent/sessions -g '*.json'` 无命中；历史侧栏仍可见的 `QA_DELETE_RUNNING_SESSION_TIM...` 是 2026-05-22 旧 QA 会话，不是本次 session。删除后 `HandAgentDesktop` 与 `agent-server` 仍运行，`lsof -nP -iTCP:4317 -sTCP:LISTEN` 显示 `node` 继续监听 `*:4317`。

### agent-server 源码目录重构 smoke

- **验证日期**：2026-06-06
- **验证环境**：mock-llm / `dist/HandAgentDesktop.app` / `main` 分支 / macOS 15+
- **验证过程**：先在 `main` 重新通过 `bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`，再用 `bash ./scripts/package-app.sh --mock-llm` 打包启动。通过原生全局快捷键打开 PromptPanel，提交 `QA smoke after fix [mock:assistant-ok] 2026-06-06`，SessionWindow 正常显示 `Mock assistant response: main chain is reachable.`。随后在同一 session 提交 `QA workspace ask after fix [mock:workspace-ask] 2026-06-06`，UI 出现 `workspace.askUser` 授权气泡；选择“仅本次”后出现 workspace 选择气泡，选择 `qa-workspace` 后 UI 显示 `Mock workspace.askUser completed.`。
- **证据**：`HandAgentRuntimeMode.json` 内容为 `{"llmMode":"mock"}`；`ps -o pid,ppid,command -p 11940` 显示 agent-server 命令路径为 `/Users/mu9/proj/handAgent/apps/agent-server/src/server/server.ts`；`~/.spotAgent/sessions/session-1780741750422-gycv3b.json` 记录 user / assistant、`workspace.askUser` tool call、`{"workspaceId":"qa-workspace"}` tool result、最终 assistant 回复，以及 `permission_request` / `tool_call` / `tool_result` 事件。QA 后已退出 `HandAgentDesktop`，`lsof -nP -iTCP:4317` 无监听进程残留。
- **结论**：通过。desktop 可从当前源码目录派生 agent-server，普通 prompt、同 session workspace 回流、session 持久化与清理状态均符合预期。

### AgentRuntime 循环次数命名回归

- **验证日期**：2026-06-06
- **验证环境**：mock-llm / `dist/HandAgentDesktop.app` / `main` 分支 / macOS 15+
- **验证过程**：复用 `session-1780741750422-gycv3b` 实机链路，在同一 session 第二轮提交 `QA workspace ask after fix [mock:workspace-ask] 2026-06-06`，完成一次用户输入内的 assistant tool call、`workspace.askUser` 工具执行、tool result 回灌与最终 assistant 回复。随后运行 `pnpm vitest run --exclude '.worktrees/**' packages/core/tests/runtime/agent-runtime.test.ts apps/agent-server/tests/session/SessionRuntimeOrchestrator.test.ts`，确认 runtime 循环、session history、turn 事件和 summary 等相关回归测试通过。
- **证据**：`~/.spotAgent/sessions/session-1780741750422-gycv3b.json` 中第二轮 user message 后仅作为一次运行完成：assistant tool call `mock-workspace-ask-1`、tool result `{"workspaceId":"qa-workspace"}`、最终 assistant `Mock workspace.askUser completed.` 均落在同一 session；定向测试结果为 2 个 test files、28 tests 全部通过；`rg -n "maxTurns|AgentRuntime exceeded maxTimes" packages apps docs -g '!docs/archive.md' -g '!.worktrees/**'` 只命中 runtime 实现与对应测试，未发现 `maxTurns` 残留。
- **结论**：通过。一次用户输入内的多轮 LLM/tool 循环仍按产品语义归为一个 turn，runtime 上限错误文案为 `AgentRuntime exceeded maxTimes: <n>`。

### 已修复：SessionWindow 多轮普通 assistant 消息渲染顺序错误

- **验证日期**：2026-06-06
- **验证环境**：mock-llm / `dist/HandAgentDesktop.app` / `main` 分支 / macOS 15+
- **缺陷现象**：同一 session 连续两轮 `[mock:assistant-ok]` 后，实时 UI 曾把两条 assistant 文本拼接到同一个左侧文本块，并把第二条 assistant 显示在第二条 user 之前。
- **修复内容**：`apps/agent-server/src/protocol/MessageTranslator.ts` 将 `assistant_delta.itemId` 从 `${sessionId}-${event.messageId}` 改为 `${sessionId}-${turnId}-${event.messageId}`。原因是 `AgentRuntime` 的 assistant `messageId` 只在单次 run 内递增，后续 turn 会重新出现 `assistant-1`；拼入 `turnId` 后 desktop `ForEach(messages)` 的 identity 跨轮唯一。
- **验证过程**：在 main 上执行 `bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build` 均通过；重新 `bash ./scripts/package-app.sh --mock-llm` 并启动 App，提交 `QA order fix first [mock:assistant-ok] ORDER_FIX_A_20260606`，随后同 tab 提交 `QA order fix second [mock:assistant-ok] ORDER_FIX_B_20260606`。
- **证据**：Computer Use 观察到 UI 顺序为第一条 user、第一条 assistant、第二条 user、第二条 assistant；`~/.spotAgent/sessions/session-1780744892022-0l1uzs.json` 中 `messages` 为 4 条，顺序同上，`events: []`；`lsof -nP -iTCP:4317` 显示仍只有 platform bridge 与共享 session connection 两条 established 连接。
- **结论**：通过。已从 `docs/bugs.md` 当前 bug 中移除。

### 单连接 session 路由 smoke（P2）

- **验证日期**：2026-06-06
- **验证环境**：mock-llm / `dist/HandAgentDesktop.app` / `main` 分支 / macOS 15+
- **验证过程**：
  - 在 main 上通过 `bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`，再执行 `bash ./scripts/package-app.sh --mock-llm` 并启动 `dist/HandAgentDesktop.app`。
  - 使用原生全局快捷键打开 PromptPanel，创建 B 会话 `session-1780744892022-0l1uzs`，连续提交 `QA order fix first [mock:assistant-ok] ORDER_FIX_A_20260606` 与 `QA order fix second [mock:assistant-ok] ORDER_FIX_B_20260606`。UI 按 user/assistant/user/assistant 顺序展示。
  - 创建 A 会话 `session-1780745046557-gwvvup`，提交 `QA route fix A workspace [mock:workspace-ask] ROUTE_FIX_A_TOOL_20260606`。`workspace.askUser` 授权面板和 workspace 选择面板只出现在 A tab；选择 `qa-workspace` 后 A 显示 `Mock workspace.askUser completed.`。
  - 关闭 A tab 后 B 自动成为 active，并继续提交 `QA route fix B after close [mock:assistant-ok] ROUTE_FIX_B_AFTER_CLOSE_20260606` 成功。
  - 从左侧历史重新打开 A，snapshot 恢复出 `{"workspaceId":"qa-workspace"}` 与最终 assistant。随后 kill agent-server PID `36405`，App 自动拉起新 PID `39289`，两个已打开 tab 重新建立共享连接；A 在重启后继续提交 `QA route fix A after restart [mock:assistant-ok] ROUTE_FIX_A_AFTER_RESTART_20260606` 成功。
- **证据**：
  - `lsof -nP -iTCP:4317` 在多 tab、关闭/重开 tab、agent-server 重启前后均显示 desktop 到 4317 只有两条 established 连接：platform bridge 与共享 session connection。
  - `~/.spotAgent/sessions/session-1780745046557-gwvvup.json`：包含 A 的 workspace tool call、tool result `{"workspaceId":"qa-workspace"}`、最终 assistant，以及重启后的普通 follow-up；events 仅包含 A 的 `permission_request` / `tool_call` / `tool_result`。
  - `~/.spotAgent/sessions/session-1780744892022-0l1uzs.json`：包含 B 的三轮普通 user/assistant 消息，`events: []`，未混入 A 的 tool 或 workspace 事件。
  - QA 结束后已退出 `HandAgentDesktop`；`pgrep -lf HandAgentDesktop`、`pgrep -lf server.ts` 均无输出，`lsof -nP -iTCP:4317` 无监听或连接残留。
- **结论**：通过。单个 SessionWindow 的多 tab 复用共享 session connection；session event / permission / workspace ask 均按 `sessionId` 路由；关闭、历史恢复与 agent-server 重启后重订阅均符合预期。

### 已修复：Anthropic provider 未使用 settings baseUrl 且不能使用 ANTHROPIC_AUTH_TOKEN

- **验证日期**：2026-06-06
- **验证环境**：真实 LLM 配置检查 + 单元测试 / `main` 分支 / macOS 15+
- **缺陷现象**：Anthropic provider 分支没有把 settings 中的 `llm.baseUrl` 传给 `@ai-sdk/anthropic`，且 settings 未配置 `apiKey` 时不会使用当前环境可用的 Bearer token `ANTHROPIC_AUTH_TOKEN`，导致 Anthropic-compatible 网关无法按 settings 配置走真实 QA。
- **修复内容**：`packages/core/src/llm/LLMClientFactory.ts` 在 Anthropic 分支透传 `baseURL: settings.baseUrl`；认证优先使用 settings `apiKey`，缺失时使用 `ANTHROPIC_AUTH_TOKEN` 作为 `authToken`。同时补充 `packages/core/tests/llm/llm-client-factory.test.ts` 覆盖 baseUrl、apiKey 优先级和 authToken fallback，并同步 `packages/core/src/llm/llm.md`。
- **验证过程**：在 main cherry-pick 修复提交 `283e7cc` 后运行 `pnpm vitest run --exclude '.worktrees/**' packages/core/tests/llm/llm-client-factory.test.ts`、`bash ./scripts/test.sh`、`bash ./scripts/swiftw build` 均通过；`curl ${ANTHROPIC_BASE_URL}/v1/models` 使用 `Authorization: Bearer ${ANTHROPIC_AUTH_TOKEN}` 返回 HTTP 200，并列出 Anthropic-compatible 模型。
- **结论**：已修复并从 `docs/bugs.md` 当前 bug 中移除。后续真实 Anthropic QA 的当前阻塞点已转为 `AISDKStreamingClient.stream()` 对 provider 错误流/空流的处理缺口。

### 已修复：Anthropic AI SDK provider 错误流被落成空 assistant

- **验证日期**：2026-06-06
- **验证环境**：真实 LLM / `dist/HandAgentDesktop.app` / Anthropic provider / `main` 分支 / macOS 15+
- **缺陷现象**：Anthropic provider 遇到 AI SDK `fullStream` error 或空流时，`AISDKStreamingClient.stream()` 会无条件 yield 空 `message_end`，导致 UI idle、无错误 banner，session 写入 `{"role":"assistant","content":""}` 且 `events: []`。
- **修复内容**：`packages/core/src/llm/LLMClientFactory.ts` 的 `AISDKStreamingClient.stream()` 处理 `error` part 并抛出 provider error；流结束时若没有 assistant content 且没有 tool call，则抛出 `AI SDK stream finished without assistant content or tool calls.`。同时补充 `packages/core/tests/llm/llm-client-factory.test.ts` 两个回归测试，并同步 `packages/core/src/llm/llm.md`。
- **验证过程**：子 agent 在 `.worktrees/anthropic-stream-errors` 先跑 RED，两个新增测试失败为 `2 failed | 7 passed`，复现空 assistant；修复后 main 提交 `5c35c4e`。主仓库通过 `pnpm vitest run --exclude '.worktrees/**' packages/core/tests/llm/llm-client-factory.test.ts`、`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`。直接 Node 调 Anthropic stream 时不再输出空 `message_end`，而是抛出 TLS failure。真实 App 回归提交 `Use plain text only. Reply exactly: ANTHROPIC_QA_TEXT_AFTER_FIX_20260606` 后 UI 显示红色错误，`~/.spotAgent/sessions/session-1780747297335-f414w0.json` 只包含 user message 与 `error` event，没有空 assistant。
- **结论**：已修复并从 `docs/bugs.md` 当前 bug 中移除。Anthropic Provider 真实调用条目仍受当前 anyrouter endpoint 对 Node/AI SDK streaming TLS 握手失败阻塞，尚未归档为通过。

### agent-server thread 主链路 smoke（P2）

- **验证日期**：2026-06-09
- **验证环境**：mock-llm packaged app / macOS 15.5 / 主仓库 `main`
- **验证过程**：执行 QA 前置基线 `bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build` 均通过；执行 `bash ./scripts/package-app.sh --mock-llm` 后从 `dist/HandAgentDesktop.app` 启动。desktop 成功派生单个 agent-server 子进程，`127.0.0.1:4317` 由该 node 进程监听。通过原生 `System Events` 注入 `Command+Shift+Space` 打开 PromptPanel，提交 `HANDAGENT_MAIN_SMOKE_QA_20260609_A` 后打开 WKWebView ThreadWindow，并显示明确 mock trigger 错误气泡。随后在同一 thread 发送 `[mock:assistant-ok] HANDAGENT_MAIN_SMOKE_QA_20260609_B`，收到 `Mock assistant response: main chain is reachable.`。再发送 `[mock:clipboard-read] HANDAGENT_PLATFORM_TOOL_QA_20260609`，ThreadWindow 内联显示 `clipboard.read` 权限请求；允许后工具结果显示剪贴板 QA 标记，并收到 `Mock clipboard.read completed.`。
- **证据**：`ps -o pid,ppid,command -p 69618` 显示 agent-server 命令为 `/opt/homebrew/bin/node --experimental-transform-types --experimental-specifier-resolution=node /Users/mu9/proj/handAgent/apps/agent-server/src/server/server.ts`，PPID 为 HandAgentDesktop PID 69617；`lsof -nP -iTCP:4317` 显示 PID 69618 监听 `127.0.0.1:4317`，且 HandAgentDesktop 与 WebView 连接均为 established；持久化文件 `~/.spotAgent/threads/thread-1780941209291-dcrrv4.json` 包含本轮 user、assistant、`clipboard.read` tool result 和 `Mock clipboard.read completed.` assistant 消息。

### ThreadWindow WebView + split WebSocket smoke（P2）

- **验证日期**：2026-06-09
- **验证环境**：mock-llm packaged app / macOS 15.5 / 主仓库 `main`
- **验证过程**：通过 `dist/HandAgentDesktop.app` 启动默认 WKWebView 路径；`open` 后 desktop 派生 agent-server，`127.0.0.1:4317` 正常监听。用 PromptPanel 提交 `HANDAGENT_MAIN_SMOKE_QA_20260609_A` 后打开 WKWebView ThreadWindow，React 显示新 tab 和 user message。浏览器直接打开 `http://127.0.0.1:4317/thread-window/index.html` 后页面不白屏，标题为 `HandAgent ThreadWindow`，历史侧栏显示 workspace 分组和默认对话；console 仅有 `favicon.ico` 404，没有 `AccordionItem must be used within Accordion`。在同一 thread 继续提交 `[mock:assistant-ok] HANDAGENT_MAIN_SMOKE_QA_20260609_B`，消息进入同一 thread 并收到 mock assistant 回复。浏览器历史列表可恢复该 thread，右侧收到 snapshot 并渲染 user / assistant / tool 消息；点击删除图标会出现 `Delete thread` 确认弹窗，点击取消后未删除。提交 `[mock:clipboard-read] HANDAGENT_PLATFORM_TOOL_QA_20260609` 后当前 thread 内联显示 `clipboard.read` 权限请求；允许后显示 tool result 和 `Mock clipboard.read completed.`。暂停 Swift desktop 进程后，从浏览器 thread socket 提交 `[mock:clipboard-read] HANDAGENT_PLATFORM_OFFLINE_QA_20260609`，ThreadWindow 仍保持连接并显示 `Platform bridge call timed out after 15000ms (method: clipboard.read)`，随后恢复 Swift 进程。
- **证据**：`lsof -nP -iTCP:4317` 显示 HandAgentDesktop 与浏览器分别通过独立连接连到 agent-server，其中 HandAgentDesktop 连接对应 `/api/platform`，浏览器连接对应 `/api/thread`；暂停期间 `ps -o pid,ppid,stat,command -p 71680,71684` 显示 Swift app 为 `T`，agent-server PID 71684 仍为 `S` 且继续监听；持久化文件 `~/.spotAgent/threads/thread-1780941209291-dcrrv4.json` 包含 `[mock:clipboard-read] HANDAGENT_PLATFORM_OFFLINE_QA_20260609`、`clipboard.read` timeout tool result 和最终 assistant 消息。

### PromptPanel initial prompt bridge smoke（P2）

- **验证日期**：2026-06-09
- **验证环境**：mock-llm packaged app / macOS 15.5 / 主仓库 `main`
- **验证过程**：通过原生 `System Events` 注入 `Command+Shift+Space` 打开 PromptPanel，输入 `PROMPTPANEL_INITIAL_PROMPT_QA_20260608_A [mock:assistant-ok]` 后按 Return，ThreadWindow 打开后直接创建新 tab，显示该 user message 和 mock assistant 回复，不停留在空白准备状态。再次通过全局快捷键打开 PromptPanel，输入 `PROMPTPANEL_INITIAL_PROMPT_QA_20260608_B [mock:assistant-ok]` 后按 Return，复用同一个 ThreadWindow，但顶部出现第二个 tab，当前 tab 显示第二条 user message，而不是写入第一个 active tab 的 composer thread。
- **证据**：`System Events` 查询提交后窗口为 `2, , HandAgent`；Computer Use 观察到 ThreadWindow URL 为 `127.0.0.1:4317/thread-window/index.html`，第二次提交后 Thread workspace 中有两个 `thread-1` tab。持久化文件 `~/.spotAgent/threads/thread-1780941623118-ay6u1b.json` 包含首条 `PROMPTPANEL_INITIAL_PROMPT_QA_20260608_A [mock:assistant-ok]`，`~/.spotAgent/threads/thread-1780941669169-3tp6jt.json` 包含首条 `PROMPTPANEL_INITIAL_PROMPT_QA_20260608_B [mock:assistant-ok]`；两个文件均包含 `Mock assistant response: main chain is reachable.`。
### Thread 历史路径与状态气泡 smoke（P2）

- **验证日期**：2026-06-09
- **验证环境**：mock-llm packaged app，默认 WKWebView 路径，macOS 15+
- **验证过程**：使用 `bash ./scripts/package-app.sh --mock-llm` 打包并 `open dist/HandAgentDesktop.app` 启动；通过全局快捷键打开 PromptPanel，提交 `STATUS_BUBBLE_ACTIVITY_FIX_QA_20260609 [mock:slow-focus]`。运行中确认新 thread 写入 `~/.spotAgent/threads/thread-1780944091160-4qjzbd.json`，近 30 分钟旧 `~/.spotAgent/sessions/` 无新增文件；`/api/activity` snapshot 返回 `status: "running"`、`latestSummary: "正在回复"`、`activeThreadId: "thread-1780944091160-4qjzbd"`；Swift StatusBubble 截图显示 `Running / 正在回复`。点击状态气泡后未打开 PromptPanel，焦点回到当前 HandAgent ThreadWindow，Computer Use 可见当前 thread 仍显示该 slow-focus prompt。随后点击 Stop 停止 slow turn。
- **证据**：`/tmp/handagent-qa/status-bubble-activity-fixed.png`；`~/.spotAgent/threads/thread-1780944091160-4qjzbd.json`；Computer Use 观察到 ThreadWindow 中 Stop 按钮与点击后焦点回到 ThreadWindow；`lsof -nP -iTCP:4317 -sTCP:LISTEN` 显示 agent-server 监听。
- **结论**：通过。当前历史主路径是 `~/.spotAgent/threads/`；默认路径 Swift StatusBubble 能展示 running 摘要并回跳当前活跃 ThreadWindow。

### PromptPanel 输入框视觉与拖动 smoke（P2）

- **验证日期**：2026-06-09
- **验证环境**：mock-llm packaged app，默认 WKWebView 路径，macOS 15+
- **验证过程**：先关闭 ThreadWindow 并激活 Finder，再通过原生全局快捷键 `Command+Shift+Space` 打开 PromptPanel。Computer Use 观察到输入框自动聚焦，首行左侧无独立图标、无独立输入框卡片或边框；单行输入占满设置按钮左侧剩余空间。使用 CoreGraphics 鼠标事件从 placeholder 右侧空白区域拖动，窗口位置从 `400,147` 移到 `490,192`。通过 Shift+Return 输入多行，输入区域增高到 5 行；通过 accessibility 设置 6 行文本后出现垂直滚动条，布局不继续撑高。普通 Return 提交后 PromptPanel 关闭并打开 ThreadWindow。点击面板外侧、按 Esc、再次按全局快捷键均能关闭面板，前台 App 保持/恢复为 Finder。切换 macOS 深色模式后再次打开 PromptPanel，输入文字和 placeholder 仍保持深色高对比，随后恢复系统外观。
- **证据**：Computer Use 观察 PromptPanel 输入框 focused；`System Events` 前台 App 查询为 `Finder`；`System Events` 窗口位置从 `400,147` 变为 `490,192`；6 行文本状态下 accessibility tree 显示输入 scroll area 出现 scroll bar。
- **结论**：通过。PromptPanel 输入框视觉、拖动、自动增高、提交与焦点恢复符合预期。

### 全前端 DESIGN.md 视觉一致性 smoke（P2）

- **验证日期**：2026-06-09
- **验证环境**：mock-llm packaged app，默认 WKWebView 路径，macOS 15+
- **验证过程**：启动 `dist/HandAgentDesktop.app` 后通过全局快捷键打开 PromptPanel，确认面板为 warm cream canvas、浅 hairline、深色输入文字，不再是旧暗色玻璃或 Mango Amber。通过 PromptPanel 设置按钮打开 Settings，确认顶部 Tab 区为 cream/surface-soft、导航按钮等分、选中态有 coral 强调线，Provider / 接口 segmented picker 和模型/Base URL/API Key 字段使用同一 warm-canvas token；切换 macOS 深色模式后 Settings 仍保持固定 warm-canvas 单主题且字段内容高对比可读。观察 StatusBubble：idle 为 cream 小浮窗，running 时通过 `DESIGN_VISUAL_STATUS_QA_20260609 [mock:slow-focus]` 触发，截图显示 teal 状态点、coral `Running` 标题、cream 背景和 glow 不遮挡文本。ThreadWindow 打开后左侧历史栏为 cream surface，`新建对话` 为 coral primary，右侧 workspace 为 dark product surface，Composer 与 tab bar 使用深色 surface。将 ThreadWindow 缩到 `640x448` 后 sidebar 隐藏，消息、TabBar 和 Composer 未重叠；Settings 缩到系统最小 `660x548` 后顶部 tabs、segmented picker 和输入框仍可读无重叠。
- **证据**：`/tmp/handagent-qa/design-status-idle.png`、`/tmp/handagent-qa/design-status-running.png`、`/tmp/handagent-qa/design-settings-min.png`、`/tmp/handagent-qa/design-threadwindow-min.png`；Computer Use 观察 PromptPanel、Settings、ThreadWindow accessibility tree；`/api/activity` snapshot 返回 running/`正在回复`。
- **结论**：通过。SwiftUI 原生界面与 React ThreadWindow 保持 DESIGN.md 的 warm-canvas / coral / dark product surface 视觉节奏，最小尺寸附近未发现文本重叠、不可读截断或布局溢出。

### Electron StatusBubble 无可聚焦 ThreadWindow 时同 App 内点击回退 PromptPanel 修复

- **验证日期**：2026-06-09
- **验证环境**：主仓库 `main`，packaged mock-llm，`HANDAGENT_ELECTRON_SHELL=1`，Electron binary `/Users/mu9/proj/handAgent/node_modules/.pnpm/electron@42.3.3/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`。
- **验证过程**：合入 `09ff7f2 fix: rebuild ActivityWindow after thread close` 后重新执行 Electron targeted tests、Electron 全量测试与 build、`bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build`、`bash ./scripts/package-app.sh --mock-llm`。packaged 资源包含 `releaseNativeFocusForNextClick()`、`window.destroy()`、`this.hasLoaded = false` 和 visible ThreadWindow close 时的 release 调用。提交 `ELECTRON_STATUSBUBBLE_REBUILD_QA_20260609 [mock:assistant-ok]` 生成 thread 后，关闭 Electron `HandAgent ThreadWindow`，ActivityWindow 变为 `AXMain=false` / `AXFocused=false`；立即用 CGEvent 点击 `{1280,870}` 后，Swift `PromptPanel` 出现为 640x448 system dialog。
- **证据**：thread 文件 `~/.spotAgent/threads/thread-1780953633259-tiygm2.json` 包含同一 user prompt 与 `Mock assistant response: main chain is reachable.`；截图 `/tmp/handagent-qa/statusbubble-rebuild-after-click.png`；退出 QA app 后无 HandAgent / Electron / agent-server 残留，`127.0.0.1:4317` 无监听。

### ThreadWindow workspace 分组标题展开缺陷修复

- **验证日期**：2026-06-09
- **验证环境**：mock-llm / 默认 WKWebView packaged app / macOS 15+
- **修复提交**：`42860fe fix: restore ThreadWindow workspace expansion`
- **验证过程**：合入修复后重新执行 ThreadWindow store、history sidebar、持久化测试，执行 ThreadWindow Web 构建、仓库级 TypeScript 验证、Swift test/build，并重新打包 mock app。实机提交 `THREADWINDOW_SCENE4_EXPAND_FIX_QA_20260609 [mock:assistant-ok]` 后，`/api/thread thread.list` 返回四个 `qa-scene4-*` fixture；CoreGraphics 点击 `default`、`handagent-test`、`qa-workspace`、`tmp` 分组标题后均可展开并显示对应 `SCENE4_*` 历史项，再次点击 `default` 可收起，点击 `SCENE4_DEFAULT...` 历史项会激活对应 thread/tab。关闭 ThreadWindow 后重新提交 `THREADWINDOW_SCENE4_PERSISTENCE_QA_20260609 [mock:assistant-ok]`，新建 WKWebView 恢复此前展开/收起状态。
- **证据**：thread 文件 `~/.spotAgent/threads/thread-1780955175109-a0tl2r.json`、`~/.spotAgent/threads/thread-1780955402861-qedb4a.json`；截图 `/tmp/handagent-qa/threadwindow-scenario4-expand-fix-all-expanded.png`、`/tmp/handagent-qa/threadwindow-scenario4-expand-fix-qa-expanded.png`、`/tmp/handagent-qa/threadwindow-scenario4-expand-fix-default-collapsed.png`、`/tmp/handagent-qa/threadwindow-scenario4-expand-fix-reopen-persisted.png`；退出 QA app 后无 HandAgent / agent-server 残留，`127.0.0.1:4317` 无监听。
- **结论**：workspace 分组标题无法展开缺陷已修复并通过主仓库 packaged live 回归；该缺陷已从 `docs/bugs.md` 移除。

### ThreadWindow 最终 assistant 文本截断缺陷修复

- **验证日期**：2026-06-09
- **验证环境**：mock-llm / 默认 WKWebView packaged app / macOS 15+
- **修复提交**：`176f0d5 fix: keep assistant delta notifications unique`
- **验证过程**：缺陷发现时，`THREADWINDOW_SCENE6_VISUAL_QA_20260609 [mock:workspace-list]` 与 `THREADWINDOW_SCENE7_LAYOUT_QA_20260609 [mock:assistant-ok]` 的 thread 文件分别持久化了完整 assistant 文本，但 ThreadWindow UI 只显示 `Mock`。按 `$trace-and-verify-call-chain` 定位到 agent-server 在同一毫秒内为多段 `assistant_message_delta` 生成重复 `notificationId`，React store 去重后丢弃后续 delta。修复后重新运行 agent-server / ThreadWindow web 相关测试、仓库级 TypeScript、Swift test/build，并重新打包 mock app；packaged live 回归提交 `THREADWINDOW_SCENE7_TEXT_FIX_QA_20260609 [mock:assistant-ok]` 与 `THREADWINDOW_SCENE6_TEXT_FIX_QA_20260609 [mock:workspace-list]`，ThreadWindow 分别完整显示 `Mock assistant response: main chain is reachable.` 与 `Mock workspace.list completed.`。
- **证据**：修复前 thread `~/.spotAgent/threads/thread-1780956268767-2n3fjt.json`、`~/.spotAgent/threads/thread-1780956663996-o7g1aj.json`；修复前截图 `/tmp/handagent-qa/threadwindow-scenario6-visual-workspace-list-final.png`、`/tmp/handagent-qa/threadwindow-scenario7-layout-assistant-ok.png`；修复后 thread `~/.spotAgent/threads/thread-1780957524607-gfjaa7.json`、`~/.spotAgent/threads/thread-1780957564200-kgnmdi.json`；修复后截图 `/tmp/handagent-qa/threadwindow-scene7-text-fix.png`、`/tmp/handagent-qa/threadwindow-scene6-text-fix.png`；退出 QA app 后无 HandAgent / agent-server 残留，`127.0.0.1:4317` 无监听。
- **结论**：最终 assistant 文本截断缺陷已修复并通过主仓库 packaged live 回归；该缺陷已从 `docs/bugs.md` 移除。

### ThreadWindow 场景 8：消息操作按钮验证（GPT 风格）

- **验证日期**：2026-06-09
- **验证环境**：默认 WKWebView packaged app，`mock-llm`
- **验证过程**：启动 `dist/HandAgentDesktop.app` 后提交 `THREADWINDOW_SCENE8_ACTION_BUTTONS_QA_20260609_R2 [mock:workspace-list]`，生成 workspace.list tool 结果与 final assistant 消息。初始状态下 assistant 和 tool 消息无操作按钮；hover final assistant 后显示 `复制 / 编辑 / 重新生成`，按钮栏使用低对比度 cream 文本且没有推动后续内容；hover tool 结果时 tool 下方不出现独立操作按钮。CoreGraphics 精确点击 final assistant 的复制按钮后，`pbpaste` 返回 `Mock workspace.list completed.`。AX 读取 final assistant 按钮状态为 `复制消息 enabled=true`、`编辑 enabled=false`、`重新生成 enabled=false`，`编辑` 与 `重新生成` 的 `AXHelp` 均为 `即将推出`。
- **证据**：thread 文件 `~/.spotAgent/threads/thread-1780957822168-ghgnjc.json`；截图 `/tmp/handagent-qa/threadwindow-scenario8-r2-initial.png`、`/tmp/handagent-qa/threadwindow-scenario8-assistant-hover.png`、`/tmp/handagent-qa/threadwindow-scenario8-tool-hover.png`、`/tmp/handagent-qa/threadwindow-scenario8-copy-click-swift-585.png`。
- **结论**：通过。

### ThreadWindow 场景 9：Composer 自动增高输入框验证（GPT 风格）

- **验证日期**：2026-06-09
- **验证环境**：默认 WKWebView packaged app，`mock-llm`
- **验证过程**：在同一 packaged mock app 的 ThreadWindow composer 中，空输入框 AX 尺寸为 `482x64`；输入 1 行后仍为 `482x64`。用 Shift+Return 验证换行可插入后，通过剪贴板粘贴 5 行真实触发 textarea input 事件，输入框增高到 `482x120`；粘贴 6 行后保持 `482x120`，内部出现垂直滚动条，外层 pill 仍居中且宽度不变。按无修饰 Return 后输入框清空并恢复为 `482x52`，thread 文件随后持久化 6 行 user message 与 mock assistant 回复。
- **证据**：thread 文件 `~/.spotAgent/threads/thread-1780957822168-ghgnjc.json`；截图 `/tmp/handagent-qa/threadwindow-scenario9-composer-paste-1line.png`、`/tmp/handagent-qa/threadwindow-scenario9-composer-paste-5lines.png`、`/tmp/handagent-qa/threadwindow-scenario9-composer-paste-6lines.png`、`/tmp/handagent-qa/threadwindow-scenario9-after-submit.png`。
- **结论**：通过。

### ThreadWindow 场景 10：视觉一致性验证

- **验证日期**：2026-06-09
- **验证环境**：默认 WKWebView packaged app，`mock-llm`
- **验证过程**：当前 ThreadWindow 显示 cream sidebar + dark workspace 的双 surface 节奏，不再是 dark-only Raycast Glass 风格；顶部没有 connection pill，TabBar 只显示 browser-style tab 和关闭按钮，无状态点。点击 `SCENE4_QA_WORKSPACE_THREAD` 历史 row 空白区域后打开 `qa-scene` tab；点击同一 row 最右侧删除图标后只显示删除确认面板，未触发 row open 传播；点击取消后确认面板关闭。场景原第 4 条文案只写到“触发 permission 请求，确认请求面板是”，缺少期望描述；本轮按可观察 request panel 行为验证：提交 `THREADWINDOW_SCENE10_PERMISSION_PANEL_QA_20260609 [mock:permission-write]` 后出现 permission 面板，深色 elevated card 内含 monospace 参数 code block、coral `允许` 与 secondary `拒绝` 按钮，右下 StatusBubble 显示 `Running / 等待权限确认`；点击 `拒绝` 后面板消失并显示 tool 拒绝结果，未执行 `file.write`。
- **证据**：thread 文件 `~/.spotAgent/threads/qa-scene4-qa-workspace.json`，其中事件记录 `permission_request file.write deny` 与 `tool_result error`；截图 `/tmp/handagent-qa/threadwindow-scenario10-visual-current.png`、`/tmp/handagent-qa/threadwindow-scenario10-history-row-click.png`、`/tmp/handagent-qa/threadwindow-scenario10-history-delete-click.png`、`/tmp/handagent-qa/threadwindow-scenario10-delete-cancel.png`、`/tmp/handagent-qa/threadwindow-scenario10-permission-panel.png`、`/tmp/handagent-qa/threadwindow-scenario10-permission-denied-after.png`。
- **结论**：通过；原手工条目第 4 条文案不完整已在本归档说明中保留。

### ThreadWindow 场景 1：Tailwind CSS 构建与主题验证

- **验证日期**：2026-06-09
- **验证环境**：默认 WKWebView packaged app，`mock-llm`
- **验证过程**：重新执行 `bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build` 与 `bash ./scripts/package-app.sh --mock-llm` 后启动主仓库 packaged app。此前已验证 `pnpm --filter handagent-thread-window-web build` 生成 Tailwind CSS 产物，CSS 产物包含 `bg-canvas`、`bg-surface-dark`、`bg-primary`、`rounded-lg` 和 warm-canvas 色值。此次通过当前 app-server 的 `http://127.0.0.1:4317/thread-window/index.html` 用 Playwright 读取运行时 DOM，确认 `main` class 包含 `bg-canvas` 且计算背景为 `rgb(250, 249, 245)`，`aside` class 包含 `bg-surface-card` 且背景为 `rgb(239, 233, 222)`，`section[aria-label="Thread workspace"]` class 包含 `bg-surface-dark` 且背景为 `rgb(24, 23, 21)`，`新建对话` button class 包含 `rounded-md bg-primary` 且背景为 `rgb(204, 120, 92)`，empty state card class 包含 `rounded-lg bg-surface-dark-elevated`。
- **证据**：CSS 产物 `apps/thread-window-web/dist/assets/index-BQgOjT3d.css`；DOM 证据 `/tmp/handagent-qa/threadwindow-scenario1-dom-classes.json`、`/tmp/handagent-qa/threadwindow-scenario1-dom-theme-nodes.json`；截图 `/tmp/handagent-qa/threadwindow-scenario1-theme.png`、`/tmp/handagent-qa/threadwindow-scenario1-playwright-dom.png`；thread 文件 `~/.spotAgent/threads/thread-1780949983762-ki8lb7.json`。
- **结论**：通过。

### ThreadWindow 场景 2：workspaceId 向后兼容验证

- **验证日期**：2026-06-09
- **验证环境**：默认 WKWebView packaged app，`mock-llm`
- **验证过程**：创建旧版本 thread 文件 `~/.spotAgent/threads/test-old-thread.json`，其 `metadata` 不含 `workspaceId`。启动默认 WKWebView packaged mock app 后，历史侧栏可搜索到旧 thread，且该旧 thread 出现在“默认对话”分组，没有解析错误或崩溃；旧文件保持不含 `workspaceId` 且 `updatedAt` 未变化。随后提交 `THREADWINDOW_SCENARIO2_NEW_THREAD_QA_20260609 [mock:assistant-ok]` 创建新 thread，`~/.spotAgent/threads/thread-1780950632340-na2sg4.json` 的 `metadata.workspaceId` 为 `null`，并包含同一 user prompt 与 mock assistant。测试旧文件已删除。
- **证据**：截图 `/tmp/handagent-qa/threadwindow-scenario2-old-thread.png`、`/tmp/handagent-qa/threadwindow-scenario2-old-thread-search.png`；thread 文件 `~/.spotAgent/threads/thread-1780950632340-na2sg4.json`；当前复核显示 `~/.spotAgent/threads/test-old-thread.json` 已不存在。
- **结论**：通过。

### ThreadWindow 场景 3：workspace.list 协议与 workspace 分组刷新验证

- **验证日期**：2026-06-09
- **验证环境**：默认 WKWebView packaged app，`mock-llm`
- **验证过程**：审查 `packages/core/src/protocol/ThreadCommand.ts` 确认 `workspace.list` 命令存在，`packages/core/src/protocol/ThreadNotification.ts` 确认 `workspace.listed` 通知包含 `workspaces[].id/name/rootPath`，`apps/thread-window-web/src/protocol/threadProtocol.ts` 的 guard 覆盖 `workspace.listed` 并校验 workspace 字段，`apps/thread-window-web/src/thread/threadSocketClient.ts` 在 WebSocket open 后发送 `encodeWorkspaceList()` 再发送 `thread.list()`。重新执行 `pnpm --filter handagent-thread-window-web exec vitest run tests/threadProtocol.test.ts tests/threadSocketClient.test.ts tests/threadWindowStore.test.ts tests/historySidebar.test.ts`，4 个文件 35 个用例通过。当前主仓库 packaged app 启动的 agent-server 上，Node WebSocket 客户端连接 `ws://127.0.0.1:4317/api/thread` 并发送 `workspace.list`，收到同 commandId 的 `workspace.listed`，payload 包含 `default`、`tmp`、`qa-workspace`、`handagent-test` 四个 workspace。live UI 历史侧栏已显示这些 workspace 分组和“默认对话”。
- **证据**：WebSocket frame 证据 `/tmp/handagent-qa/threadwindow-scenario3-workspace-websocket.json`；live UI 截图 `/tmp/handagent-qa/threadwindow-scenario2-old-thread.png`、`/tmp/handagent-qa/threadwindow-scenario2-old-thread-search.png`。
- **结论**：通过。

### ThreadWindow 场景 4：左侧边栏 workspace 分组交互

- **验证日期**：2026-06-09
- **验证环境**：默认 WKWebView packaged app，`mock-llm`
- **验证过程**：`~/.spotAgent/workspaces.json` registry 原序为 `default -> tmp -> qa-workspace -> handagent-test`，历史侧栏显示排序为 `default -> handagent-test -> qa-workspace -> tmp -> 默认对话`，确认 workspace 分组按字母排序且“默认对话”固定在最下方。历史边栏顶部显示“新建对话”按钮和搜索框；搜索可过滤所有分组 thread，清空后恢复完整列表。修复 workspace 展开状态后，重新打包提交 `THREADWINDOW_SCENE4_EXPAND_FIX_QA_20260609 [mock:assistant-ok]` 与 `THREADWINDOW_SCENE4_PERSISTENCE_QA_20260609 [mock:assistant-ok]`，`/api/thread thread.list` 返回的四个 `qa-scene4-*` fixture 分别匹配真实 workspaceId；点击 `default`、`handagent-test`、`qa-workspace`、`tmp` 标题后均可展开并显示对应历史项，再次点击 `default` 可收起；点击 `SCENE4_DEFAULT...` 历史项会激活该 thread/tab。关闭 ThreadWindow 并重新提交 prompt 后，新建 WKWebView 恢复 `handagent-test`、`qa-workspace`、`tmp` 展开和 `default` 收起状态。
- **证据**：截图 `/tmp/handagent-qa/threadwindow-scenario4-expand-fix-all-expanded.png`、`/tmp/handagent-qa/threadwindow-scenario4-expand-fix-qa-expanded.png`、`/tmp/handagent-qa/threadwindow-scenario4-expand-fix-default-collapsed.png`、`/tmp/handagent-qa/threadwindow-scenario4-expand-fix-reopen-persisted.png`；thread 文件 `~/.spotAgent/threads/thread-1780955175109-a0tl2r.json`、`~/.spotAgent/threads/thread-1780955402861-qedb4a.json`。
- **结论**：通过。

### ThreadWindow 场景 5：左侧边栏响应式缩放与隐藏

- **验证日期**：2026-06-09
- **验证环境**：默认 WKWebView packaged app，`mock-llm`
- **验证过程**：提交 `THREADWINDOW_SCENE5_RESPONSIVE_QA_20260609 [mock:assistant-ok]` 后生成 `~/.spotAgent/threads/thread-1780954592680-hdn67v.json`。用 AX 调整 `HandAgent` 窗口尺寸并读取 sidebar `complementary` 区域：窗口 920x640 时 sidebar 为 276x612，接近窗口宽度 30%；窗口放大到实际 1280x640 时 sidebar 为 320x612，达到最大宽度上限；窗口 800x640 时 sidebar 为 240x612，仍接近 30% 且高于 220；窗口 740x640 时 main 只有右侧 region，sidebar 隐藏；重新放回 920x640 后 main 恢复为 2 个区域，sidebar 为 276x612，搜索框仍存在且为空。
- **证据**：thread 文件 `~/.spotAgent/threads/thread-1780954592680-hdn67v.json`；截图 `/tmp/handagent-qa/threadwindow-scenario5-width-920.png`、`/tmp/handagent-qa/threadwindow-scenario5-width-1300.png`、`/tmp/handagent-qa/threadwindow-scenario5-width-800.png`、`/tmp/handagent-qa/threadwindow-scenario5-width-740.png`、`/tmp/handagent-qa/threadwindow-scenario5-width-920-restored.png`。
- **结论**：通过。

### ThreadWindow 场景 5A：滚动容器验证

- **验证日期**：2026-06-09
- **验证环境**：默认 WKWebView packaged app，`mock-llm`
- **验证过程**：使用当前 packaged mock app 中的 `THREADWINDOW_SCENE5A_SCROLL_QA_20260609 [mock:assistant-ok]` thread，其持久化文件为 `~/.spotAgent/threads/thread-1780955664655-r0vptz.json`，user prompt 包含 80 行长文本。WKWebView live 窗口保留初始静态截图，确认右侧消息区出现独立纵向滚动条、顶部 TabBar 和底部 Composer 位于固定区域。随后通过同一 app-server 的 ThreadWindow 运行时 DOM 执行动态滚动：左侧历史列表 `scrollHeight=4013`、`clientHeight=451`，滚动后 `scrollTop` 从 0 到 900，HandAgent 标题、新建对话按钮和搜索框坐标不变；右侧 MessageList `scrollHeight=4143`、`clientHeight=238`，滚动后 `scrollTop` 从 0 到 1200，TabBar 和 Composer 坐标不变；打开 10 个历史 thread 后 TabBar `scrollWidth=1164`、`clientWidth=620`，横向滚动后 `scrollLeft=544`，页面级 `docScrollWidth/bodyScrollWidth` 仍等于 920；最小宽度 640 下含权限请求面板时，`docScrollWidth/bodyScrollWidth` 仍等于 640。
- **证据**：thread 文件 `~/.spotAgent/threads/thread-1780955664655-r0vptz.json`；JSON `/tmp/handagent-qa/threadwindow-scenario5a-scroll-evidence-cli.json`、`/tmp/handagent-qa/threadwindow-scenario5a-tabs-evidence-cli.json`；截图 `/tmp/handagent-qa/threadwindow-scenario5a-initial-long-message.png`、`/tmp/handagent-qa/threadwindow-scenario5a-sidebar-scrolled.png`、`/tmp/handagent-qa/threadwindow-scenario5a-message-scrolled.png`、`/tmp/handagent-qa/threadwindow-scenario5a-tabs-history-overflow.png`、`/tmp/handagent-qa/threadwindow-scenario5a-minwidth-permission-panel.png`。
- **结论**：通过。

### ThreadWindow 场景 6：warm-canvas 视觉验证

- **验证日期**：2026-06-09
- **验证环境**：默认 WKWebView packaged app，`mock-llm`
- **验证过程**：通过当前 packaged app app-server 的 ThreadWindow 运行时 DOM 读取计算样式并截图。左侧 sidebar 背景为 `rgb(239, 233, 222)`，搜索框和选中历史项为 `rgb(250, 249, 245)`，边线为 `rgb(230, 223, 216)`；右侧 workspace 背景为 `rgb(24, 23, 21)`，TabBar 为 `rgb(31, 30, 27)`，Composer shell 为 `rgb(37, 35, 32)`；“新建对话”和可发送状态按钮均为 coral `rgb(204, 120, 92)`。消息样式按当前 `MessageBubble` GPT 风格实现：user 消息为 `bg-surface-card` warm cream，assistant 消息透明 `rgba(0, 0, 0, 0)`，tool 消息为 `bg-tool-bubble/50` 半透明 dark code-style。640px 最小宽度下 `docScrollWidth/bodyScrollWidth` 仍等于 640，未出现页面级横向溢出。原手工条目中的 “assistant cream card” 与当前 GPT 风格实现冲突，本次按代码和 `apps/thread-window-web/thread-window-web.md` 的当前设计事实归档。
- **证据**：JSON `/tmp/handagent-qa/threadwindow-scenario6-warm-canvas-evidence-cli.json`；截图 `/tmp/handagent-qa/threadwindow-scenario6-warm-canvas-current.png`、`/tmp/handagent-qa/threadwindow-scenario6-minwidth-current.png`。
- **结论**：通过。

### ThreadWindow 场景 7：GPT 风格布局验证

- **验证日期**：2026-06-09
- **验证环境**：默认 WKWebView packaged app，`mock-llm`
- **验证过程**：通过当前 packaged app app-server 的 ThreadWindow 运行时 DOM 验证 GPT 风格布局。MessageBubble：assistant 为 `bg-transparent` 且背景 `rgba(0, 0, 0, 0)`，user article `flex justify-end` 且 user bubble 宽度约为消息容器 85%，tool bubble 为 `bg-tool-bubble/50` 半透明 dark，tool 正文为 `font-code` / JetBrains Mono。MessageList 内层为 `max-w-[720pt]` 并水平居中；Composer shell 为 `rounded-3xl border-white/10`，附件按钮 disabled，空闲发送按钮 disabled 时使用 elevated dark，运行中停止按钮为 coral。TabBar 横向容器 `scrollWidth=1164`、`clientWidth=620`，存在 active dark tab 与 inactive dark-soft tab，关闭按钮默认 `opacity=0` 且 tab 文本无状态点。提交 `THREADWINDOW_SCENE7_TYPING_QA_20260609 [mock:slow-focus]` 后，运行中显示 3 个 `animate-bounce` 点，延迟为 `0ms / 150ms / 300ms`，停止按钮为 coral；点击停止后点和停止按钮消失。
- **证据**：JSON `/tmp/handagent-qa/threadwindow-scenario7-gpt-layout-evidence-cli.json`；截图 `/tmp/handagent-qa/threadwindow-scenario7-gpt-layout-current.png`、`/tmp/handagent-qa/threadwindow-scenario7-typing-indicator-running.png`。
- **结论**：通过。

### 真实 LLM 工具激活场景 1：纯聊天不触发工具激活

- **验证日期**：2026-06-09
- **验证环境**：默认 WKWebView packaged app，settings / real LLM，`~/.spotAgent/settings.json` provider 为 `openai-compatible`，model 为 `gpt-5.5`，api 为 `responses`，baseUrl 为 `http://127.0.0.1:8090/v1`
- **验证过程**：重新执行 `bash ./scripts/package-app.sh`，确认 bundle 无 `HandAgentRuntimeMode.json`，通过真实全局快捷键打开 PromptPanel 并提交 `HANDAGENT_REAL_CHAT_SCENE1_20260609 请用一句话写一首短诗，不要使用任何工具。`。ThreadWindow 中只出现 user 消息和 assistant 回复 `六月的风轻轻握住夜色，把未说出口的梦吹成满天星河。`，没有 `use_tools` 或其他 tool call 气泡；`/api/activity` snapshot 回到 `status:"idle"`。`~/.spotAgent/log/2026-06-09/network-002.jsonl` 中对应请求的 `tools` 数组只包含 `use_tools`，不含 builtin tool。
- **证据**：thread 文件 `~/.spotAgent/threads/thread-1780961303715-8bnpk5.json`；network 日志 `~/.spotAgent/log/2026-06-09/network-002.jsonl`；截图 `/tmp/handagent-qa/real-chat-scene1-no-tools.png`。
- **结论**：通过。

### 场景 2：真实 LLM 工具 prompt 触发激活并完成调用

- **验证日期**：2026-06-09
- **验证环境**：真实 LLM / packaged app / macOS 15+；`bash ./scripts/package-app.sh` 打包，`dist/HandAgentDesktop.app/Contents/Resources/HandAgentRuntimeMode.json` 不存在，确认未启用 mock LLM。
- **验证过程**：通过全局快捷键打开 PromptPanel，提交 `HANDAGENT_REAL_TOOL_SCENE2_20260609 请只调用屏幕读取工具看一下我的屏幕，然后用一句话总结。不要写文件，不要请求其他权限。`。ThreadWindow 先显示 `use_tools` tool 结果，随后显示 `screen.capture` tool 结果，最终 assistant 回复为“你的屏幕显示的是一张占满屏幕的抽象彩色图案/艺术壁纸。”；`/api/activity` 先进入 `tool_running / 正在使用 screen.capture`，完成后回到 `idle / 点击开始`。
- **证据**：thread 文件 `~/.spotAgent/threads/thread-1780961496528-f04ryg.json`，共 6 条消息，包含 user、`use_tools` tool result、`screen.capture` tool result 与最终 assistant；网络日志 `~/.spotAgent/log/2026-06-09/network-003.jsonl` 第 3 行请求 tools 仅包含 `use_tools`，第 5 行激活后包含完整 tool catalog，第 7 行包含 `screen_capture` function call/output；截图 `/tmp/handagent-qa/real-tool-scene2-completed-w44970.png`、`/tmp/handagent-qa/real-tool-scene2-completed-w44960.png`；Computer Use 可访问树确认 ThreadWindow 可见 `[ use_tools ]`、`[ screen.capture ]` 和最终 assistant 文本。
- **结论**：通过。真实 LLM 在新 thread 中可先调用 `use_tools` 激活完整工具集，再调用 `screen.capture`，并把 tool messages 与最终回复完整展示和持久化。

### 场景 3：真实 LLM 同一 thread 激活后不再重复 use_tools

- **验证日期**：2026-06-09
- **验证环境**：真实 LLM / packaged app / macOS 15+；沿用场景 2 的 `thread-1780961496528-f04ryg`，bundle 无 `HandAgentRuntimeMode.json`，确认未启用 mock LLM。
- **验证过程**：场景 2 完成后，在同一 ThreadWindow composer 提交 `HANDAGENT_REAL_TOOL_SCENE3_20260609 再读一次桌面前台，并用一句话说明。`。本轮 ThreadWindow 没有新增 `use_tools` 气泡，直接出现 `[ app.frontmost ]` tool result，最终 assistant 回复为“当前前台应用是 HandAgentDesktop。”；`/api/activity` 完成后回到 `idle / 点击开始`。
- **证据**：thread 文件 `~/.spotAgent/threads/thread-1780961496528-f04ryg.json` 更新为 10 条消息，场景 3 用户消息之后依次为 assistant 空 tool-call 占位、`app_frontmost` tool result 与最终 assistant；网络日志 `~/.spotAgent/log/2026-06-09/network-004.jsonl` 第 1 行场景 3 首个请求的 `tools` 已包含完整 tool catalog，第 3 行场景 3 用户消息之后的新调用只有 `app_frontmost`，没有新的 `use_tools`；Computer Use 可访问树确认 ThreadWindow 可见 `[ app.frontmost ] {"bundleId":"com.yourname.HandAgentDesktop","pid":34255,"name":"HandAgentDesktop","resolution":"best_effort"}` 与最终 assistant 文本。
- **结论**：通过。同一 thread 完成工具激活后，后续需要工具的真实 LLM turn 直接使用完整工具集，不再重复执行 `use_tools`。

### 真实 LLM pending permission request replay 修复

- **验证日期**：2026-06-09
- **验证环境**：真实 LLM / packaged app / macOS 15+；主仓库 `main` cherry-pick `fec90bd fix: replay pending permission requests on thread resume` 后重新执行 `pnpm exec vitest run apps/agent-server/tests/bridges/ThreadPermissionBridge.test.ts apps/agent-server/tests/server/server.test.ts`、`bash ./scripts/test.sh` 与 `bash ./scripts/package-app.sh`；`dist/HandAgentDesktop.app/Contents/Resources/HandAgentRuntimeMode.json` 不存在，确认未启用 mock LLM。
- **验证过程**：缺陷原始失败 hop 是 running thread 的 `thread.resume` 只返回 user-only `thread.snapshot(status:"running")`，不会重放 pending `permission.requested`。修复后在真实 LLM packaged app 中提交 `HANDAGENT_REAL_PERMISSION_REPLAY_OCR5_QA_20260609 请先调用 use_tools 激活工具，然后调用 ocr.read 读取这张 PNG。不要截图。...`，activity 进入 `waiting / 等待权限确认` 后，用第二个 `/api/thread` WebSocket 发送 `thread.resume`。该 socket 先收到 `thread.snapshot(status:"running")`，随后收到 replay 的 `permission.requested`，`toolName` 为 `ocr.read`；通过同一 socket 发送 `permission.answered` allow 后，收到 `tool.started`、`tool.finished(status:"failed")`、assistant delta 与 `turn.completed(status:"completed")`。
- **证据**：thread 文件 `~/.spotAgent/threads/thread-1780962584243-wg5ck5.json` 持久化 6 条消息，包含 user、`use_tools` tool result、`ocr.read` tool result 和最终 assistant；`/api/activity` 最终为 `idle / 点击开始`；网络日志 `~/.spotAgent/log/2026-06-09/network-005.jsonl` 第 19 行初始请求 tools 仅 `use_tools`，第 21 行激活后包含完整 tool catalog，第 23 行包含 `ocr_read` function call/output；Computer Use 可访问树确认 ThreadWindow 可见 `[ use_tools ]`、`[ ocr.read ] Vision OCR failed: The image is too small...` 与最终 assistant 文本。OCR 失败是输入 PNG 过小导致的工具业务错误，不影响 permission replay、权限回答、turn completion、持久化和 activity 状态验证。
- **结论**：通过。`ThreadPermissionBridge` pending request replay 与 `thread.resume` permission rebind 已通过主仓库真实 LLM packaged live 回归；对应 P1 已从 `docs/bugs.md` 当前 bug 移除。
### 真实 LLM 场景 4：agent-server 重启后激活状态可恢复

- **验证日期**：2026-06-09
- **验证环境**：real LLM packaged app，`bash ./scripts/package-app.sh`，`dist/HandAgentDesktop.app/Contents/Resources/HandAgentRuntimeMode.json` 不存在；主仓库 `/Users/mu9/proj/handAgent`，branch `main`；app pid `51667`，agent-server pid `51672`，`127.0.0.1:4317` 监听。
- **验证过程**：使用已激活 thread `~/.spotAgent/threads/thread-1780962584243-wg5ck5.json`。重启主仓库 packaged app 后，通过真实全局快捷键打开 PromptPanel，提交 `HANDAGENT_REAL_SCENE4_OPEN_UI_R2_20260609 请只回复 OK。` 打开 ThreadWindow；在历史侧栏搜索 `OCR5` 并点击目标 row 左侧正文区域打开同一 thread；随后提交 `HANDAGENT_REAL_SCENE4_AFTER_RESTART_R2_QA_20260609 不要调用 use_tools；请直接调用 app.frontmost 工具读取当前前台 App，并一句话回答。`。UI 进入运行态后回到 idle，thread 持久化新增 `app.frontmost` tool result 和最终 assistant 回复。
- **证据**：`~/.spotAgent/log/2026-06-09/network-005.jsonl` line 35 是 R2 首次请求，请求体 `tools` 直接包含 14 个工具：`use_tools`、`clipboard_read`、`app_frontmost`、`window_list`、`screen_capture`、`ocr_read`、`accessibility_snapshot`、`accessibility_action`、`workspace_list`、`file_read`、`file_write`、`workspace_askUser`、`mcp_computer_use_list_apps`、`mcp_computer_use_get_app_state`；该请求没有新增 R2 的 `use_tools` 调用。line 37 包含 `app_frontmost` tool result：`{"bundleId":"com.yourname.HandAgentDesktop","pid":51667,"resolution":"best_effort","name":"HandAgentDesktop"}`。`~/.spotAgent/threads/thread-1780962584243-wg5ck5.json` 最终新增 assistant 回复：`当前前台 App 是 HandAgentDesktop（bundleId: com.yourname.HandAgentDesktop）。`；`/api/activity` snapshot 回到 `idle / 点击开始`。
- **结论**：agent-server / desktop 重启后，同一 activated thread 能通过历史 tool message 推断工具激活状态；新一轮请求直接暴露完整工具集，未退回只暴露 `use_tools`，且平台工具调用成功。场景 4 通过，已从 `docs/manual-qa.md` 移除。第一次 R1 受测试工具误按应用名拉起旧 worktree 同 bundle app 污染，导致 platform bridge 被替换后离线；已通过重启主仓库 packaged app 清除干扰，未作为产品缺陷归档。

### 真实 LLM 场景 0：并发 thread 工具激活隔离

- **验证日期**：2026-06-09
- **验证环境**：real LLM packaged app，`bash ./scripts/package-app.sh`，`dist/HandAgentDesktop.app/Contents/Resources/HandAgentRuntimeMode.json` 不存在；主仓库 `/Users/mu9/proj/handAgent`，branch `main`；app pid `51667`，agent-server pid `51672`，`127.0.0.1:4317` 监听。
- **验证过程**：使用已激活 thread A `~/.spotAgent/threads/thread-1780962584243-wg5ck5.json`，其中已有 `use_tools`、`ocr.read` 和后续 `app.frontmost` tool 结果；在同一 ThreadWindow 中点击“新建对话”创建 thread B，提交 `HANDAGENT_REAL_SCENE0_THREAD_B_CHAT_QA_20260609 请用一句话回答：B 线程只是普通聊天，不要调用工具。`。B 完成后切回 A，提交 `HANDAGENT_REAL_SCENE0_THREAD_A_SECOND_TOOL_QA_20260609 不要调用 use_tools；请直接调用 app.frontmost 工具读取当前前台 App，并一句话回答。`。
- **证据**：B 持久化文件 `~/.spotAgent/threads/thread-1780963295269-y585u3.json` 只有 user 与 assistant 两条消息，assistant 为 `好的，B 线程仅普通聊天，我不会调用工具。`，UI 不显示 tool 气泡；`~/.spotAgent/log/2026-06-09/network-005.jsonl` line 39 是 B 请求，`tools` 只有 `use_tools`，没有 function call。A 的同一日志 line 41 / line 43 是第二个工具请求，`tools` 直接包含 14 个工具，包含 `app_frontmost` 等完整工具集；line 43 包含 `app_frontmost` tool result `{"name":"HandAgentDesktop","pid":51667,"bundleId":"com.yourname.HandAgentDesktop","resolution":"best_effort"}`。A 持久化文件最终新增 assistant 回复：`当前前台 App 是 HandAgentDesktop（bundleId: com.yourname.HandAgentDesktop）。`；`/api/activity` 最终回到 `idle / 点击开始`。
- **结论**：通过。工具激活状态按 thread 隔离：已激活 A 继续暴露完整工具集并可调用真实平台工具；新建普通聊天 B 未继承 A 的完整工具集，也未出现 tool call 气泡。场景 0 已从 `docs/manual-qa.md` 移除。
### 已修复：已激活 thread 重复暴露 `use_tools` 导致真实 provider 空流错误

- **修复日期**：2026-06-09
- **原始问题**：真实 LLM 场景中，thread 激活工具后 retry / 后续轮次仍可能看到 `use_tools` meta-tool；provider 重复调用后，runtime 回灌 `Tools are already active.`，随后可能出现 `AI SDK stream finished without assistant content or tool calls.`，thread 没有最终 assistant 总结。
- **调用链证据**：子 agent `019ea9b4-ed96-7e03-800e-e446f60cbc51` 使用 `$trace-and-verify-call-chain` 验证 `ThreadRuntimeOrchestrator.beforeRun -> ThreadScopedToolRegistry.refreshForThread() -> AgentRuntime.completeAssistantResponse() -> toolRegistry.list() -> LLMClient.stream(..., tools)`。RED 测试证明首次 `use_tools` 激活后第二轮 LLM request 的工具表仍包含 `use_tools`；失败 hop 是 `ThreadScopedToolRegistry.refreshActivated()` 在已激活 thread 中继续暴露 meta-tool。
- **修复内容**：`apps/agent-server/src/actions/ThreadScopedToolRegistry.ts` 改为已激活 thread 只暴露 builtin + MCP tools，不再把 `use_tools` 传给 provider；同步更新 `apps/agent-server/src/actions/actions.md` 与 `ThreadScopedToolRegistry` 回归测试。主仓库修复提交：`c165031 fix: 激活后移除 use_tools 元工具`。
- **验证结果**：`pnpm exec vitest run apps/agent-server/tests/thread/ThreadScopedToolRegistry.test.ts apps/agent-server/tests/actions/ThreadScopedToolRegistry.test.ts packages/core/tests/runtime/agent-runtime.test.ts packages/core/tests/runtime/system-prompt.test.ts` 通过，当前仓库目标测试与 `.worktrees` 副本共 74 files / 599 tests passed；`bash ./scripts/test.sh` 通过，Electron shell 16 files / 89 tests passed，agent-server + core 54 files passed / 329 tests passed / 1 skipped。
- **结论**：通过。`docs/bugs.md` 当前 bug 已移除；后续真实 provider 若仍出现空流，应按新的 network log 与当前 `~/.spotAgent/threads/<threadId>.json` 重新定位，不沿用 2026-05-24 旧 session 证据。

### Electron UI Shell `/api/activity` subscriber 重连

- **验证日期**：2026-06-09
- **验证环境**：Electron flag packaged app，`mock-llm`；`launchctl setenv HANDAGENT_ELECTRON_SHELL 1`，`HANDAGENT_ELECTRON_BINARY` 指向 `electron@42.3.3` binary，标准 `open dist/HandAgentDesktop.app` 启动。
- **验证过程**：启动后确认 Swift host、Electron main、agent-server 各一份，`127.0.0.1:4317` 由 node 监听，Computer Use 观察 Electron `HandAgent Activity` 显示 `点击开始 / HandAgent 空闲`。连续两次新建 `/api/activity` WebSocket 连接，首包均为 `activity.snapshot` 且状态为 `idle`。随后通过 `/api/thread` 创建 thread 并提交 `ELECTRON_ACTIVITY_RECONNECT_QA_20260609 [mock:assistant-ok]`，收到 assistant delta 与 `turn.completed(status:"completed")`；再次新建 `/api/activity` 连接，首包仍立即返回 snapshot，且指向刚完成的 active thread。
- **证据**：进程 pid 为 Swift host `67148`、Electron main `67149`、agent-server `67163`；thread 文件 `~/.spotAgent/threads/thread-1780964395791-tvbdeb.json` 持久化 user prompt 与 `Mock assistant response: main chain is reachable.`；重连后 `/api/activity` snapshot 为 `activeThreadId:"thread-1780964395791-tvbdeb"`、`status:"idle"`、`latestSummary:"点击开始"`。
- **结论**：通过。`/api/activity` subscriber 断开重连不会影响 `/api/thread` 消息流，新 subscriber 会立即收到当前 activity snapshot。

### Electron UI Shell Electron binary 可用性

- **验证日期**：2026-06-09
- **验证环境**：Electron flag packaged app，`mock-llm`；主仓库 `/Users/mu9/proj/handAgent`，branch `main`。
- **验证过程**：读取 launchd 环境变量 `HANDAGENT_ELECTRON_BINARY`，确认其指向 pnpm 安装的 Electron binary；执行该 binary 的 `--version`；同时检查当前 Electron main 进程命令。
- **证据**：`HANDAGENT_ELECTRON_BINARY=/Users/mu9/proj/handAgent/node_modules/.pnpm/electron@42.3.3/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`；`--version` 返回 `v42.3.3`；当前 Electron main pid `67149` 使用该 binary 启动 `dist/HandAgentDesktop.app/Contents/Resources/ElectronShell/dist/main/main.js`。
- **结论**：通过。Electron flag packaged app 可通过 `HANDAGENT_ELECTRON_BINARY` 使用可执行 Electron binary，不依赖 PATH 中存在全局 `electron`。

### Electron UI Shell packaged main 产物

- **验证日期**：2026-06-09
- **验证环境**：Electron flag packaged app，`mock-llm`；主仓库 `/Users/mu9/proj/handAgent`，branch `main`。
- **验证过程**：检查 `dist/HandAgentDesktop.app` bundle 内的 Electron shell main 入口，并核对当前 Electron main 进程命令是否使用该入口。
- **证据**：`dist/HandAgentDesktop.app/Contents/Resources/ElectronShell/dist/main/main.js` 存在，大小 `6257` bytes，内容包含 `electron.ready`；当前 Electron main pid `67149` 使用同一路径启动。
- **结论**：通过。mock packaged app bundle 已包含 Electron shell main 入口。

### Electron UI Shell mock LLM packaged 路径

- **验证日期**：2026-06-09
- **验证环境**：Electron flag packaged app，`mock-llm`；主仓库 `/Users/mu9/proj/handAgent`，branch `main`。
- **验证过程**：读取 packaged app runtime marker，随后通过 `/api/thread` 提交 mock prompt 并检查持久化 thread 与 `/api/activity`。
- **证据**：`dist/HandAgentDesktop.app/Contents/Resources/HandAgentRuntimeMode.json` 为 `{"llmMode":"mock"}`；thread 文件 `~/.spotAgent/threads/thread-1780964395791-tvbdeb.json` 包含 user `ELECTRON_ACTIVITY_RECONNECT_QA_20260609 [mock:assistant-ok]` 与 assistant `Mock assistant response: main chain is reachable.`；`/api/activity` snapshot 回到 `activeThreadId:"thread-1780964395791-tvbdeb"`、`status:"idle"`。
- **结论**：通过。Electron flag packaged app 在 mock LLM 模式下返回 mock assistant，不访问真实 LLM。

### Electron UI Shell 进程唯一性

- **验证日期**：2026-06-09
- **验证环境**：Electron flag packaged app，`mock-llm`；主仓库 `/Users/mu9/proj/handAgent`，branch `main`。
- **验证过程**：在 packaged app 运行中检查 Swift host、Electron main、agent-server 进程数，并检查 `127.0.0.1:4317` 监听者。
- **证据**：计数脚本输出 `{"swiftHost":1,"electronMain":1,"agentServer":1}`；进程链路为 Swift host pid `67148` -> Electron main pid `67149` -> agent-server pid `67163`；`lsof -nP -iTCP:4317 -sTCP:LISTEN` 仅显示 node pid `67163` 监听。
- **结论**：通过。Electron flag packaged app 没有第二份 Electron shell 或 agent-server 冲突。

### Electron UI Shell production build

- **验证日期**：2026-06-09
- **验证环境**：主仓库 `/Users/mu9/proj/handAgent`，branch `main`。
- **验证过程**：执行 `pnpm --filter handagent-electron-shell build`。
- **证据**：命令通过；构建链路完成 `tsc -p tsconfig.json`、`tsc -p tsconfig.activity-window.json` 与 `vite build -c vite.activity-window.config.ts`；Vite 输出 `31 modules transformed`，生成 `dist/activity-window/index.html`、CSS 与 JS chunk。
- **结论**：通过。Electron shell production build 当前可完成。

### Electron UI Shell initial prompt 打开 Electron ThreadWindow

- **验证日期**：2026-06-09
- **验证环境**：Electron flag packaged app，`mock-llm`；主仓库 `/Users/mu9/proj/handAgent`，branch `main`。
- **验证过程**：提交前确认 Electron 只有 `HandAgent Activity`。用真实全局快捷键打开 Swift PromptPanel，输入并提交 `ELECTRON_UI_SHELL_FINAL_QA_20260608 [mock:assistant-ok]`，随后检查窗口、Computer Use 可见内容、thread 文件与 `/api/activity`。
- **证据**：PromptPanel 打开后尺寸为 `640x448`；提交后 Electron 出现 `HandAgent ThreadWindow`，尺寸 `920x640`；Computer Use 可见 user message `ELECTRON_UI_SHELL_FINAL_QA_20260608 [mock:assistant-ok]` 与 assistant `Mock assistant response: main chain is reachable.`；thread 文件 `~/.spotAgent/threads/thread-1780964771699-7dvw8k.json` 持久化同一 user / assistant；`/api/activity` snapshot 为 `activeThreadId:"thread-1780964771699-7dvw8k"`、`status:"idle"`。
- **结论**：通过。PromptPanel initial prompt 在 Electron flag 路径下打开 Electron ThreadWindow 并创建新 thread，不走 Swift WKWebView host。

### Electron UI Shell 连续 PromptPanel 提交复用 ThreadWindow

- **验证日期**：2026-06-09
- **验证环境**：Electron flag packaged app，`mock-llm`；主仓库 `/Users/mu9/proj/handAgent`，branch `main`。
- **验证过程**：首次提交 `ELECTRON_UI_SHELL_FINAL_QA_20260608 [mock:assistant-ok]` 后保持 Electron ThreadWindow 打开；再次通过 PromptPanel 提交第二条不同 prompt，检查 Electron 窗口数量、位置/尺寸、Computer Use tab 状态与持久化 thread。
- **证据**：第二次提交前后 Electron 窗口仍只有 `HandAgent Activity` 与一个 `HandAgent ThreadWindow`，ThreadWindow 位置/尺寸保持 `260,146,920,640`；Computer Use 可见 tab 栏新增第二个 tab，当前 tab 显示 B prompt；`~/.spotAgent/threads/thread-1780964917550-h99lcu.json` 持久化第二个 user message。第二次测试输入被中文输入法转换为 `ELECTRON_UI_SHELL_FINAL_QA_20260608_B【mock：assistant-ok]`，因此 MockLLMClient 按预期报 mock trigger 不匹配；该输入法问题不影响窗口复用、tab 创建和 thread 隔离结论。
- **结论**：通过。连续 PromptPanel 提交复用同一个 Electron ThreadWindow，并创建新的 tab/thread，没有写入首次提交的 active thread。

### Electron UI Shell packaged startup ready 链路

- **验证日期**：2026-06-09
- **验证环境**：Electron flag packaged app，`mock-llm`；`HANDAGENT_ELECTRON_BINARY` 指向 `electron@42.3.3` binary，标准 `open dist/HandAgentDesktop.app` 启动。
- **验证过程**：用 launchd 环境变量启用 Electron flag 并启动 packaged app；检查进程、端口、`/api/activity` 首包、Computer Use 可见窗口，以及 packaged Electron main 入口中的 ready / supervisor 启动顺序。
- **证据**：Swift host pid `74172`、Electron main pid `74174`、agent-server pid `74188` 成功运行；`lsof -nP -iTCP:4317 -sTCP:LISTEN` 仅显示 node pid `74188` 监听；`/api/activity` 首包为 `activity.snapshot` 且 `status:"idle"`；Computer Use 只看到 Electron `HandAgent Activity`，文本为 `点击开始 / HandAgent 空闲`，Swift 无窗口；`dist/HandAgentDesktop.app/Contents/Resources/ElectronShell/dist/main/main.js` 包含 `electron.ready`、`agent-server supervisor` 与 `startSupervisor`，且 `electron.ready` 位于 supervisor log 之前。
- **结论**：通过。Electron main 未因 Swift command bridge / stdin 阻塞，ready 路径存在并继续拉起 agent-server。

### Electron UI Shell supervisor description 启动日志

- **验证日期**：2026-06-09
- **验证环境**：Electron flag packaged app，`mock-llm`；主仓库 `/Users/mu9/proj/handAgent`，branch `main`。
- **验证过程**：为捕获 stderr，短时直接启动 packaged executable 并重定向 stdout/stderr 到 `/tmp/handagent-qa/electron-supervisor-description-current-20260609.log`；随后检查日志、agent-server 监听与 `/api/activity`。
- **证据**：日志首行包含 `[electron-shell] agent-server supervisor: {"mode":"node_child","entry":"apps/agent-server/src/server/server.ts","coreRuntimeHost":"agent-server","utilityProcessBlocker":"apps/agent-server/dist/server/server.js 不存在；当前 agent-server 仍依赖 TypeScript 源码入口和 Node --experimental-transform-types"}`；同轮 node pid `75197` 监听 `127.0.0.1:4317`；`/api/activity` 首包为 `activity.snapshot` 且 `status:"idle"`。
- **结论**：通过。启动日志明确记录 supervisor description、`coreRuntimeHost:"agent-server"` 与 Node child fallback 的具体 `utilityProcessBlocker`。

### Electron UI Shell openHistory command-path

- **验证日期**：2026-06-09
- **验证环境**：Electron flag packaged app，`mock-llm`；标准 `open dist/HandAgentDesktop.app` 启动。
- **验证过程**：启动后确认 Electron 只有 `HandAgent Activity`，然后向当前 Electron command socket 发送 `thread_window.open_history` command，检查 Electron / Swift 窗口和 Computer Use 可见内容。
- **证据**：command socket 为 `/tmp/hae-C9B68DF7-F042-46FC-B318-F9284CD0FAD0.sock`；发送 command 后 Electron 窗口为 `HandAgent Activity` + `HandAgent ThreadWindow`，ThreadWindow 尺寸 `920x640`；Computer Use 可见 React 历史侧栏、workspace 分组、搜索框和历史 thread 列表；`HandAgentDesktop` 进程无 Swift 窗口。
- **结论**：通过。`openHistory` command-path 聚焦 Electron ThreadWindow 并显示历史侧栏，没有创建 Swift WKWebView host。

### Electron UI Shell 标准退出无残留

- **验证日期**：2026-06-09
- **验证环境**：Electron flag packaged app，`mock-llm`；主仓库 `/Users/mu9/proj/handAgent`，branch `main`；标准 `open dist/HandAgentDesktop.app` 启动。
- **验证过程**：先清空所有 HandAgent / Electron / agent-server 残留，再启动主仓库 packaged app；确认启动链路后用 bundle id 标准 quit，等待 6 秒后检查进程表和 `127.0.0.1:4317`。
- **证据**：启动前置进程链路只有 Swift host pid `77532` -> Electron main pid `77534` -> agent-server pid `77556`，`127.0.0.1:4317` 由 node pid `77556` 监听；执行 `osascript -e 'tell application id "com.yourname.HandAgentDesktop" to quit'` 后，`ps` 匹配 HandAgent / Electron / Electron Helper renderer / agent-server 无输出，`lsof -nP -iTCP:4317 -sTCP:LISTEN` 无输出。
- **结论**：通过。标准 quit 会清理 Electron main、renderer/helper 和 agent-server，不留下 4317 监听。

### Electron UI Shell platform tool path

- **验证日期**：2026-06-09
- **验证环境**：Electron flag packaged app，`mock-llm`；标准 `open dist/HandAgentDesktop.app` 启动。
- **验证过程**：设置系统剪贴板为唯一 marker，随后通过 `/api/thread` 提交 `ELECTRON_PLATFORM_CLIPBOARD_CURRENT_QA_20260609 [mock:clipboard-read]`，检查 thread event、持久化文件和 `/api/activity`。
- **证据**：启动链路为 Swift host pid `79246` -> Electron main pid `79248` -> agent-server pid `79262`；thread `~/.spotAgent/threads/thread-1780966063987-8vmk63.json` 持久化 user prompt、`clipboard.read` tool call、tool result `{"text":{"text":"HANDAGENT_PLATFORM_CLIPBOARD_QA_20260609_VALUE"}}` 与 assistant `Mock clipboard.read completed.`；实时 `/api/thread` 收到 `tool.started` / `tool.finished(status:"completed")`；`/api/activity` snapshot 回到 `activeThreadId:"thread-1780966063987-8vmk63"`、`status:"idle"`。
- **结论**：通过。Electron flag 路径下 agent-server 仍可通过 Swift `/api/platform` 执行平台 tool 并回写结果。

### Electron React StatusBubble starting / running / completed

- **验证日期**：2026-06-09
- **验证环境**：Electron flag packaged app，`mock-llm`；标准 `open dist/HandAgentDesktop.app` 启动。
- **验证过程**：先确认 Swift 无窗口且只有 Electron `HandAgent Activity`。提交 long-running `[mock:slow-focus]` 观察 running UI，再中断 long turn；随后提交短 `[mock:slow]` 并采集 `/api/activity` 状态序列、thread 文件和最终 ActivityWindow。
- **证据**：Computer Use 在 long-running `thread-1780966195611-ii4g6x` 运行中看到 Electron ActivityWindow 文本 `正在回复 / 正在回复`；短 prompt `ELECTRON_STATUSBUBBLE_SEQUENCE_CURRENT_QA_20260609 [mock:slow]` 的 `/api/activity` 序列为 `starting:正在开始` -> `starting:<prompt>` -> `running:正在回复` -> `completed:已完成` -> `idle:点击开始`；thread 文件 `~/.spotAgent/threads/thread-1780966255243-1kysuw.json` 持久化 assistant `Mock slow response completed.`；最终 Computer Use 看到 Electron ActivityWindow 回到 `点击开始 / 点击开始`。
- **结论**：通过。Electron flag 路径下不显示 Swift StatusBubble；右下角 Electron React StatusBubble 消费 `/api/activity` 并覆盖 starting / running / completed / idle 状态。

### Electron UI Shell 关闭 visible ThreadWindow 后复用后台服务

- **验证日期**：2026-06-09
- **验证环境**：Electron flag packaged app，`mock-llm`；标准 `open dist/HandAgentDesktop.app` 启动。
- **验证过程**：用 `thread_window.open_history` 打开 visible Electron ThreadWindow，关闭该窗口后检查 agent-server；随后用真实全局快捷键打开 Swift PromptPanel，粘贴 ASCII prompt 并提交，检查新 Electron ThreadWindow、thread 文件与 `/api/activity`。
- **证据**：关闭前 Electron 有 `HandAgent Activity` + `HandAgent ThreadWindow`，ThreadWindow 尺寸 `920x640`；点击 close button 后只剩 `HandAgent Activity`，node pid `79262` 仍监听 `127.0.0.1:4317`；随后 PromptPanel 为 `640x448`，提交 `ELECTRON_CLOSE_REUSE_CURRENT_QA_20260609 [mock:assistant-ok]` 后 Electron 重新出现 `HandAgent ThreadWindow`；thread 文件 `~/.spotAgent/threads/thread-1780966465948-vh3h1g.json` 持久化 user prompt 与 assistant `Mock assistant response: main chain is reachable.`；`/api/activity` snapshot 为 `activeThreadId:"thread-1780966465948-vh3h1g"`、`status:"idle"`。
- **结论**：通过。关闭 visible Electron ThreadWindow 不停止 agent-server；后续 PromptPanel submit 仍复用同一后台服务执行。

### Electron UI Shell 全局快捷键不触发 ThreadWindow prepare

- **验证日期**：2026-06-09
- **验证环境**：Electron flag packaged app，`mock-llm`；标准 `open dist/HandAgentDesktop.app` 启动。
- **验证过程**：在空闲态连续 3 次注入真实全局快捷键，并检查 Swift / Electron 窗口；随后精确检查 packaged main 与 Swift command encoder 中是否存在 `thread_window.prepare` command。
- **证据**：3 次快捷键后 `HandAgentDesktop` 均为 PromptPanel 窗口 `640x448`，Electron 始终只有 `HandAgent Activity`，尺寸 `272x76`，未出现 `HandAgent ThreadWindow`；`dist/HandAgentDesktop.app/Contents/Resources/ElectronShell/dist/main/main.js` 不包含精确 `"thread_window.prepare"` command 字符串；Swift `ElectronShellProtocol` 只编码 `open_initial_prompt`、`open_history`、`focus`、`activity_window.show` 和 `shutdown`。
- **结论**：通过。show/toggle PromptPanel 不展示 ThreadWindow，也不发送 `thread_window.prepare` command；hidden ThreadWindow 预热由 Electron main 自行管理。

### Electron UI Shell agent-server supervisor 重启与最大失败诊断

- **验证日期**：2026-06-09
- **验证环境**：Electron flag packaged app，`mock-llm`；标准 `open dist/HandAgentDesktop.app` 启动。
- **验证过程**：先跑 `bash ./scripts/test.sh`、`bash ./scripts/swiftw test`、`bash ./scripts/swiftw build` 基线；正常启动后 kill 当前 agent-server，再检查 supervisor 是否拉起新进程与 `/api/activity`；随后用 Python 端口占用器监听 `127.0.0.1:4317`，重启 packaged app 等待超过 5 次 restart attempt，并通过真实全局快捷键打开 PromptPanel 读取 fatal 文案。
- **证据**：正常启动时 agent-server pid `87847` 监听 `127.0.0.1:4317`；`kill -9 87847` 后新 node pid `87996` 接管监听，`/api/activity` 首包为 `activity.snapshot` 且 `status:"idle"`。端口占用场景中 `127.0.0.1:4317` 只由 Python 端口占用器监听，超过最大重启次数后无 agent-server 残留；Swift PromptPanel 的 AX 与 Computer Use 均显示 `agent-server stopped after 5 restart attempts: agent-server exited with code 1`。
- **结论**：通过。Electron supervisor 会在 agent-server 非零退出后退避重启；超过最大次数后停止重启并把明确 fatal/diagnostic 文案传回 Swift PromptPanel。
