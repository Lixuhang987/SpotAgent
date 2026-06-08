# 待办清单

## 文档维护要求（重要）

- **完成即迁移**：当本文中的待办项被代码实现并通过测试覆盖后，必须将该项**从本文移除**，并按主题分组追加到 manual-qa
- **保留四个字段**：迁移到 manual-qa.md 时务必保留 完成日期 / 关键 commit / 实现位置 / 验收结果 四个字段，便于事后追溯。
- **同步更新模块文档**：若条目跨多个模块，迁移时同步更新对应 `<dir>.md` 索引。

最后核对日期：2026-06-08。

---

## thread / turn 破坏性重构遗留

- 对齐 codex 更完整 thread / turn 语义：
  - `thread.archive` / `thread.unarchive`：本轮已选择 `thread.delete` 作为最小可用删除语义，归档能力后续单独设计。
  - `thread.read`：按 threadId 拉取完整 thread 快照或分页读取历史。
  - `thread.fork`：从指定消息或 turn 分叉新 thread。
  - `thread.rollback`：回滚到指定消息或 turn，并明确持久化与 UI 展示规则。
  - thread metadata 更新：标题、preview、workspace、action binding 等字段的更新命令与通知。
  - thread settings 更新与通知：模型、工具范围、运行参数等 thread 级配置变更。
  - goal / budget：目标状态、预算、用量统计及 UI 呈现。
  - realtime：语音、低延迟流式输入输出或实时通道。
  - codex-style `item.*`：细粒度 item 生命周期、局部更新、折叠与重放语义。
  - 前端输入协议改造：React `ThreadSocketClient` 后续通过 `ThreadCommand` 从兼容旧 `turn.start` 切到更明确的 `input.submit` / `turn.steer` 或同等语义，补充运行中输入 ack、steered / queued 状态展示。
  - 破坏性清理：后端完成常驻 input queue 后，移除旧的“同 thread 新 turn 默认 abort 旧 run”语义，把命令命名、通知命名和文档统一到 input item / active turn 模型。
  - archived/list/search：归档 thread 的列表、搜索、恢复和删除管理。
  - thread-level event replay、notification 去重与 request 生命周期。
  - auth refresh request / response：server 触发鉴权刷新、desktop 回执结果的 `ServerRequest` / `ClientResponse` 语义。
  - 子 agent / 多 turn 并行语义。
  - run hooks 输入记录：把输入写进 thread 历史，并触发用户配置的 Hooks，例如审计、提示注入。
  - 历史保存顺序：明确 thread history 初始输入、hook 注入内容与后续消息的持久化顺序。
  - MCP server 激活来源：plugin 除了用户显式指定，也支持由 skill 声明启用。
- 补一轮端到端实机验证：thread 创建、thread 恢复、thread 列表、thread 删除、turn 中断、permission / workspace 回流。
- 补一轮端到端实机验证：共享 `AppServerConnection` 上同时承载 thread/turn 主协议和 `PlatformBridgeMessage`，确认 platform request 不再创建第二条 WebSocket。

---

## 手工验证清单入口

端到端验证步骤见 [manual-qa.md](./manual-qa.md)。每次完成本文条目后，应同步更新对应模块 `<dir>.md`。
