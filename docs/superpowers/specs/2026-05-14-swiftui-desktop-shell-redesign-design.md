# SwiftUI 桌面交互壳重构设计

## 背景

当前桌面端采用 `Swift + WKWebView + React` 的交互壳结构：

- `apps/desktop/HandAgentApp.swift` 负责宿主生命周期、全局热键、窗口和 `WKWebView`
- `apps/desktop/Web` 负责 prompt 输入、消息气泡渲染与 WebSocket 交互
- `apps/agent-server` 与 `packages/core` 继续承担 ReAct loop 与协议处理

该结构可以验证主链路，但存在几个明显问题：

- 桌面交互体验受限于 Web 容器，难以做出 Raycast 风格的瞬时唤起体验
- 宿主窗口、热键、server 生命周期与 WebView 桥接职责耦合在一个入口文件中
- 当前交互只适合单页面 prompt + 气泡列表，不适合扩展为多窗口的会话工作流
- 后续如果引入常驻气泡、输入增强 action、桌宠演进，会持续被 `WKWebView` 架构拖累

本次重构目标是移除 `WKWebView`，把 UI 层和状态层迁到 Swift/SwiftUI，同时保持 `core` 与 `agent-server` 继续留在 TS，Swift 仅通过 WebSocket 与协议边界交互。

## 目标

- 去除 `WKWebView`，把桌面交互层重写为 `AppKit + SwiftUI`
- 保持 `apps/agent-server` 与 `packages/core` 继续承担 Agent runtime 逻辑
- 建立更符合桌面启动器产品的交互模型：
  - 常驻 `StatusBubble`
  - 单例 Raycast 风格 `PromptPanel`
  - 多实例 `SessionWindow`
- 让 Swift 与 TS 的边界严格收敛到 `WebSocket + SessionMessage` 协议
- 为后续桌宠化、session 恢复、action 扩展保留演进空间

## 非目标

- 第一版不实现完整桌宠动画系统
- 第一版不实现 session 持久化恢复
- 第一版不实现完整插件市场或动态下载能力
- 第一版不在 Swift 侧直接接入 `packages/core` runtime
- 第一版不改动 ReAct loop 核心逻辑，只补足服务端 session 抽象边界

## 目标交互

### 1. 常驻状态气泡

桌面上常驻一个轻量 `StatusBubble`，作为全局入口和全局状态回显。

职责：

- 展示全局聚合状态：`idle`、`running`、`failed`
- 展示当前聚焦 session 的最新 assistant 摘要
- 点击时执行统一跳转规则：
  - 若存在运行中的 session，回到最近活跃的运行中 `SessionWindow`
  - 否则回到最近活跃的 `SessionWindow`
  - 若没有可回到的 session，则打开 `PromptPanel`

第一版 `StatusBubble` 只做状态入口，不承担桌宠外观、养成或复杂动画。后续如需桌宠化，应在不改动 session 与窗口模型的前提下替换其视觉壳层。

### 2. Raycast 风格输入面板

`PromptPanel` 是单例 `NSPanel`，提供随时唤起的输入体验。

行为要求：

- 可通过全局快捷键唤起
- 可通过点击 `StatusBubble` 唤起
- 打开后自动聚焦输入框
- `Esc` 关闭
- 关闭时返还焦点给唤起前的前台应用
- 面板可拖动
- 不参与 `Command+Tab`
- 不承载会话历史和长时任务渲染

界面结构：

- 顶部：prompt 输入区域
- 中部：已注入上下文 token/attachment 行
- 底部：可搜索、可键盘选择的 action chips 命令面板

交互规则：

- 用户输入 prompt
- 用户可通过 action chips 注入选区文本、选区图片等上下文
- `Enter` 提交后创建新的 session，并打开新的 `SessionWindow`
- `PromptPanel` 自身在提交后关闭

### 3. 多窗口会话工作台

每个 Agent 会话使用一个独立 `SessionWindow` 承载。

行为要求：

- 每次从 `PromptPanel` 提交 prompt，创建一个新的 `SessionWindow`
- `SessionWindow` 是普通应用窗口，而非瞬时面板
- 支持左上角标准关闭按钮
- 支持 `Command+\`` 在多个 `SessionWindow` 之间切换
- 即使已有若干 `SessionWindow` 打开，仍可再次唤起单例 `PromptPanel` 新建会话

界面结构：

- 顶部：session 标题、运行状态、基础操作
- 中部：完整 ReAct loop 渲染区
- 底部：会话内继续追问的输入区

会话区应显式区分以下内容块：

- 用户消息
- assistant 流式回复
- tool/status 轨迹

第一版可以不暴露复杂的思考可视化，但消息结构要为后续更细粒度的 ReAct 渲染预留位置。

## 窗口模型

本次重构采用“双类型窗口”：

### PromptPanel

- 类型：`NSPanel`
- 实例数：全局单例
- 生命周期：可隐藏/重显，不作为持久工作窗口
- 特性：轻量、瞬时、可返还焦点、不可替代会话窗口

### SessionWindow

- 类型：普通 `NSWindow`
- 实例数：多实例
- 生命周期：每个 `sessionId` 对应一个自治窗口实例
- 特性：常驻、可切换、可关闭、可作为普通应用窗口参与多窗口管理

## 宿主职责拆分

不采用一个过厚的全局 `DesktopCoordinator`，而是拆为更薄的宿主服务层与窗口控制器层。

### AppServices

应用级服务容器，仅负责装配和持有全局服务，不承载具体会话逻辑。

包含：

- `HotkeyService`
- `AgentServerService`
- `SessionRegistry`

### HotkeyService

职责：

- 注册/注销全局热键
- 在热键触发时调用 `PromptPanelController`

说明：

- 全局热键属于 app 级能力，不应直接附着在 `PromptPanel` 生命周期上
- `PromptPanel` 可以被隐藏、销毁、重建，而全局热键应在 app 存活期间持续有效
- 该设计也便于后续从菜单栏、状态气泡、设置页等多个入口统一调用输入面板

### AgentServerService

职责：

- 启动/停止本地 `apps/agent-server`
- 维护本地 server 生命周期
- 向 UI 层暴露基础健康状态

约束：

- 桌面端继续负责拉起本地 `agent-server`
- Swift 不直接访问 TS runtime 内部 API

### SessionRegistry

职责：

- 维护最近使用 `sessionId` 链表
- 维护每个 session 的轻量摘要
- 为 `StatusBubble` 提供全局聚合视图

每个 session 只记录最小必要信息：

- `sessionId`
- `isRunning`
- `latestSummary`
- `lastActiveAt`
- `windowIsOpen`

`SessionRegistry` 不存储完整消息历史，不承担 reducer，不作为会话单一真相源。

### PromptPanelController

职责：

- 管理单例 `PromptPanel`
- 处理显示、隐藏、焦点返还、拖动与首焦点输入
- 将提交的新请求转换为“创建 session + 打开 SessionWindow”的动作

### SessionWindowController

职责：

- 管理一个 `SessionWindow`
- 持有对应的 `SessionViewModel`
- 在窗口活跃、消息更新、关闭时向 `SessionRegistry` 回报轻量摘要

## 状态管理策略

采用“窗口自治 + 全局轻量聚合”：

### PromptPanel 自治状态

- `draft`
- 当前选择的 action
- 待注入上下文列表
- 键盘高亮索引
- 唤起前前台应用引用

### SessionWindow 自治状态

- `sessionId`
- 完整消息列表
- 当前运行状态
- 错误状态
- 流式输出状态
- 滚动位置与窗口内纯 UI 状态
- WebSocket 连接状态

### SessionRegistry 聚合状态

仅保存给全局入口使用的摘要信息，不持有会话真相。

这一策略满足两个目标：

- `SessionWindow` 可以像普通 macOS 工作窗口一样自治
- `StatusBubble` 与全局跳转逻辑仍能获得足够信息

## Swift / TS 协议边界

Swift 与 TS 的唯一边界是 `WebSocket + SessionMessage`。

Swift 侧不直接依赖 `packages/core` 的 runtime API，不直接持有 TS 内部对象。

### Swift 侧发送

- `user_message`
- 后续可扩展 `interrupt`

第一版不要求窗口创建时必须发送 `open_session`。新的 `SessionWindow` 仅在 `PromptPanel` 提交首条消息后才创建，因此不存在“空会话窗口先打开再等待初始化”的场景。

### Swift 侧接收

- `assistant_message_start`
- `assistant_message_delta`
- `assistant_message_end`
- `tool_message`
- `status`
- `error`
- `session_snapshot`

## session 管理抽象

当前 `SessionManager` 主要围绕 `user_message -> runtime.runWithMessages()` 组织，需要补足 session 存储与查询抽象。

第一版新增目标：

- 增加 session 创建/登记语义
- 增加 `listSessions()` 接口
- 增加 `getSessionHistory(sessionId)` 接口
- 把 `session_snapshot` 作为未来恢复与查询的标准输出形态

实现要求：

- 第一版可以先做内存实现
- 可以先定义抽象接口而暂不实现完整持久化
- 不能再把 `SessionManager` 固定为“只接受一条用户消息然后调用 runtime”的狭义形态

## action chips 统一接口

输入增强能力通过统一 action provider 接口注册到 `PromptPanel` 中。

接口目标：

- 统一展示名称、关键字、快捷键、描述
- 支持键盘检索与选择
- 执行结果统一回流为本次 prompt 的注入上下文

接口边界：

- action chips 是用户发起前的输入增强
- tool 是 Agent 运行中的按需能力调用
- 第一版 action chips 不直接替代 ReAct loop 中的 tool 调度

第一版建议 action：

- 插入当前选区文本
- 插入选区图片或截图引用
- 插入预定义能力入口

## 第一版实现范围

### 1. 宿主骨架重构

- 拆分 `HandAgentApp.swift` 现有混合职责
- 建立 `AppServices`
- 建立 `HotkeyService`
- 建立 `AgentServerService`
- 建立 `SessionRegistry`

### 2. PromptPanel 落地

- 用 `NSPanel + SwiftUI` 实现单例面板
- 支持快捷键唤起、自动聚焦、`Esc` 关闭、焦点返还、拖动
- 建立 action chips 统一接口和最小实现

### 3. SessionWindow 落地

- 用 `NSWindow + SwiftUI` 实现多实例会话工作台
- 每个窗口独立持有 WebSocket client 与消息状态
- 渲染完整 ReAct loop

### 4. agent-server session 抽象补强

- 为 `SessionManager` 增加 session 管理抽象
- 预留 `listSessions()` 与 `getSessionHistory(sessionId)` 接口
- 为未来 snapshot / 恢复留边界

### 5. 文档与旧链路清理

- 更新桌面架构文档
- 把架构描述从“Swift 宿主 + Web 容器”改为“Swift 宿主 + WebSocket 协议边界”
- 逐步移除或废弃旧 `WKWebView` 主链路

## 风险与约束

### 1. SwiftUI 不能单独覆盖全部桌面体验

Raycast 风格体验依赖若干 `AppKit` 能力：

- `NSPanel`
- 前台应用焦点返还
- 窗口层级与激活策略
- 不参与 `Command+Tab`
- 窗口拖动与标题区行为

因此实现策略必须是：

- `SwiftUI` 负责视图内容
- `AppKit` 负责窗口壳与宿主行为

### 2. 多窗口独立 WebSocket 会增加连接数

第一版接受“每个 `SessionWindow` 一个独立协议 client”的实现。

原因：

- 窗口自治更符合桌面多窗口模型
- 连接隔离可降低窗口间状态串扰
- 先保证行为清晰，再考虑后续连接复用优化

### 3. session 恢复暂不一次做满

第一版需要把查询与历史抽象立住，但不强制实现完整持久化。

这样可以避免当前重构目标被“恢复系统”放大，同时又不把未来演进堵死。

## 方案总结

本次重构把桌面端从 `WKWebView` 驱动的单页面交互，重构为更符合 macOS 启动器产品形态的三层结构：

- `StatusBubble` 负责全局入口与状态回显
- `PromptPanel` 负责瞬时发起新任务
- `SessionWindow` 负责完整会话工作流

宿主层通过 `AppServices + Controller` 拆分职责：

- 热键是 app 级服务，不挂在某个窗口上
- server 生命周期由独立服务管理
- session 真正状态留在各窗口内自治
- 全局只维护轻量摘要与最近使用链表

同时，Swift 与 TS 的边界严格收敛到 `WebSocket + SessionMessage`，保证后续 SwiftUI 壳层演进不会侵入 `core` 与 `agent-server` 的实现边界。
