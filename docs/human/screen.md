对 `handAgent` 而言，`ScreenCaptureKit` 相比你现在这条旧链路：

- `screencapture` 命令
- `CGWindowListCreateImage`
- 更老的流式方案如 `CGStream` / `AVCaptureScreenInput`

多出来的价值，不是“能截图”这么简单，而是把“截图、选目标、流式传输、音频、录制、系统分享 UI”收敛成一套统一能力。

**先给结论**

如果你的目标是桌面 agent 的“看屏幕、看窗口、持续观察、远程协作、按窗口精准抓取”，`ScreenCaptureKit` 明显比旧方案强。  
如果只是偶尔静态截一张矩形区域图，`screencapture` 还能凑合。

**对比旧方案，多出来的核心能力**

1. **统一的目标模型：显示器 / App / 窗口**
   旧方案里：
- `screencapture` 更偏命令式截图
- `CGWindowListCreateImage` 偏静态窗口图像
- 流式捕获和静态截图是两套思路

`ScreenCaptureKit` 用 `SCShareableContent` + `SCContentFilter` 统一表达可捕获对象，可以直接围绕：
- display
- app
- window  
  做过滤和切换。Apple 官方就把它定义成“select and stream only the content that you want to capture”。  
  来源：[ScreenCaptureKit 概览](https://developer.apple.com/documentation/screencapturekit)

2. **真正的高性能流式捕获**
   旧静态 API 更适合一次性取图，不适合持续观察。  
   `ScreenCaptureKit` 的 `SCStream` 是持续输出 `CMSampleBuffer`，而且 Apple 明确强调：
- 可到显示器原生分辨率和帧率
- 低 CPU 开销
- 利用 GPU  
  来源：[WWDC22 Meet ScreenCaptureKit](https://developer.apple.com/videos/play/wwdc2022/10156/)

这对 agent 很重要，因为你后面如果要做：
- 持续观察前台窗口变化
- OCR 增量刷新
- UI 自动化前的视觉确认  
  旧方案成本会明显更高。

3. **截图和流式能力共用一套配置**
   从 2023 起，`ScreenCaptureKit` 增加了 `SCScreenshotManager`。  
   这意味着静态截图不再是完全另一套 API，而是和流式捕获共享类似的：
- filter
- configuration
- color / pixel format / cursor 等配置

Apple 在 WWDC23 里专门提到，如果你以前用 `CGWindowListCreateImage`，迁移会更自然，因为很多窗口图像相关选项都能在 `SCStreamConfiguration` 里找到。  
来源：
- [WWDC23 What’s new in ScreenCaptureKit](https://developer.apple.com/videos/play/wwdc2023/10136/)
- [SCScreenshotManager](https://developer.apple.com/documentation/screencapturekit/scscreenshotmanager)

4. **系统级内容选择器**
   这是旧方案基本没有的体验级增量。  
   `SCContentSharingPicker` 是系统提供的 picker，能让用户从系统 UI 里选择共享哪个窗口 / App / 屏幕，还能更新已有 stream 的选择。Apple 还明确写了“不要自己造 picker”。  
   来源：[SCContentSharingPicker](https://developer.apple.com/documentation/screencapturekit/sccontentsharingpicker)

这对 `handAgent` 的意义是：
- 你可以把“用户授权并选择目标窗口”交给系统 UI
- 不用自己维护一套窗口列表选择器
- 更符合 macOS 的隐私和交互预期

5. **音频是第一等公民**
   旧截图链路基本不碰音频。  
   `ScreenCaptureKit` 从一开始就支持和屏幕内容一起捕获音频；到 2024 年又新增了：
- 麦克风输出
- 录制 API  
  来源：
- [ScreenCaptureKit updates](https://developer.apple.com/documentation/updates/screencapturekit)
- [WWDC24 Capture HDR content with ScreenCaptureKit](https://developer.apple.com/videos/play/wwdc2024/10088/)

如果你后面想让 agent：
- 理解会议窗口画面
- 同时拿到系统音频或麦克风音频
- 做会话录制  
  旧方案基本要自己拼很多东西，`ScreenCaptureKit` 原生支持更多。

6. **HDR 支持**
   2024 年新增 HDR capture：
- `captureDynamicRange`
- `SCStreamConfigurationPreset`
- HDR stream / screenshot  
  来源：
- [ScreenCaptureKit updates](https://developer.apple.com/documentation/updates/screencapturekit)
- [WWDC24 Capture HDR content with ScreenCaptureKit](https://developer.apple.com/videos/play/wwdc2024/10088/)

对一般 agent 不是第一优先级，但如果你要：
- 高保真看设计稿
- 看亮度差异明显的内容
- 做高质量远程共享  
  这是旧链路明显做不到或做不好的。

7. **内建录制输出**
   2024 年新增 `SCRecordingOutput`，可以直接把：
- 屏幕
- 系统音频
- 麦克风  
  录到文件里，并可配置输出 URL、文件类型、codec。  
  来源：[SCRecordingOutput](https://developer.apple.com/documentation/screencapturekit/screcordingoutput)

旧方案通常要自己：
- 取帧
- 编码
- 混音
- 写文件  
  复杂很多。

8. **和系统分享体验更深度集成**
   2023 有 `Presenter Overlay`，2024 又有按窗口请求分享的接口：
- `requestSharingOfWindow(_:)`
- `requestSharingOfWindow(usingPreview:title:...)`  
  来源：
- [WWDC23 What’s new in ScreenCaptureKit](https://developer.apple.com/videos/play/wwdc2023/10136/)
- [ScreenCaptureKit updates](https://developer.apple.com/documentation/updates/screencapturekit)
- [requestSharingOfWindow(_:completionHandler:)](https://developer.apple.com/documentation/appkit/nswindow/requestsharingofwindow%28_%3Acompletionhandler%3A%29)

这更偏“远程共享 / 协作”场景，不是 agent 本地 OCR 的刚需，但如果你以后做“让别人看某个 SessionWindow”，这比自己拼分享逻辑强得多。

9. **多显示器截图**
   Apple 在 2024 的更新里明确列了 “Capture screenshots across multiple displays”。  
   这对跨屏工作流比老静态 API 更自然。  
   来源：[ScreenCaptureKit updates](https://developer.apple.com/documentation/updates/screencapturekit)

10. **旧流式方案被官方边缘化**
    Apple 更新页写得很直接：  
    2023 年“Deprecated `CGStream`. Use `SCStreamConfiguration` instead.”  
    来源：[ScreenCaptureKit updates](https://developer.apple.com/documentation/updates/screencapturekit)

这意味着从演进方向看，继续押旧流式能力不划算。

**和你当前仓库最相关的现实判断**

你现在在 [packages/platform-macos/src/MacPlatformAdapter.ts](/Users/mu9/proj/handAgent/packages/platform-macos/src/MacPlatformAdapter.ts) 里用的是：

- `screencapture` 做区域截图
- `osascript` 查前台 app / window
- 还没有流式捕获

这套方案的问题是：

- 只能一次一张，不能低成本持续观察
- 没有统一的窗口/App 过滤模型
- 没有系统 picker
- 没有音频 / 麦克风 / 录制
- 没有 HDR
- 很难优雅扩展到“远程共享某个 session window”

**对 handAgent 的实际收益排序**

最值得换的不是全部功能，而是这 4 个：

1. `SCScreenshotManager` 取代 `screencapture`
2. `SCShareableContent` 提供窗口 / App / display 枚举
3. `SCStream` 做持续观察模式
4. `SCContentSharingPicker` 处理用户选择目标内容

HDR、录制、麦克风、Presenter Overlay 都是后续增强项，不是第一阶段必须。

**一句话判断**

如果你的目标只是“截个图给 OCR”，`screencapture` 还够用。  
如果你的目标是“桌面 agent 真正理解窗口级内容并持续工作”，`ScreenCaptureKit` 是明显更对的底座。

如果你要，我下一步可以直接给你一份面向 `handAgent` 的迁移设计：
- 哪些现有 `PlatformAdapter` 接口保持不变
- 哪些能力先用 `ScreenCaptureKit` 替换
- Swift 宿主层还是 TS 平台层负责采集更合适