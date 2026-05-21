# 关联群聊弹窗 — Figma 设计稿 (node 1411:11219)

## 整体
- 圆角 12px，阴影 `0px 8px 24px rgba(0,0,0,0.12), 0px 0px 0px 1px rgba(0,0,0,0.06)`
- 白色背景，固定高度 560px
- padding: `1px 0px 1px 1px`（几乎无 padding，各区域自控）

## Header
- row, space-between, padding 16px
- 底部 1px 边框 `rgba(28,28,35,0.15)`
- 标题"关联群聊"（16px Semibold, `#1C1C23`）
- 右侧关闭按钮 24x24

## Content Container
- row, padding `0 16px`, fill 宽度
- 分为左右两栏：

### 左栏（候选列表）
- 296px 宽，固定高 537px
- 底部 1px 边框，右侧 1px 边框 `rgba(28,28,35,0.15)`
- padding `8px 0`，gap 4px
- **搜索框**：pill 形状（border-radius 9999px），背景 `rgba(28,28,35,0.04)`，高 36px
  - 内含搜索图标 16x16 + placeholder "输入群聊名称/描述搜索"（14px Regular, `rgba(28,28,35,0.4)`）
  - 搜索框右侧 padding-right 16px
- **列表项**（每项）：row, gap 8px, padding `4px 8px`, fill 宽度
  - Checkbox 16x16（未选中/已选中）
  - 群头像 32x32 圆形
  - 群名（14px Regular, `#1C1C23`）

### 右栏（已选列表）
- 296px 宽，固定高 537px
- padding `8px 0 8px 8px`，gap 4px
- **标题行**："已选2个对话"（14px Medium, `rgba(28,28,35,0.4)`）
- **已选项**：row, gap 8px, padding `4px 8px`
  - 群头像 32x32 圆形
  - 群名（14px Regular, `#1C1C23`）
  - 右侧关闭/移除按钮 24x24

## Footer
- row, justify-content flex-end, padding 16px, gap 12px
- 取消按钮：pill（9999px），padding `6px 12px`，高 28px，白色背景 + 边框 `rgba(28,28,35,0.1)`，文字 12px Semibold `rgba(28,28,35,0.8)`
- 确定按钮：pill，padding `6px 12px`，高 28px，背景 `#1C1C23`，文字 12px Semibold `#FFFFFF`
