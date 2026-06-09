# Theme 模块

全局视觉 token 与 Environment 注入。SwiftUI 原生界面通过本模块映射根目录 `DESIGN.md` 的 warm-canvas / coral / dark product surface 设计语言；可复用的颜色 / 字体 / 间距 / 圆角 / 动画时长优先通过 `@Environment(\.appTheme)` 读取。

## 文件

| 文件 | 职责 |
|------|------|
| `AppTheme.swift` | 定义 `AppTheme` 聚合 + `ThemeColors` / `ThemeTypography` / `ThemeSpacing` / `ThemeRadius` / `ThemeAnimation` |
| `ThemeEnvironment.swift` | 基于 SwiftUI `@Entry` 的 `EnvironmentValues.appTheme` 扩展 |
| `ThemeModifiers.swift` | 跨模块复用的通用 ViewModifier（`borderedCard` 等），消除各模块重复的 `RoundedRectangle + fill + strokeBorder` 样板 |

## Token 分类

- **colors**：DESIGN.md 语义色（`canvas` / `surfaceSoft` / `surfaceCard` / `surfaceDark` / `hairline` / `ink` / `muted` / `accentTeal` 等）+ 兼容旧调用点的背景 / 表面 / 文本 / coral 强调色（`accent` / `accentHover` / `accentPressed` / `accentSubtle` / `accentRing`）/ 错误 / bubble 三色（user / assistant / tool）
- **typography**：`titleFont` / `bodyFont` / `captionFont` / `promptInputFont`
- **spacing**：`xs(4) / sm(8) / md(12) / lg(16) / xl(24) / xxl(32)`
- **radius**：`sm(6) / md(8) / lg(12)`
- **animation**：`springDuration / springBounce / highlightDuration`

`AppTheme.default` 是当前唯一实例。它不是 light/dark 双主题切换，而是固定的 warm cream + coral 原生界面主题；需要 dark product surface 时使用 `surfaceDark*` token。

## 编辑此目录的约束

- **Theme token 是视觉主入口**：新增跨模块复用的颜色、字体、间距、圆角或动画参数时，先看是否能扩 token；token 真的需要新增时统一加到这里，并保证 `Sendable`。
- **局部 layout 数值逐步收敛**：当前 SwiftUI 原生界面仍有窗口尺寸、一次性 padding、定位偏移等局部数值；不要在文档中把现状写成已经完全 token 化。
- **新增颜色需走 token**：避免直接 `Color.red` / `Color(hex: ...)`。错误色用 `theme.colors.error`；强调色用 `theme.colors.accent` 系列。
- **不要为旧系统加 fallback**：目标系统 macOS 15+，token 直接用 SwiftUI 原生 API。
- **保留单主题假设**：当前不支持 light/dark mode 切换；如未来要支持，`AppTheme` 需扩为多实例并在根 View 注入。
- **不要让 ViewModel 依赖 Theme**：`@Observable` 类不读 SwiftUI Environment；样式只在 View 与 ViewModifier 中消费 token。
- **测试**：颜色 / 字体不做 RGB 精确比较；测试只断言 spacing 和 DESIGN.md 语义 token 可访问，详见 [AppThemeTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/Theme/AppThemeTests.swift)。

## 与其他模块的关系

- SwiftUI 原生模块的 `*View.swift` 与 `*Styles.swift` 优先通过 `@Environment(\.appTheme)` 消费 token；少量局部 layout 数值按模块后续收敛。
- ViewModifier（PromptPanelStyles / SettingsStyles）是 token 的二次封装层：跨模块复用的样式组合写在 Styles 文件，单 View 一次性的样式直接写在 View 里。
