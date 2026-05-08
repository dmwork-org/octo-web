/**
 * YUJ-376 · 精准过滤 vitest Browser Mode teardown 竞态
 * （纯函数，无副作用；注册见 `vitest.storybook.global-setup.ts`）
 *
 * 上游 bug: https://github.com/vitest-dev/vitest/issues/9957
 *
 * 现象：Browser Mode 下 framework 层的 manual mock 注册表（非 user-land）
 * 在 spec 文件卸载阶段仍会通过 birpc 回 Node 解析，此时 RPC 通道已关闭，
 * 触发 Unhandled Rejection 把整个 runner 判为 fail，即使所有 test.assert
 * 真的都 pass。
 *
 * 本地 + CI 验证：vitest 3.2.4 / 4.1.5 栈完全一致 —— 3.x/4.x 同根问题，
 * user-land 无 vi.mock 可重构，降版也治不了（详见 YUJ-376 issue 历史）。
 *
 * 本文件策略（surgical swallow，不是 continue-on-error 假绿）：
 *   - 在 Error + cause 链上任一节点命中两条字符串：
 *       1. message 含 `[birpc] rpc is closed`
 *       2. message 或 stack 含 `resolveManualMock`
 *     （vitest/mocker 把 birpc error 包在 `[vitest] There was an error when
 *      mocking a module` 外层里抛出，所以必须走 cause 链才能命中。）
 *   - 其他 unhandledRejection **原样放行**，不掩盖真 bug
 *   - swallow 次数超 SWALLOW_LIMIT → 放行，防止问题扩散被隐藏
 *   - 每次 swallow 在 CI 日志打 `[YUJ-376]` tag 便于 grep 追踪
 *
 * 注意：本 handler 被 global-setup 通过 `process.emit` 的 monkey-patch 调用
 * （不是 `process.on`）。因为 vitest 自己注册的 `unhandledRejection` listener
 * 里直接调 `process.exit()`，靠加一个 `process.on` listener 无法阻止 vitest
 * 的 listener 也被触发。Patch `process.emit` 让我们能在 dispatch 层直接短路
 * 不命中目标 listener。
 *
 * TODO(YUJ-376): 等上游 vitest#9957 修复后移除本文件 + global-setup 配置。
 */

export const YUJ_376_TAG = '[YUJ-376]'
export const SWALLOW_LIMIT = 50

let swallowCounter = 0

export function getSwallowCounter(): number {
  return swallowCounter
}

export function resetSwallowCounter(): void {
  swallowCounter = 0
}

/**
 * 收集 Error + 其 `cause` 链上所有节点的 message 和 stack。
 *
 * vitest/mocker 把 `[birpc] rpc is closed` 包在
 * `new Error('[vitest] There was an error when mocking a module', { cause })`
 * 里抛出，所以最外层 reason.message 不含 `[birpc]`，必须走 cause 链才匹配到。
 */
function collectErrorText(reason: unknown): { msg: string; stack: string } {
  const msgParts: string[] = []
  const stackParts: string[] = []
  const seen = new Set<unknown>()
  let cur: unknown = reason
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    if (cur instanceof Error) {
      msgParts.push(cur.message)
      if (cur.stack) stackParts.push(cur.stack)
      cur = (cur as { cause?: unknown }).cause
    } else {
      msgParts.push(String(cur))
      break
    }
  }
  return { msg: msgParts.join('\n'), stack: stackParts.join('\n') }
}

/**
 * 判断本次 unhandledRejection 是否为 YUJ-376 已知 teardown stale RPC。
 *   - 命中 pattern → 吞掉（计数，打 warn，返回 true）
 *   - 其他 → 返回 false，调用方应让事件原样派发（vitest 等其他 listener 会处理）
 *   - 命中 pattern 但 counter 超阈值 → 返回 false（放行；同时把当前 reason 换成
 *     「已超阈值」的 error 来提醒人）
 */
export function handleUnhandledRejection(reason: unknown): {
  swallow: boolean
  replacement?: Error
} {
  const { msg, stack } = collectErrorText(reason)
  const isBirpcClosed = /\[birpc\]\s*rpc is closed/.test(msg)
  const isManualMockResolve =
    /resolveManualMock/.test(stack) || /resolveManualMock/.test(msg)

  if (isBirpcClosed && isManualMockResolve) {
    swallowCounter += 1
    if (swallowCounter > SWALLOW_LIMIT) {
      // 超阈值：放行真 error 让 vitest 报出来，顺便包一层说明便于 triage
      const replacement = new Error(
        `YUJ-376 swallow counter exceeded ${SWALLOW_LIMIT}; refusing to suppress further. ` +
          `Original: ${msg}`,
      )
      // 手动挂 cause —— `new Error(msg, {cause})` 需要 ES2022 target，本仓
      // tsconfig 尚未升级。运行期 v8 支持 Error.cause as own property。
      if (reason instanceof Error) {
        ;(replacement as { cause?: unknown }).cause = reason
      }
      return { swallow: false, replacement }
    }
    // eslint-disable-next-line no-console
    console.warn(
      `${YUJ_376_TAG} Swallowed known framework teardown race (#${swallowCounter}): ` +
        `${msg.split('\n')[0]}`,
    )
    return { swallow: true }
  }

  return { swallow: false }
}
