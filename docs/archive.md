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
