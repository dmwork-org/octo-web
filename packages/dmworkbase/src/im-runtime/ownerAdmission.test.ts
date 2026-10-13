import { afterEach, describe, expect, it, vi } from 'vitest'
import { createImOwnerAdmission } from './ownerAdmission'
import {
    beginImOwnerOperation, captureImOwnerWorkContext, installImOwnerAdmission,
    hasImOwnerAdmission, isImOwnerWorkAllowed, uninstallImOwnerAdmission, withImOwnerOperation,
} from './ownerAdmissionHost'
import { installImReadAttentionGate, isImReadAttentionAllowed } from './readAttentionHost'

const installed: ReturnType<typeof createImOwnerAdmission>[] = []
function install() {
    const owner = createImOwnerAdmission()
    installImOwnerAdmission(owner)
    installed.push(owner)
    return owner
}
afterEach(() => {
    for (const owner of installed.splice(0)) {
        owner.quiesce(owner.snapshot().generation + 1)
        uninstallImOwnerAdmission(owner)
    }
})

describe('Web message owner admission', () => {
    it('keeps ordinary Web allowed until an exclusive host is installed', () => {
        expect(hasImOwnerAdmission()).toBe(false)
        const ordinary = beginImOwnerOperation('history')
        expect(ordinary.isCurrent()).toBe(true)
        const owner = install()
        expect(hasImOwnerAdmission()).toBe(true)
        expect(ordinary.isCurrent()).toBe(false)
        expect(() => installImOwnerAdmission(createImOwnerAdmission())).toThrow('owner_denied')
        owner.quiesce(1)
        expect(hasImOwnerAdmission()).toBe(true)
        expect(isImOwnerWorkAllowed()).toBe(false)
    })

    it('revokes synchronously before cancellation callbacks and waits for actual release', async () => {
        const owner = install()
        const cancel = vi.fn(() => expect(() => owner.begin('send')).toThrow('owner_denied'))
        const ticket = owner.begin('upload', cancel)
        const drained = vi.fn()
        const waiting = owner.waitForDrain().then(drained)
        owner.quiesce(1)
        owner.quiesce(1)
        expect(cancel).toHaveBeenCalledOnce()
        expect(ticket.isCurrent()).toBe(false)
        expect(owner.snapshot().pendingCount).toBe(1)
        await Promise.resolve()
        expect(drained).not.toHaveBeenCalled()
        ticket.release()
        ticket.release()
        await waiting
        expect(drained).toHaveBeenCalledOnce()
    })

    it('does not treat cancellation failure as settlement', () => {
        const owner = install()
        const ticket = owner.begin('upload', () => { throw new Error('cancel failed') })
        owner.quiesce(1)
        expect(owner.snapshot().pendingCount).toBe(1)
        expect(() => owner.prepare(2)).toThrow('owner_denied')
        ticket.release()
    })

    it('requires prepare and a matching explicit activation without reviving old callbacks', () => {
        const owner = install()
        const old = captureImOwnerWorkContext()
        const ticket = owner.begin('history')
        owner.quiesce(1)
        ticket.release()
        owner.prepare(2)
        const deniedContext = captureImOwnerWorkContext()
        expect(() => owner.begin('connect')).toThrow('owner_denied')
        expect(() => owner.activate(1)).toThrow('owner_stale')
        owner.activate(2)
        expect(deniedContext()).toBe(false)
        expect(old()).toBe(false)
        expect(ticket.isCurrent()).toBe(false)
        expect(captureImOwnerWorkContext()()).toBe(true)
    })

    it.each(['preparing', 'active'] as const)('allows revoking the same positive generation from %s', phase => {
        const owner = install()
        owner.quiesce(1)
        owner.prepare(2)
        if (phase === 'active') owner.activate(2)
        const cancel = vi.fn(() => expect(() => owner.begin('send')).toThrow('owner_denied'))
        const ticket = phase === 'active' ? owner.begin('send', cancel) : undefined
        owner.quiesce(2)
        owner.quiesce(2)
        expect(owner.snapshot()).toEqual({ generation: 2, phase: 'quiescing', pendingCount: ticket ? 1 : 0 })
        expect(() => owner.activate(2)).toThrow('owner_stale')
        expect(() => owner.quiesce(1)).toThrow('owner_stale')
        expect(() => owner.prepare(2)).toThrow(ticket ? 'owner_denied' : 'owner_stale')
        if (ticket) {
            expect(ticket.isCurrent()).toBe(false)
            expect(cancel).toHaveBeenCalledOnce()
            ticket.release()
        }
        owner.prepare(3)
        expect(owner.snapshot().phase).toBe('preparing')
    })

    it.each([-1, 0, 0.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid generation %s', next => {
        const owner = install()
        expect(() => owner.quiesce(next)).toThrow('owner_stale')
        expect(owner.snapshot().phase).toBe('active')
    })

    it('retains a deny barrier even if the legacy read gate is disposed', () => {
        const owner = install()
        const gate = installImReadAttentionGate(true)
        try {
            expect(isImReadAttentionAllowed()).toBe(true)
            owner.quiesce(1)
            gate.dispose()
            expect(isImReadAttentionAllowed()).toBe(false)
        } finally { gate.dispose() }
    })

    it.each(['resolve', 'reject'] as const)('keeps an actual %s Promise pending after quiesce', async mode => {
        const owner = install()
        let resolve!: (value: number) => void
        let reject!: (error: Error) => void
        const deferred = new Promise<number>((yes, no) => { resolve = yes; reject = no })
        const pending = withImOwnerOperation('history', () => deferred).then(
            value => ({ value }), error => ({ error }),
        )
        owner.quiesce(1)
        expect(owner.snapshot().pendingCount).toBe(1)
        if (mode === 'resolve') resolve(7)
        else reject(new Error('http failure'))
        const result = await pending
        expect(result).toHaveProperty('error')
        if ('error' in result) expect(result.error.message).toBe(mode === 'resolve' ? 'owner_stale' : 'http failure')
        expect(owner.snapshot().pendingCount).toBe(0)
    })
})
