# AGENTS.md — DMWork 编码工作规范

> 工作流程和约束规则。
> 技术规范（Token / 组件分层 / 视觉规则 / Storybook）在 **DEVELOPMENT.md**。

---

## 任务开始前：必读

**开始写代码前先做这两件事：**

1. **读 `DEVELOPMENT.md`** — 按顶部"快速查阅"找到当前任务对应的章节
2. **确认工作目录** — 在分配的 worktree 里工作，不要动主仓库目录

跳过 = 大概率踩已知的坑，返工。

---

## Storybook 驱动开发（新组件必须遵循）

**新建任何 UI 组件，必须按以下顺序：**

```
1. 建组件文件（index.tsx + index.css）
2. 写 Story（ComponentName.stories.tsx）
3. 启动 Storybook 验证
4. 确认所有 variant（light + dark 都看）
5. 确认通过 → 再接入业务代码
```

Story 覆盖要求、启动命令见 DEVELOPMENT.md 章节四、六。

---

## 禁止事项

- **硬编码颜色/间距/圆角** → Token 使用规范见 DEVELOPMENT.md 章节二
- **`!important`** → 用提高选择器优先级代替
- **在组件里创建新颜色变量** → 需要新颜色时更新 `packages/dmworkbase/src/theme/tokens.css`
- **`@media (prefers-color-scheme: dark)`** → 用 `body[theme-mode=dark]` + Token 实现
- **直接覆盖 Semi class**（如 `.semi-button-primary { ... }`）→ 在组件根节点覆盖 Token

---

## PR 规范

- PR 描述禁止包含本地路径
- PR 开出去后每隔 30 分钟检查一次 review 评论：`gh pr view {num} --comments`
- 有评论立即处理，处理完说明修了哪些，再通知任务发起人

---

## Commit 前检查

```bash
# 确认改动文件数合理（超过 10 个要警觉）
git diff --cached --stat

# 检查有无无关文件混入
git diff --cached --name-only
```

**Checklist：**
- [ ] 无硬编码颜色/间距/圆角
- [ ] 无 `!important`
- [ ] 无无关文件混入
- [ ] 新组件有对应 Story 文件
- [ ] Storybook light + dark 都验证过
