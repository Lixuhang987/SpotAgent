# Theme 模块

全局视觉 token 与 Environment 注入。所有 SwiftUI View 通过 `@Environment(\.appTheme)` 读取颜色 / 字体 / 间距 / 圆角 / 动画时长，**不允许在 View 中硬编码任何这些数值**。

## 文件

| 文件 | 职责 |
|------|------|
| `AppTheme.swift` | 定义 `AppTheme` 聚合 + `ThemeColors` / `ThemeTypography` / `ThemeSpacing` / `ThemeRadius` / `ThemeAnimation` |
| `ThemeEnvironment.swift` | `AppThemeKey` + `EnvironmentValues.appTheme` 扩展 |

## Token 分类

- **colors**：背景 / 表面 / 文本 / 强调色（Mango Amber：`accent` / `accentHover` / `accentPressed` / `accentSubtle` / `accentRing`）/ 错误 / 边框 / bubble 三色（user / assistant / tool）
- **typography**：`titleFont` / `bodyFont` / `captionFont` / `promptInputFont`
- **spacing**：`xs(4) / sm(8) / md(12) / lg(16) / xl(20) / xxl(24)`
- **radius**：`sm(6) / md(8) / lg(12)`
- **animation**：`springDuration / springBounce / highlightDuration`

`AppTheme.default` 是当前唯一实例（Raycast Glass + Mango Amber，dark-only）。

## 编辑此目录的约束

- **不要在 View 中写魔法数字或硬编码颜色**：先看是否能扩 token；token 真的需要新增时统一加到这里，并保证 `Sendable`。
- **新增颜色需走 token**：避免直接 `Color.red` / `Color(hex: ...)`。错误色用 `theme.colors.error`；强调色用 `theme.colors.accent` 系列。
- **不要为旧系统加 fallback**：目标系统 macOS 15+，token 直接用 SwiftUI 原生 API。
- **保留 dark-only 假设**：当前不支持 light mode 切换；如未来要支持，`AppTheme` 需扩为 `light` / `dark` 两实例并在根 View 注入。
- **不要让 ViewModel 依赖 Theme**：`@Observable` 类不读 SwiftUI Environment；样式只在 View 与 ViewModifier 中消费 token。
- **测试**：颜色 / 字体不可比，只断言 spacing 等可比 token；详见 [AppThemeTests](/Users/mu9/proj/handAgent/apps/desktop/TestsSwift/AppThemeTests.swift)。

## 与其他模块的关系

- 所有 `*View.swift` 与 `*Styles.swift` 通过 `@Environment(\.appTheme)` 消费 token。
- ViewModifier（PromptPanelStyles / SessionStyles / StatusBubbleStyles）是 token 的二次封装层：跨模块复用的样式组合写在 Styles 文件，单 View 一次性的样式直接写在 View 里。
