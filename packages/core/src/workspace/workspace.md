# workspace

用户显式注册的命名沙箱，是 `file.read / file.write` 唯一允许的根目录来源。LLM 不能拿到绝对路径，必须先调 `workspace.list` 拿 `id` 再传给 file tool；如果多个 workspace 都可能匹配，应调用 `workspace.askUser` 让用户在 ThreadWindow 内选择。

## 文件

| 文件 | 职责 |
|------|------|
| `Workspace.ts` | DTO：`Workspace`（id / name / description / rootPath / createdAt / isDefault）/ `WorkspaceSummary`（不含 rootPath）/ `WorkspaceRegistration` / `WorkspaceUpdate` / `WorkspaceRegistry` 接口 |
| `FileWorkspaceRegistry.ts` | 持久化到 `~/.spotAgent/workspaces.json`；首次启动播种 default workspace（rootPath = `~/.spotAgent/workspace/`）；`register` 强制绝对路径 + `mkdir -p`；缓存按文件状态戳失效 |
| `index.ts` | 桶导出 |

## 设计原则

- **不要把 rootPath 给 LLM**：`workspace.list` tool 返回 `WorkspaceSummary`，没有 `rootPath`；LLM 只看到 id / name / description。
- **模糊时问用户**：`workspace.askUser({ prompt, candidateIds? })` 只把 `WorkspaceSummary` 候选发到 ThreadWindow，用户取消、超时、关闭 thread 或没有活动窗口时返回 `{ cancelled: true }`。
- **删除不删盘**：`remove(id)` 仅从注册表移除条目，不递归删除磁盘内容，避免误伤用户文件。
- **沙箱化路径解析**：`file.read / file.write` 入参为 `{ workspaceId, relativePath }`，由 tool 内部 join + realpath 校验仍在 rootPath 内（详见 [tools/tools.md](/Users/mu9/proj/handAgent/packages/core/src/tools/tools.md)）。
- **写共享文件**：desktop 的 [WorkspaceSettingsView](/Users/mu9/proj/handAgent/apps/desktop/Sources/Settings/settings.md) 直接写 `workspaces.json`；agent-server 的 `FileWorkspaceRegistry` 不启 watcher，但每次 `list / get / getDefault / register / update / remove` 都会先比较文件 `mtimeMs + size`，文件变化后自动重读，避免写操作覆盖外部修改。

## 文件结构

```
~/.spotAgent/workspaces.json
```

```json
{
  "version": 1,
  "workspaces": [
    {
      "id": "default",
      "name": "default",
      "description": "默认工作区...",
      "rootPath": "/Users/mu9/.spotAgent/workspace",
      "createdAt": "2026-05-17T...",
      "isDefault": true
    }
  ]
}
```

## 编辑此目录的约束

- 不要在 `Workspace` 上加 LLM 不该看到的字段（如本地凭证、sourcetree 列表）；UI 自己的临时态请放别处。
- 新增 registry 实现（如内存版）必须与 `FileWorkspaceRegistry` 保持完全一致的契约（默认 workspace 自播种、`getDefault` 永不返回 null）。
- `description` 是 LLM 选择 workspace 的主要依据，UI 应限长 200 字以避免 prompt 膨胀。

## 相关文档

- 文件 tool 沙箱：[tools/tools.md](/Users/mu9/proj/handAgent/packages/core/src/tools/tools.md)
- 设置 UI：[apps/desktop/Sources/Settings/settings.md](/Users/mu9/proj/handAgent/apps/desktop/Sources/Settings/settings.md)
