# AGENTS.md — DMWork 编码工作规范

> 适用于所有 AI Agent 在此项目中的工作方式。
> 技术规范（Token / 组件分层 / Storybook）在 **DEVELOPMENT.md**，本文只写流程和约束。

---

## 任务开始前：必读

**不管接到什么任务，开始写代码前先做这两件事：**

1. **读 `DEVELOPMENT.md`** — 按顶部的"快速查阅"找到当前任务对应的章节
2. **确认工作目录** — 在分配给你的 worktree 里工作，不要动主仓库目录

跳过这步直接写代码 = 大概率踩已知的坑，返工。

---

## Storybook 驱动开发（新组件必须遵循）

**新建任何 UI 组件，必须按以下顺序：**

```
1. 建组件文件（index.tsx + index.css）
2. 写 Story（ComponentName.stories.tsx）
3. 启动 Storybook 验证
4. 在 Storybook 里确认所有 variant（light + dark 都看）
5. 确认通过 → 再接入业务代码
```

**Story 必须覆盖：**
- 所有视觉状态（default / hover / disabled / error / loading）
- light 和 dark 两个主题
- 边界值（文字超长、内容为空等）

**启动命令：**
```bash
pnpm --filter @octo/web storybook
```

---

## 禁止事项

### 硬编码颜色/间距/圆角

详见 DEVELOPMENT.md 章节二（Token 使用规范）。

核心原则：
- 颜色必须用 `var(--wk-*)` 或 `var(--semi-color-*)`
- 间距必须用 `var(--wk-sp-*)`
- 圆角必须用 `var(--wk-r-*)`

### 禁止使用 `!important`

用提高选择器优先级代替：
```css
/* ❌ */
.my-btn { height: 46px !important; }

/* ✅ */
.wk-login-panel .semi-button.my-btn { height: 46px; }
```

### 禁止创建新颜色变量

需要新颜色时先更新 `packages/dmworkbase/src/theme/tokens.css`，不允许在组件里自创。

### 禁止写 `@media (prefers-color-scheme: dark)`

用 `body[theme-mode=dark]` + Token 变量实现主题切换。

---

## Semi Design 覆盖规范

```css
/* ✅ 在组件根节点覆盖 token */
.my-component {
  --semi-color-primary: var(--wk-brand-primary);
}

/* ❌ 不要直接覆盖 Semi class */
.semi-button-primary { background: red; }
```

---

## PR 规范

- **PR 描述禁止包含本地路径**（`/Users/...` 等）
- PR 开出去后每隔 30 分钟检查一次 review 评论：`gh pr view {num} --comments`
- 有评论立即处理，处理完在 PR 里说明修了哪些，再通知 Will

---

## Commit 前检查

```bash
# 1. 确认改动文件数合理（超过 10 个要警觉）
git diff --cached --stat

# 2. 检查有无无关文件混入
git diff --cached --name-only

# 3. 核对 Review Checklist
```

**Review Checklist：**
- [ ] 没有硬编码颜色/间距/圆角
- [ ] 没有 `!important`
- [ ] 没有无关文件混入（配置文件、本地脚本等）
- [ ] 新组件有对应的 Story 文件
- [ ] Storybook 里 light + dark 都验证过
- [ ] `git diff --stat` 文件数量符合预期

---

## 组件视觉规范（快速参考）

详细规则见 DEVELOPMENT.md。以下为常用速查：

**头像形状 — 身份规则（严格遵守）**
```
人类用户 → border-radius: 50%
AI Bot  → border-radius: var(--wk-r-sm)
群组    → border-radius: var(--wk-r-md)
```

**消息气泡**
```css
.msg-bubble {
  border-radius: 2px var(--wk-r-lg) var(--wk-r-lg) var(--wk-r-lg);
  max-width: 480px;
}
```

**AI 面板**
```css
.ai-panel {
  border-radius: var(--wk-r-lg);
  max-width: 680px;
  border: 1px solid var(--wk-ai-border);
}
```
