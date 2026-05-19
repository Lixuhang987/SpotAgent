# HandAgent 实机 QA 测试流程

## 文档状态

本文档是待审核的实机 QA 执行流程。审核通过前，不启动桌面 App、不注入全局快捷键、不执行正式验收步骤；只允许做文档修订和必要的静态资料核对。

本文档补充 [manual-qa.md](manual-qa.md)：`manual-qa.md` 定义验收清单和通过标准，本文档定义执行顺序、取证方式、停止条件和报告格式。

## 测试目标

- 验证桌面端 MVP 主链路：全局热键唤起 PromptPanel、提交 prompt、创建 SessionWindow、agent-server 驱动 LLM/tool 循环、状态气泡回跳。
- 验证用户主动附件入口：文本选区 chip、区域截图 chip、附件随用户消息进入会话窗口和持久化。
- 验证设置与工具链路：模型设置错误展示、workspace 配置、文件 tool 沙箱、权限审批。
- 验证恢复链路：agent-server 崩溃自动重启、SessionWindow 自动重连和 `session_snapshot` 恢复。
- 区分产品缺陷、环境配置问题和测试工具限制；没有证据的现象不写成产品 bug。

## 固定约束

- 测试必须在独立 worktree 执行，路径以实际 QA 分支为准，例如 `/Users/mu9/proj/handAgent/.worktrees/<task-name>`。
- 桌面 App 以标准 `.app` bundle 方式启动，路径固定为 `dist/HandAgentDesktop.app`；不要改 bundle id 或移动 `.app`，避免 macOS 权限记忆失效。
- 产品 UI 观察与点击、输入、滚动使用 `computer-use:computer-use`。
- 全局快捷键判定不用 Computer Use `press_key`。默认 `showPromptPanel` 热键必须用原生 macOS 事件注入：

```bash
osascript -e 'tell application "System Events" to key code 49 using {command down, shift down}'
```

- PromptPanel 提交使用 Return 触发 TextField submit；不要点击模糊的 accessibility `button 1`，该按钮可能是设置齿轮：

```bash
osascript -e 'tell application "System Events" to key code 36'
```

- 屏幕、窗口、文件、剪贴板、App 状态不得作为会话初始上下文默认注入 LLM。QA 过程可以用系统命令取证，但这些证据只用于测试报告，不进入用户 prompt。
- 可疑缺陷必须按调用链逐跳验证，停在第一处未被证实的跳点；不能从测试工具失败直接推断产品 bug。

## 准备阶段

### 1. 记录环境

执行前记录以下信息，写入测试记录或 `bug.md` 的“基线与环境”部分：

```bash
pwd
git branch --show-current
git rev-parse HEAD
sw_vers
xcodebuild -version
pnpm --version
node --version
```

期望：

- `pwd` 位于独立 worktree。
- 当前分支为本次 QA 文档或后续 QA 分支。
- Node、pnpm、Xcode 可用。

### 2. 安装依赖与基线

正式实机 QA 前必须先跑基线；任一失败则停止实机测试，先记录失败，不启动桌面 App：

```bash
pnpm install --frozen-lockfile
bash ./scripts/test.sh
bash ./scripts/swiftw test
bash ./scripts/swiftw build
```

说明：

- `scripts/swiftw` 会把 Swift 模块缓存固定到仓库内 `.cache/swift/`。
- 如果 Swift 命令在当前 shell 失败，以当前 shell 输出为准，不用 Codex Stop hook 结果替代。
- 如果只是在审核本文档，不执行本节基线。

### 3. 打包与启动

基线通过后打包并启动：

```bash
bash ./scripts/package-app.sh
open dist/HandAgentDesktop.app
```

启动后立刻取证：

```bash
pgrep -fl HandAgentDesktop
lsof -nP -iTCP:4317 -sTCP:LISTEN
```

如果 4317 端口有监听，继续查 node 命令路径：

```bash
ps -o pid,ppid,command -p <agent-server-pid>
```

期望：

- `HandAgentDesktop` 进程存在。
- agent-server 监听 `127.0.0.1:4317`。
- node 命令路径指向当前 worktree 的 `apps/agent-server/src/server.ts`，不能误用主仓库路径。

## 阶段一：启动与状态气泡

### 操作

1. 用 Computer Use 观察 `HandAgentDesktop`。
2. 查询窗口数量和尺寸：

```bash
osascript -e 'tell application "System Events" to tell process "HandAgentDesktop" to get count of windows'
osascript -e 'tell application "System Events" to tell process "HandAgentDesktop" to get value of attribute "AXSize" of every window'
```

### 期望

- 桌面右下角出现状态气泡。
- 状态气泡窗口尺寸约为 `280x62`。
- 气泡文案与当前会话状态一致；无 running session 时应显示空闲或最近摘要。

### 失败停止点

- App 未启动：停在打包 / 启动链路，不进入热键测试。
- agent-server 未启动：记录 UI 可见错误、进程输出和 4317 端口状态，不提交 prompt。
- 气泡不可见但进程正常：继续取窗口列表、屏幕位置、activation policy 证据后再判断。

## 阶段二：全局热键与 PromptPanel

### 操作

1. 注入默认 `showPromptPanel` 快捷键：

```bash
osascript -e 'tell application "System Events" to key code 49 using {command down, shift down}'
```

2. 用 Computer Use 观察 PromptPanel 是否出现。
3. 查询窗口数量和尺寸：

```bash
osascript -e 'tell application "System Events" to tell process "HandAgentDesktop" to get count of windows'
osascript -e 'tell application "System Events" to tell process "HandAgentDesktop" to get value of attribute "AXSize" of every window'
```

4. 查询输入框焦点：

```bash
osascript -e 'tell application "System Events" to tell process "HandAgentDesktop" to get focused of text field 1 of window 1'
```

### 期望

- PromptPanel 出现，尺寸约为 `640x448`。
- 输入框自动聚焦。
- 普通 `showPromptPanel` 不应自动携带 `[选区]` 或附件 chip。
- server 不可用时 PromptPanel 可以显示错误并保留草稿，但不能静默吞掉输入。

### 失败停止点

- 原生快捷键事件发出后窗口无变化：先核对 `KeyboardShortcuts` 当前配置与 macOS 辅助功能权限。
- Computer Use 没有观察到面板，但窗口数量 / 尺寸已变化：记录为测试观察限制，继续用系统证据和可见截图交叉确认。
- 输入框未聚焦：停在 PromptPanel 焦点链路，不进入提交。

## 阶段三：主会话链路

### 操作

1. 在 PromptPanel 输入一个短 prompt，例如“请用一句话回复 HandAgent 主链路测试”。
2. 用 Return 提交：

```bash
osascript -e 'tell application "System Events" to key code 36'
```

3. 用 Computer Use 观察 PromptPanel 关闭、SessionWindow 出现。
4. 查询窗口尺寸，确认出现约 `760x560` 的会话窗口。
5. 观察用户气泡、assistant 气泡、状态条、错误 banner。
6. 查询最新 session 文件：

```bash
ls -lt ~/.spotAgent/sessions | head
jq '.metadata, .messages[-4:], .events[-8:]' ~/.spotAgent/sessions/<session-id>.json
```

### 期望

- PromptPanel 关闭，新建标题以 `Session` 开头的 SessionWindow。
- 会话窗口先出现用户气泡，再出现 assistant 回复或明确错误。
- 如果缺少模型配置，应可见展示 `Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。`，并进入 assistant / error 展示路径，而不是静默失败。
- session 文件包含用户消息、assistant 消息或 error event。

### 调用链取证

| 跳点 | 证据 |
| --- | --- |
| PromptPanel submit | Return 注入命令、Computer Use 看到面板关闭 |
| SessionWindow 创建 | 窗口数量 / 尺寸 / 标题 |
| WebSocket 连接 | SessionWindow 连接状态、4317 端口监听 |
| agent-server 收到消息 | session 文件 messages / events |
| LLM 或错误返回 | UI 气泡、session event、状态气泡摘要 |

## 阶段四：状态气泡回跳

### 操作

1. 在会话运行中点击状态气泡。
2. 关闭当前 SessionWindow 后再次点击状态气泡。
3. 如存在历史会话，观察是否回到最近活跃窗口；无可回跳窗口时是否打开 PromptPanel。

### 期望

- running session 优先被激活。
- 无 running session 时回到最近活跃窗口。
- 无窗口可回跳时打开 PromptPanel。
- 气泡文本与 SessionWindow 状态一致。

### 失败停止点

- 点击未触发：先用 Computer Use 确认命中气泡，而不是被其他窗口遮挡。
- 激活失败：记录窗口层级、窗口标题、气泡 registry 派生状态。

## 阶段五：文本选区附件

### 前提

`captureSelection` 当前无默认快捷键，需在 Settings 的快捷键页为本轮 QA 临时设置；设置后无需重启 App，运行中注册层应自动重绑定。

### 操作

1. 打开任意可选择文本的 App，选中固定文本，例如“HandAgent selection QA sample”。
2. 触发 `captureSelection` 快捷键。
3. 用 Computer Use 观察 PromptPanel 是否出现 textSelection chip。
4. 点击 chip 的移除入口，确认可移除；重新采集一次后提交 prompt。
5. 检查 SessionWindow 用户气泡附件摘要和 session 文件。

### 期望

- 有选区时出现 `text_selection` 附件摘要。
- 无选区时只弹 PromptPanel，不出现 chip。
- 提交后用户气泡保留原始 prompt，并显示附件数量与类型。
- session 文件中能看到由服务端拼入的 `[选区]` 文本块或附件相关消息。

### 失败停止点

- 未弹面板：先核对快捷键设置和重绑定。
- 弹面板但无 chip：检查剪贴板是否被选区 App 写入、`MacSelectionCaptureProvider` 是否返回 empty/error。
- chip 正常但持久化缺失：停在 Coordinator 到 `UserMessageAttachmentPayload` 或 agent-server 持久化边界。

## 阶段六：区域截图附件

### 前提

`captureRegion` 当前无默认快捷键，需在 Settings 的快捷键页为本轮 QA 临时设置。

### 操作

1. 触发 `captureRegion` 快捷键。
2. 在系统圈选 UI 中拖出一个小矩形。
3. 用 Computer Use 观察 PromptPanel 是否出现 imageRegion chip。
4. 点击图片 chip，确认 QuickLook 预览可打开；关闭预览。
5. 提交带图片 chip 的 prompt，检查 SessionWindow 用户附件摘要和 session 文件。
6. 再触发一次 `captureRegion` 并按 ESC 取消，确认不弹 PromptPanel。

### 期望

- 成功圈选后出现 `image` 附件摘要。
- QuickLook 预览可打开，关闭后 UI 仍可用。
- 图片附件持久化为 image STUB；进入 runtime 前展开为多模态 image part。
- ESC 取消不弹 PromptPanel，不产生会话。

### 失败停止点

- 系统圈选未出现：先记录 Screen Recording 权限状态和 `screencapture -i` 行为。
- chip 出现但预览失败：停在 `QuickLookPreviewController` / 临时文件边界。
- UI 显示正常但 session 缺附件：停在提交协议或持久化边界。

## 阶段七：设置、workspace 与文件 tool

### 操作

1. 打开 Settings，检查模型、快捷键、工作区三个 Tab 是否可访问。
2. 在 Workspaces tab 新增工作区：
   - rootPath：`~/Desktop/handagent-test`
   - description：`测试工作区`
3. 如当前 agent-server 不会热加载 workspace，重启桌面 App 后继续。
4. 提交“在测试工作区里写一个 hello.txt 文件”。
5. 检查 tool event、实际文件、权限审批路径。
6. 提交“读取上面那个文件”。
7. 提交越狱写入请求，例如写 `../../etc/passwd`，检查 tool 拒绝。

### 期望

- `~/.spotAgent/workspaces.json` 写入新增 workspace。
- LLM 先通过 `workspace.list` 了解 workspace，再调用 `file.write` / `file.read`。
- `~/Desktop/handagent-test/hello.txt` 被创建并可读取。
- 越狱路径被明确拒绝，不创建文件。

### 取证命令

```bash
cat ~/.spotAgent/workspaces.json
ls -la ~/Desktop/handagent-test
cat ~/Desktop/handagent-test/hello.txt
jq '.events[-20:]' ~/.spotAgent/sessions/<session-id>.json
```

## 阶段八：权限审批

### 操作

1. 首次触发 `file.write`，观察内联权限气泡。
2. 分别验证“本次允许”“会话内允许”“拒绝”。
3. 如果 UI 提供“始终允许”，验证 `~/.spotAgent/permissions.json` 写入。
4. 保持 60 秒不响应一次请求，验证超时按 deny 处理。
5. 关闭有挂起权限请求的 SessionWindow，确认请求被取消。

### 期望

- 权限气泡不阻塞其他会话窗口。
- 本次允许只影响本次调用。
- 会话内允许只影响当前 session。
- 拒绝会让 LLM 收到“用户拒绝执行该 tool”的 tool message，不应卡死。
- 超时和窗口关闭都有明确状态，不留僵尸请求。

### 取证

```bash
cat ~/.spotAgent/permissions.json
jq '.events[-30:]' ~/.spotAgent/sessions/<session-id>.json
```

## 阶段九：agent-server 崩溃恢复

### 操作

1. 找到 agent-server pid：

```bash
lsof -nP -iTCP:4317 -sTCP:LISTEN
ps -o pid,ppid,command -p <agent-server-pid>
```

2. 确认该 pid 是当前 `HandAgentDesktop` 的子进程，且命令路径在当前 worktree。
3. 执行一次崩溃模拟：

```bash
kill -9 <agent-server-pid>
```

4. 观察 SessionWindow 连接 banner、状态气泡和 4317 端口恢复。
5. 等待重连后提交新消息，检查是否继续可用。
6. 需要验证重启上限时，连续杀 6 次，观察第 6 次后的原生 alert。

### 期望

- 单次崩溃后桌面 App 按指数退避重启 agent-server。
- SessionWindow 自动重连并重发 `open_session`。
- server 返回 `session_snapshot` 后历史消息恢复。
- 连续失败超过上限后弹出 `Agent Server 已停止`，且“查看日志”按钮能打开 `~/.spotAgent/`。

### 失败停止点

- kill 到了非当前 worktree server：本轮恢复测试作废，重新启动后再测。
- 端口恢复但 SessionWindow 不恢复：停在 `SessionSocketClient` 重连 / `open_session` 边界。
- SessionWindow 恢复但历史丢失：停在 agent-server `session_snapshot` / session store 边界。

## 阶段十：清理

测试完成或中断时必须记录清理状态：

```bash
osascript -e 'tell application "HandAgentDesktop" to quit'
pgrep -fl HandAgentDesktop
lsof -nP -iTCP:4317 -sTCP:LISTEN
```

如仍有当前测试启动的 agent-server 子进程，先确认 pid 与命令路径，再停止：

```bash
kill <agent-server-pid>
```

测试数据按审核要求处理：

- `~/Desktop/handagent-test`：如果只用于本轮 QA，可删除；如果包含失败证据，先保留并在报告里注明。
- `~/.spotAgent/sessions/<session-id>.json`：涉及缺陷证据的 session 文件保留。
- `~/.spotAgent/permissions.json` 与 `workspaces.json`：如测试修改影响后续日常使用，记录后恢复。

## 缺陷报告规则

确认 bug 后写中文 `bug.md`。产品缺陷和测试工具限制分开记录。

每个产品缺陷包含：

- 严重级别：P0 / P1 / P2 / P3。
- 复现步骤：从干净状态开始，写到最小可复现路径。
- 实际结果：UI 文案、窗口状态、session event、文件系统结果。
- 期望结果：引用 `manual-qa.md` 或本文档中的明确期望。
- 证据：Computer Use 观察、窗口数量 / 尺寸、进程命令、端口状态、session 文件片段。
- 初步调用链 / 根因边界：只写已验证到的第一个失败跳点。

测试工具限制单独包含：

- 工具行为。
- 产品侧系统证据。
- 为什么不判定为产品 bug。
- 是否需要后续人工键盘或真实用户操作复核。

## 通过标准

本流程完成时需要有以下结论之一：

- 通过：`manual-qa.md` P0/P1/P2/P3 项按计划完成，缺陷为空或只剩已确认非阻塞项。
- 条件通过：主链路通过，但存在明确记录的环境限制、上游模型错误或测试工具限制。
- 不通过：任一主链路阻塞，或权限 / 文件沙箱 / 崩溃恢复出现高风险缺陷。
- 未执行：本文档尚未审核或基线失败，未进入正式实机 QA。
