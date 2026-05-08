/**
 * YUJ-376 unit test · 验证 vitest.storybook.handler.ts 的分流逻辑
 *
 * 这份单测在 jsdom 环境（apps/web 的默认 vitest.config.ts）跑，**不**走
 * storybook browser mode，确保 handler 的分支行为在 CI 每次 lint/build
 * 阶段都被验证过。
 *
 * 分四类 case 覆盖：
 *   - match：birpc closed + resolveManualMock → swallow:true
 *     含「裸 Error」和「包在 cause 里」两条路径
 *     （后者才是实际 vitest 抛的形状：`{cause: birpcError}`）
 *   - partial-match: 只命中一条字符串 → swallow:false（保留真 bug 信号）
 *   - non-match: 其他 unhandledRejection → swallow:false
 *   - over-limit: counter > SWALLOW_LIMIT → swallow:false + replacement（不再压制）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
    SWALLOW_LIMIT,
    YUJ_376_TAG,
    getSwallowCounter,
    handleUnhandledRejection,
    resetSwallowCounter,
} from '../../vitest.storybook.handler'

/** 模拟 vitest/mocker 实际抛出的包装后 Error（外 msg 不含 birpc，cause 才含）。 */
function makeVitestWrappedError(): Error {
    const innerStack = [
        'Error: [birpc] rpc is closed, cannot call "resolveManualMock"',
        '    at Proxy.sendCall @vitest/browser/dist/index.js:2888:33',
        '    at ManualMockedModule.factory @vitest/browser/dist/index.js:3232:34',
        '    at ManualMockedModule.resolve @vitest/mocker/dist/chunk-registry.js:161:21',
        '    at RouteHandler._handleInternal playwright-core/lib/client/network.js:698:7',
    ].join('\n')
    const inner = new Error('[birpc] rpc is closed, cannot call "resolveManualMock"')
    inner.stack = innerStack
    const outer = new Error(
        '[vitest] There was an error when mocking a module. If you are using "vi.mock" factory, ...',
    )
    // 手动挂 cause —— `new Error(msg, {cause})` 需要 ES2022 target，本仓未升级。
    ;(outer as { cause?: unknown }).cause = inner
    outer.stack = [
        `Error: ${outer.message}`,
        '    at createHelpfulError @vitest/mocker/dist/chunk-registry.js:189:16',
    ].join('\n')
    return outer
}

/** 裸 birpc 错误（没有 cause 包装）—— 兜底形状。 */
function makeRawBirpcError(): Error {
    const err = new Error('[birpc] rpc is closed, cannot call "resolveManualMock"')
    err.stack = [
        `Error: ${err.message}`,
        '    at ManualMockedModule.resolve @vitest/mocker/dist/chunk-registry.js:158:25',
    ].join('\n')
    return err
}

describe('YUJ-376 handleUnhandledRejection', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        resetSwallowCounter()
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
        warnSpy.mockRestore()
        resetSwallowCounter()
    })

    describe('matching the YUJ-376 pattern → swallow:true', () => {
        it('swallows the cause-wrapped form (actual vitest shape)', () => {
            const err = makeVitestWrappedError()
            const verdict = handleUnhandledRejection(err)
            expect(verdict.swallow).toBe(true)
            expect(verdict.replacement).toBeUndefined()
            expect(getSwallowCounter()).toBe(1)
            expect(warnSpy).toHaveBeenCalledOnce()
            const warnMsg = warnSpy.mock.calls[0][0] as string
            expect(warnMsg).toContain(YUJ_376_TAG)
            expect(warnMsg).toContain('#1')
            expect(warnMsg).toContain('There was an error when mocking a module')
        })

        it('swallows the raw birpc form (no cause wrapper)', () => {
            const err = makeRawBirpcError()
            const verdict = handleUnhandledRejection(err)
            expect(verdict.swallow).toBe(true)
            expect(getSwallowCounter()).toBe(1)
            expect(warnSpy).toHaveBeenCalledOnce()
        })

        it('accepts variant spacing in `[birpc] rpc is closed`', () => {
            const err = new Error('[birpc]    rpc is closed, call "resolveManualMock" failed')
            const verdict = handleUnhandledRejection(err)
            expect(verdict.swallow).toBe(true)
            expect(getSwallowCounter()).toBe(1)
        })

        it('handles circular cause chain without infinite loop', () => {
            const a = new Error('[birpc] rpc is closed, call resolveManualMock')
            const b = new Error('inner')
            ;(a as { cause?: unknown }).cause = b
            ;(b as { cause?: unknown }).cause = a
            const verdict = handleUnhandledRejection(a)
            expect(verdict.swallow).toBe(true)
        })
    })

    describe('partial match → swallow:false (don\'t hide real bugs)', () => {
        it('birpc closed but no resolveManualMock → swallow:false', () => {
            const err = new Error('[birpc] rpc is closed, cannot call "onCancel"')
            err.stack = `${err.message}\n    at unrelated code`
            const verdict = handleUnhandledRejection(err)
            expect(verdict.swallow).toBe(false)
            expect(getSwallowCounter()).toBe(0)
        })

        it('resolveManualMock but no birpc closed → swallow:false', () => {
            const err = new Error('some other teardown error mentioning resolveManualMock')
            const verdict = handleUnhandledRejection(err)
            expect(verdict.swallow).toBe(false)
            expect(getSwallowCounter()).toBe(0)
        })
    })

    describe('non-matching → swallow:false', () => {
        it('returns swallow:false for ordinary Error', () => {
            const err = new Error('totally unrelated test failure')
            const verdict = handleUnhandledRejection(err)
            expect(verdict.swallow).toBe(false)
            expect(verdict.replacement).toBeUndefined()
            expect(getSwallowCounter()).toBe(0)
        })

        it('returns swallow:false for string rejection', () => {
            const verdict = handleUnhandledRejection('some string rejection')
            expect(verdict.swallow).toBe(false)
            expect(getSwallowCounter()).toBe(0)
        })

        it('returns swallow:false for non-Error object', () => {
            const verdict = handleUnhandledRejection({ code: 'ECONNREFUSED' })
            expect(verdict.swallow).toBe(false)
            expect(getSwallowCounter()).toBe(0)
        })

        it('does not log [YUJ-376] warning for non-matching rejections', () => {
            handleUnhandledRejection(new Error('unrelated'))
            expect(warnSpy).not.toHaveBeenCalled()
        })
    })

    describe('counter discipline', () => {
        it(`stops swallowing after ${SWALLOW_LIMIT} hits (returns replacement)`, () => {
            for (let i = 0; i < SWALLOW_LIMIT; i++) {
                expect(handleUnhandledRejection(makeVitestWrappedError()).swallow).toBe(true)
            }
            expect(getSwallowCounter()).toBe(SWALLOW_LIMIT)

            const verdict = handleUnhandledRejection(makeVitestWrappedError())
            expect(verdict.swallow).toBe(false)
            expect(verdict.replacement).toBeInstanceOf(Error)
            expect(verdict.replacement?.message).toMatch(
                /YUJ-376 swallow counter exceeded/,
            )
        })

        it('resetSwallowCounter() clears state between test suites', () => {
            handleUnhandledRejection(makeVitestWrappedError())
            handleUnhandledRejection(makeVitestWrappedError())
            expect(getSwallowCounter()).toBe(2)
            resetSwallowCounter()
            expect(getSwallowCounter()).toBe(0)
        })
    })
})
