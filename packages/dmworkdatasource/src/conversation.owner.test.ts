import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { Channel, Conversation, Message } from 'wukongimjssdk'
import APIClient from '@octo/base/src/Service/APIClient'
import { createImOwnerAdmission, type ImOwnerAdmission } from '@octo/base/src/im-runtime/ownerAdmission'
import { installImOwnerAdmission, uninstallImOwnerAdmission } from '@octo/base/src/im-runtime/ownerAdmissionHost'

vi.mock('@octo/base', () => ({
    WKApp: { apiClient: APIClient.shared },
    SyncMessageOptions: class { limit = 15; startMessageSeq = 0; endMessageSeq = 0; pullMode = 0 },
    Convert: { toMessage: (value: unknown) => value, toMessageExtra: (value: unknown) => value },
}))
import { ConversationProvider } from './conversation'

let owner: ImOwnerAdmission
const previousAdapter = axios.defaults.adapter
beforeEach(() => {
    owner = createImOwnerAdmission()
    installImOwnerAdmission(owner)
    APIClient.shared.config.apiURL = 'https://api.example.test/v1/'
})
afterEach(() => {
    owner.quiesce(owner.snapshot().generation + 1)
    uninstallImOwnerAdmission(owner)
    axios.defaults.adapter = previousAdapter
})
const channel = new Channel('g1', 2)

describe('ConversationProvider real API owner composition', () => {
    it.each(['deleteConversation', 'deleteMessages', 'clearConversationMessages'] as const)(
        'admits and tracks the former direct axios %s path', async action => {
            let resolve!: (value: AxiosResponse) => void
            let captured!: AxiosRequestConfig
            const adapter = vi.fn((config: AxiosRequestConfig) => {
                captured = config
                return new Promise<AxiosResponse>(yes => { resolve = yes })
            })
            axios.defaults.adapter = adapter
            const provider = new ConversationProvider()
            const message = new Message()
            message.channel = channel
            message.messageID = '42'
            message.messageSeq = 7
            const conversation = new Conversation()
            conversation.channel = channel
            conversation.lastMessage = message
            const pending = (action === 'deleteConversation' ? provider.deleteConversation(channel)
                : action === 'deleteMessages' ? provider.deleteMessages([message])
                    : provider.clearConversationMessages(conversation)).catch(error => error)
            await vi.waitFor(() => expect(adapter).toHaveBeenCalledOnce())
            expect(owner.snapshot().pendingCount).toBe(1)
            owner.quiesce(1)
            resolve({ config: captured, data: {}, headers: {}, status: 200, statusText: 'OK' })
            expect(await pending).toMatchObject({ code: 'owner_stale' })
            expect(owner.snapshot().pendingCount).toBe(0)
            expect(captured.url).toBe(action === 'deleteConversation' ? 'conversations/g1/2'
                : action === 'deleteMessages' ? 'message' : 'message/offset')
        },
    )

    it('blocks history and read APIs after quiesce without dispatching HTTP', async () => {
        const adapter = vi.fn()
        axios.defaults.adapter = adapter
        owner.quiesce(1)
        const provider = new ConversationProvider()
        await expect(provider.syncMessages(channel)).rejects.toMatchObject({ code: 'owner_denied' })
        await expect(provider.markConversationUnread(channel, 0)).rejects.toMatchObject({ code: 'owner_denied' })
        await expect(provider.syncMessageExtras(channel, 0, 20)).rejects.toMatchObject({ code: 'owner_denied' })
        expect(adapter).not.toHaveBeenCalled()
    })
})
