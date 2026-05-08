/**
 * YUJ-376 · vitest.storybook.config.ts 的 test.globalSetup 入口
 *
 * 为什么要「接管现有 listener」而不是单纯加一个 listener：
 * vitest 自己在 cli-api 里注册的 `unhandledRejection` listener（见 vitest
 * 4.1.5/dist/chunks/cli-api.*.js, class method `registerUnhandledRejection`）
 * 里做的事情是：
 *   process.exitCode = 1; this.printError(err, ...); this.error("\n\n"); process.exit();
 * Node EventEmitter 按顺序调所有 listener，再加 listener 也拦不住 vitest 的
 * `process.exit()` —— 所以必须**替换 listener 集合**：先暂存所有既有 listener，
 * 再把它们全挪走；替换为一个单入口 listener，它做分流：
 *   - 命中 YUJ-376 pattern → 打 warn、计数、安排 1s 后 self-exit(0)
 *     （单独调度原因见下）
 *   - 其他 → 原样转发给所有原 listener（vitest 的行为完全保留）
 *
 * 为什么 swallow 后还要自己 `process.exit(0)`（Yu v3 拍板）：
 * vitest Browser Mode 的正常收尾路径隐含依赖于「最后一条 unhandled rejection
 * 触发 vitest 自己的 onUnhandledRejection → process.exit()」。一旦我们把这条
 * 吞了，vitest 的 main loop 还在等 Playwright WebSocket / route handler 的
 * promise resolve，而这些 promise 因 birpc 关闭永远不会 resolve。结果就是
 * CI run 25569584276 观测到的「最后一个 story pass → [YUJ-376] Swallow #1 →
 * 15 分钟挂起，job timeout cancelled」。
 *
 * 类比：吞 EPIPE 是对的，但还得 `close(fd)`/`exit()`，不然 fd 泄漏。
 *
 * 所以：swallow 后必须由我们主动 `process.exit(0)`。
 *   - 1s 给其他 in-flight cleanup hook 机会跑完（summary 等最后 I/O 刷屏）
 *   - `.unref()` 让 timer 不强行续命；若真的没其他事件源 node 会立即 exit
 *   - 用 `process.exit(0)` 而非 `process.exitCode ?? 0`：所有 test assertion
 *     真的都 pass，我们只是跳过了 framework 的损坏 teardown 路径，正确的
 *     exit code 就是 0。若未来 test 真 fail，vitest 会在 summary 打印+设置
 *     exit code，那条路径先于 teardown 竞态发生，我们不会拦到。
 *
 * 分流逻辑本身（纯函数、可单测）写在 ./vitest.storybook.handler.ts。
 *
 * TODO(YUJ-376): 等上游 vitest#9957 修复后，删除本文件 +
 *   vitest.storybook.handler.ts + vitest.storybook.config.ts 的 globalSetup
 *   配置项。
 */
import { handleUnhandledRejection, YUJ_376_TAG } from './vitest.storybook.handler'

type UnhandledRejectionListener = (reason: unknown, promise: Promise<unknown>) => void

const POST_SWALLOW_EXIT_DELAY_MS = 1_000

let originalListeners: UnhandledRejectionListener[] = []
let installed = false
let exitScheduled = false

function scheduleSelfExit(): void {
  if (exitScheduled) return
  exitScheduled = true
  const timer = setTimeout(() => {
    // eslint-disable-next-line no-console
    console.warn(
      `${YUJ_376_TAG} Teardown RPC unresolvable; forcing clean exit(0)`,
    )
    // eslint-disable-next-line n/no-process-exit
    process.exit(0)
  }, POST_SWALLOW_EXIT_DELAY_MS)
  // .unref() 让进程在没有其他活跃 handle 时可以自然退出（比如 vitest 自己
  // 先 clean exit），而不是被我们这个 timer 强行续命 1s。
  timer.unref()
}

function wrappedListener(reason: unknown, promise: Promise<unknown>): void {
  const verdict = handleUnhandledRejection(reason)
  if (verdict.swallow) {
    // 关键：vitest 自己的 process.exit() 不会跑，需要我们自己安排退出
    // （详见本文件头注释）。
    scheduleSelfExit()
    return
  }
  // 超阈值：用 replacement 替换 reason 继续派发（让人看到「swallow 失效」提示）
  const passReason = verdict.replacement ?? reason
  for (const l of originalListeners) {
    try {
      l(passReason, promise)
    } catch {
      // listener 内部异常不影响其他 listener
    }
  }
}

export async function setup(): Promise<void> {
  if (installed) return
  installed = true
  originalListeners = process.listeners(
    'unhandledRejection',
  ) as UnhandledRejectionListener[]
  process.removeAllListeners('unhandledRejection')
  process.on('unhandledRejection', wrappedListener)
  // eslint-disable-next-line no-console
  console.log(
    `${YUJ_376_TAG} globalSetup took over ${originalListeners.length} unhandledRejection ` +
      `listener(s) (pid=${process.pid})`,
  )
}

export async function teardown(): Promise<void> {
  if (!installed) return
  process.off('unhandledRejection', wrappedListener)
  for (const l of originalListeners) {
    process.on('unhandledRejection', l)
  }
  originalListeners = []
  installed = false
}
