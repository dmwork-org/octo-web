# AGENTS.md — DMWork 项目工作约定

> 只写这个项目特有的约定。
> 通用工作习惯在 Agent 自身配置里。
> 技术规范在 **DEVELOPMENT.md**。

---

## 开始任务前

读 `DEVELOPMENT.md` — 按顶部"快速查阅"找对应章节，不需要全读。

在分配的 worktree 里工作，不要动主仓库目录。

新增业务能力、新页面、新模块，或对既有模块做结构化迁移时，先读 `docs/new-module-development-guide.md`，并在动代码前产出"行为清单、文件地图、PR 范围、验证计划"四件套。

涉及国际化、多语言或用户可见文案时，先读 `docs/i18n-agent-guide.md`，再运行相关校验。

涉及业务代码修改时，先确认模块归属和现有入口。不要因为历史目录里已有相似代码，就默认把新能力继续塞进 `Components/`、`Messages/` 或 `packages/dmwork*`。

新增业务能力应优先落在职责清晰的模块目录，并补充必要的 README、测试或 Story；确需修改共享组件、消息渲染或基础服务时，在最终说明里写明影响范围。

同一业务能力只保留一个用户可见入口。为了重构或复用新增底层实现时，不要同时暴露两套菜单、路由或按钮入口。

---

## 企业模块边界：Loop / Personal

`loop` / `personal` 属于闭源企业能力，host 只保留企业模块插槽和通用生命周期。涉及这两块时先读 `ENTERPRISE_DEVELOPMENT.md`。

注意：在 `Mininglamp-OSS/octo-web#1145` 同步进当前分支前，仓库里可能仍有历史 `loop` / `personal` 代码。闭源准备分支不要主动删除这些历史代码，删除由开源同步带入。

目录归属：

- `octo-web/` — 只维护 host 通用插槽、环境变量、CI/Docker 装配、登录后 standalone 回跳等非业务承载能力。
- `octo-enterprise-modules/` — 只维护企业入口聚合。当前本轮只使用 `src/loop.ts`。
- `octo-loop-module/` — 维护 `@dmwork/loop` 和 `@dmwork/personal` 的页面、路由、API、UI、i18n、测试。

硬性约束：

- 不要把 `loop` / `personal` 业务代码重新放回 `octo-web/packages/`。
- 不要在 host 里直接 import 或注册 `@dmwork/loop`、`@dmwork/personal`、`@octo/loop`、`@octo/personal`。
- 不要新增第二套 loop/personal 菜单、路由或按钮入口；企业模块入口注册后只能有一套用户可见入口。
- docs 仍然 host-owned；本轮不要把 docs clone、迁移或混入 `loop` / `personal` 企业装配。
- 本地私有仓和 `octo-web` 同级：`octo-web/`、`octo-enterprise-modules/`、`octo-loop-module/`。不要把私有仓放进 `octo-web` worktree。
- 在 docs 正式拆分前，企业入口默认使用 `../octo-enterprise-modules/src/loop.ts`，不要用可能聚合 docs 的 `src/index.ts`。

如果要改 loop/personal 业务行为，应在 `octo-loop-module` 做；如果要改企业模块聚合，应在 `octo-enterprise-modules` 做；只有 slot、env、CI、Docker、host shell 生命周期才应改 `octo-web`。

---

## 新建 UI 组件：建议先写 Story 再接业务

```
1. 建组件文件（index.tsx + index.css）
2. 写 Story（ComponentName.stories.tsx）
3. Storybook 里验证通过（light + dark 都看）
4. 再接入业务代码
```

顺序不能颠倒。建议新组件总是包含 Story，在 Storybook 里手动验证。

Story 写法见 DEVELOPMENT.md 章节四、六。

---

## 禁止事项

详细规范见 DEVELOPMENT.md 对应章节，以下为核心约束：

- **硬编码颜色/间距/圆角** → 章节二
- **`!important`** → 章节十三
- **直接覆盖 Semi class** → 章节十三
- **在组件里创建新颜色变量** → 章节十三
- **`@media (prefers-color-scheme: dark)`** → 章节十三

---

## UI/数据分离架构

本项目采用分层结构：

- `ui/` — UI 组件（新组件统一放这里，用 `pnpm gen:component` 生成）
- `bridge/` — 数据桥接层（types.ts + use*.ts）
- `Components/` / `Messages/` — 现有组件库
