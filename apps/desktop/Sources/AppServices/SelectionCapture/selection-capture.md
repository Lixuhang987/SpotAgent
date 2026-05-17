# SelectionCapture 模块

桌面端的两条用户主动采集路径：文本选区（`MacSelectionCaptureProvider`）与区域截图（`MacRegionCaptureProvider`）。两者都不属于 tool，而是用户触发的 attachment，归属 [Hotkey](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/Hotkey/hotkey.md) → [Coordinator](/Users/mu9/proj/handAgent/apps/desktop/Sources/Coordinator/coordinator.md) → [PromptPanel](/Users/mu9/proj/handAgent/apps/desktop/Sources/PromptPanel/prompt-panel.md) attachment 流程。

## 文件

| 文件 | 职责 |
|------|------|
| `SelectionCaptureProvider.swift` | 协议 `SelectionCaptureProvider` + 结果 `SelectionCaptureResult`（`selected/empty/error`）；`MacSelectionCaptureProvider` 用 osascript 触发 Cmd-C，120ms 后读 `NSPasteboard` 并恢复原内容 |
| `RegionCaptureProvider.swift` | 协议 `RegionCaptureProvider` + 结果 `RegionCaptureResult`（`captured/cancelled/error`）；`MacRegionCaptureProvider` 调 `/usr/sbin/screencapture -i -x` 写临时 PNG 后 base64 编码 |

## 数据流

```
captureSelection 热键
  └─ AppCoordinator.handleCaptureSelectionHotkey()
       └─ MacSelectionCaptureProvider.captureSelectedText()
            ├─ selected(text)  → PromptPanelController.appendAttachment(.textSelection(...))
            ├─ empty           → 仅 PromptPanelController.show()
            └─ error(message)  → PromptPanelController.appendAttachment(.selectionError(...))

captureRegion 热键
  └─ AppCoordinator.handleCaptureRegionHotkey()
       └─ MacRegionCaptureProvider.captureRegion()
            ├─ captured(base64) → PromptPanelController.appendAttachment(.imageRegion(...))
            ├─ cancelled        → 不弹面板（用户按 ESC）
            └─ error(message)   → PromptPanelController.appendAttachment(.selectionError(...))
```

附件提交后由 Coordinator 翻译为 `UserMessageAttachmentPayload`（`textSelection` / `image`），通过 `SessionSocketClient` 走 `user_message.attachments` 发到 agent-server。

## 设计备注

- 当前两条路径都使用 macOS 命令行兜底，违反 AGENTS.md「优先原生 API」的偏好。原因与后续计划：
  - **文本选区**：macOS 没有公开「读当前应用的当前选区」API，可用方案是 Accessibility API（需 a11y 权限 + 应用支持）或合成 Cmd-C。当前选 osascript Cmd-C，因为不需要额外权限弹窗，适合 MVP。后续可在用户授予 Accessibility 权限后切到 AX 路径以避免污染剪贴板。
  - **区域截图**：`screencapture -i` 是当前最快出 MVP 的圈选 UI。后续按 TODO 2.3 / 3.1 计划用 ScreenCaptureKit 自建圈选 + 截图 UI，避免依赖 CLI、无需切到「截图全屏然后裁剪」。
- 两个 Provider 都是 `Sendable` 协议、可注入；测试用 stub 实现替代即可。
- 临时文件失败不抛异常，统一映射成 `RegionCaptureResult.error`。
- 文本选区路径 120ms 等待是经验值；过短会读不到剪贴板，过长用户能感知到延迟。
- 选区 / 截图后不直接构造 `SessionMessage`，必须经 PromptPanel attachment chip 让用户确认或编辑后再提交，符合 AGENTS.md「只有用户主动输入可以作为初始上下文」的边界。

## 编辑此目录的约束

- 不要在此目录新增 tool 化的「screen.capture」或「accessibility.read」实现，那是 [PlatformBridge](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md) 的职责。
- 不要把 Provider 的结果直接发给 agent-server，必须让 PromptPanel 展示 chip。
- 新增采集路径请同时新增对应的 `PromptAttachmentResult` case 与 `UserMessageAttachmentPayload` case，并保持两者一一映射。
