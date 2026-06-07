# SessionWindow ChatGPT 风格 UI 重构设计

**设计日期**: 2026-06-08  
**目标**: 将 HandAgent macOS 桌面端 SessionWindow 界面全面重构为 ChatGPT 官网风格，提升视觉现代感与空间感。

## 概览

参考 OpenAI ChatGPT 官网界面，对 SessionWindow 进行渐进式重构：

- **视觉语言**: 深色主题优化，去除气泡边框，增加留白与层次
- **消息展示**: assistant 消息无背景透明融入页面，user 消息右对齐浅色背景，tool/thinking 低调呈现
- **输入交互**: pill 形大圆角输入栏，内嵌功能按钮
- **导航结构**: 侧边栏改为 workspace 分组 + 会话列表，顶部保留浏览器风格 tab bar
- **状态反馈**: 简化状态指示，去除独立 header，状态融入侧边栏与消息流

## 实施策略

**渐进式重构（方案 A）**：在现有代码结构上逐模块改造，保持每步可验证，降低风险。

**改造顺序**：
1. 主题配色更新（AppTheme.swift）
2. 消息区域重构（SessionContentView + 消息 bubble views）
3. 输入栏重构（SessionComposerView）
4. 侧边栏重构（SessionHistorySidebarView）
5. Tab bar 样式改造（SessionTabBarView）
6. 状态指示简化（去除 SessionStatusHeaderView，状态融入其他组件）

**优势**：
- 每步独立验证，git history 清晰
- 保留 ViewModel 层与数据流，不动 WebSocket 通信
- 避免一次性重写带来的回归风险

## 1. 视觉语言与主题系统

### 1.1 配色方案

更新 `/Users/mu9/proj/handAgent/apps/desktop/Sources/Theme/AppTheme.swift`：

| Token | 当前值 | 新值 | 说明 |
|-------|--------|------|------|
| `background` | `#0B0B0F` | `#212121` | 主背景，偏暖深灰，对齐 ChatGPT |
| `surface` | `white@4%` | `#2F2F2F` | 侧边栏、输入栏容器背景 |
| `surfaceHover` | — | `#3A3A3A` | **新增**：hover 状态背景 |
| `userBubble` | `orange@12%` | `#3A3A3A` | user 消息背景，改为中性灰 |
| `assistantBubble` | `white@4%` | `Color.clear` | assistant 消息完全透明 |
| `toolBubble` | `white@6%` | `white@4%` | tool/thinking 更低调 |
| `textPrimary` | `#F2F2F5` | `#ECECEC` | 主文本 |
| `textSecondary` | `#9A9AAB` | `#A0A0A0` | 次要文本 |
| `border` | `white@8%` | `white@6%` | 更轻的边框 |
| `accent` | `#FFA946` | **保持** | HandAgent 品牌橙色不变 |
| `accentHover` | `#FF9420` | **保持** | — |
| `error` | `#FF5E5E` | **保持** | — |

### 1.2 字体调整

| Token | 当前值 | 新值 | 原因 |
|-------|--------|------|------|
| `bodyFont` | `14pt regular` | `15pt regular` | 提升可读性 |
| `titleFont` | `18pt semibold` | `16pt semibold` | 更内敛 |
| `captionFont` | `12pt regular` | `13pt regular` | 工具消息更易读 |
| `promptInputFont` | `20pt medium` | `16pt regular` | 对齐 ChatGPT 输入框字号 |

### 1.3 间距与圆角

**间距**：保持当前定义不变（`xs:4, sm:8, md:12, lg:16, xl:20, xxl:24`）。

**圆角**：

| 场景 | 值 | 说明 |
|------|-----|------|
| 输入栏 pill | `24pt` | 大圆角 pill 形 |
| user 消息背景 | `16pt` | 柔和圆角 |
| 侧边栏项 | `8pt` | 列表项圆角 |
| tab 顶部 | `8pt` | 浏览器 tab 风格 |

### 1.4 布局约束

- **内容区最大宽度**：`720pt`，消息区与输入栏水平居中
- **侧边栏宽度**：`240pt`（保持不变）

## 2. 消息区域

### 2.1 整体布局

文件：`SessionContentView.swift`

- 内容区域 `maxWidth: 720pt`，水平居中
- 消息间距保持 `sm (8pt)`
- 滚动区域铺满可用高度

### 2.2 消息样式分层

| 角色 | 对齐 | 背景 | 圆角 | 边框 | 文本色 | 字号 |
|------|------|------|------|------|--------|------|
| `user` | 右对齐，`maxWidth: 85%` | `#3A3A3A` | `16pt` | 无 | `textPrimary` | `15pt` |
| `assistant` | 左对齐，全宽 | 透明 | — | 无 | `textPrimary` | `15pt` |
| `tool`/`thinking` | 左对齐，全宽 | 透明 | — | 无 | `textSecondary` | `13pt` |

### 2.3 assistant 消息

文件：`SessionMessageBubbleView.swift`（需改造）

- **无背景、无边框**，文本直接铺在页面 `background` 上
- **去除常驻 copy 按钮**，改为 hover 时在消息底部显示操作栏（复制、重试等）
- **打字指示器**：运行中时，assistant 消息底部显示三个跳动的点动画

### 2.4 user 消息

- **右对齐**，带 `#3A3A3A` 圆角背景块（`16pt` radius）
- **附件内嵌**：图片/文本选区附件显示在背景块内部

### 2.5 tool/thinking 消息

- **左对齐**，无背景
- **低调呈现**：`textSecondary` 色 + `13pt` 字号，视觉层级低于 assistant
- **tool 名称标注**：用 `caption` 样式显示工具名称（如 `[Read]`、`[Bash]`）

### 2.6 权限与 workspace 选择气泡

文件：`SessionRequestBubbleViews.swift`

- 保持独立卡片样式
- **去掉顶部 accent 边框**
- 改为 `surface` 背景 + `white@6%` 轻边框
- 内边距与圆角对齐 `md (12pt)` / `lg (12pt)`

## 3. 输入栏（Composer）

### 3.1 外观

文件：`SessionComposerView.swift`

- **形状**：大圆角 pill 容器（`24pt` radius）
- **背景**：`surface` (`#2F2F2F`)
- **边框**：`white@6%`，获得焦点时变为 `white@12%`
- **宽度**：与消息区域同宽（`maxWidth: 720pt`，居中）
- **内边距**：水平 `16pt`，垂直 `12pt`

### 3.2 内部布局

```
┌──────────────────────────────────────────────────────┐
│  [+]   文本输入区域                    [🎤]   [↑]   │
└──────────────────────────────────────────────────────┘
```

**组件**（从左到右）：

1. **Attach 按钮**：`+` 图标（`plus.circle.fill`），点击弹出附件选择
2. **文本输入区域**：
   - 多行 `TextEditor`，自适应高度（最大 5 行）
   - Placeholder：`"发送消息"`
   - 字体：`16pt regular`
3. **语音按钮**：
   - 麦克风图标（`mic.fill`）
   - 灰色 disabled 状态（占位待实现）
4. **发送按钮**：
   - 圆形按钮
   - 有内容：`accent` 背景 + 白色箭头（`arrow.up`）
   - 无内容：`surfaceHover` 背景 + `textSecondary` 箭头
   - 运行中时变为 **Stop 按钮**：方形图标（`stop.fill`），`accent` 色

### 3.3 交互

- **Enter 发送**，**Shift+Enter 换行**（保持当前行为）
- 焦点时边框高亮（`white@12%`）
- 发送按钮仅在有文本内容时激活

## 4. 侧边栏

### 4.1 整体结构

文件：`SessionHistorySidebarView.swift`（需大幅改造）

- **宽度**：`240pt`（不变）
- **背景**：`surface` (`#2F2F2F`)，与主内容区 `background` (`#212121`) 形成色差层次
- **无分割线**：靠背景色差区分边界

### 4.2 顶部区域（固定）

```
┌────────────────────────────┐
│  [新会话]           [🔍]   │
└────────────────────────────┘
```

- **新会话按钮**：
  - 文字 `"新会话"` + 图标（`plus.circle.fill`）
  - hover 时 `surfaceHover` 背景
  - 点击创建新会话并切换
- **搜索按钮**：
  - 放大镜图标（`magnifyingglass`）
  - 点击展开搜索输入框（或跳转搜索视图）

### 4.3 中间区域（滚动）

```
┌────────────────────────────┐
│  ▶ Workspace A             │
│    • 会话 1                │
│    • 会话 2                │
│  ▶ Workspace B             │
│  ───────────────────────── │
│  会话标题 1                 │
│  会话标题 2                 │
│  会话标题 3                 │
└────────────────────────────┘
```

**结构**：

1. **显式 workspace 分组**：
   - 文件夹图标（`folder.fill`）+ workspace 名称
   - 可折叠/展开（箭头指示：`▶` 收起，`▼` 展开）
   - 展开后显示该 workspace 下的会话列表（子项缩进）
2. **分割线**：
   - workspace 区域与默认会话之间，`white@6%` 细线
3. **默认 workspace 会话列表**：
   - 平铺显示，无分组标题
   - 直接显示会话标题

**会话行样式**：

- **单行文本**，超长截断（ellipsis）
- **当前活跃会话**：`surfaceHover` 背景 + 左侧 `2pt` 宽 `accent` 色竖条
- **hover 状态**：`surfaceHover` 背景
- **圆角**：`8pt`
- **去除**：状态圆点、badge（"当前"/"已打开"）、消息计数

### 4.4 底部区域（固定）

**连接状态指示**：

- **重连中**：`spinner` + `"重连中"`，`textSecondary` 色
- **连接已断开**：`exclamationmark.triangle.fill` + `"连接已断开"`，`error` 色
- **正常连接**：无显示

**设置入口**：

- 齿轮图标（`gearshape.fill`）+ `"设置"` 文字
- 贴底固定
- hover 时 `surfaceHover` 背景

## 5. Tab Bar

### 5.1 位置与范围

文件：`SessionTabBarView.swift`

- **位置**：窗口顶部，紧贴标题栏下方（或融入标题栏区域）
- **横跨**：workspace 区域（不包含侧边栏）

### 5.2 样式（浏览器 tab 风格）

```
┌─────────────────────────────────────────────────────────┐
│ [会话A]  [会话B]  [会话C]                          [+]  │
└─────────────────────────────────────────────────────────┘
```

**Tab 项样式**：

| 状态 | 背景 | 边框 | 说明 |
|------|------|------|------|
| **活跃** | `background` (`#212121`) | 无底部边界 | 与内容区融为一体 |
| **非活跃** | `surface` (`#2F2F2F`) | `white@6%` | 视觉上"沉下去" |
| **hover** | `surfaceHover` | — | 非活跃 tab hover 高亮 |

**Tab 组件**：

- **标题文本**：单行，截断
- **关闭按钮**：hover 时显示 `×`（`xmark.circle.fill`）
- **圆角**：顶部 `8pt`
- **尺寸**：
  - 宽度：自适应文本，`min: 80pt`，`max: 180pt`
  - 高度：`32pt`
- **去除状态圆点**

**新 tab 按钮**：

- `+` 图标（`plus`）
- 贴在最后一个 tab 右侧
- hover 时 `surfaceHover` 背景

### 5.3 交互

- **点击 tab**：切换到对应会话
- **点击关闭**：关闭 tab（如果是最后一个，关闭窗口或显示空状态）
- **拖拽排序**：保留（如果当前已实现）

### 5.4 与侧边栏的关系

- 侧边栏点击会话时，自动在 tab bar 中打开或切换到对应 tab
- 如果会话已在某个 tab 中打开，直接激活该 tab

## 6. 状态指示

### 6.1 运行状态

**去除独立的 `SessionStatusHeaderView`**（`SessionWorkspaceView.swift` 中移除）。

**新的运行状态反馈**：

1. **运行中**：
   - assistant 消息底部显示 **打字指示器**（三个跳动的点，类似 ChatGPT）
   - 发送按钮变为 **Stop 按钮**：方形图标（`stop.fill`），`accent` 色，点击中断
2. **空闲/完成**：
   - 无显示
   - 发送按钮恢复正常（箭头）

### 6.2 连接状态

**位置**：侧边栏底部（设置入口上方）

**状态**：

| 状态 | 显示 | 颜色 | 交互 |
|------|------|------|------|
| **正常连接** | 无显示 | — | — |
| **重连中** | `spinner` + `"重连中"` | `textSecondary` | 仅展示 |
| **连接已断开** | `⚠️` + `"连接已断开"` | `error` | 仅展示，无重试按钮 |

**说明**：连接失败和断开是同一状态。不提供重试按钮，因为会话包含已执行的 tool 上下文，由用户自行发送 `"继续"` 等 prompt 恢复。

### 6.3 会话内错误

文件：`SessionErrorBannerView.swift`

- **去除独立浮层**，融入消息流
- **样式**：无背景，`error` 色文字 + `exclamationmark.triangle.fill` 图标
- **位置**：插入在相关消息附近（如 tool 调用失败后）

## 7. 不变的部分

为了控制改造范围，以下部分 **保持不变**：

- **ViewModel 层**：`SessionViewModel.swift`、`SessionTabViewModel.swift`、`SessionWindowViewModel.swift` 数据流逻辑不变
- **WebSocket 通信**：`SessionSocketClient.swift` 协议与连接管理不变
- **数据模型**：`SessionBubble`、`SessionAttachmentSummary`、`SessionPermissionRequest` 等不变
- **功能逻辑**：权限审批、workspace 选择、附件上传、消息复制等功能保持
- **快捷键行为**：全局快捷键、输入框快捷键不变

## 8. 技术实施细节

### 8.1 文件改动范围

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `AppTheme.swift` | **修改** | 配色、字体调整 |
| `SessionWindowView.swift` | **微调** | 去除 status header 相关引用 |
| `SessionWorkspaceView.swift` | **重构** | 移除 `SessionStatusHeaderView`，调整布局 |
| `SessionContentView.swift` | **重构** | 内容区居中约束（max 720pt） |
| `SessionMessageBubbleView.swift` | **重构** | 消息样式分层，去边框，hover 操作栏 |
| `SessionComposerView.swift` | **重构** | pill 形输入栏，内嵌按钮布局 |
| `SessionHistorySidebarView.swift` | **重构** | workspace 分组，去状态 badge，连接状态底部显示 |
| `SessionTabBarView.swift` | **重构** | 浏览器 tab 风格，活跃/非活跃背景区分 |
| `SessionRequestBubbleViews.swift` | **微调** | 去顶部 accent 边框，改轻边框 |
| `SessionErrorBannerView.swift` | **微调** | 无背景样式 |
| `SessionStyles.swift` | **可选重构** | 如果 modifier 不适配新样式，改为直接在 view 中实现 |

**新增文件**（可选）：

- `SessionTypingIndicator.swift`：打字指示器组件
- `SessionSidebarWorkspaceRow.swift`：workspace 分组行组件（如果逻辑复杂）

### 8.2 渐进式实施检查点

每个步骤完成后验证：

1. **主题配色**：启动 app，确认背景色、文字色变化符合预期
2. **消息区域**：发送多条消息，验证 user/assistant/tool 样式分层正确
3. **输入栏**：测试输入、发送、附件、焦点状态
4. **侧边栏**：测试 workspace 折叠/展开、会话切换、连接状态显示
5. **Tab bar**：测试 tab 切换、关闭、新建
6. **状态指示**：测试运行中、stop、连接断开、重连

### 8.3 兼容性与回退

- **最低支持版本**：`macOS 15+`（当前已定，无需改动）
- **无需 fallback**：新样式不涉及新 API，仅 SwiftUI 视图重构
- **git 分支策略**：在 feature 分支上渐进提交，每个模块完成后 commit，便于回滚

## 9. 验收标准

完成后需满足：

- [ ] 主题配色对齐设计稿（背景 `#212121`，surface `#2F2F2F`，accent 保持）
- [ ] assistant 消息无背景透明，user 消息右对齐灰色背景，tool 消息低调呈现
- [ ] 输入栏为 pill 形，内嵌 attach/text/voice占位/send 按钮
- [ ] 侧边栏顶部"新会话"+搜索，中间 workspace 分组+默认会话列表，底部连接状态+设置
- [ ] Tab bar 为浏览器风格，活跃 tab 与内容区融合，非活跃 tab 沉入 surface 色
- [ ] 运行中显示打字指示器，发送按钮变为 stop 按钮
- [ ] 连接状态显示在侧边栏底部，无独立 status header
- [ ] 内容区与输入栏水平居中，max 720pt
- [ ] 所有交互功能（权限、附件、切换会话、tab 管理）正常工作
- [ ] 无回归：ViewModel 数据流、WebSocket 通信、附件系统正常

## 10. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 改动面大，引入布局 bug | 每步独立验证，commit 粒度细化 |
| 消息样式改动影响可读性 | 参考 ChatGPT 实际效果，测试不同消息长度 |
| 侧边栏 workspace 分组逻辑复杂 | 先实现静态 UI，再接入数据源，逐步调试 |
| tab bar 样式与窗口标题栏冲突 | 测试 macOS 原生标题栏行为，必要时调整 z-index / padding |
| 打字指示器动画性能 | 使用 SwiftUI 原生 `ProgressView` 或轻量自定义动画 |

## 附录：参考截图

用户提供的 ChatGPT 截图关键特征：

- **深色背景**：主区域接近 `#212121`，侧边栏略浅
- **无气泡 assistant 消息**：文本直接铺在背景上，无边框无背景
- **user 消息有背景块**：浅灰色圆角背景，右对齐
- **大圆角输入栏**：pill 形，内嵌功能按钮
- **侧边栏分组**：顶部功能导航，中间项目分组，底部账户
- **浏览器风格 tab**：活跃 tab 凸显，非活跃 tab 收敛

---

**本设计文档完成时间**: 2026-06-08  
**设计者**: Claude (HandAgent 项目 AI 协作者)
