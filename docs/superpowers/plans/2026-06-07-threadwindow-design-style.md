# ThreadWindow 视觉重构实施计划

> **给 agentic workers：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务执行本计划。步骤使用 checkbox（`- [ ]`）记录进度。

**目标：** 将 React ThreadWindow 从旧 Raycast dark-only 样式重构为 `/Users/mu9/proj/handAgent/DESIGN.md` 描述的 Claude 暖色画布、coral CTA 与深色产品面板风格。

**架构：** 样式承载在 `apps/thread-window-web`；Swift `ThreadWindow` 仅是 WKWebView host，不重新引入 Swift ThreadWindow UI。Tailwind token 先映射 `DESIGN.md` 中的颜色、字体、圆角和阴影，再由 App、Sidebar、Tabs、Messages、Composer、RequestPanels 统一消费。

**技术栈：** React 19、TypeScript、Tailwind CSS、Vitest、Vite、Swift WKWebView host。

---

### Task 1：Tailwind 设计 token

**文件：**
- 修改：`apps/thread-window-web/tailwind.config.js`
- 修改：`apps/thread-window-web/src/styles/tailwind.css`
- 测试：`apps/thread-window-web/tests/designTokens.test.ts`

- [ ] **Step 1：先写失败的 token 测试**

创建 `apps/thread-window-web/tests/designTokens.test.ts`，校验 `DESIGN.md` 中最核心的 warm canvas、coral primary、dark product surface 和 ink token：

```ts
import { describe, expect, it } from "vitest";

// Tailwind config is intentionally JavaScript in this package.
// @ts-expect-error no declaration file is needed for this config-only import
import tailwindConfig from "../tailwind.config.js";

const colors = tailwindConfig.theme.extend.colors;

describe("ThreadWindow Claude design tokens", () => {
  it("maps the warm canvas, coral primary, and dark product surfaces from DESIGN.md", () => {
    expect(colors.canvas).toBe("#faf9f5");
    expect(colors.primary.DEFAULT).toBe("#cc785c");
    expect(colors["surface-dark"]).toBe("#181715");
    expect(colors.ink).toBe("#141413");
  });
});
```

- [ ] **Step 2：运行 token 测试并确认失败**

运行：`pnpm --filter handagent-thread-window-web exec vitest run tests/designTokens.test.ts`

预期：失败，因为当前配置仍使用旧 `background: #0B0B0F` 和 `accent: #FFA947`。

- [ ] **Step 3：替换 Tailwind token**

更新 `tailwind.config.js`，暴露 `DESIGN.md` 的 token：`canvas`、`surface-soft`、`surface-card`、`surface-dark`、`surface-dark-elevated`、`surface-dark-soft`、`hairline`、`hairline-soft`、`ink`、`body`、`muted`、`muted-soft`、`on-primary`、`on-dark`、`on-dark-soft`、`primary`、`success`、`warning`、`error`，并保留组件仍会使用的兼容别名。

- [ ] **Step 4：更新基础 CSS**

将 body 背景设为 `#faf9f5`，文本设为 `#141413`，定义 display/body/code 字体 CSS 变量，并保留 WKWebView 最小尺寸。

- [ ] **Step 5：再次运行 token 测试并确认通过**

运行：`pnpm --filter handagent-thread-window-web exec vitest run tests/designTokens.test.ts`

预期：通过。

### Task 2：ThreadWindow 组件样式重构

**文件：**
- 修改：`apps/thread-window-web/src/App.tsx`
- 修改：`apps/thread-window-web/src/components/HistorySidebar.tsx`
- 修改：`apps/thread-window-web/src/components/WorkspaceGroup.tsx`
- 修改：`apps/thread-window-web/src/components/TabBar.tsx`
- 修改：`apps/thread-window-web/src/components/MessageList.tsx`
- 修改：`apps/thread-window-web/src/components/MessageBubble.tsx`
- 修改：`apps/thread-window-web/src/components/Composer.tsx`
- 修改：`apps/thread-window-web/src/components/RequestPanels.tsx`

- [ ] **Step 1：重构整体 shell**

使用 cream `main` canvas、`surface-card` 历史侧栏和 `surface-dark` workspace。保持现有 grid、store 和 WebSocket 状态流不变。

- [ ] **Step 2：重构历史侧栏和 workspace 分组**

主操作使用 coral；选中 row 使用 cream card；元信息使用 muted；row 圆角保持 8px。可视 row 的 hover/focus/active 边界必须和打开 thread 的点击边界一致，删除按钮必须阻止冒泡。

- [ ] **Step 3：重构 tabs 和消息区域**

tabs 放在 dark elevated surface 上；assistant 消息使用 cream card；user 消息使用 coral-tinted cream card；tool 消息使用 dark code-style card，并用 monospace 展示 tool 标签和内容。

- [ ] **Step 4：重构 composer 和 request panels**

composer 输入框使用 cream input dock；发送按钮使用 coral；停止按钮使用 dark secondary；permission/workspace request panels 使用 dark product mockup card，并将参数 JSON 放在 monospace dark code block 中。

- [ ] **Step 5：构建 web package**

运行：`pnpm --filter handagent-thread-window-web build`

预期：退出码为 0。

### Task 3：文档、QA 与最终验证

**文件：**
- 修改：`apps/thread-window-web/thread-window-web.md`
- 修改：`apps/desktop/desktop.md`
- 修改：`apps/desktop/Sources/Settings/settings.md`
- 修改：`docs/manual-qa.md`

- [ ] **Step 1：更新 ThreadWindow 前端文档**

将旧 “Raycast Glass + Mango Amber” 设计系统段落替换为 Claude warm-canvas 映射，并说明 Swift 仍只负责 WKWebView host。

- [ ] **Step 2：更新 Swift 宿主文档边界**

在 `apps/desktop/desktop.md` 说明 Swift `Theme` 约束 SwiftUI 原生界面；React ThreadWindow 的视觉 token 由 `apps/thread-window-web` 和根目录 `DESIGN.md` 约束。在 Settings 文档中避免继续要求 Settings 与 React ThreadWindow 保持统一暗色玻璃风格。

- [ ] **Step 3：更新 manual QA**

新增或替换 ThreadWindow 视觉 QA：提交 prompt 后确认 cream sidebar、dark workspace、coral send/new-thread buttons、可见 tab 状态、request panels、最小窗口尺寸下无文本遮挡，并确认历史 row 的点击边界与视觉边界一致。

- [ ] **Step 4：运行最终验证**

运行：

```bash
pnpm --filter handagent-thread-window-web test
pnpm --filter handagent-thread-window-web build
bash ./scripts/test.sh
bash ./scripts/swiftw test
bash ./scripts/swiftw build
```

预期：所有命令退出码为 0。

- [ ] **Step 5：视觉截图检查**

启动 `pnpm --filter handagent-thread-window-web dev`，用浏览器在桌面视口和最小视口打开本地页面，确认页面非空、cream/dark/coral surface 正确，且最小尺寸下没有明显遮挡。截图只作为验证证据，不纳入提交。

- [ ] **Step 6：复查 diff**

运行：`git diff --check && git status --short`

预期：无 whitespace error，且只包含计划内代码、测试与文档文件。
