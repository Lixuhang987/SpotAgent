# 已验证归档

本文记录经过实机 QA 验证通过的功能。每项保留验证日期、验证环境、验证过程与证据。

新条目从 [待验收.md](./待验收.md) 或 [manual-qa.md](./manual-qa.md) 验证通过后移入此处。

最后更新日期：2026-05-19。

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
