# 后端 I18n 契约接入 Goal 指导文档

本文用于指导后续 goal 模式开发：在 Octo Web 已有前端国际化基础上，接入后端 i18n 契约，并保持当前版本可用、未来后端能力上线后可自然增强。

开始前同时阅读：

- `AGENTS.md`
- `DEVELOPMENT.md`
- `docs/i18n-agent-guide.md`
- `docs/i18n-tracking.md`
- `.i18n/scan-config.json`

## 目标

接入后端 i18n 契约，最终支持：

- `?lang=` 和 `i18n_lang` cookie。
- 内部 Octo API 请求携带 `Accept-Language`。
- 后端 v2 错误 envelope：
  - `error.code`
  - `error.message`
  - `error.details`
  - `error.http_status`
- legacy 错误 fallback：
  - `msg`
  - `status`
  - 外层 HTTP status
- 登录响应中的 `language` 字段。
- 已登录用户切换语言时调用 `PUT /v1/user/language`。
- Axios 和内部 `fetch` 共用同一套语言 header 与错误解析逻辑。

## 落地状态

本分支已按该契约完成以下检查点：

- 语言输入与持久化：`?lang=`、`?locale=`、`i18n_lang`、localStorage、navigator fallback。
- 请求语言：`APIClient` 和 `apiFetch` 统一发送 `Accept-Language`，不发送 `X-Octo-Lang`。
- 错误处理：统一 v2 + legacy normalizer，隐藏 internal/5xx raw 文案，按 code / semantic status 判断 auth、forbidden、rate limit。
- Fetch 处理：内部 fetch 使用 `apiFetch` / `apiFetchJson`，文件资源、本地 probe、第三方 URL、unload beacon、OIDC 自定义客户端保留 raw fetch。
- 登录语言：登录响应非空 `language` 立即应用到本地 locale、localStorage 和 `i18n_lang`；空字符串不覆盖本地选择。
- 已登录语言同步：NavRail 切换先本地生效，再 best-effort 调 `PUT /v1/user/language`，失败不回滚 UI。

## 工作目录

前端开发只在这个 worktree 内进行：

```txt
/Users/will/Project/octo/octo-web-i18n-backend-integration
```

目标分支：

```txt
feat/i18n-backend-integration
```

不要修改主仓目录：

```txt
/Users/will/Project/octo/octo-web
```

后端仓库只作为只读参考：

```txt
/Users/will/Project/octo/octo-server
```

除非用户明确要求，否则不要改后端代码。

## 事实来源优先级

后续开发按以下顺序判断事实：

1. 当前前端 worktree 代码。
2. 当前后端 `octo-server/main` 实现。
3. 后端 draft / 契约文档。
4. 旧 Codex 会话记录。

不要依赖旧 thread 状态或旧 prompt cache。

## 当前后端实现事实

截至本 worktree 创建时，后端 main 已经有这些实现：

- localized error renderer 已同时输出 v2 envelope 和 legacy 字段。
- `ResponseErrorL` 为兼容老客户端，外层 HTTP status 仍返回 `400`。
- 真实语义状态码在 `error.http_status`。
- `error.message` 由后端按协商语言渲染。
- `err.shared.internal` 是 internal code，后端会过滤 details；前端也不应展示 raw server error。
- 后端会返回 `Content-Language` 和 `Vary`。
- 语言协商优先级：

```txt
可信 X-Octo-Lang
?lang=
i18n_lang cookie
user.language
Accept-Language
default language
```

- Web 前端不要发送 `X-Octo-Lang`，这是可信服务间传播用的 header。
- `GET /v1/user/current`、登录响应等 login detail response 已包含 `language`。
- `language: ""` 表示用户没有显式账号语言偏好。
- `PUT /v1/user/language` 已存在，支持：
  - `{ "language": "zh-CN" }`
  - `{ "language": "en-US" }`
  - `{ "language": "" }`
- `PUT /v1/user/language` 成功不回显 language。
- `PUT /v1/user/language` 的错误响应当前仍可能是 legacy，所以前端必须同时兼容 v2 和 legacy。

关键影响：

后端当前是 cookie 优先于 `user.language`。因此前端在登录响应读到非空 `language` 后，必须同步写入 `i18n_lang` cookie，否则旧 cookie 可能继续覆盖账号语言偏好。

## 执行规则

### 通用规则

- 每个 Phase 都要能独立 review、独立验证、独立 commit。
- 每完成一个 Phase 或稳定 checkpoint，就提交一次。
- 不要 push，除非用户明确要求。
- 不要混入无关 UI polish、样式重构或业务改动。
- 保持当前后端未完全支持时仍可用。
- 后端能力按渐进增强处理。

### Commit 规则

每次 commit 必须代表稳定检查点：

- 相关测试或构建通过。
- `git diff --check` 通过。
- commit message 描述本阶段意图。

推荐 commit message：

```txt
docs(i18n): add backend contract goal guide
feat(i18n): align locale inputs with backend contract
feat(api): normalize backend error envelopes
feat(api): share i18n handling with fetch requests
feat(login): apply backend language preference
feat(i18n): sync signed-in language preference
```

如果某个 Phase 只能部分完成，也可以在稳定点 commit，但必须满足：

- 未完成行为有 guard 或 fallback。
- touched code 的测试通过。
- final response 明确剩余事项。

### Goal 模式停止条件

不要在所有必要 Phase 完成前标记 goal complete。

遇到阻塞时，优先推进相邻的可验证任务。只有同一个阻塞连续三轮仍无法绕过，才视为真正 blocked。

不是阻塞的情况：

- 某环境暂时没有后端 endpoint。
- dev server 不可用。
- 浏览器登录态丢失。
- 某 legacy endpoint 还没有 v2 envelope。

可能是真阻塞的情况：

- 契约语义不清，影响前端持久化策略。
- 缺依赖且网络安装被拒。
- worktree 状态损坏，无法隔离测试或构建。

## Phase 0：基线与契约确认

目的：确认从最新前端和后端事实开始。

任务：

- 确认前端 worktree 分支和状态。
- 确认后端仓库状态。
- 读取本文和标准 i18n 文档。
- 当契约细节不确定时，优先看后端实现。
- 如发现契约与实现不一致，在文档或 final response 中记录。

命令：

```bash
git status --short
git branch --show-current
pnpm i18n:check
```

后端只读参考命令：

```bash
git -C /Users/will/Project/octo/octo-server status --short
git -C /Users/will/Project/octo/octo-server log --oneline -n 20 --grep=i18n
```

提交：

只有新增或更新文档时提交。

## Phase 1：语言检测与 Cookie 持久化

目的：让前端语言检测兼容后端链接和公开页。

涉及文件：

- `packages/dmworkbase/src/i18n/detectLocale.ts`
- `packages/dmworkbase/src/i18n/I18nService.ts`
- `packages/dmworkbase/src/i18n/__tests__/detectLocale.test.ts`
- `packages/dmworkbase/src/i18n/__tests__/I18nService.test.ts`

检测顺序：

```txt
explicit locale
?lang=
?locale=
i18n_lang cookie
localStorage octo:locale
navigator.language
defaultLocale
```

持久化：

```txt
localStorage.octo:locale
i18n_lang=<locale>; Path=/; Max-Age=31536000; SameSite=Lax
```

规则：

- 保留 `?locale=` 兼容现有实现。
- `i18n_lang` 不是安全凭证。
- 不要把 `i18n_lang` 设成 HttpOnly，前端和公开页需要读写。
- 只持久化 normalize 后的受支持语言。

验证：

```bash
pnpm exec vitest run packages/dmworkbase/src/i18n/__tests__/detectLocale.test.ts
pnpm exec vitest run packages/dmworkbase/src/i18n/__tests__/I18nService.test.ts
pnpm i18n:check
git diff --check
```

提交：

```bash
git add packages/dmworkbase/src/i18n
git commit -m "feat(i18n): align locale inputs with backend contract"
```

## Phase 2：统一 API Error Normalizer

目的：让前端统一理解 v2 和 legacy 后端错误。

涉及文件：

- `packages/dmworkbase/src/Service/apiError.ts`
- `packages/dmworkbase/src/Service/__tests__/apiError.test.ts`

需要兼容的输入：

```txt
v2:
data.error.code
data.error.message
data.error.details
data.error.http_status

legacy:
data.msg
data.status
outer HTTP status
```

统一输出：

```ts
interface NormalizedApiError {
  code?: string;
  httpStatus?: number;
  message: string;
  backendMessage?: string;
  details?: Record<string, unknown>;
  raw: unknown;
}
```

展示策略：

- `err.shared.internal` 或 5xx：展示前端本地通用错误，不展示后端 raw 文案。
- `err.shared.auth.required`、`err.shared.auth.token_missing`、`err.shared.auth.token_invalid`、`err.shared.auth.token_expired` 或 401：登录过期 / 需要登录。
- `err.shared.auth.forbidden` 或 403：无权限，不触发 logout。
- `err.shared.rate.limited` 或 429：限流提示。
- 普通业务错误：默认展示后端本地化后的 `error.message`。
- legacy 错误：展示 `msg`，没有 `msg` 时 fallback 到前端 unknown。

规则：

- 不要用 `error.message` 做业务判断。
- 业务分支优先看 `error.code`。
- 状态语义看 `error.http_status`。
- 只有 legacy fallback 才使用外层 HTTP status。

验证：

```bash
pnpm exec vitest run packages/dmworkbase/src/Service/__tests__/apiError.test.ts
pnpm i18n:check
git diff --check
```

提交：

```bash
git add packages/dmworkbase/src/Service/apiError.ts packages/dmworkbase/src/Service/__tests__/apiError.test.ts
git commit -m "feat(api): normalize backend error envelopes"
```

## Phase 3：APIClient 接入后端契约

目的：让主 Axios 请求路径发送语言意图，并使用统一错误解析。

涉及文件：

- `packages/dmworkbase/src/Service/APIClient.ts`
- `packages/dmworkbase/src/Service/apiLanguage.ts`
- `packages/dmworkbase/src/Service/__tests__/APIClient.error.test.ts`

请求行为：

- 内部 Octo API 请求发送 `Accept-Language`。
- 不发送 `X-Octo-Lang`。
- 默认不发送 `X-Octo-Error-Envelope`。

响应行为：

- 使用 `normalizeApiError`。
- 通过 auth code 或 normalized 401 触发 logout。
- 保留 legacy `extractErrorMsg`。
- 尽量保持现有调用方对 `{ error, msg, status }` 的兼容。

验证：

```bash
pnpm exec vitest run packages/dmworkbase/src/Service/__tests__/apiError.test.ts
pnpm exec vitest run packages/dmworkbase/src/Service/__tests__/APIClient.error.test.ts
pnpm --filter @octo/web build
pnpm i18n:check
git diff --check
```

提交：

```bash
git add packages/dmworkbase/src/Service
git commit -m "feat(api): use backend i18n error semantics"
```

## Phase 4：Fetch Wrapper 与内部 Fetch 迁移

目的：让独立内部 `fetch` 与 Axios 保持同一套语言和错误行为。

涉及文件：

- `packages/dmworkbase/src/Service/apiFetch.ts`
- `packages/dmworkbase/src/Service/__tests__/apiFetch.test.ts`
- 需要迁移的内部 fetch 调用点

封装 API：

```ts
apiFetch(input, init)
apiFetchJson<T>(input, init)
```

内部 API fetch 必须：

- 发送 `Accept-Language`。
- 非 2xx 时安全读取 JSON。
- 抛出 `NormalizedApiError`。

不要包装这些请求：

- 预签名上传 URL。
- 文件下载或文件预览资源。
- PDF、PPT、图片、静态内容请求。
- 本地语音模型 probe 请求。
- 第三方绝对 URL。

不包装的 fetch，如果原因不明显，需要加短注释。

优先检查调用点：

- `apps/web/src/Components/InviteLanding`
- `apps/web/src/Components/ConnectionStatus`
- `packages/dmworkbase/src/Components/NavRail/NavSettingsPanel`
- 文件预览 renderers，只确认它们应保留 raw fetch。

验证：

```bash
pnpm exec vitest run packages/dmworkbase/src/Service/__tests__/apiFetch.test.ts
pnpm --filter @octo/web build
pnpm i18n:check
git diff --check
```

提交：

```bash
git add packages/dmworkbase/src/Service apps/web/src packages/dmworkbase/src/Components
git commit -m "feat(api): share i18n handling with fetch requests"
```

## Phase 5：登录响应 Language 字段

目的：后端返回账号级语言偏好时，前端立即应用。

涉及文件：

- `packages/dmworklogin/src/loginSession.ts`
- `packages/dmworklogin/src/__tests__/loginSession.test.ts`

规则：

- `language` 为 `zh-CN` 或 `en-US` 时，调用 `i18n.setLocale(language)`。
- 同步写 `localStorage.octo:locale` 和 `i18n_lang`。
- `language` 为 `""` 时，不合成默认值，不覆盖本地偏好。
- `language` 缺失时，保持当前行为。
- 因为后端 cookie 优先于 `user.language`，非空 `language` 必须同步到 cookie。

验证：

```bash
pnpm exec vitest run packages/dmworklogin/src/__tests__/loginSession.test.ts
pnpm --filter @octo/login test
pnpm --filter @octo/web build
git diff --check
```

提交：

```bash
git add packages/dmworklogin/src
git commit -m "feat(login): apply backend language preference"
```

## Phase 6：已登录语言切换同步后端

目的：已登录用户切换语言时，既立即更新本地 UI，又 best-effort 写入后端账号偏好。

涉及文件：

- `packages/dmworkbase/src/Components/NavRail/NavLanguageSwitcher.tsx`
- 可选：`packages/dmworkbase/src/Service/UserLanguageService.ts`
- 相关测试

流程：

```txt
1. 用户选择语言。
2. 立即 setLocale(next)，UI 本地生效。
3. localStorage 和 i18n_lang cookie 更新。
4. 如果已登录，best-effort PUT /v1/user/language { language: next }。
5. 成功不依赖响应体回显 language。
6. 失败不回滚 UI。
```

规则：

- 登录页语言切换不调用 `PUT /v1/user/language`。
- 登录后的 NavRail 语言切换调用该接口。
- 该接口的 legacy 错误不能破坏本地语言切换。
- 除非产品明确要求，否则失败不要弹强打扰 toast。

验证：

```bash
pnpm exec vitest run packages/dmworkbase/src/i18n/__tests__/I18nService.test.ts
pnpm --filter @octo/web build
pnpm i18n:check
git diff --check
```

浏览器检查：

```txt
已登录切语言后 UI 立即变化。
localStorage.octo:locale 更新。
i18n_lang cookie 更新。
已登录时发送 PUT /v1/user/language。
PUT 失败不回滚 UI。
登录页切语言不调用 PUT。
```

提交：

```bash
git add packages/dmworkbase/src/Components/NavRail packages/dmworkbase/src/Service
git commit -m "feat(i18n): sync signed-in language preference"
```

## Phase 7：文档与最终回归

目的：让本次接入对后续 agent 和 reviewer 可维护。

涉及文件：

- `docs/i18n-agent-guide.md`
- `docs/i18n-tracking.md`
- `docs/i18n-backend-integration-goal-guide.md`
- `docs/i18n-backend-integration-goal-guide.zh-CN.md`
- 必要时更新 PR checklist

需要记录：

- `?lang=` / `?locale=` 兼容关系。
- `i18n_lang` cookie。
- 后端 v2 envelope 与 legacy fallback。
- `Accept-Language` 请求行为。
- 前端不发送 `X-Octo-Lang`。
- 默认不发送 `X-Octo-Error-Envelope`。
- 内部 fetch wrapper 使用规则。
- 已登录语言同步行为。

验证：

```bash
pnpm i18n:check
pnpm --filter @octo/web build
git diff --check
```

完整 focused regression：

```bash
pnpm exec vitest run packages/dmworkbase/src/i18n/__tests__/detectLocale.test.ts
pnpm exec vitest run packages/dmworkbase/src/i18n/__tests__/I18nService.test.ts
pnpm exec vitest run packages/dmworkbase/src/Service/__tests__/apiError.test.ts
pnpm exec vitest run packages/dmworkbase/src/Service/__tests__/apiFetch.test.ts
pnpm exec vitest run packages/dmworklogin/src/__tests__/loginSession.test.ts
```

提交：

```bash
git add docs
git commit -m "docs(i18n): document backend contract integration"
```

## 最终验收标准

只有满足以下条件，goal 才能标记 complete：

- Phase 1 到 Phase 7 已完成，或有证据说明某个 Phase 不需要做。
- `pnpm i18n:check` 通过。
- `pnpm --filter @octo/web build` 通过。
- `git diff --check` 通过。
- touched code 的 focused tests 通过。
- 浏览器检查覆盖：
  - `?lang=en-US`
  - `?locale=zh-CN`
  - 未登录语言切换
  - 已登录语言切换
  - legacy 错误响应
  - v2 外层 400 且 `error.http_status=401`
  - `err.shared.internal`
  - 至少一个已迁移的内部 fetch 路径
- 所有工作按稳定阶段 commit。

## PR 描述模板

```txt
Backend i18n contract integration

Implemented:
- Locale inputs: ?lang, ?locale, i18n_lang, localStorage, navigator fallback
- Accept-Language on internal API requests
- v2 + legacy API error normalization
- APIClient integration
- apiFetch integration for internal fetch calls
- login response language handling
- signed-in PUT /v1/user/language sync

Not sent:
- X-Octo-Lang, because it is trusted service-to-service only
- X-Octo-Error-Envelope by default, because backend already double-emits and CORS rollout should stay independent

Verification:
- pnpm i18n:check
- pnpm --filter @octo/web build
- focused vitest commands:
  - ...
- browser checks:
  - ...
```
