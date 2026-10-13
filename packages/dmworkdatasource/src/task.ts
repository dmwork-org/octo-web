import { WKApp } from "@octo/base"
import axios from "axios"
import { MediaMessageContent, MessageTask, TaskStatus } from "wukongimjssdk"
import {
    beginUploadOwnerAttempt, captureUploadTaskContext, type UploadOwnerAttempt,
} from "./taskOwnerAttempt"

interface UploadCredentials {
    uploadUrl: string
    downloadUrl: string
    contentType: string
    contentDisposition?: string
    key: string
    expiredTime: number
}

interface UploadMediaContent extends MediaMessageContent {
    url?: string
}

export class MediaMessageUploadTask extends MessageTask {
    private _progress?: number
    private readonly originIsCurrent = captureUploadTaskContext()
    private activeAttempt?: UploadOwnerAttempt
    private activePromise?: Promise<void>

    getUUID() {
        const bytes = new Uint8Array(32)
        crypto.getRandomValues(bytes)
        return Array.from(bytes, byte => "0123456789ABCDEF"[byte % 16]).join("")
    }

    start(): Promise<void> {
        if (this.status === TaskStatus.cancel) return this.activePromise ?? Promise.resolve()
        return this.runAttempt(async attempt => {
            const mediaContent = this.message.content as UploadMediaContent
            if (mediaContent.file) {
                const ext = mediaContent.extension ? `.${mediaContent.extension}` : ""
                const path = `/${this.message.channel.channelType}/${this.message.channel.channelID}/${this.getUUID()}${ext}`
                const credentials = await this.getUploadCredentials(mediaContent.file, path, attempt.signal)
                if (!this.isCurrent(attempt)) return
                if (credentials) await this.performUpload(mediaContent.file, credentials, attempt)
                else this.publishStatus(TaskStatus.fail, attempt)
            } else {
                this.publishStatus(mediaContent.remoteUrl ? TaskStatus.success : TaskStatus.fail, attempt)
            }
        })
    }

    /** Direct callers receive the same admission and attempt guards as start(). */
    uploadFile(file: File, credentials: UploadCredentials): Promise<void> {
        if (this.status === TaskStatus.cancel) return this.activePromise ?? Promise.resolve()
        return this.runAttempt(attempt => this.performUpload(file, credentials, attempt))
    }

    private runAttempt(run: (attempt: UploadOwnerAttempt) => Promise<void>): Promise<void> {
        if (this.activePromise) return this.activePromise
        if (!this.originIsCurrent()) return Promise.resolve()
        let attempt: UploadOwnerAttempt
        try { attempt = beginUploadOwnerAttempt(this.originIsCurrent) }
        catch { return Promise.resolve() } // SDK starts tasks without observing a rejection.
        this.activeAttempt = attempt
        const work = Promise.resolve().then(async () => {
            try {
                if (this.isCurrent(attempt)) await run(attempt)
            } catch {
                // Cancellation or stale completion must never notify SDK task success/failure.
                if (this.isCurrent(attempt)) {
                    this.status = TaskStatus.fail
                    try { this.update() } catch { /* Do not reject a fire-and-forget SDK task. */ }
                }
            } finally {
                attempt.release()
                if (this.activeAttempt === attempt) {
                    this.activeAttempt = undefined
                    this.activePromise = undefined
                }
            }
        })
        this.activePromise = work
        return work
    }

    private isCurrent(attempt: UploadOwnerAttempt): boolean {
        return this.activeAttempt === attempt && attempt.isCurrent()
    }

    private publishStatus(status: TaskStatus, attempt: UploadOwnerAttempt): void {
        if (!this.isCurrent(attempt)) return
        this.status = status
        this.update() // SDK may synchronously enqueue send here; retain the ticket through it.
    }

    private async performUpload(file: File, credentials: UploadCredentials, attempt: UploadOwnerAttempt): Promise<void> {
        if (!this.isCurrent(attempt)) return
        const timeoutMs = Math.max(2 * 60 * 1000, file.size / (1024 * 1024) * 10 * 1000)
        const headers: Record<string, string> = { "Content-Type": credentials.contentType }
        if (credentials.contentDisposition) headers["Content-Disposition"] = credentials.contentDisposition
        const resp = await axios.put(credentials.uploadUrl, file, {
            headers,
            signal: attempt.signal,
            timeout: timeoutMs,
            onUploadProgress: event => {
                if (!this.isCurrent(attempt)) return
                if (event.total && event.total > 0) {
                    this._progress = Math.round(event.loaded / event.total * 100)
                    this.update()
                }
            },
        })
        if (!this.isCurrent(attempt)) return
        if (resp.status >= 200 && resp.status < 300) {
            const mediaContent = this.message.content as UploadMediaContent
            mediaContent.url = credentials.downloadUrl
            mediaContent.remoteUrl = credentials.downloadUrl
            this.publishStatus(TaskStatus.success, attempt)
        } else this.publishStatus(TaskStatus.fail, attempt)
    }

    async getUploadCredentials(file: File, path: string, signal?: AbortSignal): Promise<UploadCredentials | undefined> {
        const contentType = file.type || "application/octet-stream"
        const fileName = file.name || "file"
        const result = await WKApp.apiClient.get(
            `file/upload/credentials?path=${encodeURIComponent(path)}&type=chat&filename=${encodeURIComponent(fileName)}&contentType=${encodeURIComponent(contentType)}&fileSize=${file.size}`,
            { signal },
        )
        if (result && result.uploadUrl && result.downloadUrl) return result as UploadCredentials
    }

    suspend(): void {}
    resume(): void {}

    cancel(): void {
        const shouldNotify = this.activeAttempt ? this.isCurrent(this.activeAttempt) : this.originIsCurrent()
        this.activeAttempt?.cancel()
        this.status = TaskStatus.cancel
        if (shouldNotify) this.update()
    }

    progress(): number { return this._progress ?? 0 }

    /** Retry only after the previous credentials/PUT Promise has actually settled. */
    async restart(): Promise<void> {
        if (this.activePromise) return this.activePromise
        if (this.status === TaskStatus.processing || !this.originIsCurrent()) return
        this.status = TaskStatus.processing
        this._progress = 0
        this.update()
        await this.start()
    }
}
