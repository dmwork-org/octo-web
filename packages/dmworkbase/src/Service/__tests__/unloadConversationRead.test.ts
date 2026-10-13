import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createImOwnerAdmission, type ImOwnerAdmission } from '../../im-runtime/ownerAdmission'
import { installImOwnerAdmission, uninstallImOwnerAdmission } from '../../im-runtime/ownerAdmissionHost'
import { installImReadAttentionGate, type ImReadAttentionGate } from '../../im-runtime/readAttentionHost'
import { flushConversationReadOnUnload } from '../unloadConversationRead'

let owner: ImOwnerAdmission
let gate: ImReadAttentionGate
beforeEach(() => {
    owner = createImOwnerAdmission()
    installImOwnerAdmission(owner)
    gate = installImReadAttentionGate(true)
})
afterEach(() => {
    gate.dispose()
    owner.quiesce(owner.snapshot().generation + 1)
    uninstallImOwnerAdmission(owner)
})
const options = {
    apiURL: 'https://api.example.test/v1/', token: 'test-token', spaceId: 'space-a',
    channelId: 'group', channelType: 2, unread: 0,
}

describe('unload clearUnread owner boundary', () => {
    it('refuses unload after quiesce even when the legacy gate was removed', () => {
        owner.quiesce(1)
        gate.dispose()
        const send = vi.fn<typeof fetch>()
        expect(flushConversationReadOnUnload({ ...options, fetch: send })).toBeUndefined()
        expect(send).not.toHaveBeenCalled()
    })

    it('refuses hidden read attention', () => {
        gate.setAllowed(false)
        const send = vi.fn<typeof fetch>()
        expect(flushConversationReadOnUnload({ ...options, fetch: send })).toBeUndefined()
        expect(send).not.toHaveBeenCalled()
    })

    it.each(['resolve', 'reject'] as const)('tracks keepalive until actual %s without resurrecting reads', async mode => {
        let yes!: (response: Response) => void
        let no!: (error: Error) => void
        const send = vi.fn<typeof fetch>(() => new Promise((resolve, reject) => { yes = resolve; no = reject }))
        const pending = flushConversationReadOnUnload({ ...options, fetch: send })!.catch(error => error)
        expect(send).toHaveBeenCalledWith(`${options.apiURL}conversation/clearUnread`, expect.objectContaining({
            keepalive: true, method: 'PUT', headers: expect.objectContaining({ 'X-Space-Id': 'space-a' }),
        }))
        owner.quiesce(1)
        expect(owner.snapshot().pendingCount).toBe(1)
        if (mode === 'resolve') yes({ ok: true } as Response)
        else no(new Error('network'))
        expect(await pending).toBeInstanceOf(Error)
        expect(owner.snapshot().pendingCount).toBe(0)
    })

    it('releases synchronous fetch failure but does not claim success', async () => {
        const send = vi.fn<typeof fetch>(() => { throw new Error('unload failure') })
        await expect(flushConversationReadOnUnload({ ...options, fetch: send })).rejects.toThrow('unload failure')
        expect(owner.snapshot().pendingCount).toBe(0)
    })
})
