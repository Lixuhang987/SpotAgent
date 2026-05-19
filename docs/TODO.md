# 待办清单

本文只保留**当前仍需修复、补齐或端到端验证**的事项。已由代码实现并有测试覆盖的历史项不在此处保留。

## 文档维护要求（重要）

- **完成即迁移**：当本文中的待办项被代码实现并通过测试覆盖（或完成手工验收）后，必须将该项**从本文移除**，并按主题分组追加到 [待验收.md](./待验收.md)。
- **保留四个字段**：迁移到 待验收.md 时务必保留 完成日期 / 关键 commit / 实现位置 / 验收结果 四个字段，便于事后追溯。
- **同步更新模块文档**：若条目跨多个模块，迁移时同步更新对应 `<dir>.md` 索引。
- **不要在本文记录历史**：本文只看现在和未来；历史去看 [待验收.md](./待验收.md) 或 `git log`。

历史进度参见 [待验收.md](./待验收.md)。架构改进路线参见 [architecture-review.md](./architecture-review.md)。

最后核对日期：2026-05-20。

---

## P2 — 运行时与 UX 增强

### 1. 权限审批关闭窗口取消挂起请求实机验证

**现状**：`once / session / always / deny / timeout` 与 Settings 权限规则列表（查看 / 撤销 / 关键参数摘要）已完成实机 QA 并归档；`FilePermissionPolicy`、`SessionPermissionBridge`、`AgentRuntime` 权限拦截、`SessionSocketClient` 解码、`SessionWindowView` 内联气泡均有自动测试覆盖。**剩余风险只在关闭 SessionWindow 时取消挂起权限请求这条真实桌面路径**。

**验收标准**：

- 触发一个会进入 `permission_request` 的 tool 调用，在授权气泡挂起时关闭 SessionWindow。
- 确认该请求被取消或按 deny 回流，不留下僵尸 pending request。
- 重新打开或新建会话后，同一 tool 仍能正常触发权限询问并继续执行。
- 将过程记入 [manual-qa.md](./manual-qa.md) 或 [live-qa-flow.md](./live-qa-flow.md)。

**依赖**：无。

---

## 手工验证清单入口

端到端验证步骤见 [manual-qa.md](./manual-qa.md)；实机 QA 流程与缺陷报告格式见 [live-qa-flow.md](./live-qa-flow.md)。每次完成本文条目后，应同步更新 [待验收.md](./待验收.md) 与对应模块 `<dir>.md`。
