import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios'
import APIClient from '../APIClient'
import { createImOwnerAdmission, type ImOwnerAdmission } from '../../im-runtime/ownerAdmission'
import { installImOwnerAdmission, uninstallImOwnerAdmission } from '../../im-runtime/ownerAdmissionHost'
import { messageOwnerHttpKind } from '../messageOwnerHttp'

const client = APIClient.shared
let owner: ImOwnerAdmission
const priorAdapter = axios.defaults.adapter
beforeEach(() => {
    owner = createImOwnerAdmission()
    installImOwnerAdmission(owner)
    client.config.apiURL = 'https://api.example.test/v1/'
    client.config.tokenCallback = () => 'test-token'
    client.config.spaceIdCallback = () => 'space-a'
    client.logoutCallback = vi.fn()
})
afterEach(() => {
    owner.quiesce(owner.snapshot().generation + 1)
    uninstallImOwnerAdmission(owner)
    axios.defaults.adapter = priorAdapter
    client.config.tokenCallback = undefined
    client.config.spaceIdCallback = undefined
    client.config.imContextRevisionCallback = undefined
    client.logoutCallback = undefined
})

function response(config: AxiosRequestConfig): AxiosResponse {
    return { status: 200, statusText: 'OK', data: { messages: [] }, headers: {}, config }
}
function deferredHttp() {
    let finish!: (response: AxiosResponse) => void
    let fail!: (error: unknown) => void
    let config!: AxiosRequestConfig
    const adapter = vi.fn((request: AxiosRequestConfig) => {
        config = request
        return new Promise<AxiosResponse>((yes, no) => { finish = yes; fail = no })
    })
    axios.defaults.adapter = adapter
    return { adapter, done: () => finish(response(config)), fail: (status: number) => fail({
        config, response: { status, data: { msg: 'http failure' } },
    }) }
}

describe('message HTTP owner boundary', () => {
    it.each(['message/channel/sync', '/v1/message/readed', '/api/v1/conversation/clearUnread',
        'conversations/group/2', 'https://api.example.test/v1/message/extra/sync',
        'reactions', 'reaction/sync', 'messages/_search_global_messages'])('covers path %s', path => {
        expect(messageOwnerHttpKind(path)).toBeDefined()
    })

    it('blocks queued and new HTTP before dispatch, while unrelated APIs remain available', async () => {
        const adapter = vi.fn(async (config: AxiosRequestConfig) => response(config))
        axios.defaults.adapter = adapter
        const queued = client.put('conversation/clearUnread', {}).catch(error => error)
        expect(owner.snapshot().pendingCount).toBe(1)
        owner.quiesce(1)
        expect(await queued).toMatchObject({ code: 'owner_stale' })
        await expect(client.post('message/channel/sync', {})).rejects.toMatchObject({ code: 'owner_denied' })
        await expect(client.post('reactions', {})).rejects.toMatchObject({ code: 'owner_denied' })
        expect(adapter).not.toHaveBeenCalled()
        await client.get('users/me')
        expect(adapter).toHaveBeenCalledOnce()
    })

    it.each([200, 401, 500])('waits for actual HTTP %s then rejects stale completion', async status => {
        const http = deferredHttp()
        const pending = client.post('message/channel/sync', {}).catch(error => error)
        await vi.waitFor(() => expect(http.adapter).toHaveBeenCalledOnce())
        owner.quiesce(1)
        expect(owner.snapshot().pendingCount).toBe(1)
        if (status === 200) http.done()
        else http.fail(status)
        expect(await pending).toMatchObject({ code: 'owner_stale' })
        expect(owner.snapshot().pendingCount).toBe(0)
        expect(client.logoutCallback).not.toHaveBeenCalled()
    })

    it('captures a revision so Space/account roundtrips cannot publish or log out', async () => {
        let revision = '1'
        client.config.imContextRevisionCallback = () => revision
        const http = deferredHttp()
        const pending = client.put('conversation/clearUnread', {}).catch(error => error)
        await vi.waitFor(() => expect(http.adapter).toHaveBeenCalledOnce())
        revision = '3'
        http.fail(401)
        expect(await pending).toMatchObject({ code: 'owner_stale' })
        expect(client.logoutCallback).not.toHaveBeenCalled()
    })

    it('passes AbortSignal through clearUnread PUT but keeps pending until transport settles', async () => {
        const http = deferredHttp()
        const controller = new AbortController()
        const pending = client.put('conversation/clearUnread', {}, { signal: controller.signal }).catch(error => error)
        await vi.waitFor(() => expect(http.adapter).toHaveBeenCalledOnce())
        expect(http.adapter.mock.calls[0][0].signal).toBe(controller.signal)
        controller.abort()
        expect(owner.snapshot().pendingCount).toBe(1)
        http.done()
        await pending
        expect(owner.snapshot().pendingCount).toBe(0)
    })
})
