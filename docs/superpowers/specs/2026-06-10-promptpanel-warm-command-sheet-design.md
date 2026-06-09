# PromptPanel Warm Command Sheet 设计

## 文档元信息

- 日期：2026-06-10
- 范围：`apps/desktop/Sources/PromptPanel`、SwiftUI Theme 文档、相关 Settings 文档
- 状态：设计待评审

## 背景

PromptPanel 是 Swift 原生入口中最核心的即时输入界面：用户通过全局热键唤起它，输入普通 prompt，或选择 manifest 派生的 Action，并可附带用户主动采集的文本选区、截图等 attachment。它不承载 thread UI，也不读取屏幕、剪贴板、App 状态或文件上下文；这些能力仍必须通过 tool 按需读取。

项目当前已经完成跨端主题重构：`design/tokens.json` 是 token 源，Swift 通过 `GeneratedThemeTokens.swift` 生成 `AppTheme.light` / `AppTheme.dark`，`AppearanceThemeService` 解析 `system` 后把 `AppTheme` 注入 SwiftUI，并通过 `theme.changed` 同步给 Electron/React。旧文档中仍存在“固定 warm cream / 固定 Aqua / 单主题”的表述，继续按这些旧约束改 PromptPanel 会造成主题能力倒退。

本设计以根目录 `DESIGN.md` 的 warm-canvas editorial 语言为视觉依据，但必须按当前 token 事实落地：浅色主题保留 cream/coral，深色主题使用同一语义 token 的 dark 映射，而不是把 PromptPanel 固定成浅色面板。

## 目标

1. 将 PromptPanel 打磨为 Warm Command Sheet：轻量、温暖、清晰、适合热键即时输入的 macOS 浮层。
2. 保留现有 View / ViewModel / Controller / Styles 边界，不把窗口副作用、快捷键或 thread 逻辑塞进 View。
3. 保留输入边界：只提交用户主动输入和用户主动附件，不新增任何隐式上下文采集。
4. 保留空态拖动区和输入增长规则：空 draft 时输入控件只覆盖 placeholder 附近，有内容后占满设置按钮左侧剩余宽度；最多 5 行后滚动。
5. 让 PromptPanel 在 light / dark resolved theme 下都使用 `AppTheme` token，避免固定浅色或固定系统 Aqua 视觉假设。
6. 优化输入区、附件 chip、server 不可用提示、action list、空状态和交互反馈的视觉层级。
7. 将过期文档和过期测试假设纳入完成范围，避免后续开发继续引用旧主题约束。

## 非目标

- 不迁移 PromptPanel 到 Electron/React。
- 不新增 PromptPanel 的 prompt 历史、最近输入、分类浏览或复杂命令搜索系统。
- 不修改 ActionDefinition、ActionInvocation、plugin manifest 或 initial prompt 协议。
- 不改变 PromptPanel 提交后由 Electron 打开 ThreadWindow 的流程。
- 不修改 agent-server、packages/core、React ThreadWindow 的 thread 协议。
- 不引入新的设计系统或新的颜色来源；跨模块 token 仍只来自 `design/tokens.json`。

## 当前事实

- `AppTheme.default` 指向 `.light`，但运行时实际主题由 `AppearanceThemeService.appTheme` 注入。
- `PromptPanelController.updateTheme(_:)` 已经能刷新已存在面板的 root view。
- `PromptPanelController.ensurePanel()` 仍设置 `panel.appearance = NSAppearance(named: .aqua)`。如果继续保留该设置，必须证明它只用于规避 AppKit 控件继承系统样式问题，不等同于固定 PromptPanel 视觉为浅色；否则应调整测试和实现。
- `PromptPanelView` 当前主要问题不是缺少品牌色，而是层级偏平：输入区、附件、错误提示、action row、空状态的语义区分不够明显。
- `prompt-panel.md` 与 `settings.md` 仍包含固定 warm cream / fixed Aqua 的旧表述，和当前 light/dark token 事实不一致。
- `PromptPanelAppearanceTests` 与 `ProductionSettingsWindowPresenterTests` 仍保护 `.aqua`，可能阻止 dark theme 体验修复。

## 设计原则

### DESIGN.md 优先

视觉语言沿用 `DESIGN.md`：

- 浅色主题：tinted cream canvas、warm card surface、coral emphasis、dark ink text。
- 深色主题：dark product surface、warm coral accent、cream text，不做简单反色。
- Coral 只用于焦点、主要强调、匹配状态或关键提示；不要把所有可交互元素都染成 coral。

### Token 优先

所有新增颜色、圆角、间距、动效都优先使用 `theme.colors.*` / `theme.spacing.*` / `theme.radius.*` / `theme.animation.*`。如果现有 token 不够表达，先修改 `design/tokens.json` 并重新生成 Swift token；不要在 PromptPanel 里硬编码 hex 或临时 `Color(...)`。

### Light/Dark 对等

每个视觉状态都必须同时指定 light 和 dark 下的语义，而不是只验证浅色：

- panel background
- hairline / divider
- input text / placeholder
- action hover / focus
- trigger pill
- attachment chip
- image preview affordance
- selection error chip
- server unavailable banner
- disabled input

### 即时入口优先

PromptPanel 是热键入口，不是完整页面。设计应保持低认知负担：

- 不加 hero、品牌标题、说明性大段文本。
- 不把 action list 变成复杂卡片墙。
- 不引入多层筛选或分组，除非已有 Action 数据结构能自然支持且不会扩大实现面。

## 视觉方案：Warm Command Sheet

### 面板容器

PromptPanel 继续是 640px 左右的非激活浮层，圆角、hairline、阴影都由 `PromptPanelContainerModifier` 统一控制。

容器应从“单一 cream 卡片”改为“token 化 command sheet”：

- 背景使用 `theme.colors.canvas`，允许现有轻微 opacity，但必须在 dark theme 下保持可读。
- 描边使用 `theme.colors.hairline`。
- 阴影用 `theme.colors.ink.opacity(...)` 可能在 dark theme 下不合适，实施时需要检查 dark theme 是否几乎无阴影或过脏；必要时新增 token 化 shadow 或按 theme 语义调整。
- 圆角保持 `theme.radius.lg`，不超过 `DESIGN.md` 卡片半径上限。

### 输入区

输入区仍不绘制独立输入框，避免破坏空态拖动区。

调整点：

- placeholder 从“输入你的请求”改为更明确但短的中文，例如“问 HandAgent…”或“输入请求，Return 提交”。
- placeholder 使用 `theme.colors.textSecondary` 或 `textMuted`，必须在 dark theme 下可读。
- 禁用状态不应只让 NSTextView 不可编辑；视觉上应有低强调状态，例如输入文本/placeholder 降级到 muted，并配合 server banner 说明原因。
- 输入获得焦点时不增加外框；可保留系统光标和文本清晰度，必要时只在首行区域增加极轻的 focus affordance，但不得影响拖动区。

### 设置按钮

设置按钮是 icon-only button，必须满足可访问性和可点击区域要求：

- 视觉图标仍可保持 14pt 左右，但实际 hit area 应不小于 28px；若用更完整的 macOS 可点击标准，优先靠近 32px。
- hover / pressed 状态使用 `surfaceSoft` / `surfaceMuted`，不要只改图标颜色。
- 保留 help 文案“打开设置 (⌘,)”。

### 附件 chip

附件 chip 需要区分三类语义：

- 普通文本附件：`surface` / `surfaceSoft` 背景 + hairline，文字用 `textPrimary`。
- 图片附件：保留可点击 QuickLook 预览 affordance，使用图标或轻微 accent ring 表达“可预览”，但不要用强 coral 填满。
- selection error：使用 error 语义，不应和普通附件只差图标；背景可用 error subtle token，如果没有该 token，使用 `surfaceSoft` + `theme.colors.error` 文本/描边。

删除按钮必须扩大实际点击区域，并保持视觉边界和可交互边界一致。不要出现 chip 看起来整体可点但只有文字或小叉能响应的情况。

### Server 不可用提示

当前 banner 使用 coral icon 和 accent ring，容易和主强调混淆。改为 warning/error 语义：

- 连接暂不可用、重连中：使用 `theme.colors.warning` 或 `accentAmber`。
- Action 渲染失败、缺必填参数：使用 `theme.colors.error`。
- 文案必须说明草稿保留，例如“服务暂不可用，草稿已保留”。
- banner 继续显示在输入区下方，不弹 modal，不清空 draft。

### Action list

Action list 保持 Raycast-like 简洁列表，但提升信息层级：

- 每行主文本是 `action.title`。
- 如果 `action.description` 存在，下一行以 caption 显示；如果没有 description，不强造副标题。
- 右侧 trigger pill 使用 `surfaceSoft` / `surfaceMuted` 背景，hover 时文字可切到 `accent`。
- hover / keyboard focus 状态使用 `surfaceCard` 或 `surfaceMuted` 背景 + `accentRing` 描边。
- 行高可以略增，但不能让 420px 面板只显示很少 action。

如果当前没有键盘上下选择 action，本 spec 不强制新增完整键盘导航；但实现中不得让 hover 成为唯一反馈路径。未来如新增键盘选中态，必须复用同一高亮样式。

### 空状态

空状态必须中文化，替换 `No actions`：

- 无 action 数据时：“暂无可用 Action”。
- 有查询但无匹配时：“没有匹配的 Action”。

空状态使用 muted 文本，不需要大插画或说明段落。

## 组件边界

### View

`PromptPanelView` 继续只消费 ViewModel 状态和 `@Environment(\.appTheme)`。允许新增私有子 View / helper，但不要让 View 直接调用 AppKit 或 KeyboardShortcuts。

### ViewModel

`PromptPanelViewModel` 不应因为视觉优化而依赖 `Color`、`Font`、`View` 或 Theme。若需要区分“空 action 是无数据还是无匹配”，可以用现有 `draft` 和 `filteredActions` 在 View 层判断；除非确实需要复用，才新增 plain Swift 计算属性。

### Controller

`PromptPanelController` 继续负责窗口生命周期、focus、ESC、本地事件监听和 QuickLook。主题更新通过 `updateTheme(_:)` 注入，不把 theme 放入 ViewModel。

### Styles

跨行复用的容器、action row、chip button hit area 可以放入 `PromptPanelStyles.swift`。一次性布局保留在 `PromptPanelView.swift`，避免样式文件膨胀。

## 主题与窗口外观

实现前必须重新判断 `.aqua` 固定测试是否仍合理。

可接受的两种结果：

1. 保留 `NSAppearance(.aqua)`，但明确它只用于稳定 AppKit 控件渲染；实际 panel 视觉完全由注入的 `AppTheme.light/dark` 决定。测试应改为验证 dark `AppTheme` 注入后 SwiftUI root view 使用 dark token，而不是只断言 Aqua。
2. 改为按 resolved theme 设置 `.aqua` / `.darkAqua`，并更新 PromptPanel 与 Settings 的窗口 presenter 逻辑和测试。

不接受的结果：代码和测试继续把 `.aqua` 当成“固定浅色 UI”的保护条件，同时 Settings 又暴露 dark theme 选项。

## Settings 主题刷新风险

虽然本 spec 的主要视觉范围是 PromptPanel，但当前 Settings 也参与外观主题配置。实现计划必须处理或明确验证以下风险：

- Settings 窗口创建时注入 `appTheme`。
- 用户在已打开的 Settings 外观 Tab 中切换主题时，Settings 自身是否立即刷新。
- 如果当前不会刷新，需要给 `SettingsLifecycle` / presenter 增加 theme refresh 入口，或用可观察状态把 root view 的 theme 重新注入。

这个任务属于“避免主题倒退”的必要边界，因为用户最先切换主题的地方就是 Settings。

## 过期文档更新范围

实现完成时必须更新以下文档：

- `apps/desktop/Sources/PromptPanel/prompt-panel.md`
  - 删除固定 warm cream / 固定 Aqua / 单主题表达。
  - 记录 PromptPanel 遵循 `design/tokens.json` 生成的 `AppTheme.light/dark`。
  - 记录 Warm Command Sheet 的输入区、附件 chip、action row、server banner 约束。
- `apps/desktop/Sources/Settings/settings.md`
  - 删除固定 Aqua 和单一 warm-canvas 表述。
  - 记录 Settings 外观 Tab 会更新 Swift 原生 UI 和 Electron/React resolved theme。
  - 记录 Settings 自身在主题切换时必须刷新或说明刷新机制。
- `apps/desktop/Sources/Theme/theme.md`
  - 若新增 token 或调整 token 映射，更新 token 分类和编辑约束。
- `docs/manual-qa.md`
  - 增加 PromptPanel light/dark 视觉检查。
  - 增加 Settings 切换主题后 PromptPanel、Settings、Electron ThreadWindow 是否同步的手工验收。

如果实现中修改了测试对 `.aqua` 的假设，也要在对应模块文档说明窗口 appearance 与 SwiftUI theme token 的边界。

## 测试策略

### Swift 单元测试

需要新增或更新测试覆盖：

- PromptPanel controller 能在 `updateTheme(.dark)` 后刷新 root view，不需要重建 ViewModel。
- PromptPanel / Settings 的 appearance 测试不再只保护固定 Aqua 浅色视觉；如保留 Aqua，测试名和断言必须表达真实目的。
- Settings 已打开后切换主题的刷新行为。
- 现有 ViewModel 行为不变：普通 submit、action submit、server unavailable 保留 draft、attachment 过滤仍通过。

SwiftUI 视觉细节不适合全部用单元测试断言，但关键主题注入和窗口刷新路径必须有自动化覆盖。

### 构建验证

实现完成后至少运行：

- `bash ./scripts/swiftw test`
- `bash ./scripts/swiftw build`
- `bash ./scripts/test.sh`

如果修改了 `design/tokens.json` 或生成脚本，还必须运行 token 生成和相关 JS 测试。

### 手工 QA

手工 QA 必须覆盖：

1. 浅色主题打开 PromptPanel：输入区、action row、附件 chip、server banner 都符合 `DESIGN.md`。
2. 深色主题打开 PromptPanel：无浅色残留、文字对比清晰、hover/focus 可见。
3. 已打开 Settings 时切换外观：Settings 自身、PromptPanel、Electron ThreadWindow 同步到 resolved theme。
4. server 不可用或 action 参数缺失时，banner 语义颜色正确且 draft 不丢。
5. 图片附件 chip 可预览，删除按钮可点击区域与视觉边界一致。

## 验收标准

- PromptPanel 在 light/dark 下都符合 Warm Command Sheet 方向，不再依赖固定浅色文档假设。
- 视觉状态使用 token，不出现新增硬编码颜色。
- 空态中文化。
- Action row、attachment chip、settings button、server banner 有明确 hover/focus/disabled/error 语义。
- 输入区空态拖动区域和有内容扩展行为保持不变。
- PromptPanel 提交、Action 渲染、附件提交、QuickLook 预览、server unavailable 保留草稿行为保持不变。
- 过期文档已更新，`docs/manual-qa.md` 已新增对应验收项。
- 相关测试不再把旧单主题 Aqua 假设当成视觉正确性的唯一依据。

## 实施顺序建议

1. 先补测试或调整现有测试命名，明确主题刷新和窗口 appearance 的真实边界。
2. 优化 PromptPanel 容器、输入区、settings button hit area。
3. 优化附件 chip、server banner 和 action list。
4. 处理 Settings 已打开后的 theme refresh 风险。
5. 更新 PromptPanel / Settings / Theme / manual QA 文档。
6. 跑 Swift 测试、Swift build 和 TypeScript 测试。

## 自审记录

- 无 TBD / TODO。
- 本 spec 只覆盖 Swift 原生 PromptPanel 与必要主题文档，不扩大到 React ThreadWindow 视觉重构。
- 已明确 light/dark 双主题事实，避免继续使用旧的固定 warm cream 单主题约束。
- 已把过期文档更新列为完成条件，而不是实现后的可选补充。
