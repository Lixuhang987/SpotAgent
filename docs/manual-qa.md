# 手工验收清单

## 验收目标

确认桌面 Agent MVP 的端到端主链路可用：热键唤起、输入 prompt、创建会话窗口、LLM 返回结果、状态气泡回跳。

## 验收前提

- 已完成依赖安装
- 已通过 `bash ./scripts/test.sh`
- 已通过 `bash ./scripts/swiftw test`
- 已通过 `bash ./scripts/swiftw build`

## 验收步骤

1. 启动桌面应用。
2. 确认状态气泡显示在桌面边缘。
3. 按全局热键唤起 PromptPanel。
4. 确认 PromptPanel 输入框自动聚焦。
5. 输入一段用户主动发起的请求并提交。
6. 观察 PromptPanel 关闭并新建 SessionWindow。
7. 观察 SessionWindow 中出现用户消息和 assistant 流式回复。
8. 点击状态气泡，确认优先回到当前 running session；没有 running session 时回最近活跃窗口。
9. 如未配置 `apiKey`，确认错误会以可见文案 `Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。` 和 assistant 气泡展示，而不是静默失败。

## 通过标准

- 热键可稳定唤起 PromptPanel
- 提交 prompt 后能稳定创建 SessionWindow
- 结果以 SwiftUI 消息列表形式反馈到 UI
- 状态气泡可作为回跳入口
- 错误路径有可见反馈
