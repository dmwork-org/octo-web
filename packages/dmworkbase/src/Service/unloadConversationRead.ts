import { beginImOwnerOperation } from '../im-runtime/ownerAdmissionHost'
import { isImReadAttentionAllowed } from '../im-runtime/readAttentionHost'

/** Keepalive bypasses axios, so its real Promise needs an independent owner ticket. */
export function flushConversationReadOnUnload(options: {
    apiURL: string
    token: string
    spaceId: string
    channelId: string
    channelType: number
    unread: number
    fetch?: typeof fetch
}): Promise<void> | undefined {
    if (!isImReadAttentionAllowed()) return
    const operation = beginImOwnerOperation('read')
    try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json', token: options.token }
        if (options.spaceId) headers['X-Space-Id'] = options.spaceId
        const pending = (options.fetch ?? fetch)(`${options.apiURL}conversation/clearUnread`, {
            method: 'PUT', headers, keepalive: true,
            body: JSON.stringify({
                channel_id: options.channelId, channel_type: options.channelType,
                unread: options.unread > 0 ? options.unread : 0,
            }),
        })
        return pending.then(response => {
            operation.assertCurrent()
            if (!response.ok) throw new Error('unload_read_failed')
        }).finally(() => operation.release())
    } catch (error) {
        operation.release()
        return Promise.reject(error)
    }
}
