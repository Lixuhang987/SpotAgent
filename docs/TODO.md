# 待办清单

按依赖关系分组，组内按优先级排列。

## 一、Tool 注册与运行时接入（当前最关键断点）

- [ ] 生产环境 Tool 注册：`startDefaultServer` 创建空 `ToolRegistry()`，9 个 builtin tool 均未注册到生产 server（`agent-server/src/server.ts:52`）
- [ ] Tool 需要 PlatformAdapter 注入：Tool 构造依赖 `PlatformAdapter`，server 启动时未创建 `MacPlatformAdapter` 也未注入

## 二、选区接入（CLAUDE.md 标记"待收尾"）

- [ ] Swift 侧选区采集未接入 PromptPanel：提交时 `attachments` 只有 `noAttachment` / `textToken`，没有触发系统选区采集的路径
- [ ] 选区未传入 WebSocket：`SessionSocketClient.sendUserMessage` 硬编码 `selection: nil`（`SessionSocketClient.swift:58`）
- [ ] 选区采集时机：应该新增一个全局快捷键，唤起选区，待用户选区后弹出promptPanel，并将图片放到上下文

## 三、ScreenCaptureKit 迁移

- [ ] 迁移到 ScreenCaptureKit：CLAUDE.md 要求优先使用 SCK，当前仍用 `screencapture` CLI（`MacPlatformAdapter.ts:91`）

## 六、会话历史与恢复

- [ ] 会话历史 UI + 恢复：`listSessions()` / `getSessionHistory()` 后端已实现，前端无浏览入口，也无法恢复或继续历史会话

## 七、审计与权限

- [ ] SessionEvent 审计写入：`SessionRecord` 定义了事件类型，但 runtime 循环中未写入（`SessionRecord.ts`）
- [ ] 权限审批流程：`permission_request` 事件类型已定义，无实际拦截/审批逻辑
- [ ] Tool 执行前权限检查：架构预留，未实现

## 八、补全与扩展

- [ ] 多 provider LLM 支持：当前只有 `VercelClient`（OpenAI 兼容），无 Anthropic / 本地模型
- [ ] Agent Server 错误恢复：已有 `AgentServerService`，但崩溃重启策略未明确
