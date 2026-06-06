# 待办清单

## 文档维护要求（重要）

- **完成即迁移**：当本文中的待办项被代码实现并通过测试覆盖后，必须将该项**从本文移除**，并按主题分组追加到 manual-qa
- **保留四个字段**：迁移到 manual-qa.md 时务必保留 完成日期 / 关键 commit / 实现位置 / 验收结果 四个字段，便于事后追溯。
- **同步更新模块文档**：若条目跨多个模块，迁移时同步更新对应 `<dir>.md` 索引。

最后核对日期：2026-06-06。

---

## thread / turn 破坏性重构遗留

- Store 层仍需继续切到完整 TCA 模型：`Store / State / Action / Reducer`，拆分 thread 配置快照与运行缓存 `EventStore`。
- 对齐 codex 更完整 thread / turn 语义：
  - thread archive 与 delete 的最终产品选择。
  - thread title / preview 更新策略。
  - thread-level event replay、notification 去重与 request 生命周期。
  - 子 agent / 多 turn 并行语义。
- 补一轮端到端实机验证：thread 创建、thread 恢复、thread 列表、thread 删除、turn 中断、permission / workspace 回流。

---

run_hooks_and_record_inputs(...)：把输入写进 thread 历史，并触发用户配置的 Hooks（例如审计、提示注入）。
history最后还是最开始保存

mcpserver（plugin）除了用户显示指定，也支持在skill里启用

---

## 手工验证清单入口

端到端验证步骤见 [manual-qa.md](./manual-qa.md)。每次完成本文条目后，应同步更新对应模块 `<dir>.md`。
