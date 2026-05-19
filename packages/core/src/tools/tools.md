# tools

`AgentTool` 协议、`ToolRegistry` 注册中心、当前 11 个 builtin tool，以及本地目录插件 tool。

## 文件

| 文件 | 职责 |
|------|------|
| `AgentTool.ts` | `AgentTool<TInput, TOutput>` 接口：`name / description / inputSchema (JSON Schema) / call(input, context?)`；`context` 当前包含 `sessionId / toolCallId`；可选 `stubByDefault` 声明 runtime 可把结果写成 Blob/Stub |
| `defineTool.ts` | `defineTool({ name, description, inputSchema (zod), stubByDefault?, run })` 工厂：`zod` schema 自动转 JSON Schema 2019-09；`.create(deps)` 生成的 `call(input, context?)` 会先用同一个 schema 做运行时入参校验，再调用 `run` |
| `ToolRegistry.ts` | Map 包装；`register / replaceAll / get / list`，单次注册重名抛错，`replaceAll()` 供 settings 热加载原地刷新；`list()` 返回 `RegisteredTool`（去掉 `call`），供 `LLMClient.stream` 使用 |
| `registerBuiltins.ts` | 组合根：根据 `PlatformAdapter` + 可选 `WorkspaceRegistry` + `ToolSettings` 装配 candidates，过 allowlist/denylist 后注册 |
| `registerTools.ts` | 插件感知组合根：先生成 builtin candidates，再合并插件 loader 结果；builtin 名称优先，重复 plugin tool 全部禁用，最后统一套 `allowlist / denylist` |
| `builtins/*.ts` | 11 个 builtin tool 实现，全部用 `defineTool` 工厂表达 |
| `builtins/workspace-path.ts` | `file.read` / `file.write` 共享的 workspace 路径校验工具：拒绝绝对路径与 `..` 越狱、`realpath` 后再次校验 |
| `plugins/` | 本地目录插件 manifest 解析、加载与子进程执行隔离，见 [plugins/plugins.md](/Users/mu9/proj/handAgent/packages/core/src/tools/plugins/plugins.md) |

## 11 个 builtin tool

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
| `workspace.askUser` | `{ prompt, candidateIds? }` | `WorkspaceRegistry.summarize` + `WorkspaceAskResolver` | 多个 workspace 候选都合理时，通过 SessionWindow 内联气泡让用户选择；取消、超时或无活动 session 返回 `{ cancelled: true }` |
| `file.read` | `{ workspaceId, relativePath, cached }` | `WorkspaceRegistry` | 沙箱 read：经 `realpath` 校验仍在 rootPath 内；`cached` 必填，取 `turn` 或 `persist` |
| `file.write` | `{ workspaceId, relativePath, content }` | `WorkspaceRegistry` | 沙箱 write：写前 lstat 拒绝 basename 是 symlink；10 MiB 上限；`.tmp → rename` 原子写 |

## 注册流程

```mermaid
flowchart LR
  A[startDefaultServer / before run refresh] --> B[SettingsBackedToolRegistry.refresh]
  B --> C[loadToolSettings + plugin stamp]
  A --> W[FileWorkspaceRegistry]
  A --> D[RemotePlatformAdapter]
  C & W & D --> E[registerTools]
  E --> F[candidates = 7 platform tools + 4 workspace tools]
  E --> P[loadLocalPluginTools 从 ~/.spotAgent/plugins 读取插件]
  F & P --> R[冲突规则：builtin 优先，重复 plugin tool 禁用]
  R --> G[filterToolNames（denylist 优先 > allowlist）]
  G --> H[registry.replaceAll]
  H --> I[返回 {registry, registered, disabled}]
```

`SettingsBackedToolRegistry` 在 agent-server 启动和每轮 user message 进入 runtime 前按 `settings.json` 与 `~/.spotAgent/plugins/*/plugin.json` 文件戳刷新；`disabled` 列表回流到 `console.log`，便于排错；当 `workspaceRegistry` 缺失时，三个 file/workspace tool 直接进 disabled；当缺少 `WorkspaceAskResolver` 时，`workspace.askUser` 单独进 disabled。

插件 tool 第一版只支持本地目录安装：`~/.spotAgent/plugins/<plugin-id>/plugin.json`。manifest 可用 `enabled: false` 禁用整插件；单个 tool 启停复用 `tools.allowlist / tools.denylist`。插件执行通过本地子进程隔离，JSON stdin/stdout；崩溃、非 JSON 输出、超时都作为 tool error 返回，不影响 agent-server 进程。

## 编辑此目录的约束

- 新增 builtin tool 必须：实现 `AgentTool` → 在 `registerBuiltins.ts` 的 `candidates` 里挂上 → 同步更新 [README](/Users/mu9/proj/handAgent/README.md) 与本文件的"10 个 builtin tool"表。
- 新增插件 manifest 字段或执行协议字段时，同步更新 [plugins/plugins.md](/Users/mu9/proj/handAgent/packages/core/src/tools/plugins/plugins.md)，并补 manifest 解析与执行失败路径测试。
- tool name 一律点号风格（`category.action`），描述要包含调用场景与边界条件，方便 LLM 自决策。
- 不要在 tool 内部直接 `import "node:fs"` 与平台无关的 IO；platform 类 tool 必须经 `PlatformAdapter`，文件类 tool 必须经 `WorkspaceRegistry`。
- 工具结果优先返回**可序列化对象**（runtime 自动 JSON.stringify）；返回字符串只用于人类阅读场景。
- 大段输出工具若需要 Blob/Stub 路径，应在 input schema 中加入必填 `cached: "turn" | "persist"`，并设置 `stubByDefault`；runtime 会负责落 Blob 与渲染 STUB，tool 不直接拼文本。
- 入参 schema 单一源：写 `zod` schema 即可，`defineTool` 自动派生 JSON Schema、TS 类型，并在 `call(input)` 内执行运行时校验；不要再手写 JSON Schema 字面量，也不要在 builtin tool 里重复做外层入参结构校验。
- 运行时入参校验失败时，`call(input)` 以 rejected `Error` 返回统一可读错误，错误信息包含 tool name 与字段路径（例如缺字段、类型错误、strict object 的未知字段），方便 `AgentRuntime` 与审计日志直接展示。

## 相关文档

- 平台抽象：[platform/platform.md](/Users/mu9/proj/handAgent/packages/core/src/platform/platform.md)
- 工作区沙箱：[workspace/workspace.md](/Users/mu9/proj/handAgent/packages/core/src/workspace/workspace.md)
- 配置开关：[config/config.md](/Users/mu9/proj/handAgent/packages/core/src/config/config.md)
- 桌面侧 macOS 实现：[apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md)
