# 待办清单

本文只保留**当前仍需修复、补齐或端到端验证**的事项。已由代码实现并有测试覆盖的历史项不在此处保留。

## 文档维护要求（重要）

- **完成即迁移**：当本文中的待办项被代码实现并通过测试覆盖（或完成手工验收）后，必须将该项**从本文移除**，并按主题分组追加到 [待验收.md](./待验收.md)。
- **保留四个字段**：迁移到 待验收.md 时务必保留 完成日期 / 关键 commit / 实现位置 / 验收结果 四个字段，便于事后追溯。
- **同步更新模块文档**：若条目跨多个模块，迁移时同步更新对应 `<dir>.md` 索引。
- **不要在本文记录历史**：本文只看现在和未来；历史去看 [待验收.md](./待验收.md) 或 `git log`。

历史进度参见 [待验收.md](./待验收.md)。架构改进路线参见 [architecture-review.md](./architecture-review.md)。

最后核对日期：2026-05-19。

---

## P2 — 运行时与 UX 增强

### 1. 权限审批端到端手工验证

**现状**：`FilePermissionPolicy`、`SessionPermissionBridge`、`AgentRuntime` 权限拦截、`SessionSocketClient` 解码、`SessionWindowView` 内联气泡、Settings 权限规则列表（查看 / 撤销 / 关键参数摘要）均已实现并有单测覆盖。**剩余风险只在真实桌面端到端 QA**。

**验收标准**：

- 手工跑通 `once / session / always / deny / timeout / close session` 全路径，并把过程记入 [manual-qa.md](./manual-qa.md) 或 [live-qa-flow.md](./live-qa-flow.md)。
- Settings 权限规则列表手工核对：toolName、关键参数摘要、decision、createdAt 显示正确，撤销永久规则后该规则不再生效。

**依赖**：无。

### 2. OCR 与 Accessibility 平台能力落地

**现状**：`ocr.read`、`accessibility.snapshot`、`accessibility.action` 已作为 builtin tool 注册并暴露给 LLM，但 macOS 侧 `MacPlatformProvider` 对这三个 method 统一返回 `not_implemented`。

**用户场景**：LLM 需要读取截图中文字、理解前台 App 可访问性树或执行基础点击 / 输入动作时，tool 应返回真实结果，而不是运行时失败。

**验收标准**：

- `ocr.read` 基于 Vision 或系统 OCR 从用户主动提供图片 / tool 截图中识别文本。
- `accessibility.snapshot` 基于 Accessibility API 返回 frontmost app/window/element 的结构化树。
- `accessibility.action` 至少支持 press/click/set_value，并在权限不足时返回明确可读错误。
- 未授权 Accessibility / Screen Recording 时有明确权限引导。
- Swift provider 增加可测的解析层单测，并补 [manual-qa.md](./manual-qa.md) 真实 App QA 步骤。

**依赖**：macOS 权限提示与审计文案应与 permission UI 对齐。

### 3. 会话中断 / Stop

**现状**：协议里已有 `interrupt` 帧，但 `SessionRouter` 未处理，SessionWindow 也没有 Stop 按钮；一旦 LLM 请求或 tool 调用耗时较长，用户只能关闭窗口或等待。

**用户场景**：用户发现请求写错或 tool 卡住时，应能在 SessionWindow 中停止当前 run，并让后端取消或忽略后续输出。

**验收标准**：

- SessionWindow 运行态显示 Stop 控件。
- `interrupt` 帧由 server 路由到当前 session run。
- `AgentRuntime` / `LLMClient` 支持 abort signal，至少能停止后续事件推送并把会话状态置为 interrupted。
- tool 调用无法硬取消时，后续结果不再写入已中断 run。
- 测试覆盖 interrupt 后不再追加 assistant / tool 消息。

**依赖**：LLM 真实 streaming 接口已完成；UI Stop 可先做「忽略后续输出」的最小闭环，再向 provider abort 语义收敛。

---

## P3 — 长期能力

### 4. 多 provider LLM 支持

**现状**：生产路径只有 `VercelClient`，OpenAI 兼容 API 通过 `responses/chat/completion` 切换。仓库依赖中已有 `@ai-sdk/anthropic`，但尚未接入 provider factory。

**验收标准**：

- 抽出 `LLMClientFactory`。
- settings 支持 provider 字段。
- 至少接入第二个 provider（建议 Anthropic）验证消息、stream、tool call 归一化。
- provider capability 显式声明是否支持 tool calling / multimodal / streaming，runtime 据此降级。

**依赖**：provider capability 需要声明是否支持当前已落地的多模态 content part、tool calling 与 streaming。

### 5. 用户自定义 tool / 插件系统

**现状**：所有 tool 都是 builtin，随代码构建。

**验收标准**：

- 设计插件 manifest、安装目录、启停机制、权限声明和冲突规则。
- 第一版可以只支持本地目录插件（`~/.spotAgent/plugins/`）。
- 插件崩溃 / 超时不拖垮 agent-server。
- 与 workspace 沙箱和权限审批系统对齐。

**依赖**：权限 UI、workspace askUser、tool 注册边界稳定后再启动（这些前置项已全部完成）。

---

## 手工验证清单入口

端到端验证步骤见 [manual-qa.md](./manual-qa.md)；实机 QA 流程与缺陷报告格式见 [live-qa-flow.md](./live-qa-flow.md)。每次完成本文条目后，应同步更新 [待验收.md](./待验收.md) 与对应模块 `<dir>.md`。

