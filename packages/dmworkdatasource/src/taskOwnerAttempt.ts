import {
    beginImOwnerOperation, captureCurrentImConversationSyncContext,
    captureImOwnerWorkContext,
} from "@octo/base"

export interface UploadOwnerAttempt {
    readonly signal: AbortSignal
    isCurrent(): boolean
    cancel(): void
    release(): void
}

/** A task belongs to its originating account/Space and owner, including retries. */
export function captureUploadTaskContext(): () => boolean {
    const ownerIsCurrent = captureImOwnerWorkContext()
    const contextIsCurrent = captureCurrentImConversationSyncContext()
    return () => ownerIsCurrent() && contextIsCurrent()
}

/** Abort requests cancellation; the caller releases only after actual work settles. */
export function beginUploadOwnerAttempt(originIsCurrent: () => boolean): UploadOwnerAttempt {
    const controller = new AbortController()
    let cancelled = false
    let released = false
    const cancel = () => {
        cancelled = true
        controller.abort()
    }
    const operation = beginImOwnerOperation("upload", cancel)
    return {
        signal: controller.signal,
        isCurrent: () => !cancelled && !released && operation.isCurrent() && originIsCurrent(),
        cancel,
        release() {
            if (released) return
            released = true
            operation.release()
        },
    }
}
