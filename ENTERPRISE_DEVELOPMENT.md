# Enterprise Development

本文档记录闭源构建如何装配企业模块。当前准备工作只覆盖 `loop` / `personal`，不要把 docs 迁移混入这一轮。

当前分支只做闭源仓提前准备，不主动模拟删除 `octo-web` 内的历史 `loop` / `personal` 代码。实际删除等待开源 PR `Mininglamp-OSS/octo-web#1145` 同步进 `test` 后再通过 rebase 承接。

## 背景

开源 PR `Mininglamp-OSS/octo-web#1145` 会把 `loop` 和 `personal` 从开源 `octo-web` host 中移除，host 改为通过 Vite enterprise slot 加载私有模块。同步该 PR 后，host 侧只负责：

- 通过 `VITE_ENTERPRISE_MODULES_ENTRY` 生成 `virtual:octo-enterprise-modules`
- 调用企业入口导出的 `registerEnterpriseModules(context)`
- 汇总企业入口导出的 `getEnterpriseStandaloneHandlers()`
- 可选注入 `VITE_ENTERPRISE_HTML_HEAD_PATH` 指向的 HTML head 片段

## 本地目录

推荐闭源本地开发目录固定为：

```text
<workspace>/
  octo-web/
  octo-enterprise-modules/
  octo-loop-module/
```

两个私有仓和 `octo-web` 并列，不放进 `octo-web` worktree。

本轮 `loop` / `personal` 迁移验证使用 loop-only 企业入口：

```text
../octo-enterprise-modules/src/loop.ts
```

`../octo-enterprise-modules/src/index.ts` 可能包含未来 docs 聚合入口；在 docs 正式拆分前不要用于本轮闭源装配验证。

入口必须导出：

```ts
export function registerEnterpriseModules(context: {
  registerModule(module: unknown): void;
}): void;

export function getEnterpriseStandaloneHandlers(): unknown[];
```

`octo-enterprise-modules` 负责聚合 `loop` / `personal`，`octo-loop-module` 作为被聚合的私有模块源码，不在开源 host 中直接注册。

## 本地启动

先准备私有模块：

```bash
# clone/link 私有仓到：
# ../octo-enterprise-modules
# ../octo-loop-module
```

然后启动企业 dev server：

```bash
pnpm dev:enterprise
```

脚本会设置：

```bash
VITE_ENTERPRISE_MODULES_ENTRY=$(dirname "$PWD")/octo-enterprise-modules/src/loop.ts
VITE_ENTERPRISE_HTML_HEAD_PATH=$(dirname "$PWD")/octo-enterprise-modules/html/head.html
VITE_ENTERPRISE_FS_ALLOW=$PWD:$(dirname "$PWD")/octo-enterprise-modules:$(dirname "$PWD")/octo-loop-module:$PWD/node_modules
```

如果企业 HTML head 文件不存在，脚本会跳过该变量。

## CI 装配

CI 应在构建前拿到三个目录：

```text
<workspace>/
  octo-web/
  octo-enterprise-modules/
  octo-loop-module/
```

如果 CI 先 checkout `octo-web`，再 checkout 私有仓，建议把私有仓放到 `octo-web` 的 sibling：

```text
../octo-enterprise-modules
../octo-loop-module
```

构建 env 使用绝对路径最稳：

```yaml
env:
  VITE_ENTERPRISE_MODULES_ENTRY: ${{ github.workspace }}/../octo-enterprise-modules/src/loop.ts
  VITE_ENTERPRISE_HTML_HEAD_PATH: ${{ github.workspace }}/../octo-enterprise-modules/html/head.html
  VITE_ENTERPRISE_FS_ALLOW: ${{ github.workspace }}:${{ github.workspace }}/../octo-enterprise-modules:${{ github.workspace }}/../octo-loop-module:${{ github.workspace }}/node_modules
```

闭源 CI 可以直接调用：

```bash
pnpm build:enterprise
```

该脚本会检查 `octo-enterprise-modules` 和 `octo-loop-module` 是否已经在 `octo-web` sibling 目录，并默认使用 `octo-enterprise-modules/src/loop.ts`。它只负责装配和构建，不负责 clone 私有仓或决定私有仓 ref。

### 桌面端企业打包

普通桌面打包命令 `pnpm build-ele:*` 不会主动启用企业模块。需要打带 enterprise slot 的桌面包时，使用：

```bash
pnpm build-ele:enterprise
pnpm build-ele:enterprise:mac
pnpm build-ele:enterprise:win
pnpm build-ele:enterprise:linux
pnpm build-ele:enterprise:linux-arm64
```

桌面企业打包与 Web 企业构建使用同一套入口规则：`VITE_ENTERPRISE_MODULES_ENTRY` 指向哪些 `octo-enterprise-modules` entry，Vite 只会 import 这些 entry；entry 没有 import/register 的私有模块不会进入包。

默认入口仍是：

```bash
VITE_ENTERPRISE_MODULES_ENTRY=$(dirname "$PWD")/octo-enterprise-modules/src/loop.ts
```

需要组合多个企业入口时，用平台 path delimiter 分隔，例如 macOS/Linux：

```bash
VITE_ENTERPRISE_MODULES_ENTRY="../octo-enterprise-modules/src/loop.ts:../octo-enterprise-modules/src/drive.ts" pnpm build-ele:enterprise:mac
```

GitLab test/tag 打包已经按 Docker build context 限制做了专门处理：CI 会把私有仓 clone 到 `octo-web/.enterprise/`，再把它们复制进镜像构建上下文。该目录已加入 `.gitignore`，仅作为 CI 临时目录，不作为源码归属。

默认策略：

- `test`：`ENABLE_ENTERPRISE_MODULES=true`，默认使用 `ENTERPRISE_MODULES_REF=test` 和 `ENTERPRISE_LOOP_REF=test`。`octo-enterprise-modules/test` 与 `octo-loop-module/test` 承载企业模块测试环境内容；日常迭代先进入私有仓 `test` 分支，验证通过后再进入各自稳定分支。
- `prod tag`：`package_tag` 是手动 job。当前暂时沿用全局默认 `ENTERPRISE_MODULES_REF=main` 和 `ENTERPRISE_LOOP_REF=main`；企业仓 tag/commit 自动读取策略后续单独设计。
- `develop`：默认不启用企业模块，避免无关分支依赖私有仓。

## Test 与生产发布流程

企业能力由多个仓共同装配，发布时需要明确每个仓的来源：

```text
test 环境 =
  octo-web/test
+ octo-enterprise-modules/test
+ octo-loop-module/test

生产包 =
  octo-web tag
+ octo-enterprise-modules tag 或 commit SHA
+ octo-loop-module tag 或 commit SHA
```

### Test 环境

- `octo-web/test` 默认拉取 `octo-enterprise-modules/test` 和 `octo-loop-module/test`。
- `octo-loop-module` 的日常业务迭代先合入自己的 `test` 分支，测试环境随 `octo-web/test` 部署装配验证。
- `octo-enterprise-modules/test` 只维护企业入口聚合；当前本轮默认入口仍是 `src/loop.ts`，不要把 docs 装配混入 loop/personal 验证。
- 当企业模块测试通过并准备上线时，再按各私有仓自己的发布策略进入稳定分支或打 tag。

### 生产 tag

当前生产 tag 构建暂时默认取企业仓 `main`，用于保持现有发布行为。该策略不是长期方案，因为 `main` 会继续变化，同一个 `octo-web` tag 在不同时间重跑可能得到不同产物。

后续应单独设计生产企业模块版本策略，例如在 `package_tag` 手动 job 中指定：

```text
ENTERPRISE_MODULES_REF=<octo-enterprise-modules 的 tag 或 commit SHA>
ENTERPRISE_LOOP_REF=<octo-loop-module 的 tag 或 commit SHA>
```

这两个 ref 不要求和 `octo-web` tag 同名，也不要求彼此同名。它们只需要是各自仓库里已确认可发布的固定快照。

如果后续要减少手工输入，可以扩展 CI：生产未显式配置 ref 时自动读取各企业仓最新 tag；显式配置时优先使用配置值。但无论如何，生产默认不应使用 `main`。

私有仓认证：

- 使用组级 `ENTERPRISE_TOKEN` 读取 `codex.mlamp.cn/dmwork/octo-web-enterprise/*`，token 需要 `read_repository` 权限。
- 不复用 `CODE_TOKEN` 读取企业仓，避免 deploy-files token 权限不足时在 clone 阶段失败。

私有仓 checkout 方式需要按实际代码托管确认。如果使用 GitHub Actions 且两个私有仓是标准 `owner/repo` 形式，可以用：

```yaml
- uses: actions/checkout@v4

- uses: actions/checkout@v4
  with:
    repository: <owner>/<octo-enterprise-modules-repo>
    path: octo-enterprise-modules
    token: ${{ secrets.ENTERPRISE_TOKEN }}
    ref: main

- uses: actions/checkout@v4
  with:
    repository: <owner>/<octo-loop-module-repo>
    path: octo-loop-module
    token: ${{ secrets.ENTERPRISE_TOKEN }}
    ref: main
```

如果私有仓实际位于内部 GitLab/嵌套 group（例如 `dmwork/octo-web-enterprise/...`），不要直接套用 `actions/checkout.repository`，需要由运维给出可认证 clone URL 或 mirror 到 GitHub `owner/repo` 形式。

## Docker 构建

开源 PR 同步后，Dockerfile 支持以下 build args：

```text
VITE_ENTERPRISE_MODULES_ENTRY
VITE_ENTERPRISE_HTML_HEAD_PATH
VITE_ENTERPRISE_FS_ALLOW
```

GitLab CI 的 Docker build context 是 `octo-web/` 仓库根目录。CI 会先把两个私有仓放到 `octo-web/.enterprise/`，再执行 Docker build；`.enterprise/` 只作为 CI 临时构建输入，不作为源码归属。

示例：

```bash
docker build \
  --file Dockerfile \
  --build-arg VITE_ENTERPRISE_MODULES_ENTRY=/app/.enterprise/octo-enterprise-modules/src/loop.ts \
  --build-arg VITE_ENTERPRISE_HTML_HEAD_PATH=/app/.enterprise/octo-enterprise-modules/html/head.html \
  --build-arg VITE_ENTERPRISE_FS_ALLOW=/app:/app/.enterprise/octo-enterprise-modules:/app/.enterprise/octo-loop-module:/app/apps/web/node_modules \
  .
```

## 待运维确认

- test 环境使用私有模块 `main` 还是固定 commit。
- prod tag 发布时如何锁定 `octo-enterprise-modules` 和 `octo-loop-module` 版本。
- `octo-web` / `octo-enterprise-modules` / `octo-loop-module` 三者版本如何对应。
- CI 访问私有仓使用哪个 token/Deploy Key，以及是否需要 GitHub mirror。
