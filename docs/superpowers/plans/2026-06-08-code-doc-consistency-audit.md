# Code Doc Consistency Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对整个 handAgent 仓库执行只读一致性审核，找出代码、文件结构、测试、示例与 Markdown 文档之间的不匹配。

**Architecture:** 审核按目录责任边界拆成 5 个并行分区，每个分区先沿 `handAgent.md -> <dir>.md` 的 DFS 文档索引读取上下文，再用代码和文件系统作为事实来源核对文档。主协调者只负责计划、分发、汇总、去重和定级，不在本轮直接修改业务代码或文档。

**Tech Stack:** Markdown、TypeScript、Swift/SwiftUI、React/Vite、Vitest、SwiftPM、`rg`、`git`。

---

## File Structure

- Create: `docs/superpowers/plans/2026-06-08-code-doc-consistency-audit.md`
  - 记录本次全仓库代码/文档一致性审核的分区、步骤、输出格式与验证标准。
- Inspect only: `AGENTS.md`, `handAgent.md`, `README.md`, `DESIGN.md`, `docs/**`
  - 根文档、开发说明、手工 QA、bugs/TODO、历史 specs/plans。
- Inspect only: `packages/**`
  - `packages/core` 的 TypeScript 核心实现、测试与模块文档。
- Inspect only: `apps/agent-server/**`
  - 本地 WebSocket server、thread runtime 编排、settings、protocol、tests 与模块文档。
- Inspect only: `apps/desktop/**`
  - macOS SwiftUI/AppKit 宿主、PromptPanel、ThreadWindow、AppServices、StatusBubble、Settings、Theme 与模块文档。
- Inspect only: `apps/thread-window-web/**`, `examples/**`
  - React ThreadWindow 前端、构建配置、示例插件、append prompts、MCP 示例与文档。

## Output Contract

每个分区返回的问题必须使用同一格式，方便主协调者去重：

```markdown
### P1: 简短标题

- 文档位置：`path/to/doc.md`
- 代码/文件证据：`path/to/code.ts`
- 不一致点：文档说 X，但代码或文件系统实际是 Y。
- 建议修正：把文档改为 Y，或若文档代表目标状态则补齐代码实现。
```

严重级别：

- `P0`：文档误导会导致错误执行、错误命令、数据丢失或安全边界误判。
- `P1`：核心架构、主调用链路、协议字段、能力边界或测试策略明显漂移。
- `P2`：模块索引、功能描述、示例路径、状态说明过期，但不直接破坏执行。
- `P3`：措辞、命名、轻微遗漏或可读性问题。

## Task 1: Root Docs and Historical Plans Audit

**Files:**
- Inspect: `AGENTS.md`
- Inspect: `handAgent.md`
- Inspect: `README.md`
- Inspect: `DESIGN.md`
- Inspect: `docs/dev.md`
- Inspect: `docs/manual-qa.md`
- Inspect: `docs/bugs.md`
- Inspect: `docs/TODO.md`
- Inspect: `docs/human/**`
- Inspect: `docs/superpowers/specs/**`
- Inspect: `docs/superpowers/plans/**`

- [ ] **Step 1: Map root documentation inventory**

Run:

```bash
rg --files -g '*.md' | sort
```

Expected: prints every repository Markdown file, including `AGENTS.md`, `handAgent.md`, `apps/apps.md`, `packages/packages.md`, `examples/examples.md`, and all direct `docs/*.md` leaves.

- [ ] **Step 2: Map actual top-level structure**

Run:

```bash
find . -maxdepth 2 -type d \
  -not -path './.git*' \
  -not -path './node_modules*' \
  -not -path './*/node_modules*' \
  | sort
```

Expected: prints the actual first two directory levels so root docs can be checked for missing or stale direct children.

- [ ] **Step 3: Check root command truth**

Run:

```bash
sed -n '1,220p' package.json
sed -n '1,220p' scripts/test.sh
sed -n '1,220p' scripts/swiftw
```

Expected: shows the real package scripts and wrapper commands used to validate TypeScript and Swift.

- [ ] **Step 4: Check root architecture claims against code**

Run:

```bash
rg -n "ThreadCommandRouter|ThreadRuntimeOrchestrator|ThreadInputQueue|ThreadNotificationPublisher|ThreadPersistence|FileThreadStore|platform_bridge_hello|/api/thread|/api/platform|WKWebView|PromptPanel|StatusBubble" apps packages
```

Expected: prints concrete code references for every root architecture term that appears in `handAgent.md` or `AGENTS.md`.

- [ ] **Step 5: Return root findings**

Return all root/doc findings using the Output Contract. If no mismatch is found, return:

```markdown
未发现 root/docs 范围内有证据的代码/文档不一致。
```

## Task 2: Packages Core Audit

**Files:**
- Inspect: `handAgent.md`
- Inspect: `packages/packages.md`
- Inspect: `packages/core/core.md`
- Inspect: `packages/core/src/src.md`
- Inspect: `packages/core/src/**`
- Inspect: `packages/core/tests/**`

- [ ] **Step 1: Read the required documentation chain**

Run:

```bash
sed -n '1,260p' handAgent.md
sed -n '1,240p' packages/packages.md
sed -n '1,260p' packages/core/core.md
sed -n '1,260p' packages/core/src/src.md
```

Expected: shows the repository, package, core, and core source-layer documentation that define the audit context.

- [ ] **Step 2: Compare documented modules to actual modules**

Run:

```bash
find packages/core/src -maxdepth 2 -type d | sort
rg --files packages/core/src packages/core/tests | sort
```

Expected: shows every actual core source/test directory and file.

- [ ] **Step 3: Check exported APIs and protocol DTOs**

Run:

```bash
rg -n "export |interface |type |class |enum |ThreadCommand|ThreadNotification|ServerRequest|ClientResponse|PlatformBridge|AgentRuntime|ToolRegistry|Permission|Workspace|ThreadStore|Blob" packages/core/src packages/core/tests
```

Expected: prints the actual exported and locally defined core APIs to compare against module docs.

- [ ] **Step 4: Return packages/core findings**

Return all `packages/core` findings using the Output Contract. If no mismatch is found, return:

```markdown
未发现 packages/core 范围内有证据的代码/文档不一致。
```

## Task 3: Agent Server Audit

**Files:**
- Inspect: `handAgent.md`
- Inspect: `apps/apps.md`
- Inspect: `apps/agent-server/agent-server.md`
- Inspect: `apps/agent-server/src/src.md`
- Inspect: `apps/agent-server/src/**`
- Inspect: `apps/agent-server/tests/**`

- [ ] **Step 1: Read the required documentation chain**

Run:

```bash
sed -n '1,260p' handAgent.md
sed -n '1,220p' apps/apps.md
sed -n '1,260p' apps/agent-server/agent-server.md
sed -n '1,260p' apps/agent-server/src/src.md
sed -n '1,220p' apps/agent-server/tests/tests.md
```

Expected: shows the repository, app-layer, agent-server, source, and test documentation that define the audit context.

- [ ] **Step 2: Compare documented modules to actual modules**

Run:

```bash
find apps/agent-server/src apps/agent-server/tests -maxdepth 2 -type d | sort
rg --files apps/agent-server/src apps/agent-server/tests | sort
```

Expected: shows every actual agent-server source/test directory and file.

- [ ] **Step 3: Check runtime and WebSocket protocol implementation**

Run:

```bash
rg -n "ThreadCommandRouter|ThreadRuntimeOrchestrator|ThreadInputQueue|ThreadNotificationPublisher|ThreadPersistence|WebSocket|/api/thread|/api/platform|thread.start|thread.resume|turn.start|turn.interrupt|permission.requested|workspace.requested" apps/agent-server/src apps/agent-server/tests packages/core/src/protocol
```

Expected: prints actual server protocol routing, thread orchestration, and request/response handling evidence.

- [ ] **Step 4: Return agent-server findings**

Return all `apps/agent-server` findings using the Output Contract. If no mismatch is found, return:

```markdown
未发现 apps/agent-server 范围内有证据的代码/文档不一致。
```

## Task 4: Desktop App Audit

**Files:**
- Inspect: `handAgent.md`
- Inspect: `apps/apps.md`
- Inspect: `apps/desktop/desktop.md`
- Inspect: `apps/desktop/Sources/**`
- Inspect: `apps/desktop/TestsSwift/**`

- [ ] **Step 1: Read the required documentation chain**

Run:

```bash
sed -n '1,260p' handAgent.md
sed -n '1,220p' apps/apps.md
sed -n '1,280p' apps/desktop/desktop.md
find apps/desktop/Sources -name '*.md' -maxdepth 3 -print | sort
```

Expected: shows desktop-layer context and the complete list of desktop module docs.

- [ ] **Step 2: Compare documented modules to actual modules**

Run:

```bash
find apps/desktop/Sources apps/desktop/TestsSwift -maxdepth 3 -type d | sort
rg --files apps/desktop/Sources apps/desktop/TestsSwift | sort
```

Expected: shows every actual Swift source/test directory and file.

- [ ] **Step 3: Check native app behavior claims**

Run:

```bash
rg -n "PromptPanel|ThreadWindow|WKWebView|StatusBubble|GlobalHotkey|Hotkey|SelectionCapture|PlatformBridge|MacPlatformProvider|ScreenCaptureKit|SCScreenshotManager|NSPasteboard|NSWorkspace|CGWindowListCopyWindowInfo|Vision|Accessibility|Settings" apps/desktop/Sources apps/desktop/TestsSwift
```

Expected: prints actual desktop app behavior evidence for the documented native boundaries.

- [ ] **Step 4: Return desktop findings**

Return all `apps/desktop` findings using the Output Contract. If no mismatch is found, return:

```markdown
未发现 apps/desktop 范围内有证据的代码/文档不一致。
```

## Task 5: Thread Window Web and Examples Audit

**Files:**
- Inspect: `handAgent.md`
- Inspect: `apps/apps.md`
- Inspect: `apps/thread-window-web/thread-window-web.md`
- Inspect: `apps/thread-window-web/src/**`
- Inspect: `apps/thread-window-web/tests/**`
- Inspect: `examples/examples.md`
- Inspect: `examples/mcp/**`
- Inspect: `examples/plugins/**`

- [ ] **Step 1: Read the required documentation chain**

Run:

```bash
sed -n '1,260p' handAgent.md
sed -n '1,220p' apps/apps.md
sed -n '1,260p' apps/thread-window-web/thread-window-web.md
sed -n '1,220p' examples/examples.md
sed -n '1,220p' examples/plugins/plugins.md
sed -n '1,220p' examples/mcp/mcp.md
```

Expected: shows web and examples context before reading local implementation.

- [ ] **Step 2: Compare documented web/example files to actual files**

Run:

```bash
find apps/thread-window-web/src apps/thread-window-web/tests examples -maxdepth 3 -type d | sort
rg --files apps/thread-window-web/src apps/thread-window-web/tests examples | sort
```

Expected: shows every actual web source/test file and example file.

- [ ] **Step 3: Check web protocol and example config truth**

Run:

```bash
rg -n "thread.start|thread.resume|thread.list|thread.delete|turn.start|turn.interrupt|permission.requested|workspace.requested|permission.answered|workspace.answered|/api/thread|append|mcp|plugin|tool" apps/thread-window-web/src apps/thread-window-web/tests examples packages/core/src/protocol
```

Expected: prints actual web protocol and example configuration evidence.

- [ ] **Step 4: Return web/examples findings**

Return all `apps/thread-window-web` and `examples` findings using the Output Contract. If no mismatch is found, return:

```markdown
未发现 apps/thread-window-web 与 examples 范围内有证据的代码/文档不一致。
```

## Task 6: Merge, Deduplicate, and Rank Findings

**Files:**
- Inspect: all task outputs

- [ ] **Step 1: Merge all sub-agent outputs**

Group findings by affected document path. If two findings refer to the same stale sentence or same missing child index, keep the more specific evidence and mention both source areas only when both are useful.

- [ ] **Step 2: Validate the highest-risk findings locally**

For each `P0` and `P1`, run a focused `rg` or `sed` command against the cited files before reporting it. Example:

```bash
rg -n "citedSymbolOrField" cited/path another/relevant/path
```

Expected: confirms the cited mismatch is still present in the local workspace.

- [ ] **Step 3: Produce final audit summary**

Return:

```markdown
## 审核结果

- P0: N
- P1: N
- P2: N
- P3: N

## 发现的问题

### P1: 标题

- 文档位置：`path/to/doc.md`
- 代码/文件证据：`path/to/code.ts`
- 不一致点：文档说 X，但代码或文件系统实际是 Y。
- 建议修正：把文档改为 Y，或若文档代表目标状态则补齐代码实现。

## 未覆盖/风险

- 未运行完整测试；本轮目标是静态一致性审核。
```

## Self-Review

- Spec coverage: 本计划覆盖根文档、`docs/**`、`packages/core/**`、`apps/agent-server/**`、`apps/desktop/**`、`apps/thread-window-web/**` 与 `examples/**`，满足“审核整个代码库”的范围。
- Placeholder scan: 除既有文件名 `docs/TODO.md` 外，未使用 `TBD`、`TODO`、`implement later`、`fill in details` 或无证据的泛化步骤。
- Type consistency: 计划中只引用仓库现有目录、命令和可检索符号；输出格式在所有任务中保持一致。
