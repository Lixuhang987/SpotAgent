# 开发说明

## 启动项目

1. 先配置 `OPENAI_API_KEY`。

```bash
export OPENAI_API_KEY="你的 OpenAI API key"
```

如果希望长期生效，可写入 `~/.zshrc`：

```bash
echo 'export OPENAI_API_KEY="你的 OpenAI API key"' >> ~/.zshrc
source ~/.zshrc
```

2. 安装 workspace 依赖。

```bash
pnpm install
```

3. 启动桌面宿主。

```bash
bash ./scripts/swiftw run HandAgentDesktop
```

4. 如果 `swiftw run` 在当前机器报错，优先检查 Xcode 版本与 `xcode-select` 是否指向完整 Xcode，再执行同样流程。

### API key 排查

- `OPENAI_API_KEY` 由宿主启动出来的本地 `apps/agent-server/src/server.ts` 进程读取。
- 如果提交 prompt 后看到 `Missing OPENAI_API_KEY. Set it before starting HandAgent.`，说明桌面宿主启动时没有拿到该环境变量。
- 这时先在当前 shell 里配置变量，再重新执行 `bash ./scripts/swiftw run HandAgentDesktop`。

## 调试方式

### TypeScript 侧

- 修改 `apps/agent-server/` 或 `packages/core/` 后，先跑：

```bash
pnpm exec vitest run \
  apps/agent-server/src/SessionManager.test.ts \
  packages/core/tests/runtime.test.ts \
  packages/core/tests/selection.test.ts \
  packages/core/tests/context-tools.test.ts \
  packages/core/tests/file-tools.test.ts
```

### Swift 宿主

- 修改 `apps/desktop/HandAgentApp.swift` 后，先跑：

```bash
bash ./scripts/swiftw build
```

- 如果需要观察窗口与热键行为，优先用 PromptPanel、SessionWindow 和状态气泡的可见状态来定位问题。
- 热键相关问题先确认辅助功能权限是否已授权。

### 端到端

- 文本链路：热键唤起 -> PromptPanel 输入 prompt -> 新建 SessionWindow -> bubble 输出结果。
- 状态链路：状态气泡展示 -> 点击后回到 running session 或最近活跃窗口。
- 工具链路：先通过 `packages/core/tests/*` 里对应测试验证，再考虑接到 SessionWindow。

## 代码规范

### 目录边界

- `apps/desktop/HandAgentApp.swift` 只放 macOS 宿主入口与顶层协调逻辑。
- `apps/desktop/Sources/` 按 `AppServices`、`PromptPanel`、`SessionWindow`、`StatusBubble` 分目录放 Swift 实现。
- `packages/core/` 只放跨平台的 Agent Core、tool 协议和通用测试。
- `packages/platform-macos/` 只放 macOS 平台实现。

### 依赖边界

- Core 代码不要直接依赖宿主 UI。
- 平台实现只通过 `PlatformAdapter` 暴露能力，不要把 macOS 细节泄漏到 core。
- LLM provider 通过 `LLMClient` 抽象接入，不要把具体 provider 绑死在 runtime。

### 行为边界

- 只有用户主动输入和用户主动选区可以作为初始上下文。
- 屏幕、窗口、文件、剪贴板、App 状态一律通过 tool 按需读取。
- 新 tool 默认要保持小而清晰：输入、输出、错误语义要明确。

### 命名和格式

- 文档默认中文，除非是 API、协议字段或原始命名。
- tool 名称尽量使用稳定的点号风格，例如 `file.read`、`screen.capture`。
- 测试名称要直接描述行为，不要只写“should work”。
- 新增代码优先保持最小闭环，避免把后续任务提前塞进当前任务里。

## 常用命令

```bash
# Agent-server + Core 测试
pnpm exec vitest run \
  apps/agent-server/src/SessionManager.test.ts \
  packages/core/tests/runtime.test.ts \
  packages/core/tests/selection.test.ts \
  packages/core/tests/context-tools.test.ts \
  packages/core/tests/file-tools.test.ts

# 桌面宿主测试与构建
bash ./scripts/swiftw test
bash ./scripts/swiftw build
```
