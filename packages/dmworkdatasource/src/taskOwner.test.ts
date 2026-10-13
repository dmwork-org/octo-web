import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios"
import { Channel, MediaMessageContent, Message, TaskStatus } from "wukongimjssdk"
import { createImOwnerAdmission, type ImOwnerAdmission } from "@octo/base/src/im-runtime/ownerAdmission"
import { installImOwnerAdmission, uninstallImOwnerAdmission } from "@octo/base/src/im-runtime/ownerAdmissionHost"

const state = vi.hoisted(() => ({ apiGet: vi.fn(), contextRevision: 0 }))
vi.mock("@octo/base", async () => ({
    ...await import("../../dmworkbase/src/im-runtime/ownerAdmissionHost"),
    captureCurrentImConversationSyncContext: () => {
        const revision = state.contextRevision
        return () => state.contextRevision === revision
    },
    WKApp: { apiClient: { get: state.apiGet } },
}))
vi.mock("axios", () => ({ default: { put: vi.fn() } }))
import { MediaMessageUploadTask } from "./task"

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
        contentType: "image/png", key: "/chat/file", expiredTime: 123,
    }
}
function response(status = 200): AxiosResponse<unknown> {
    return { status, data: {}, statusText: "OK", headers: {}, config: {} }
}
function fixture(file: File | null = new File(["image"], "image.png"), remoteUrl = "") {
    const content: MediaMessageContent & { url?: string } = new MediaMessageContent()
    content.file = file ?? undefined
    content.extension = "png"
    content.remoteUrl = remoteUrl
    const message = new Message()
    message.channel = new Channel("room", 2)
    message.content = content
    const task = new MediaMessageUploadTask(message)
    const update = vi.spyOn(task, "update").mockImplementation(() => {})
    return { task, content, update }
}

describe("media upload owner settlement", () => {
    let owner: ImOwnerAdmission
    beforeEach(() => {
        vi.clearAllMocks()
        state.contextRevision = 0
        owner = createImOwnerAdmission()
        installImOwnerAdmission(owner)
    })
    afterEach(() => {
        const snapshot = owner.snapshot()
        if (snapshot.phase === "active") owner.quiesce(snapshot.generation + 1)
        expect(owner.snapshot().pendingCount).toBe(0)
        uninstallImOwnerAdmission(owner)
    })

    it("retains credentials work after quiesce and prevents a late PUT", async () => {
        const request = deferred<ReturnType<typeof credentials>>()
        state.apiGet.mockReturnValue(request.promise)
        const { task, update } = fixture()
        const work = task.start()
        await vi.waitFor(() => expect(state.apiGet).toHaveBeenCalledOnce())
        const signal: AbortSignal = state.apiGet.mock.calls[0][1].signal
        owner.quiesce(1)
        expect(signal.aborted).toBe(true)
        expect(owner.snapshot().pendingCount).toBe(1)
        let drained = false
        void owner.waitForDrain().then(() => { drained = true })
        await Promise.resolve()
        expect(drained).toBe(false)
        request.resolve(credentials())
        await work
        expect(axios.put).not.toHaveBeenCalled()
        expect(update).not.toHaveBeenCalled()
        await owner.waitForDrain()
        expect(owner.snapshot().pendingCount).toBe(0)
    })

    it("cancel during credentials also prevents a late PUT in ordinary Web", async () => {
        owner.quiesce(1)
        uninstallImOwnerAdmission(owner)
        const request = deferred<ReturnType<typeof credentials>>()
        state.apiGet.mockReturnValue(request.promise)
        const { task, update } = fixture()
        const work = task.start()
        await vi.waitFor(() => expect(state.apiGet).toHaveBeenCalledOnce())
        task.cancel()
        request.resolve(credentials())
        await work
        expect(task.status).toBe(TaskStatus.cancel)
        expect(update).toHaveBeenCalledOnce()
        expect(axios.put).not.toHaveBeenCalled()
    })

    it("quiesce ignores late progress and successful PUT until actual settlement", async () => {
        state.apiGet.mockResolvedValue(credentials())
        const put = deferred<AxiosResponse<unknown>>()
        let uploadConfig: AxiosRequestConfig | undefined
        vi.mocked(axios.put).mockImplementation((_url, _file, config) => {
            uploadConfig = config
            return put.promise
        })
        const { task, content, update } = fixture()
        const work = task.start()
        await vi.waitFor(() => expect(axios.put).toHaveBeenCalledOnce())
        owner.quiesce(1)
        expect(uploadConfig?.signal?.aborted).toBe(true)
        expect(owner.snapshot().pendingCount).toBe(1)
        uploadConfig?.onUploadProgress?.({ loaded: 9, total: 10 })
        expect(task.progress()).toBe(0)
        put.resolve(response())
        await work
        expect(content.remoteUrl).toBe("")
        expect(content.url).toBeUndefined()
        expect(update).not.toHaveBeenCalled()
        expect(task.status).not.toBe(TaskStatus.success)
    })

    it("explicit cancel cannot be overwritten by an adapter that ignores abort", async () => {
        state.apiGet.mockResolvedValue(credentials())
        const put = deferred<AxiosResponse<unknown>>()
        vi.mocked(axios.put).mockReturnValue(put.promise)
        const { task, content, update } = fixture()
        const work = task.start()
        await vi.waitFor(() => expect(axios.put).toHaveBeenCalledOnce())
        task.cancel()
        expect(owner.snapshot().pendingCount).toBe(1)
        put.resolve(response())
        await work
        expect(task.status).toBe(TaskStatus.cancel)
        expect(content.remoteUrl).toBe("")
        expect(update).toHaveBeenCalledOnce()
    })

    it("restart cannot overlap unresolved credentials and is explicit after settlement", async () => {
        const request = deferred<ReturnType<typeof credentials>>()
        state.apiGet.mockReturnValueOnce(request.promise).mockResolvedValue(credentials())
        vi.mocked(axios.put).mockResolvedValue(response())
        const { task } = fixture()
        const work = task.start()
        await vi.waitFor(() => expect(state.apiGet).toHaveBeenCalledOnce())
        task.cancel()
        const restart = task.restart()
        expect(state.apiGet).toHaveBeenCalledOnce()
        request.resolve(credentials())
        await Promise.all([work, restart])
        expect(axios.put).not.toHaveBeenCalled()
        expect(task.status).toBe(TaskStatus.cancel)
        await task.restart()
        expect(state.apiGet).toHaveBeenCalledTimes(2)
        expect(axios.put).toHaveBeenCalledOnce()
        expect(task.status).toBe(TaskStatus.success)
    })

    it("repeated start cannot create overlapping upload attempts", async () => {
        const request = deferred<ReturnType<typeof credentials>>()
        state.apiGet.mockReturnValue(request.promise)
        const { task } = fixture()
        const first = task.start()
        const second = task.start()
        expect(second).toBe(first)
        await vi.waitFor(() => expect(state.apiGet).toHaveBeenCalledOnce())
        task.cancel()
        request.resolve(credentials())
        await first
    })

    it("a fresh grant cannot revive a task from the previous owner generation", async () => {
        const { task, update } = fixture()
        owner.quiesce(1)
        owner.prepare(2)
        owner.activate(2)
        await task.start()
        await task.restart()
        expect(state.apiGet).not.toHaveBeenCalled()
        expect(axios.put).not.toHaveBeenCalled()
        expect(update).not.toHaveBeenCalled()
    })

    it("old account/Space credentials cannot start a PUT even after context returns", async () => {
        const request = deferred<ReturnType<typeof credentials>>()
        state.apiGet.mockReturnValue(request.promise)
        const { task, update } = fixture()
        const work = task.start()
        await vi.waitFor(() => expect(state.apiGet).toHaveBeenCalledOnce())
        state.contextRevision += 2 // A -> B -> A remains a distinct context.
        request.resolve(credentials())
        await work
        await task.restart()
        expect(axios.put).not.toHaveBeenCalled()
        expect(update).not.toHaveBeenCalled()
    })

    it("old account/Space PUT completion cannot publish its URL or SDK success", async () => {
        state.apiGet.mockResolvedValue(credentials())
        const put = deferred<AxiosResponse<unknown>>()
        vi.mocked(axios.put).mockReturnValue(put.promise)
        const { task, content, update } = fixture()
        const work = task.start()
        await vi.waitFor(() => expect(axios.put).toHaveBeenCalledOnce())
        state.contextRevision++
        put.resolve(response())
        await work
        expect(content.url).toBeUndefined()
        expect(content.remoteUrl).toBe("")
        expect(update).not.toHaveBeenCalled()
    })

    it("direct uploadFile has the same ticket and stale completion guard", async () => {
        const put = deferred<AxiosResponse<unknown>>()
        vi.mocked(axios.put).mockReturnValue(put.promise)
        const { task, content, update } = fixture()
        const work = task.uploadFile(new File(["image"], "image.png"), credentials())
        await vi.waitFor(() => expect(axios.put).toHaveBeenCalledOnce())
        expect(owner.snapshot().pendingCount).toBe(1)
        owner.quiesce(1)
        put.resolve(response())
        await work
        expect(state.apiGet).not.toHaveBeenCalled()
        expect(content.remoteUrl).toBe("")
        expect(update).not.toHaveBeenCalled()
    })

    it("remoteUrl success retains admission through synchronous SDK publication", async () => {
        const { task, update } = fixture(null, "https://download.example.invalid/existing")
        update.mockImplementation(() => { expect(owner.snapshot().pendingCount).toBe(1) })
        await task.start()
        expect(task.status).toBe(TaskStatus.success)
        expect(update).toHaveBeenCalledOnce()
        expect(owner.snapshot().pendingCount).toBe(0)
    })

    it("denied remoteUrl and fire-and-forget SDK start never notify or reject", async () => {
        owner.quiesce(1)
        const { task, update } = fixture(null, "https://download.example.invalid/existing")
        await expect(task.start()).resolves.toBeUndefined()
        expect(update).not.toHaveBeenCalled()
        expect(state.apiGet).not.toHaveBeenCalled()
    })


    it("SDK publication failure does not reject a fire-and-forget task or leak its ticket", async () => {
        const { task, update } = fixture(null, "https://download.example.invalid/existing")
        update.mockImplementation(() => { throw new Error("listener failure") })
        await expect(task.start()).resolves.toBeUndefined()
        expect(task.status).toBe(TaskStatus.fail)
        expect(owner.snapshot().pendingCount).toBe(0)
    })

    it("old progress callbacks cannot affect a subsequent retry attempt", async () => {
        state.apiGet.mockResolvedValue(credentials())
        const first = deferred<AxiosResponse<unknown>>()
        const second = deferred<AxiosResponse<unknown>>()
        const progress: Array<(event: { loaded: number; total: number }) => void> = []
        vi.mocked(axios.put).mockImplementation((_url, _file, config) => {
            if (config?.onUploadProgress) progress.push(config.onUploadProgress)
            return progress.length === 1 ? first.promise : second.promise
        })
        const { task, update } = fixture()
        const work = task.start()
        await vi.waitFor(() => expect(axios.put).toHaveBeenCalledOnce())
        first.reject(new Error("network failure"))
        await work
        const retry = task.restart()
        await vi.waitFor(() => expect(axios.put).toHaveBeenCalledTimes(2))
        const before = update.mock.calls.length
        progress[0]({ loaded: 9, total: 10 })
        expect(task.progress()).toBe(0)
        expect(update).toHaveBeenCalledTimes(before)
        progress[1]({ loaded: 3, total: 10 })
        expect(task.progress()).toBe(30)
        second.resolve(response())
        await retry
        expect(task.status).toBe(TaskStatus.success)
    })
})
