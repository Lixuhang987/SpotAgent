# 待办清单

## 文档维护要求（重要）

- **完成即迁移**：当本文中的待办项被代码实现并通过测试覆盖后，必须将该项**从本文移除**，并按主题分组追加到 manual-qa
- **保留四个字段**：迁移到 manual-qa.md 时务必保留 完成日期 / 关键 commit / 实现位置 / 验收结果 四个字段，便于事后追溯。
- **同步更新模块文档**：若条目跨多个模块，迁移时同步更新对应 `<dir>.md` 索引。

最后核对日期：2026-06-06。

---

## thread / turn 破坏性重构遗留

- Swift desktop 仍需切到 Thread-only 主协议：
  - 统一 `SessionWindow` / `SessionProtocolClient` / `SessionEventBus` / 相关 ViewModel 命名与 DTO。
  - 引入统一 `AppServer` 宿主对象，由 app 启动时初始化并负责创建 app-server 进程、维护统一 WebSocket 请求入口。
  - `PlatformBridgeService` 保持独立对象，但复用同一 app-server 连接语义订阅 `ServerRequest` / 平台请求回流。
  - Store 层切到 TCA：`Store / State / Action / Reducer`，拆分 thread 配置快照 `SessionState` 的替代物与运行缓存 `EventStore`。
- core 仍需删除旧 `Session*` 迁移残留，不保留兼容层：
  - `SessionCommand` / `SessionEvent` / `SessionMessage` / `SessionProtocolShared`。
  - `AgentSessionHandle`。
  - `SessionRecord` / `SessionStore` / `FileSessionStore` / `InMemorySessionStore`。
  - `AgentSession` 命名是否改为 Thread 输入模型，待 Swift 主链路切换时一并定。
- 统一持久化与历史路径：
  - agent-server 新主链路已写 `~/.spotAgent/threads/`。
  - desktop 历史列表与旧 `~/.spotAgent/sessions/` 读取路径仍需破坏性切换，不做长期迁移兼容。
- desktop 与 agent-server 主链路完成切换后，补一轮端到端验证：thread 创建、thread 恢复、thread 列表、thread 删除、turn 中断、permission / workspace 回流。

---

run_hooks_and_record_inputs(...)：把输入写进会话历史，并触发用户配置的 Hooks（例如审计、提示注入）。
history最后还是最开始保存

mcpserver（plugin）除了用户显示指定，也支持在skill里启用

---

## 手工验证清单入口

端到端验证步骤见 [manual-qa.md](./manual-qa.md)。每次完成本文条目后，应同步更新对应模块 `<dir>.md`。
