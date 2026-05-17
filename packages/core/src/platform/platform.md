# platform

跨平台能力的接口与跨进程 RPC 实现。core 不直接调 macOS API，所有平台能力均通过 `PlatformAdapter` 调用，再由 `RemotePlatformAdapter` 经 `PlatformBridge` 反向 IPC 到桌面 App。

## 文件

| 文件 | 职责 |
|------|------|
| `PlatformAdapter.ts` | 平台能力的统一接口 + 全部入参 / 出参 DTO（FrontmostAppInfo / WindowInfo / ScreenCapture* / OCR* / Accessibility*）；所有出参都带 `resolution: "best_effort"` 标记 |
| `PlatformBridge.ts` | 跨进程 RPC 接口：`call<T>(method, args, timeoutMs?)`；定义 `PlatformBridgeOfflineError` / `PlatformBridgeTimeoutError` / `PlatformBridgeRemoteError` 三个类型化错误 |
| `RemotePlatformAdapter.ts` | 实现 `PlatformAdapter`，每个方法转发为 `bridge.call("clipboard.read", args)`；默认 15s 超时 |
| `OfflinePlatformAdapter.ts` | Null object，所有方法直接抛 `not_implemented`，给测试 / 无桌面环境用 |

## 数据流

```
agent-server 内 tool.call(input)
  └─ ScreenCaptureTool / WindowListTool / ...
       └─ RemotePlatformAdapter.captureScreen(req)
            └─ PlatformBridge.call("screen.capture", req)
                 └─ WebSocketPlatformBridge: 包装 platform_request 帧
                      └─ ws → desktop
                           └─ PlatformBridgeService 收到，分发给 MacPlatformProvider
                                └─ ScreenCaptureKit / NSPasteboard / NSWorkspace ...
                           └─ platform_response 帧回流
                 ← 解析 + 校验 status
            ← Promise resolve / reject 三种类型化错误
```

## 关键约定

- **方法名稳定**：`PlatformBridgeMethod` 是字面量联合（`clipboard.read | app.frontmost | window.list | screen.capture | ocr.read | accessibility.snapshot | accessibility.action`），增删字段需要 desktop / agent-server / 协议三处同步。
- **错误三态**：
  - `Offline`：bridge 未 attach（desktop 还没 hello），立即抛，不等待。
  - `Timeout`：默认 15s 超时；区域截图等耗时方法可调高。
  - `Remote`：desktop 端实现明确返回错误（如 `not_implemented`、权限被拒）。
- **消息载荷**：所有 RPC 走 `SessionMessage.platform_request / platform_response`，`sessionId` 用魔法值 `"_platform"`（见 [protocol/protocol.md](/Users/mu9/proj/handAgent/packages/core/src/protocol/protocol.md)）。
- **resolution 字段**：所有出参带 `"best_effort"` 字面量；目前是占位（未来扩展 `"exact" / "estimated"` 等档位用）。

## 编辑此目录的约束

- 不要在 core 内 `import` 任何 `electron` / `node:child_process` 调 macOS API；macOS 实现走桌面端 [MacPlatformProvider](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md)。
- `PlatformAdapter` 接口与 `PlatformBridgeMethod` 字面量必须 1:1，新增方法时同步改三处：接口、bridge 字面量、Mac 端 dispatch table。
- `RemotePlatformAdapter` 不要塞业务校验；它只是透传层。校验放进具体 tool 或桌面端 provider。
- 测试用 `OfflinePlatformAdapter` 即可，不要在 core 测试里 mock 真实 macOS 行为。

## 相关文档

- 桌面端 macOS 实现：[apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/AppServices/PlatformBridge/platform-bridge.md)
- WS 桥实现：[apps/agent-server/agent-server.md](/Users/mu9/proj/handAgent/apps/agent-server/agent-server.md)
- 协议帧：[protocol/protocol.md](/Users/mu9/proj/handAgent/packages/core/src/protocol/protocol.md)
- 调用方：[tools/tools.md](/Users/mu9/proj/handAgent/packages/core/src/tools/tools.md)
