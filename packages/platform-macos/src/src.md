# src

## 目录职责

`packages/platform-macos/src` 是 macOS 平台源码目录，负责实现 core 声明的两个关键抽象：

- `PlatformAdapter`
- `SelectionCapture`

## 文件说明

### `MacPlatformAdapter.ts`

负责实现平台 tool 所依赖的上下文读取与动作能力。

#### 输入来源

- `ScreenCaptureRequest`
- `OCRRequest`
- `AccessibilitySnapshotTarget`
- `AccessibilityActionRequest`

#### 输出结果

- `FrontmostAppInfo`
- `WindowInfo[]`
- `ScreenCaptureResult`
- `OCRResult`
- `AccessibilityNodeSnapshot`
- `AccessibilityActionResult`

### `MacSelectionCapture.ts`

负责实现用户主动选区文本采集。

#### 输入

- 无显式业务输入，内部通过复制当前选区来采集

#### 输出

- `SelectionCaptureResult`
  - `selected`
  - `empty`
  - `error`

## 当前实现细节

- 剪贴板读取依赖 `pbpaste`
- 剪贴板恢复依赖 `pbcopy`
- 前台 App 和窗口信息依赖 `osascript`
- 截图依赖 `screencapture`
- 选区复制脚本为 `tell application "System Events" to keystroke "c" using command down`

## 与上游的契约

- 所有实现都必须返回 core 定义的标准 DTO。
- 平台异常统一转成明确的 `Error`，由上游决定如何展示或恢复。
- 不在本层引入 UI 状态、窗口控制或 LLM provider 逻辑。
