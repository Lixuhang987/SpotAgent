# 手工验收清单

## 验收目标

确认桌面 Agent MVP 的端到端主链路可用，并把仍需补齐或待验证的路径单独记录：热键唤起、输入 prompt、附件采集、创建会话窗口、LLM 返回结果、状态气泡回跳、权限审批、工作区管理、agent-server 崩溃恢复。

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
7. 观察 SessionWindow 中出现用户消息和 assistant 回复。当前后端是伪流式：一次性拿到 LLM 完整结果后发 `start/delta/end`，不要求 token 级 streaming。
8. 点击状态气泡，确认优先回到当前 running session；没有 running session 时回最近活跃窗口。
9. 如未配置 `apiKey`，确认错误会以可见文案 `Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。` 和 assistant 气泡展示，而不是静默失败。

## 选区与区域附件（P1）

10. 在任意 App 中选中一段文字，按 `captureSelection` 热键，确认 PromptPanel 弹出且输入框上方出现 textSelection chip；chip 可点击移除。
11. 没有任何文字选中时再按一次，确认 PromptPanel 仅弹出，无 chip（`SelectionCaptureResult.empty`）。
12. 按 `captureRegion` 热键进入 macOS 系统圈选 UI，画一个矩形完成截图，确认 PromptPanel 弹出且出现 imageRegion chip；点 chip 触发 QuickLook 内嵌预览，按 ESC 取消圈选时不弹 PromptPanel。
13. 提交带 chip 的 prompt，到 SessionWindow 后确认 agent-server 可收到 `attachments` 字段并写入会话持久化。注意：当前窗口的本地用户气泡只回显 prompt 文本，不展示附件摘要；这是 [TODO](/Users/mu9/proj/handAgent/docs/TODO.md) 中待修 UI 缺口。文本选区会在服务端拼入 user content，图片附件当前被 `composeUserContent()` 写成 image STUB，LLM 看不到真实图像字节。

## 工作区与文件 tool（P2）

14. 打开「设置」→ Workspaces tab，新增一个工作区，rootPath 选 `~/Desktop/handagent-test`，description 填「测试工作区」，确认列表立即更新。
15. 唤起 PromptPanel，输入「在测试工作区里写一个 hello.txt 文件」，确认：
    - LLM 先调 `workspace.list`（log 中可见 tool_call）。
    - 再调 `file.write({workspaceId, relativePath: "hello.txt", content})`，路径落到 `~/Desktop/handagent-test/hello.txt`。
16. 输入「读取上面那个文件」，确认 `file.read` 返回正文。
17. 验证沙箱：尝试让 LLM 写 `../../etc/passwd`，确认 tool 返回明确的越狱错误，文件不创建。

## 权限审批（P2）

18. 在 SessionWindow 内触发一个会调 `file.write` 的 prompt，首次出现内联气泡询问；选择「本次允许」，确认本次执行通过、下次同 tool 仍询问。
19. 第二次询问时选择「会话内允许」，再下一次同 tool 同参数自动放行；切换到新会话再触发一次，应再次询问。
20. 选择「拒绝」时，确认 LLM 收到「用户拒绝执行该 tool」的伪造 tool message 并能继续推进，不卡死。
21. 询问超时（默认 60s）保持沉默，确认按 deny 处理。
22. 关闭 SessionWindow 时若有挂起请求，确认全部被取消，不留僵尸。
23. 查看 `~/.spotAgent/permissions.json`，确认「始终允许」规则已写入。当前 Settings 尚无权限规则管理 UI，撤销永久规则需要后续补齐。

## agent-server 崩溃恢复（P3）

24. 通过 `kill -9 <agent-server pid>` 模拟崩溃，确认：
    - SessionWindow 出现连接错误或断开提示。
    - 桌面 App 在指数退避（约 1s/2s/4s/8s/16s）内自动重启 server。
    - 重启成功后新会话可继续提交。
    - 现有 SessionWindow 自动重连并重发 `open_session`；该路径已有 `SessionSocketClientTests` 覆盖，但仍需实机确认重启后 `session_snapshot` 正常恢复。
25. 连续杀 6 次模拟反复崩溃，确认第 6 次后弹出 `NSAlert("Agent Server 已停止")`；「查看日志」按钮是否能打开 `~/.spotAgent/` 仍需实机确认。

## 通过标准

- 主链路全部跑通；
- 文本附件能从用户输入流转到 agent-server；当前 SessionWindow 附件回显仍待补齐。图片附件能传输并落 Blob，但尚未进入多模态 LLM 消息；
- file tool 严格沙箱化，越狱被拒；
- 权限审批 UI 不阻塞其他会话，决策被持久化；权限规则管理 UI 是后续项；
- agent-server 崩溃可自动重启，过限有可见反馈；现有会话自动重连订阅需实机验证；
- 所有错误路径均有明确文案，不出现静默失败。
