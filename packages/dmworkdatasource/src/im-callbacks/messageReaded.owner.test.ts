import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Channel, Message } from "wukongimjssdk"
import { createImOwnerAdmission, type ImOwnerAdmission } from "@octo/base/src/im-runtime/ownerAdmission"
import { installImOwnerAdmission, uninstallImOwnerAdmission } from "@octo/base/src/im-runtime/ownerAdmissionHost"
import { createMessageReadedCallback } from "./messageReaded"

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
}
function messages(): Message[] {
    const message = new Message()
    message.messageID = "message-one"
    return [message]
}

describe("managed receipt acceptance", () => {
    let owner: ImOwnerAdmission
    beforeEach(() => {
        owner = createImOwnerAdmission()
        installImOwnerAdmission(owner)
    })
    afterEach(() => {
        const snapshot = owner.snapshot()
        if (snapshot.phase === "active") owner.quiesce(snapshot.generation + 1)
        expect(owner.snapshot().pendingCount).toBe(0)
        uninstallImOwnerAdmission(owner)
    })

    it("propagates HTTP failure at generation zero and cannot notify acceptance", async () => {
        const failure = new Error("network")
        const post = vi.fn().mockRejectedValue(failure)
        const accepted = vi.fn()
        const callback = createMessageReadedCallback({ postMessageReaded: post })
        await expect(callback(new Channel("room", 2), messages()).then(accepted)).rejects.toBe(failure)
        expect(accepted).not.toHaveBeenCalled()
        expect(owner.snapshot().pendingCount).toBe(0)
    })

    it("retains the whole mocked HTTP Promise and rejects success after revocation", async () => {
        const request = deferred<unknown>()
        const post = vi.fn().mockReturnValue(request.promise)
        const callback = createMessageReadedCallback({ postMessageReaded: post })
        const accepted = vi.fn()
        const work = callback(new Channel("room", 2), messages()).then(accepted)
        expect(owner.snapshot().pendingCount).toBe(1)
        owner.quiesce(1)
        expect(owner.snapshot().pendingCount).toBe(1)
        const outcome = expect(work).rejects.toMatchObject({ name: "ImOwnerAdmissionError", code: "owner_stale" })
        request.resolve({ ok: true })
        await outcome
        expect(accepted).not.toHaveBeenCalled()
        expect(owner.snapshot().pendingCount).toBe(0)
    })

    it("turns a late failed request into fixed stale diagnostics", async () => {
        const request = deferred<unknown>()
        const callback = createMessageReadedCallback({ postMessageReaded: () => request.promise })
        const work = callback(new Channel("room", 2), messages())
        owner.quiesce(1)
        const outcome = expect(work).rejects.toMatchObject({ message: "owner_stale", code: "owner_stale" })
        request.reject(new Error("late backend failure"))
        await outcome
    })

    it("denies new receipts synchronously before any HTTP call", async () => {
        owner.quiesce(1)
        const post = vi.fn()
        const callback = createMessageReadedCallback({ postMessageReaded: post })
        await expect(callback(new Channel("room", 2), messages())).rejects.toMatchObject({ code: "owner_denied" })
        expect(post).not.toHaveBeenCalled()
    })

    it("rejects a completed receipt from an old account/Space context", async () => {
        let revision = 0
        const request = deferred<unknown>()
        const callback = createMessageReadedCallback({
            postMessageReaded: () => request.promise,
            captureContext: () => {
                const captured = revision
                return () => revision === captured
            },
        })
        const work = callback(new Channel("room", 2), messages())
        revision += 2
        const outcome = expect(work).rejects.toMatchObject({ code: "owner_stale" })
        request.resolve({ ok: true })
        await outcome
    })


    it("synchronous context capture failure releases admission without posting", async () => {
        const failure = new Error("context unavailable")
        const post = vi.fn()
        const callback = createMessageReadedCallback({
            postMessageReaded: post,
            captureContext: () => { throw failure },
        })
        await expect(callback(new Channel("room", 2), messages())).rejects.toBe(failure)
        expect(post).not.toHaveBeenCalled()
        expect(owner.snapshot().pendingCount).toBe(0)
    })

    it("keeps the ticket through successful callback completion", async () => {
        const request = deferred<unknown>()
        const callback = createMessageReadedCallback({ postMessageReaded: () => request.promise })
        const work = callback(new Channel("room", 2), messages())
        expect(owner.snapshot().pendingCount).toBe(1)
        request.resolve({ ok: true })
        await expect(work).resolves.toEqual({ ok: true })
        expect(owner.snapshot().pendingCount).toBe(0)
    })
})
