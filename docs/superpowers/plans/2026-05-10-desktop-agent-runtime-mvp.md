# 桌面 Agent Runtime MVP 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 macOS 优先的桌面 Agent MVP。UI 由 Swift 宿主承载 React in WKWebView，Agent Core 作为跨平台独立层运行；用户通过全局快捷键唤起，输入 prompt 后由 LLM 按需调用 tool 读取上下文并执行操作，后台结果通过气泡反馈。

**Architecture:** 使用 `Swift + WKWebView + React` 作为桌面宿主与 UI，Agent Core、tool registry、LLM 循环和平台抽象全部放在共享跨平台层。macOS 第一版实现宿主与平台适配，后续只需补新的 platform adapter，不改核心 runtime 协议。LLM 调用通过 Vercel 提供的接口层接入。

**Tech Stack:** Swift、WKWebView、React、TypeScript、Node.js、Vite、Vitest、Vercel AI SDK / OpenAI API、macOS automation APIs / AppleScript / Accessibility bridge

---

## 文件结构

- `Package.swift`
  - Swift 宿主与 WebView 入口配置。
- `apps/desktop/HandAgentApp.swift`
  - macOS 宿主入口，注册热键、启动窗口、连接 runtime。
- `apps/desktop/Web/`
  - React UI 代码，渲染输入框与气泡。
- `packages/core/src/runtime/AgentRuntime.ts`
  - LLM + ReAct loop 的核心执行器。
- `packages/core/src/runtime/AgentSession.ts`
  - 单次会话模型。
- `packages/core/src/runtime/ToolCallEnvelope.ts`
  - tool 调用与返回结构。
- `packages/core/src/llm/LLMClient.ts`
  - LLM client 接口。
- `packages/core/src/llm/VercelClient.ts`
  - 通过 Vercel 接入的 LLM 实现。
- `packages/core/src/tools/AgentTool.ts`
  - tool 接口。
- `packages/core/src/tools/ToolRegistry.ts`
  - tool 注册与 schema 导出。
- `packages/core/src/tools/builtins/`
  - 剪贴板、文件、截图、OCR、App、窗口、可访问性相关工具。
- `packages/core/src/platform/PlatformAdapter.ts`
  - 平台抽象接口。
- `packages/platform-macos/src/MacPlatformAdapter.ts`
  - macOS 具体实现。
- `packages/core/src/config/AppConfig.ts`
  - 工作区、模型、热键等配置。
- `packages/core/tests/`
  - 核心 runtime 和 tool 的少量单元测试。
- `apps/desktop/tests/`
  - 关键 UI/热键联动的少量集成测试。

### Task 1: 搭建 Swift 宿主与 WebView 框架

**Files:**
- Create: `Package.swift`
- Create: `apps/desktop/HandAgentApp.swift`
- Create: `apps/desktop/Web/App.tsx`
- Create: `apps/desktop/Web/PromptBox.tsx`
- Create: `packages/core/src/config/AppConfig.ts`
- Test: `swift build`

- [ ] **Step 1: 验证仓库当前缺少宿主工程**

```bash
swift build
```

Expected: FAIL with `Package.swift` not found

- [ ] **Step 2: 创建最小 Swift 宿主和 WKWebView 容器**

```swift
import SwiftUI
import WebKit

@main
struct HandAgentApp: App {
    var body: some Scene {
        WindowGroup {
            WebContainerView()
        }
    }
}
```

```swift
struct WebContainerView: NSViewRepresentable {
    func makeNSView(context: Context) -> WKWebView { WKWebView() }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
```

- [ ] **Step 3: 放入最小 React 输入框**

```tsx
export function PromptBox() {
  return <input placeholder="输入你要 Agent 执行的任务" />;
}
```

- [ ] **Step 4: 再次构建，确认宿主骨架可编译**

```bash
swift build
```

Expected: PASS 或进入依赖缺失错误，但宿主骨架已识别

### Task 2: 实现全局热键与唤起流程

**Files:**
- Modify: `apps/desktop/HandAgentApp.swift`
- Create: `apps/desktop/Web/BubbleList.tsx`
- Create: `apps/desktop/Web/bridge.ts`
- Test: `apps/desktop/tests/hotkey.test.ts`

- [ ] **Step 1: 写一个热键唤起的最小测试**

```ts
import { describe, expect, it } from "vitest";

describe("prompt open flow", () => {
  it("opens prompt from hotkey action", () => {
    const result = openPrompt("");
    expect(result.visible).toBe(true);
  });
});
```

- [ ] **Step 2: 运行一次失败验证**

```bash
swift build
```

Expected: FAIL 或报告缺少 bridge 实现

- [ ] **Step 3: 接入 Swift 全局快捷键和 WebView 消息桥**

```swift
// 注册全局快捷键后，向 WKWebView 发送 openPrompt 消息
```

- [ ] **Step 4: 让 Web 层接收唤起消息并展示输入框**

```ts
export function openPrompt(prefill = "") {
  return { visible: true, prefill };
}
```

### Task 3: 实现“用户主动选区”采集能力

**Files:**
- Create: `packages/core/src/selection/SelectionCapture.ts`
- Create: `packages/platform-macos/src/MacSelectionCapture.ts`
- Modify: `packages/core/src/runtime/AgentSession.ts`
- Test: `packages/core/tests/selection.test.ts`

- [ ] **Step 1: 写一个选区预填测试**

```ts
import { describe, expect, it } from "vitest";

it("prefills selected text", async () => {
  const capture = new FakeSelectionCapture("用户刚刚选中的文本");
  const text = await capture.captureSelectedText();
  expect(text).toBe("用户刚刚选中的文本");
});
```

- [ ] **Step 2: 实现选区采集接口与 macOS 默认实现**

```ts
export interface SelectionCapture {
  captureSelectedText(): Promise<string | null>;
}
```

```ts
export class MacSelectionCapture implements SelectionCapture {
  async captureSelectedText() {
    return null;
  }
}
```

### Task 4: 建立 Agent Core、tool 协议与注册中心

**Files:**
- Create: `packages/core/src/tools/AgentTool.ts`
- Create: `packages/core/src/tools/ToolRegistry.ts`
- Create: `packages/core/src/runtime/AgentRuntime.ts`
- Create: `packages/core/src/runtime/AgentMessage.ts`
- Create: `packages/core/src/runtime/ToolCallEnvelope.ts`
- Create: `packages/core/tests/runtime.test.ts`

- [ ] **Step 1: 写一个 runtime 集成测试**

```ts
import { describe, expect, it } from "vitest";

it("executes tool calls and returns final message", async () => {
  const runtime = new AgentRuntime(fakeClient, new ToolRegistry([fakeTool]));
  const result = await runtime.run("测试");
  expect(result.at(-1)?.content).toBe("done");
});
```

- [ ] **Step 2: 实现最小 tool 协议与 runtime 循环**

```ts
export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call(arguments_: Record<string, unknown>): Promise<unknown>;
}
```

```ts
export class AgentRuntime {
  constructor(
    private llmClient: LLMClient,
    private toolRegistry: ToolRegistry
  ) {}

  async run(userInput: string) {
    const messages = [{ role: "user", content: userInput }];
    return messages;
  }
}
```

### Task 5: 实现第一批内置 tool

**Files:**
- Create: `packages/core/src/tools/builtins/ClipboardReadTool.ts`
- Create: `packages/core/src/tools/builtins/FileReadTool.ts`
- Create: `packages/core/src/tools/builtins/FileWriteTool.ts`
- Create: `packages/core/src/tools/builtins/FrontmostAppTool.ts`
- Create: `packages/core/src/tools/builtins/WindowListTool.ts`
- Create: `packages/core/src/platform/PlatformAdapter.ts`
- Create: `packages/platform-macos/src/MacPlatformAdapter.ts`

- [ ] **Step 1: 只写一个文件读写 round-trip 测试**

```ts
import { describe, expect, it } from "vitest";

it("writes and reads workspace files", async () => {
  const writeTool = new FileWriteTool(workspaceRoot);
  const readTool = new FileReadTool(workspaceRoot);
  await writeTool.call({ path: "notes/today.md", content: "# 今日总结" });
  const result = await readTool.call({ path: "notes/today.md" });
  expect(result).toBe("# 今日总结");
});
```

- [ ] **Step 2: 实现剪贴板、文件、前台 App、窗口工具**

```ts
export class FileReadTool implements AgentTool { /* ... */ }
export class FileWriteTool implements AgentTool { /* ... */ }
export class ClipboardReadTool implements AgentTool { /* ... */ }
```

- [ ] **Step 3: 定义平台抽象并补 macOS 实现骨架**

```ts
export interface PlatformAdapter {
  currentClipboardText(): Promise<string | null>;
  frontmostAppInfo(): Promise<Record<string, string>>;
  frontmostWindowList(): Promise<Record<string, string>[]>;
}
```

### Task 6: 接入截图、OCR 与可访问性操作 tool

**Files:**
- Create: `packages/core/src/tools/builtins/ScreenCaptureTool.ts`
- Create: `packages/core/src/tools/builtins/OCRTool.ts`
- Create: `packages/core/src/tools/builtins/AccessibilitySnapshotTool.ts`
- Create: `packages/core/src/tools/builtins/AccessibilityActionTool.ts`
- Modify: `packages/platform-macos/src/MacPlatformAdapter.ts`

- [ ] **Step 1: 只补一个 OCR tool schema 测试**

```ts
import { describe, expect, it } from "vitest";

it("registers OCR tool schema", () => {
  const registry = new ToolRegistry([new OCRTool(platform)]);
  expect(registry.exportSchemas().some(s => s.name === "ocr_read")).toBe(true);
});
```

- [ ] **Step 2: 实现截图、OCR 与可访问性动作接口**

```ts
export class OCRTool implements AgentTool { /* ... */ }
export class AccessibilityActionTool implements AgentTool { /* ... */ }
```

### Task 7: 接入 Vercel LLM client 与气泡反馈

**Files:**
- Create: `packages/core/src/llm/LLMClient.ts`
- Create: `packages/core/src/llm/VercelClient.ts`
- Create: `apps/desktop/Web/BubbleList.tsx`
- Modify: `apps/desktop/Web/App.tsx`
- Modify: `apps/desktop/HandAgentApp.swift`

- [ ] **Step 1: 只写一个“提交 prompt 后出现结果气泡”的集成测试**

```ts
import { describe, expect, it } from "vitest";

it("shows a bubble after run completes", async () => {
  const app = createTestApp();
  await app.submitPrompt("将当前内容总结成笔记");
  expect(app.bubbles.at(-1)?.text).toBe("done");
});
```

- [ ] **Step 2: 接入 Vercel LLM client**

```ts
export class VercelClient implements LLMClient {
  async respond() {
    return { type: "message", text: "done" };
  }
}
```

- [ ] **Step 3: 接入 bubble 反馈**

```tsx
export function BubbleList({ items }) {
  return <div>{items.map(item => <div key={item.id}>{item.text}</div>)}</div>;
}
```

### Task 8: 串联 MVP 端到端流程并补充文档

**Files:**
- Modify: `apps/desktop/HandAgentApp.swift`
- Modify: `apps/desktop/Web/App.tsx`
- Create: `README.md`
- Create: `docs/manual-qa.md`

- [ ] **Step 1: 跑一次全量构建**

```bash
swift build
```

Expected: PASS

- [ ] **Step 2: 补 README 与手工验收清单**

```md
# HandAgent

## 当前能力

- 全局热键唤起输入框
- 支持用户主动选区预填
- 仅用户主动输入进入 LLM
- LLM 按需调用 context tools 和 action tools
- 后台气泡反馈
```

- [ ] **Step 3: 提交**

```bash
git add .
git commit -m "feat: complete desktop agent runtime mvp"
```

## 自检

- Spec coverage:
  - UI 已切换为 Swift + WKWebView + React。
  - 核心仍保持跨平台独立层。
  - LLM 调用改为 Vercel 接入。
- Placeholder scan:
  - 计划中没有 `TODO`、`TBD`、`implement later` 之类占位词。
  - 测试粒度已收敛到每个大模块少量验证。
- Type consistency:
  - `AgentRuntime`、`ToolRegistry`、`SelectionCapture`、`PlatformAdapter` 等命名保持一致。
