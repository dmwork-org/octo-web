import { defineConfig } from 'vitest/config'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  optimizeDeps: {
    // 扫描 workspace 所有包的源码，让 Vite 提前发现并预编译所有依赖
    // 避免测试运行中途触发热重载导致 AttachmentPreview.stories 失败
    entries: [
      path.resolve(__dirname, '../../packages/*/src/**/*.{ts,tsx}'),
      path.resolve(__dirname, 'src/**/*.{ts,tsx}'),
    ],
  },
  plugins: [
    storybookTest({
      configDir: path.resolve(__dirname, '.storybook'),
    }),
  ],
  test: {
    name: 'storybook',
    // YUJ-376: CI 偶发 `[birpc] rpc is closed, cannot call "resolveManualMock"`
    // 根因是上游 vitest#9957 —— Browser Mode 下 framework 层的 manual mock
    // 注册表在 spec 文件卸载阶段仍会通过 birpc 回 Node 解析，此时 RPC 通道
    // 已关闭，触发 Unhandled Rejection 把整个 runner 判为 fail（即使所有
    // story test 本身都 pass）。
    //
    // 本地 + CI 验证：vitest 3.2.4 / 4.1.5 栈完全一致，3.x/4.x 同根问题，
    // user-land 无 vi.mock 可重构，降版也治不了。
    //
    // 三路防线（配合，缺一不可）：
    //   1. globalSetup: Node 主进程级 surgical swallow —— 精确匹配 YUJ-376
    //      teardown stale RPC pattern，其他 unhandledRejection 原样抛出，
    //      不掩盖真 bug。详见 ./vitest.storybook.global-setup.ts 和
    //      ./vitest.storybook.handler.ts。
    //      （注意：不能用 setupFiles —— Browser Mode 下 setupFiles 在
    //      浏览器上下文跑，没有 Node `process` 全局；而 unhandledRejection
    //      发生在 Node-side 的 Playwright RouteHandler 回调里。）
    //   2. fileParallelism: false —— 让 story 文件串行，减小 session 并发触发
    //      竞态的窗口（虽然不能治本，但能把 swallow 次数降到个位数）。
    //   3. retry: 2 —— 兜底容器/网络抖动。
    //
    // TODO(YUJ-376): 等上游 vitest#9957 修复后移除整套 workaround。
    globalSetup: ['./vitest.storybook.global-setup.ts'],
    fileParallelism: false,
    retry: 2,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
})
