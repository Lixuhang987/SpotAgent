# Theme 模块

全局视觉 token 与 Environment 注入。SwiftUI 原生界面通过本模块消费 `design/tokens.json` 生成的 Swift token；可复用的颜色 / 字体 / 间距 / 圆角 / 动画时长优先通过 `@Environment(\.appTheme)` 读取。

## 文件

| 文件 | 职责 |
|------|------|
| `AppTheme.swift` | 定义 `AppTheme.light` / `AppTheme.dark` 聚合，并把 `GeneratedThemeTokens` 映射到 SwiftUI `Color` / `Font` / spacing / radius / animation |
| `GeneratedThemeTokens.swift` | 由 `scripts/generate-theme-tokens.mjs` 从 `design/tokens.json` 生成；不要手写修改 |
| `ThemeEnvironment.swift` | 基于 SwiftUI `@Entry` 的 `EnvironmentValues.appTheme` 扩展 |
| `ThemeModifiers.swift` | 跨模块复用的通用 ViewModifier（`borderedCard` 等），消除各模块重复的 `RoundedRectangle + fill + strokeBorder` 样板 |

## Token 分类

- **colors**：`AppTheme` 保留 SwiftUI 现有语义 API（如 `canvas` / `surfaceSoft` / `surfaceCard` / `surfaceDark` / `hairline` / `ink` / `muted` / `accentTeal` / `accent` / `accentHover` / `accentPressed` / `accentSubtle` / `accentRing` / `error` / bubble 三色），但取值来源统一是 `GeneratedThemeTokens`，不再维护手写颜色常量源。
- **typography**：`titleFont` / `bodyFont` / `captionFont` / `promptInputFont`
- **spacing**：来自生成 token 的 `xs / sm / md / lg / xl / xxl`
- **radius**：`sm(6) / md(8) / lg(12)`
- **animation**：`springDuration / springBounce / highlightDuration`

`AppTheme.default` 指向 `.light`。具体使用 `.light` 还是 `.dark` 由 `AppearanceThemeService` 根据 Swift Settings 中的 `light` / `dark` / `system` 偏好解析后注入。

## 编辑此目录的约束

- **Theme token 是视觉主入口**：新增跨模块复用的颜色、字体、间距、圆角或动画参数时，先修改 `design/tokens.json`，再运行 `pnpm generate:theme-tokens`；不要直接编辑生成文件。
- **局部 layout 数值逐步收敛**：当前 SwiftUI 原生界面仍有窗口尺寸、一次性 padding、定位偏移等局部数值；不要在文档中把现状写成已经完全 token 化。
- **新增颜色需走 token**：避免在 View 中直接写 `Color.red` / `Color(hex: ...)`。错误色用 `theme.colors.error`；强调色用 `theme.colors.accent` 系列。
- **不要为旧系统加 fallback**：目标系统 macOS 15+，token 直接用 SwiftUI 原生 API。
- **Swift 只消费宿主解析主题**：Swift Settings 保存偏好，`AppearanceThemeService` 解析 `system` 并把当前 `AppTheme` 注入原生 UI；React 侧只订阅 Electron 转发的 resolved theme。
- **不要让 ViewModel 依赖 Theme**：`@Observable` 类不读 SwiftUI Environment；样式只在 View 与 ViewModifier 中消费 token。
- **测试**：颜色 / 字体不做 RGB 精确比较；测试只断言 spacing 和 DESIGN.md 语义 token 可访问，详见 [AppThemeTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/Theme/AppThemeTests.swift)。

## 与其他模块的关系

- SwiftUI 原生模块的 `*View.swift` 与 `*Styles.swift` 优先通过 `@Environment(\.appTheme)` 消费 token；少量局部 layout 数值按模块后续收敛。
- ViewModifier（PromptPanelStyles / SettingsStyles）是 token 的二次封装层：跨模块复用的样式组合写在 Styles 文件，单 View 一次性的样式直接写在 View 里。
