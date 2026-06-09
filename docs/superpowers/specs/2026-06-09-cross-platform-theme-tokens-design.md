# 跨端主题 token 与 light/dark/system 设计

## 目标

建立一套单一来源的跨端设计 token，并让 SwiftUI 与 React/Tailwind 从生成适配层消费同一套 token。主题偏好由 Swift 宿主持久化和解析，支持 `light`、`dark`、`system` 三种用户选择；Electron/React 只接收 Swift 下发的已解析主题并订阅变更。

本次是破坏性迁移：旧的 Swift 手写 token、旧的 React `tailwind.config.js` token、Tailwind v3 配置路径和任何旧主题兼容层都不是目标形态。实现完成后，不保留“新旧 token 并行”的长期代码路径。

## 当前事实

- Swift 原生界面已有 `apps/desktop/Sources/Theme/AppTheme.swift`，通过 `@Environment(\.appTheme)` 消费 token。
- React ThreadWindow 使用 Tailwind 3.4，主题 token 手写在 `apps/thread-window-web/tailwind.config.js`。
- Electron preload 只向 React 暴露 `/api/thread` URL、initial prompt receiver 和有限 feature marker。
- Swift 到 Electron 的 command bridge 已有 `ElectronShellCommand` / `SwiftToElectronCommand`，目前只承载窗口、ActivityWindow 和 shutdown 命令。
- `~/.spotAgent/settings.json` 由 Swift `AgentSettingsStore` 读写，当前顶层包含 `llm` 与 `tools`。agent-server 读取这两个运行配置；主题配置不应进入 agent-server 运行链路。

## 方案选择

采用“Style Dictionary 构建期生成 + Swift 原生运行时 + Tailwind v4 CSS-first”方案。

不采用 Swift 主题运行时库。SwiftUI 已有 Environment 注入和 Observation 状态模型，引入第三方主题 SDK 会与现有 `AppTheme`、Settings ViewModel 和宿主生命周期重叠。

不采用 React ThemeProvider 或 CSS-in-JS。ThreadWindow 已经是 Tailwind UI，主题运行时应由 DOM `data-theme` 与 CSS variables 驱动，React 只负责订阅 Electron 下发的主题事件。

## Token 源文件

新增 `design/tokens.json` 作为唯一设计 token 源。源文件必须包含：

- `color.light`：浅色主题语义色。
- `color.dark`：深色主题语义色。
- `spacing`：跨端共享间距。
- `radius`：跨端共享圆角。
- `typography`：跨端共享字体族和字号语义。
- `shadow`：Web 可直接消费的阴影 token；Swift 如暂不消费，也由源文件保留。
- `animation`：跨端共享动画时长。

Token 命名使用产品语义，不使用组件或平台命名。例如使用 `canvas`、`surface`、`surfaceElevated`、`textPrimary`、`accent`、`accentHover`、`hairline`，不使用 `threadWindowBackground` 或 `swiftPanelFill`。

## Token 生成

新增生成脚本，输入 `design/tokens.json`，输出两个适配层：

- Swift：`apps/desktop/Sources/Theme/GeneratedThemeTokens.swift`
- Web：`apps/thread-window-web/src/styles/generated-theme.css`

生成物提交到仓库，保证 SwiftPM 和 Vite 构建不依赖运行时生成。修改 `design/tokens.json` 后必须运行生成脚本，并在测试中校验生成物未漂移。

Swift 生成物提供强类型 token 常量。`AppTheme` 保持现有消费形态，但其默认实例改为从生成 token 构造：

- `AppTheme.light`
- `AppTheme.dark`
- `AppTheme.resolved(_:)`

Web 生成物使用 Tailwind v4 CSS-first 形态：

```css
@theme {
  --color-app-canvas: var(--ha-color-canvas);
  --color-app-surface: var(--ha-color-surface);
  --color-app-text-primary: var(--ha-color-text-primary);
  --spacing-sm: 8px;
  --radius-md: 8px;
}

:root[data-theme="light"] {
  --ha-color-canvas: #faf9f5;
  --ha-color-surface: #efe9de;
  --ha-color-text-primary: #141413;
}

:root[data-theme="dark"] {
  --ha-color-canvas: #181715;
  --ha-color-surface: #252320;
  --ha-color-text-primary: #faf9f5;
}
```

React 组件必须逐步迁移到 `bg-app-*`、`text-app-*`、`border-app-*` 等 Tailwind v4 语义 token。迁移完成后删除旧的 `surface-dark`、`on-dark` 等硬编码 v3 token 定义。

## Tailwind v4 升级

`apps/thread-window-web` 升级到 Tailwind v4。目标状态：

- 使用 `@tailwindcss/vite`。
- 删除 `tailwind.config.js` 的主题 token 配置。
- `src/styles/tailwind.css` 使用 CSS-first 入口：

```css
@import "tailwindcss";
@import "./generated-theme.css";
```

本项目由 Electron 承载 ThreadWindow，不需要兼容老浏览器。Tailwind v4 的现代浏览器要求由当前 Electron 版本承担。

## 主题配置与持久化

主题偏好只由 Swift 宿主持久化。`~/.spotAgent/settings.json` 新增顶层字段：

```json
{
  "appearance": {
    "themePreference": "system"
  }
}
```

`themePreference` 只允许：

- `light`
- `dark`
- `system`

缺失、非法或旧文件读取失败时，默认使用 `system`。Swift 写入 appearance 时必须保留已有 `llm` 和 `tools` 字段；写入 LLM/tool 时必须保留 `appearance` 字段。

agent-server 不读取、不缓存、不监听 `appearance`。主题配置是宿主 UI 配置，不是 runtime 配置。

## Swift 运行时

Swift 新增主题状态服务，职责是：

- 从 `AgentSettingsStore` 读取和写入 `themePreference`。
- 将 `system` 解析成当前 macOS 外观下的 `light` 或 `dark`。
- 监听系统 appearance 变化；只有当前偏好为 `system` 时，系统变化才触发 resolved theme 变更。
- 向 SwiftUI 根视图注入当前 `AppTheme`。
- 在 Electron 启动可接收命令后下发当前主题。
- 用户在 Settings 中修改主题时，立即持久化并下发主题。

SwiftUI 视图继续通过 `@Environment(\.appTheme)` 消费主题。不要让 ViewModel 依赖 SwiftUI Theme；ViewModel 只处理设置值和用户动作。

## Settings UI

Settings 新增“外观”Tab。Tab 中提供一个 segmented picker：

- 跟随系统
- 浅色
- 深色

该 Tab 通过 `AppearanceSettingsViewModel` 代理 `AgentSettingsStore`，不直接读写文件。

Settings 窗口本身继续使用现有 `SettingsTabBar`、`SettingsSection`、`SettingsRow` 等样式组件，不引入系统 `Form` / `GroupBox`。

## Swift ↔ Electron 协议

新增 Swift 到 Electron command：

```json
{
  "channel": "electron_shell",
  "type": "theme.changed",
  "commandId": "theme-command-1",
  "theme": {
    "preference": "system",
    "resolved": "dark"
  }
}
```

`preference` 是用户保存值，`resolved` 是 React 实际应用值。`resolved` 只允许 `light` 或 `dark`。

Electron 收到后：

- 保存当前主题状态。
- 向已存在的 ThreadWindow renderer 广播主题变更。
- 后续创建或预热新的 ThreadWindow 时，preload 注入最新主题初值。
- 回写 `command.ack`，保持 command bridge 的可观测性。

主题 command 失败不应改变 agent-server availability，也不应触发 fatal error；它只影响 UI 主题同步。

## Electron preload 与 React 订阅

ThreadWindow preload 新增受控能力，不暴露 `ipcRenderer`、Node 或 Electron 对象：

```ts
window.handAgentTheme = {
  preference: "system",
  resolved: "dark"
};

window.handAgentSubscribeThemeChange = (handler) => unsubscribe;
```

React 新增 native theme config：

- 启动时读取 `window.handAgentTheme`；缺失时使用 `{ preference: "system", resolved: "light" }`。
- 订阅 `handAgentSubscribeThemeChange`。
- 将 `document.documentElement.dataset.theme` 设置为 `light` 或 `dark`。

React 不解析 `system`，不读取 macOS 外观，不通过 `matchMedia` 决定主题。Swift 是唯一主题宿主。

## ActivityWindow

本次范围只要求 ThreadWindow React 订阅主题。Electron ActivityWindow 可以在同一套 token 生成物可用后迁移，但不作为本 spec 的完成条件。

原因：ActivityWindow 当前是独立 `src/activity-window/styles.css`，只承载状态气泡，不影响 ThreadWindow 主 UI。强行同批迁移会扩大验收面。

## 删除与替换

实现完成后必须删除或替换：

- `apps/thread-window-web/tailwind.config.js` 中旧的手写主题 token。
- React 组件中依赖旧 v3 token 的最终样式命名。
- Swift `AppTheme.swift` 中手写颜色常量的来源定义；保留 `AppTheme` API 作为消费适配层。
- 任何“为了兼容旧 token 名称而长期存在”的映射层。

允许短期在一次提交内按任务顺序出现中间状态，但最终提交不能残留旧实现。

## 测试策略

### Token 生成

- 测试 `design/tokens.json` 能生成 Swift 和 CSS 输出。
- 测试生成物与当前仓库文件一致；未运行生成脚本时测试失败。

### Swift

- `AgentSettingsStore` 默认读取 `appearance.themePreference = system`。
- 写入 appearance 时保留 `llm` 与 `tools`。
- 写入 `llm` 或 `tools` 时保留 `appearance`。
- 非法 themePreference 回退为 `system`。
- theme command 编码字段与 TS 协议一致。
- 主题服务在 `light` / `dark` 下直接解析，在 `system` 下随系统外观解析。

### Electron

- `isSwiftToElectronCommand` 接受合法 `theme.changed`，拒绝非法 preference 或 resolved。
- `ElectronShellRuntime` 收到 `theme.changed` 后更新主题并 ack。
- ThreadWindow host 可以向 renderer 发送主题变更。
- preload 暴露初始主题和订阅函数，且不暴露 raw IPC。

### React

- native theme config 缺失时回退为 `system/light`。
- 初始主题会写入 `document.documentElement.dataset.theme`。
- 收到订阅事件后更新 `data-theme`。
- Tailwind v4 token 测试校验 `generated-theme.css` 包含 light/dark CSS variables 和 `@theme` 语义 token。

### 端到端手工验收

更新 `docs/manual-qa.md`，加入：

1. 默认设置为“跟随系统”。
2. 切换到浅色，Settings 和新打开的 ThreadWindow 都变浅色。
3. 切换到深色，已打开 ThreadWindow 不刷新页面即可变深色。
4. 切换回跟随系统，修改 macOS 外观后 ThreadWindow 跟随变化。
5. 重启 App 后主题偏好仍然保留。

## 文档更新

实现完成后必须更新：

- `handAgent.md`：补充 Swift 宿主负责主题偏好与主题下发。
- `apps/apps.md`：补充主题 IPC 在 apps 层的位置。
- `apps/desktop/desktop.md`：补充 Settings/Theme/Electron command bridge 主题职责。
- `apps/desktop/Sources/Theme/theme.md`：说明 token 来自生成物，不再手写。
- `apps/desktop/Sources/AppServices/AgentSettings/agent-settings.md`：记录 `appearance` 顶层字段。
- `apps/desktop/Sources/Settings/settings.md`：记录“外观”Tab。
- `apps/desktop/Sources/AppServices/ElectronShell/electron-shell.md`：记录 `theme.changed` command。
- `apps/electron-shell/electron-shell.md` 与 `apps/electron-shell/src/preload/preload.md`：记录主题状态和 preload API。
- `apps/thread-window-web/thread-window-web.md`：记录 Tailwind v4、generated theme CSS 和 React 订阅规则。
- `docs/manual-qa.md`：记录手工验收步骤。

## 非目标

- 不让 agent-server 读取主题配置。
- 不把主题配置写入 thread、workspace、permission 或 plugin 文件。
- 不保留 Tailwind v3 主题配置作为回退路径。
- 不引入 Swift 第三方主题运行时库。
- 不引入 React CSS-in-JS 或 ThemeProvider。
- 不要求 ActivityWindow 在本 spec 中完成主题订阅。

## 完成标准

- `design/tokens.json` 是跨端 token 唯一来源。
- SwiftUI 和 React/Tailwind 都从生成适配层消费 token。
- Tailwind 已升级到 v4 CSS-first 形态。
- Settings 支持 `light / dark / system`，并由 Swift 持久化到 `~/.spotAgent/settings.json`。
- Swift 是唯一解析 `system` 的宿主。
- Electron/React 能接收启动主题和运行时主题变更。
- 旧 Tailwind v3 token 配置和旧手写 token 来源已删除。
- 自动化测试、Swift build 和相关文档更新完成。
