# Bug 清单

本文记录当前已知但尚未修复的 bug。功能待办继续放在 [TODO.md](/Users/mu9/proj/handAgent/docs/TODO.md)，架构问题继续放在 [architecture-review.md](/Users/mu9/proj/handAgent/docs/architecture-review.md)。

最后核对日期：2026-05-19。

## 修 bug 约束

- 修复跨 View / ViewModel / Coordinator / Service / 进程边界 / 系统 API 的 bug 时，必须遵循 [$trace-and-verify-call-chain](/Users/mu9/.agents/skills/trace-and-verify-call-chain/SKILL.md)。
- 修复前先写出预期调用链，并把每一跳标成 checkpoint：说明该跳应发生什么、如何观察、什么证据能证明。
- 按顺序复现并验证每个 checkpoint，停在第一个未被证实的跳点；不要提前假设后续链路成功或失败。
- 只有在明确证明某一跳失败后，才实施最小修复；修复完成后需要补回能防止回归的测试或手工验收记录，并重新验证完整链路。

## 当前 bug

### 1. 快捷键修改配置不会生效

**现象**：用户在设置页修改快捷键配置后，新配置不会在运行中的桌面 App 里生效。

**预期**：保存或录入新的快捷键后，后续全局快捷键触发应立即使用最新配置；若需要重新注册监听，也应由 Settings 保存链路或快捷键服务显式完成。

**排查约束**：修复前先按 `设置页录入 -> KeyboardShortcuts 存储 -> Hotkey registrar 监听更新 -> AppCoordinator 回调 -> PromptPanel / captureSelection / captureRegion 可见结果` 写出 checkpoint，并逐跳验证。

**待验证点**：

- `KeyboardShortcuts.Recorder` 是否已把新值写入持久化存储。
- `KeyboardShortcuts.onKeyUp` 注册的 handler 是否会自动跟随同名 shortcut 更新。
- 如果不会自动更新，当前 `AppServicesProductionImpls` / hotkey registrar 是否需要注销并重新注册监听。
- `PromptPanelController` 内部 action 快捷键匹配是否也需要响应设置变化。
