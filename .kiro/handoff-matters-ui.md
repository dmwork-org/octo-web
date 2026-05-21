# Matters UI 优化 — Agent 交接文档

> 本文档用于交接给下一个 Agent，让其能够继续处理 PR 审核评论、修复问题、推送更新。
> 核心任务：拉取 PR #78 的评论，按评论修改代码，推送更新。

---

## 一、项目概况

### 仓库信息
- **上游仓库**：`Mininglamp-OSS/octo-web`（PR 目标）
- **Fork 仓库**：`dmwork-org/octo-web`（我们的 origin）
- **分支**：`feat/matters-ui-optimization`
- **PR 链接**：https://github.com/Mininglamp-OSS/octo-web/pull/78
- **PR 状态**：已提交，等待人工审核

### 技术栈
- Vite 8 + pnpm 10 + React 18 + TypeScript
- UI 库：Semi Design（@douyinfe/semi-ui）
- Monorepo（Turborepo），主要改动在 `E:\octo-web\packages\dmworktodo\` 下
- CSS 使用项目自定义 token 变量（`--wk-*`），定义在 `E:\octo-web\packages\dmworkbase\src\theme\`

### 开发规范文件
- **E:\octo-web\DEVELOPMENT.md**：项目开发规范（必读）
- **E:\octo-web\AGENTS.md**：Agent 工作约定
- 关键规范：
  - 禁止 `!important`
  - 禁止硬编码颜色（应用 `var(--wk-*)` token）
  - 禁止 `@media (prefers-color-scheme: dark)`
  - 禁止直接覆盖 Semi class（应通过组件根节点选择器）
  - 禁止 `any` 类型
  - commit 格式：`feat(scope): 描述` / `fix(scope): 描述`

---

## 二、本次改动范围

### 改动文件清单（29 个文件）

```
E:\octo-web\.gitignore                                          # 加了 .kiro/settings/mcp.json 和 figma-spec/rawdata 忽略
E:\octo-web\apps\web\vite.config.ts                             # 支持 VITE_PORT/VITE_HOST 环境变量覆盖
E:\octo-web\packages\dmworkbase\src\assets\icons\*.svg           # 从 Figma 下载的 SVG 图标（5个）
E:\octo-web\packages\dmworktodo\src\pages\MatterPage.css         # 侧边栏样式（header/tabs/list/card/分组导航）
E:\octo-web\packages\dmworktodo\src\pages\TodoPage.tsx            # 侧边栏 TSX（新建按钮/分组标题/归档按钮）
E:\octo-web\packages\dmworktodo\src\panel\ChatTodoPanel\index.tsx # 会话内事项面板（tab切换/loading优化/分组）
E:\octo-web\packages\dmworktodo\src\panel\MatterDetailPanel\index.css  # 详情面板全部样式
E:\octo-web\packages\dmworktodo\src\panel\MatterDetailPanel\index.tsx  # 详情面板 TSX（header/goal/people/tabs/channels/timeline/activity）
E:\octo-web\packages\dmworktodo\src\ui\AnchorPopover\index.css   # 原消息弹窗样式
E:\octo-web\packages\dmworktodo\src\ui\AnchorPopover\index.tsx   # 原消息弹窗 TSX
E:\octo-web\packages\dmworktodo\src\ui\CreateTaskModal\index.css # 创建事项弹窗样式
E:\octo-web\packages\dmworktodo\src\ui\CreateTaskModal\index.tsx # 创建事项弹窗 TSX
E:\octo-web\packages\dmworktodo\src\ui\DetailPanel\index.css     # DetailPanel 样式（备用面板）
E:\octo-web\packages\dmworktodo\src\ui\DetailPanel\index.tsx     # DetailPanel TSX（备用面板）
E:\octo-web\packages\dmworktodo\src\ui\LinkChannelsModal\LinkChannelsModal.css  # 关联群聊弹窗样式
E:\octo-web\packages\dmworktodo\src\ui\LinkChannelsModal\index.tsx              # 关联群聊弹窗 TSX
E:\octo-web\packages\dmworktodo\src\ui\OwnerEditor\index.css     # 负责人编辑器样式
E:\octo-web\packages\dmworktodo\src\ui\OwnerEditor\index.tsx     # 负责人编辑器 TSX
E:\octo-web\packages\dmworktodo\src\ui\SidebarCard\index.tsx     # 侧边栏卡片 TSX
E:\octo-web\packages\dmworktodo\src\ui\SmartCreateModal\index.css # 智能创建弹窗样式
E:\octo-web\packages\dmworktodo\src\ui\SmartCreateModal\index.tsx # 智能创建弹窗 TSX
E:\octo-web\packages\dmworktodo\src\ui\TodoCard\index.css        # 事项卡片样式
E:\octo-web\packages\dmworktodo\src\ui\TodoCard\index.tsx        # 事项卡片 TSX
```

### 改动分类

#### 1. 创建事项弹窗（SmartCreateModal / CreateTaskModal）
- Header："新建事项："+ 关闭按钮
- 字段顺序：事项名称 → 主要目标（textarea + 0/200 字数统计）→ 负责人 → Deadline
- 输入框：无边框，背景 `rgba(28,28,35,0.04)`，圆角 6px
- 标签：14px Semibold + 红色必填星号
- 按钮：pill 形状（border-radius: 9999px），取消/确定
- 保留了麦克风语音输入功能

#### 2. 侧边栏（MatterPage.css / TodoPage.tsx / ChatTodoPanel）
- Header：16px Semibold 标题 + 纯图标新建按钮，无 border-bottom
- Tabs：pill 容器（`rgba(28,28,35,0.05)` 背景），选中白色 pill + 阴影
- 卡片列表：gap 8px，淡入动画
- SidebarCard：ColorTag pill（状态+M-编号）+ 日历日期 + 标题 + 创建人/负责人
- 分组导航：紫色竖条 4px×12px + 文字 + 箭头
- Loading 优化：只在首次加载且无数据时显示"加载中"

#### 3. 详情面板 Header（MatterDetailPanel）
- **独立模式**：StatusPicker pill（含 M-xxx 编号）+ "截止到 5/15 周四"
- **嵌入模式**（showClose=true）：第一行"M-xxx｜标题" + ColorTag，第二行日期，右侧关闭按钮
- 嵌入模式标题可点击编辑
- 关闭按钮仅嵌入模式显示

#### 4. 主要目标区（wk-mp-goal）
- 🎯主要目标标签：紫色渐变背景 `linear-gradient(90deg, rgba(127,59,245,0.1) 0%, transparent 100%)`
- 来源信息：tag 图标 + "来自 #频道 · 用户 · 时间"（14px Regular，`#1C1C23`）
- 描述正文：14px Medium
- 创建人/负责人：pill tag（白色背景 + 边框 + 头像 + 名字）

#### 5. 负责人编辑器（OwnerEditor）
- Trigger：每个 assignee 独立 pill tag（不再堆叠）
- Dropdown：224px 宽，每项 32px 高，左侧 tick 占位 + 头像 20px + 名字 14px
- 去掉了"多选 · 至少保留 1 位"提示文字

#### 6. Tabs + 关联群聊（wk-mp-tabs / wk-mp-channels）
- Tabs：47px 高，gap 24px，选中底部 2px 黑色指示条
- 关联新群按钮：filled/interface/add 图标（紫色实心圆+白色加号）+ "关联新群"
- Channel Card：圆角 12px，背景 `rgba(28,28,35,0.04)`，padding 12px
  - Header：群名 16px Medium + "X分钟前同步" + 右侧 ChannelMoreMenu
  - 消息预览：头像 20px + 用户名 + 时间 + 内容
  - "展开/收起群内时间线"按钮（紫色 12px Semibold）

#### 7. 群内时间线（TimelinePanel）
- 容器：白色背景 + 1px 边框，圆角 8px，padding 24px
- Header："群内时间线" + arrow-down-up 排序按钮（点击切换，图标 opacity 动态变化）
- 日期分隔："今天 5/23" + 横线
- Entry：左侧主区（时间 + 头像 20px + 用户名 + "："+ 内容）+ 右侧"原消息"按钮（Launch 图标）

#### 8. 变更记录（ActivityPanel）
- Toolbar："变更类型：全部类型"下拉 + arrow-down-up 排序
- 下拉弹窗：184px 宽，圆角 6px，每项 32px，左侧 tick
- 表格布局：变更时间 | 变更类型 | 变更内容 | 变更人 | 来源群
- Diff 渲染：description_changed 用 +/- 图标（绿/红），title/deadline 用箭头

#### 9. AnchorPopover（原消息弹窗）
- 424px 宽，max-height 370px，自适应高度
- Header：群名（max 325px）+ 时间（右对齐），无关闭按钮
- 消息行：头像 20px + 用户名 Medium + 时间 + "："+ 内容（padding-left 24px）
- 点击消息跳转（替代原来的底部"↗ 跳到原消息"按钮）
- 无权限时 cursor: not-allowed + opacity: 0.5

#### 10. 关联群聊弹窗（LinkChannelsModal）
- 625×560px，圆角 12px
- 双栏布局：左栏候选列表（296px）+ 右栏已选列表（296px）
- 搜索框：pill 形状，背景 `rgba(28,28,35,0.04)`
- 列表项：checkbox 16px + 群头像 32px（WKAvatar）+ 群名
- Footer：取消/确定 pill 按钮

---

## 三、已知问题和遗留项

### 已知的 TypeScript 类型问题
- `WKAvatar` 组件（class component）与 React 18 类型定义不兼容
- 这是项目已有问题，main 分支上就存在，运行时正常
- 表现为 `JSX element class does not support attributes because it does not have a 'props' property`

### 硬编码颜色（22 处）
- 主要是 ColorTag 专用色：`#ebf9ff`/`#005694`（蓝）、`#ecf9ec`/`#176221`（绿）、`#F5F6F7`（表头）
- 以及 diff 图标色：`#34C724`（绿加号）、`#F54A45`（红减号）、`#4954E6`（蓝标签）
- 建议后续在 `tokens.css` 统一定义为 `--wk-tag-*` 变量

### 后端缺失的功能
- **TimelineEntry 没有 type/category 字段**：设计稿里有 ColorTag（产出/解除阻塞/要求变更/决策/阻塞/创建），但后端没数据
- **Timeline 编辑 API 不存在**：设计稿里 hover 可编辑时间线条目，但后端只有 list/add/delete
- **MatterActivity 没有 source_channel 字段**：变更记录表格的"来源群"列暂时显示"-"

### 本地开发注意事项
- 端口 3000 在 Windows Hyper-V 下被保留，需要在 `E:\octo-web\apps\web\.env.local` 设置 `VITE_PORT=5173` 和 `VITE_HOST=localhost`
- Figma MCP 配置在 `E:\octo-web\.kiro\settings\mcp.json`（已 gitignore）

---

## 四、PR 审核处理指南

### 拉取评论的命令

```bash
# 设置代理（用户的网络需要代理访问 GitHub）
$env:HTTPS_PROXY="http://127.0.0.1:7897"

# 拉取 PR 评论
gh api repos/Mininglamp-OSS/octo-web/pulls/78/comments

# 拉取 PR reviews
gh pr view 78 --repo Mininglamp-OSS/octo-web --comments --json comments,reviews

# 拉取 PR checks 状态
gh pr checks 78 --repo Mininglamp-OSS/octo-web
```

### 已处理的自动化评论
- **CodeQL ReDoS 警告**：已修复，`[^:]+` 改为 `[^:]*`（commit e165e70b）

### 修改后推送的流程

```bash
# 1. 修改代码
# 2. 检查 diagnostics
# 3. git add -A
# 4. git commit -m "fix(matters): 描述"
# 5. 推送（需要代理）
$env:HTTPS_PROXY="http://127.0.0.1:7897"; git push
```

### 如果需要 squash commits
当前分支有 30+ commits，如果 reviewer 要求 squash：
```bash
git rebase -i main
# 将除第一个外的所有 commit 改为 squash (s)
# 保存后编辑合并的 commit message
$env:HTTPS_PROXY="http://127.0.0.1:7897"; git push --force-with-lease
```

---

## 五、Figma 设计稿参考

### Figma 文件信息
- **文件 Key**：`Dlbb92GOXdv9PGTSVQBsCg`
- **文件名**：octo设计稿
- **Figma MCP**：配置在 `.kiro/settings/mcp.json`，使用 `figma-developer-mcp` 包 + stdio 模式

### 关键节点 ID 对照表

| 组件 | Figma Node ID | 说明 |
|------|---------------|------|
| 创建事项弹窗 | 1411:10562 | Modal 整体 |
| 事项 Item（默认） | 1411:9339 | Card 默认状态 |
| 事项 Item（Active） | 1411:9304 | Card 选中状态 |
| 事项列表整体 | 1411:9267 | 包含多个 Card |
| Tab 筛选器 | 1411:9498 | pill 容器 |
| 侧边栏 Header | 1411:9254 | 标题+新建按钮 |
| 分组导航 | 1411:10057 | 紫色竖条 |
| 详情面板 Header（独立） | 1411:9578 | 状态+日期 |
| 详情面板 Header（嵌入） | 1411:12925 | 标题+状态+日期 |
| 主要目标+内容区 | 1411:9590 | 标题+目标+来源+描述+人员 |
| 创建人/负责人 | 1411:9602 | pill tag 布局 |
| Tabs（关联群聊/产出/变更） | 1411:9627 | 底部指示条 |
| 关联新群按钮 | 1411:9631 | filled/interface/add 图标 |
| 关联群聊卡片 | 1411:9635 | 圆角灰底卡片 |
| 群内时间线（展开） | 1411:11431 | 白色卡片+条目列表 |
| 时间线 Header | 1411:11454 | 标题+排序按钮 |
| 时间线条目 | 1411:11467 / 1411:11468 | 单条 entry |
| 变更记录 Toolbar | 1411:8742 | 筛选+排序 |
| 变更记录表格 | 1411:8751 | 表头+行 |
| 变更记录 diff 单元格 | 1411:8791 | +/- 图标列表 |
| 筛选下拉弹窗 | 1411:11631 | SelectMenu |
| 负责人下拉弹窗 | 1411:11387 | UserMenuMini |
| AnchorPopover | 1423:6254 | 原消息弹窗 |
| AnchorPopover Header | 1423:6345 | 群名+时间 |
| AnchorPopover 消息 item | 1423:6346 | 单条消息 |
| 来源信息行 | 1423:5847 | tag 图标+文字 |
| 关联群聊弹窗 | 1411:11219 | 双栏 Modal |

### 查看 Figma 节点的方法

```
# 使用 Figma MCP 工具
mcp_figma_get_figma_data(fileKey="Dlbb92GOXdv9PGTSVQBsCg", nodeId="1411:9578")

# 或者直接访问 URL
https://www.figma.com/design/Dlbb92GOXdv9PGTSVQBsCg/octo设计稿?node-id=1411-9578
```

---

## 六、项目 Token 体系速查

Token 定义文件：`E:\octo-web\packages\dmworkbase\src\theme\semantic.css`

### 颜色 Token
```css
--wk-brand-primary: #1C1C23          /* 主色（深黑） */
--wk-color-accent: #7F3BF5           /* 紫色点缀（AI/链接） */
--wk-text-primary: #1F2329           /* 主文字 */
--wk-text-strong: rgba(28,28,35,0.9) /* 强调文字 */
--wk-icon-default: rgba(28,28,35,0.6)/* 默认图标/次要文字 */
--wk-icon-muted: rgba(28,28,35,0.4)  /* 弱化图标/placeholder */
--wk-brand-tint-04: rgba(28,28,35,0.04) /* 输入框背景 */
--wk-brand-tint-08: rgba(28,28,35,0.08) /* 边框 */
--wk-brand-tint-10: rgba(28,28,35,0.1)  /* pill 边框 */
--wk-brand-tint-15: rgba(28,28,35,0.15) /* 分隔线 */
--wk-brand-tint-35: rgba(28,28,35,0.35) /* placeholder 文字 */
--wk-bg-surface: #FFFFFF             /* 白色背景 */
--wk-bg-item-hover: rgba(46,50,56,0.09) /* hover 背景 */
--wk-color-danger: #F54A45           /* 红色/错误 */
--wk-text-on-brand: #FFFFFF          /* 品牌色上的文字 */
```

### 间距 Token
```css
--wk-sp-1: 4px    --wk-sp-1-5: 6px   --wk-sp-2: 8px
--wk-sp-3: 12px   --wk-sp-4: 16px    --wk-sp-5: 20px
--wk-sp-6: 24px   --wk-sp-8: 32px
```

### 圆角 Token
```css
--wk-r-xs: 3px    --wk-r-sm: 6px     --wk-r-md: 8px
--wk-r-lg: 16px   --wk-r-full: 9999px
```

### 字号 Token
```css
--wk-text-size-sm: 12px   --wk-text-size-md: 14px
--wk-text-size-xl: 16px
--wk-font-regular: 400    --wk-font-medium: 500
--wk-font-semibold: 600
```

---

## 七、组件层级关系

```
E:\octo-web\packages\dmworktodo\src\panel\MatterDetailPanel\ (panel/MatterDetailPanel/)
├── StatusPicker (内部组件，在同文件)
├── EditableTitle (内部组件)
├── EditableDeadline (内部组件)
├── EditableDescription (内部组件)
├── OwnerEditor (E:\octo-web\packages\dmworktodo\src\ui\OwnerEditor\)
├── TimelinePanel (内部组件)
├── ActivityPanel (内部组件)
├── AnchorPopover (E:\octo-web\packages\dmworktodo\src\ui\AnchorPopover\)
├── LinkChannelsModal (E:\octo-web\packages\dmworktodo\src\ui\LinkChannelsModal\)
└── ChannelMoreMenu (内部组件)

E:\octo-web\packages\dmworktodo\src\panel\ChatTodoPanel\ (panel/ChatTodoPanel/)
├── SidebarCard (E:\octo-web\packages\dmworktodo\src\ui\SidebarCard\)
└── MatterDetailPanel (嵌入，showClose=true)

E:\octo-web\packages\dmworktodo\src\pages\TodoPage.tsx (pages/TodoPage.tsx)
├── SidebarCard (E:\octo-web\packages\dmworktodo\src\ui\SidebarCard\)
├── SmartCreateModal (E:\octo-web\packages\dmworktodo\src\ui\SmartCreateModal\)
└── MatterDetailPanel (独立，showClose=false)
```

---

## 八、常见 Review 问题预判

### 可能被提出的问题

1. **硬编码颜色**：22 处 ColorTag 色值没用 token
   - 回复：这些是设计稿指定的 ColorTag 专用色，当前 token 体系（E:\octo-web\packages\dmworkbase\src\theme\tokens.css）没有对应变量，建议后续统一定义

2. **Semi class 覆盖**：通过 `.wk-xxx .semi-modal-body` 方式
   - 回复：符合 E:\octo-web\DEVELOPMENT.md 第十三章"在组件根节点覆盖"的允许方式

3. **文件数量多**：29 个文件
   - 回复：这是整个 matters 模块的 UI 优化任务，涉及创建弹窗/侧边栏/详情面板/弹窗等多个组件

4. **WKAvatar 类型错误**：
   - 回复：这是项目已有问题（class component vs React 18 类型），main 分支上就存在

5. **vite.config.ts 改动**：
   - 回复：支持环境变量覆盖端口/host，默认值不变，不影响其他人。本地通过 E:\octo-web\apps\web\.env.local 配置

---

## 九、快速操作命令

工作目录：`E:\octo-web`

```bash
# 启动开发服务器（需要 E:\octo-web\apps\web\.env.local 配置端口）
pnpm dev

# 检查 TypeScript
npx tsc --noEmit -p packages/dmworktodo/tsconfig.json

# 查看当前分支状态
git log --oneline main..HEAD

# 拉取 PR 评论（需要代理）
$env:HTTPS_PROXY="http://127.0.0.1:7897"
gh api repos/Mininglamp-OSS/octo-web/pulls/78/comments

# 推送修改
$env:HTTPS_PROXY="http://127.0.0.1:7897"; git push

# 设置默认仓库（如果 gh 报错）
$env:HTTPS_PROXY="http://127.0.0.1:7897"; gh repo set-default dmwork-org/octo-web
```

---

## 十、注意事项

1. **不要 push 到 main**，只 push 到 `feat/matters-ui-optimization` 分支
2. **代理端口 7897**：所有 GitHub API 操作需要设置 `$env:HTTPS_PROXY="http://127.0.0.1:7897"`
3. **Windows 系统**：shell 是 PowerShell/bash，路径用 `\` 或 `/` 都行
4. **端口问题**：本地 dev server 用 5173（.env.local 配置），不要改 vite.config.ts 的默认值
5. **commit 前检查**：`git diff --stat` 确认改动文件数合理
6. **禁止 force push**（除非 reviewer 明确要求 squash）
7. **Figma MCP 可用**：`E:\octo-web\.kiro\settings\mcp.json` 已配置，可以直接调用 `mcp_figma_get_figma_data`
