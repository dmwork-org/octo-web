import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import axios, { type AxiosResponse } from "axios"
import { Channel } from "wukongimjssdk"
import APIClient from "../APIClient"
import { precheckUploadCredentials, uploadChatMedia } from "../UploadCredentials"
import { createImOwnerAdmission, type ImOwnerAdmission } from "../../im-runtime/ownerAdmission"
import { installImOwnerAdmission, uninstallImOwnerAdmission } from "../../im-runtime/ownerAdmissionHost"

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
}
function credentials() {
    return {
        uploadUrl: "https://upload.example.invalid/put",
        downloadUrl: "https://download.example.invalid/file",
        contentType: "image/png",
    }
}
function response(): AxiosResponse<unknown> {
    return { status: 200, statusText: "OK", data: {}, headers: {}, config: {} }
}
const file = () => new File(["image"], "image.png", { type: "image/png" })
const channel = new Channel("room", 2)

describe("chat credentials owner settlement", () => {
    let owner: ImOwnerAdmission
    let revision = 0
    let token = "account-a"
    let space = "space-a"
    beforeEach(() => {
        owner = createImOwnerAdmission()
        installImOwnerAdmission(owner)
        revision = 0
        token = "account-a"
        space = "space-a"
        APIClient.shared.config.tokenCallback = () => token
        APIClient.shared.config.spaceIdCallback = () => space
        APIClient.shared.config.imContextRevisionCallback = () => String(revision)
    })
    afterEach(() => {
        vi.restoreAllMocks()
        APIClient.shared.config.tokenCallback = undefined
        APIClient.shared.config.spaceIdCallback = undefined
        APIClient.shared.config.imContextRevisionCallback = undefined
        const snapshot = owner.snapshot()
        if (snapshot.phase === "active") owner.quiesce(snapshot.generation + 1)
        expect(owner.snapshot().pendingCount).toBe(0)
        uninstallImOwnerAdmission(owner)
    })

    it("precheck remains pending after abort until credentials actually settle", async () => {
        const request = deferred<ReturnType<typeof credentials>>()
        const get = vi.spyOn(APIClient.shared, "get").mockReturnValue(request.promise)
        const work = precheckUploadCredentials(file(), channel, "png")
        expect(owner.snapshot().pendingCount).toBe(1)
        owner.quiesce(1)
        expect(get.mock.calls[0][1]?.signal?.aborted).toBe(true)
        expect(owner.snapshot().pendingCount).toBe(1)
        const outcome = expect(work).rejects.toMatchObject({ name: "ImOwnerAdmissionError", code: "owner_stale" })
        request.resolve(credentials())
        await outcome
        expect(owner.snapshot().pendingCount).toBe(0)
    })

    it("quiesce while credentials are pending cannot start direct PUT", async () => {
        const request = deferred<ReturnType<typeof credentials>>()
        vi.spyOn(APIClient.shared, "get").mockReturnValue(request.promise)
        const put = vi.spyOn(axios, "put")
        const work = uploadChatMedia(file(), channel, "png")
        owner.quiesce(1)
        const outcome = expect(work).rejects.toMatchObject({ code: "owner_stale" })
        request.resolve(credentials())
        await outcome
        expect(put).not.toHaveBeenCalled()
    })

    it("one ticket spans credentials and PUT, and ignored abort cannot return a URL", async () => {
        vi.spyOn(APIClient.shared, "get").mockResolvedValue(credentials())
        const request = deferred<AxiosResponse<unknown>>()
        const put = vi.spyOn(axios, "put").mockReturnValue(request.promise)
        const work = uploadChatMedia(file(), channel, "png")
        expect(owner.snapshot().pendingCount).toBe(1)
        await vi.waitFor(() => expect(put).toHaveBeenCalledOnce())
        expect(owner.snapshot().pendingCount).toBe(1)
        owner.quiesce(1)
        expect(put.mock.calls[0][2]?.signal?.aborted).toBe(true)
        expect(owner.snapshot().pendingCount).toBe(1)
        const outcome = expect(work).rejects.toMatchObject({ code: "owner_stale" })
        request.resolve(response())
        await outcome
        expect(owner.snapshot().pendingCount).toBe(0)
    })

    it("denies precheck and direct upload before any credentials request", async () => {
        owner.quiesce(1)
        const get = vi.spyOn(APIClient.shared, "get")
        const put = vi.spyOn(axios, "put")
        await expect(precheckUploadCredentials(file(), channel, "png")).rejects.toMatchObject({ code: "owner_denied" })
        await expect(uploadChatMedia(file(), channel, "png")).rejects.toMatchObject({ code: "owner_denied" })
        expect(get).not.toHaveBeenCalled()
        expect(put).not.toHaveBeenCalled()
    })

    it("old account credentials cannot start PUT", async () => {
        const request = deferred<ReturnType<typeof credentials>>()
        vi.spyOn(APIClient.shared, "get").mockReturnValue(request.promise)
        const put = vi.spyOn(axios, "put")
        const work = uploadChatMedia(file(), channel, "png")
        token = "account-b"
        request.resolve(credentials())
        await expect(work).rejects.toMatchObject({ code: "owner_stale" })
        expect(put).not.toHaveBeenCalled()
    })

    it("Space round trip cannot validate old credentials", async () => {
        const request = deferred<ReturnType<typeof credentials>>()
        vi.spyOn(APIClient.shared, "get").mockReturnValue(request.promise)
        const put = vi.spyOn(axios, "put")
        const work = uploadChatMedia(file(), channel, "png")
        space = "space-b"
        revision++
        space = "space-a"
        revision++
        request.resolve(credentials())
        await expect(work).rejects.toMatchObject({ code: "owner_stale" })
        expect(put).not.toHaveBeenCalled()
    })

    it("stale PUT rejection exposes only the fixed owner diagnostic", async () => {
        vi.spyOn(APIClient.shared, "get").mockResolvedValue(credentials())
        const request = deferred<AxiosResponse<unknown>>()
        const put = vi.spyOn(axios, "put").mockReturnValue(request.promise)
        const work = uploadChatMedia(file(), channel, "png")
        await vi.waitFor(() => expect(put).toHaveBeenCalledOnce())
        revision++
        const outcome = expect(work).rejects.toMatchObject({ message: "owner_stale", code: "owner_stale" })
        request.reject(new Error("late upstream detail"))
        await outcome
    })


    it("synchronous context capture failure cannot leak an operation ticket", async () => {
        APIClient.shared.config.tokenCallback = () => { throw new Error("context unavailable") }
        const get = vi.spyOn(APIClient.shared, "get")
        await expect(precheckUploadCredentials(file(), channel, "png")).rejects.toThrow("context unavailable")
        expect(get).not.toHaveBeenCalled()
        expect(owner.snapshot().pendingCount).toBe(0)
    })

    it("a successful live upload returns its URL after both requests settle", async () => {
        vi.spyOn(APIClient.shared, "get").mockResolvedValue(credentials())
        vi.spyOn(axios, "put").mockResolvedValue(response())
        await expect(uploadChatMedia(file(), channel, "png")).resolves.toBe(credentials().downloadUrl)
        expect(owner.snapshot().pendingCount).toBe(0)
    })
})
