# 手工验收清单

## 验收目标

确认桌面 Agent MVP 的端到端主链路可用，并把仍需补齐或待验证的路径单独记录：热键唤起、输入 prompt、附件采集、创建会话窗口、LLM 返回结果、状态气泡回跳、会话历史入口、权限审批、工作区管理、agent-server 崩溃恢复。

## 验收前提

- 已完成依赖安装
- 已通过 `bash ./scripts/test.sh`
- 已通过 `bash ./scripts/swiftw test`
- 已通过 `bash ./scripts/swiftw build`

## 主链路（P0）

1. 启动桌面应用。
2. 确认状态气泡显示在桌面右下角。
3. 按 `showPromptPanel` 热键（默认 ⌘⇧Space）唤起 PromptPanel。
4. 确认 PromptPanel 输入框自动聚焦。
5. 输入一段用户主动发起的请求并提交。
6. 观察 PromptPanel 关闭并新建 SessionWindow。
7. 观察 SessionWindow 中出现用户消息和 assistant 回复；assistant 回复应随 LLM token delta 逐段更新，而不是只在最终完成时一次性出现。
8. 点击状态气泡，确认优先回到当前 running session；没有 running session 时回最近活跃窗口。
9. 如未配置 `apiKey`，确认错误会以可见文案 `Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。` 和 assistant 气泡展示，而不是静默失败。

## 选区与区域附件（P1）

10. 在任意 App 中选中一段文字，按 `captureSelection` 热键，确认 PromptPanel 弹出且输入框上方出现 textSelection chip；chip 可点击移除。
11. 没有任何文字选中时再按一次，确认 PromptPanel 仅弹出，无 chip（`SelectionCaptureResult.empty`）。
12. 按 `captureRegion` 热键进入 macOS 系统圈选 UI，画一个矩形完成截图，确认 PromptPanel 弹出且出现 imageRegion chip；点 chip 触发 QuickLook 内嵌预览，按 ESC 取消圈选时不弹 PromptPanel。
13. 提交带 chip 的 prompt，到 SessionWindow 后确认当前用户气泡显示附件数量与类型（`text_selection` / `image`），agent-server 可收到 `attachments` 字段并写入会话持久化。文本选区会在服务端拼入 user content；图片附件持久化为 image STUB，进入 runtime 前会展开为 LLM 多模态 image part。

## 工作区与文件 tool（P2）

14. 打开「设置」→ Workspaces tab，新增一个工作区，rootPath 选 `~/Desktop/handagent-test`，description 填「测试工作区」，确认列表立即更新。
15. 唤起 PromptPanel，输入「在测试工作区里写一个 hello.txt 文件」，确认：
    - LLM 先调 `workspace.list`（log 中可见 tool_call）。
    - 再调 `file.write({workspaceId, relativePath: "hello.txt", content})`，路径落到 `~/Desktop/handagent-test/hello.txt`。
16. 输入「读取上面那个文件」，确认 `file.read` 返回正文。
17. 验证沙箱：尝试让 LLM 写 `../../etc/passwd`，确认 tool 返回明确的越狱错误，文件不创建。

## 会话历史入口（P2）

18. 准备至少两条 `~/.spotAgent/sessions/*.json` 历史会话，确认 `updatedAt` 不同且消息内容可区分。
19. 唤起 PromptPanel，输入历史标题、sessionId 或消息 preview 关键字，确认 action 列表出现「最近会话：...」并可过滤。
20. 点击最近会话 action，确认打开目标 session 的 SessionWindow；若同一 sessionId 已有窗口，再次恢复时只聚焦已有窗口，不新建第二个同 id 窗口。
21. 唤起 PromptPanel，点击「会话历史」action，确认独立历史窗口打开。
22. 在独立历史窗口搜索标题 / sessionId / preview，确认左侧列表过滤、右侧预览随选中项更新。
23. 点击恢复按钮，确认目标 session 打开或聚焦。
24. 在独立历史窗口删除一条历史，确认先出现二次确认；点取消时文件仍存在，点删除后对应 `~/.spotAgent/sessions/<id>.json` 被移除且列表刷新。
25. 在 SessionWindow 左侧历史侧栏右键删除，也应先出现二次确认，确认后才发送删除并移除列表。

## 权限审批（P2）

26. 在 SessionWindow 内触发一个会调 `file.write` 的 prompt，首次出现内联气泡询问；选择「本次允许」，确认本次执行通过、下次同 tool 仍询问。
27. 第二次询问时选择「会话内允许」，再下一次同 tool 同参数自动放行；切换到新会话再触发一次，应再次询问。
28. 选择「拒绝」时，确认 LLM 收到「用户拒绝执行该 tool」的伪造 tool message 并能继续推进，不卡死。
29. 询问超时（默认 60s）保持沉默，确认按 deny 处理。
30. 关闭 SessionWindow 时若有挂起请求，确认全部被取消，不留僵尸。
31. 查看 `~/.spotAgent/permissions.json`，确认「始终允许」规则已写入，并在 Settings → 权限中确认 toolName、参数摘要、decision、createdAt 可见，点击「撤销」后规则从 UI 和文件中移除。

## agent-server 崩溃恢复（P3）

32. 通过 `kill -9 <agent-server pid>` 模拟崩溃，确认：
    - SessionWindow 出现连接错误或断开提示。
    - 桌面 App 在指数退避（约 1s/2s/4s/8s/16s）内自动重启 server。
    - 重启成功后新会话可继续提交。
    - 现有 SessionWindow 自动重连并重发 `open_session`；该路径已有 `SessionSocketClientTests` 覆盖，但仍需实机确认重启后 `session_snapshot` 正常恢复。
33. 连续杀 6 次模拟反复崩溃，确认第 6 次后弹出 `NSAlert("Agent Server 已停止")`；「查看日志」按钮是否能打开 `~/.spotAgent/` 仍需实机确认。

## 通过标准

- 主链路全部跑通；
- 文本附件能从用户输入流转到 agent-server，并在当前 SessionWindow 用户气泡中显示附件摘要；图片附件能传输、回显摘要、落 Blob，并进入多模态 LLM 消息；
- PromptPanel 最近会话 action、独立历史窗口搜索 / 预览 / 恢复 / 删除确认可用，同一 sessionId 恢复只聚焦已有窗口或打开一个恢复窗口；
- file tool 严格沙箱化，越狱被拒；
- 权限审批 UI 不阻塞其他会话，决策被持久化；Settings 权限页可以查看和撤销永久规则；
- agent-server 崩溃可自动重启，过限有可见反馈；现有会话自动重连订阅需实机验证；
- 所有错误路径均有明确文案，不出现静默失败。
