import { afterEach, describe, expect, it, vi } from 'vitest'
import { Channel, Message, MessageText } from 'wukongimjssdk'
import { createImOwnerAdmission, type ImOwnerAdmission } from '../../im-runtime/ownerAdmission'
import { installImOwnerAdmission, uninstallImOwnerAdmission } from '../../im-runtime/ownerAdmissionHost'

vi.mock('../Convert', () => ({ applyMsgLevelExternalFieldsWithFallback: vi.fn() }))
vi.mock('../../Utils/groupDisband', () => ({ isConversationDisbanded: () => false }))
vi.mock('../../im-runtime/channelRuntime', () => ({ getImChannelInfo: () => undefined }))
vi.mock('../../Utils/sendContentProxy', () => ({ wrapSendContentForInjection: (content: unknown) => content }))
import { ForwardService } from '../ForwardService'

let owner: ImOwnerAdmission
afterEach(() => {
    owner.quiesce(owner.snapshot().generation + 1)
    uninstallImOwnerAdmission(owner)
})
describe('forwarding owner context', () => {
    it.each(['resolve', 'reject'] as const)('blocks remaining serial chunks after a late %s and reactivation', async mode => {
        owner = createImOwnerAdmission()
        installImOwnerAdmission(owner)
        let yes!: (message: Message) => void
        let no!: (error: Error) => void
        const sender = vi.fn(() => new Promise<Message>((resolve, reject) => { yes = resolve; no = reject }))
        const onSent = vi.fn()
        const pending = ForwardService.send([new Channel('group', 2)], () => [
            new MessageText('first'), new MessageText('second'),
        ], { sender, onSent }).catch(error => error)
        expect(sender).toHaveBeenCalledOnce()
        owner.quiesce(1); owner.prepare(2); owner.activate(2)
        if (mode === 'resolve') yes(new Message())
        else no(new Error('failed'))
        expect(await pending).toMatchObject({ code: 'owner_stale' })
        expect(sender).toHaveBeenCalledOnce()
        expect(onSent).not.toHaveBeenCalled()
    })
})
