# 开发说明

## 启动项目

1. 先配置模型设置。

```json
{
  "llm": {
    "provider": "openai-compatible",
    "model": "gpt-5-mini",
    "apiKey": "你的 OpenAI API key",
    "baseUrl": "https://你的模型提供商兼容 OpenAI 的入口/v1",
    "api": "responses"
  }
}
```

推荐直接通过桌面应用的 `Settings...` 页面编辑这份 `~/.spotAgent/settings.json`。说明：

- `baseUrl` 可留空，运行时会自动回退到 `https://api.openai.com/v1`。
- `provider` 当前支持 `openai-compatible` 与 `anthropic`；缺失时默认按旧配置走 `openai-compatible`。
- `api` 当前支持 `responses`、`chat`、`completion`。
- `agent-server` 会在每次模型请求前检查这份文件的文件戳；文件变化后会重新读取，因此修改设置后无需重启桌面宿主。

2. 安装 workspace 依赖。

```bash
pnpm install
```

3. 启动桌面宿主。

```bash
bash ./scripts/swiftw run HandAgentDesktop
```

4. 如果 `swiftw run` 在当前机器报错，优先检查 Xcode 版本与 `xcode-select` 是否指向完整 Xcode，再执行同样流程。

### 模型配置排查

- 本地 `apps/agent-server/src/server.ts` 会通过 `SettingsBackedLLMClient` 在每次请求前检查 `~/.spotAgent/settings.json` 的文件戳，配置变化后重新读取。
- core 的 `LLMClientFactory` 会根据配置里的 `provider` 创建 OpenAI 兼容或 Anthropic client；OpenAI 兼容路径会继续根据 `api` 选择 `responses`、`chat` 或 `completion` provider model。
- 图片附件会先保存为本地 blob 与 session STUB；进入 LLM 请求前才展开为多模态 image part。`api=completion` 不支持图片，请使用 `responses` 或 `chat`。
- 如果提交 prompt 后看到 `Missing apiKey in ~/.spotAgent/settings.json. 请先在设置页完成模型配置。`，说明当前设置文件里没有有效的 `apiKey`。
- 如果提交 prompt 后看到 `Could not connect to the server`，优先检查本地 `agent-server` 是否成功启动，而不要先把问题归因到 API key。
- 如果模型请求打到了错误的 provider 地址，先检查 `baseUrl` 是否与目标服务要求的 OpenAI 兼容入口一致。

## 调试方式

### TypeScript 侧

- 修改 `apps/agent-server/` 或 `packages/core/` 后，先跑：

```bash
bash ./scripts/test.sh
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

### 打包与系统权限

- 本地 QA 打包使用 `bash ./scripts/package-app.sh --mock-llm`。
- 脚本默认用 ad-hoc 签名，但会显式写入 `designated => identifier "com.yourname.HandAgentDesktop"`，避免默认 requirement 退化成随二进制变化的 `cdhash`。这样屏幕录制、辅助功能等 macOS TCC 权限在多次重构建后仍能复用同一个 App 身份。
- 如果需要换正式签名身份，可设置 `HANDAGENT_PACKAGE_CODESIGN_IDENTITY`；如果 bundle id 或签名策略变化，也要同步设置 `HANDAGENT_PACKAGE_CODESIGN_REQUIREMENT`。

## 代码规范

### 目录边界

- `apps/desktop/HandAgentApp.swift` 只放 macOS 宿主入口与顶层协调逻辑。
- `apps/desktop/Sources/` 按 `AppServices`、`PromptPanel`、`SessionWindow`、`StatusBubble` 分目录放 Swift 实现。
- `packages/core/` 只放跨平台的 Agent Core、tool 协议和通用测试。
- macOS 平台能力放在 `apps/desktop/Sources/AppServices/PlatformBridge/MacPlatformProvider.swift`，通过 `PlatformBridgeService` 暴露反向 IPC。

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
bash ./scripts/test.sh

# 桌面宿主测试与构建
bash ./scripts/swiftw test
bash ./scripts/swiftw build
```
