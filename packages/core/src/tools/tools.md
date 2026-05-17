# tools

`AgentTool` 协议、`ToolRegistry` 注册中心，以及当前 9 个 builtin tool。

## 文件

| 文件 | 职责 |
|------|------|
| `AgentTool.ts` | `AgentTool<TInput, TOutput>` 接口：`name / description / inputSchema (JSON Schema) / call(input)` |
| `ToolRegistry.ts` | Map 包装；`register / get / list`，重名抛错；`list()` 返回 `RegisteredTool`（去掉 `call`），供 `LLMClient.complete` 使用 |
| `registerBuiltins.ts` | 组合根：根据 `PlatformAdapter` + 可选 `WorkspaceRegistry` + `ToolSettings` 装配 candidates，过 allowlist/denylist 后注册 |
| `builtins/*.ts` | 9 个 builtin tool 实现 |

## 9 个 builtin tool

| name | 入参 | 依赖 | 说明 |
|------|------|------|------|
| `clipboard.read` | `{}` | `PlatformAdapter.currentClipboardText` | 读 NSPasteboard 文本 |
| `app.frontmost` | `{}` | `PlatformAdapter.frontmostAppInfo` | 当前前台 App 信息 |
| `window.list` | `{}` | `PlatformAdapter.frontmostWindowList` | 当前可见窗口列表（CGWindowList） |
| `screen.capture` | `ScreenCaptureRequest` | `PlatformAdapter.captureScreen`（→ ScreenCaptureKit） | 支持 display / window / region 三种 target，base64 PNG 返回 |
| `ocr.read` | `OCRRequest` | `PlatformAdapter.recognizeText` | macOS 暂返回 `not_implemented` |
| `accessibility.snapshot` | `AccessibilitySnapshotTarget` | `PlatformAdapter.accessibilitySnapshot` | macOS 暂返回 `not_implemented` |
| `accessibility.action` | `AccessibilityActionRequest` | `PlatformAdapter.performAccessibilityAction` | macOS 暂返回 `not_implemented` |
| `workspace.list` | `{}` | `WorkspaceRegistry.summarize` | 返回 `[{id, name, description, isDefault}]`，**不含 rootPath** |
| `file.read` | `{ workspaceId, relativePath }` | `WorkspaceRegistry` | 沙箱 read：经 `realpath` 校验仍在 rootPath 内 |
| `file.write` | `{ workspaceId, relativePath, content }` | `WorkspaceRegistry` | 沙箱 write：当前对 basename 是 symlink 越狱有保护盲区（见架构改进） |

## 注册流程

```mermaid
flowchart LR
  A[startDefaultServer] --> B[loadToolSettings]
  A --> C[FileWorkspaceRegistry]
  A --> D[RemotePlatformAdapter]
  B & C & D --> E[registerBuiltinTools]
  E --> F[candidates = 7 platform tools + 3 workspace tools]
  E --> G[filterToolNames（denylist 优先 > allowlist）]
  G --> H[registry.register]
  H --> I[返回 {registry, registered, disabled}]
```

`disabled` 列表回流到 `console.log`，便于排错；当 `workspaceRegistry` 缺失时，三个 file/workspace tool 直接进 disabled。

## 编辑此目录的约束

- 新增 builtin tool 必须：实现 `AgentTool` → 在 `registerBuiltins.ts` 的 `candidates` 里挂上 → 同步更新 [README](/Users/mu9/proj/handAgent/README.md) 与本文件的"9 个 builtin tool"表。
- tool name 一律点号风格（`category.action`），描述要包含调用场景与边界条件，方便 LLM 自决策。
- 不要在 tool 内部直接 `import "node:fs"` 与平台无关的 IO；platform 类 tool 必须经 `PlatformAdapter`，文件类 tool 必须经 `WorkspaceRegistry`。
- 工具结果优先返回**可序列化对象**（runtime 自动 JSON.stringify）；返回字符串只用于人类阅读场景。
- 入参 JSON Schema 与 TS 类型当前手写，必须双向对齐；推荐未来引入 `zod`/`@sinclair/typebox` 单一源（架构改进项）。

## 相关文档

- 平台抽象：[platform/platform.md](/Users/mu9/proj/handAgent/packages/core/src/platform/platform.md)
- 工作区沙箱：[workspace/workspace.md](/Users/mu9/proj/handAgent/packages/core/src/workspace/workspace.md)
- 配置开关：[config/config.md](/Users/mu9/proj/handAgent/packages/core/src/config/config.md)
- 桌面侧 macOS 实现：[apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md)
