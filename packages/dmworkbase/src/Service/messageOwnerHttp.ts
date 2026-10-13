import { ImOwnerAdmissionError, type ImOwnerOperationKind } from '../im-runtime/ownerAdmission'
import { beginImOwnerOperation } from '../im-runtime/ownerAdmissionHost'

/** Includes direct conversation mutations, global searches, extras and reminders. */
export function messageOwnerHttpKind(path: string): ImOwnerOperationKind | undefined {
    // Absolute API URLs and the relative /api/v1, /v1 forms use the same boundary.
    let pathname: string
    try { pathname = new URL(path, 'https://local.invalid/').pathname }
    catch { return undefined }
    const relative = pathname.replace(/^\/(?:api\/)?v1\//, '/').replace(/^\//, '')
    if (/^message\/readed(?:\/|$)/.test(relative)) return 'receipt'
    if (/^conversation\/clearUnread(?:\/|$)/.test(relative)) return 'read'
    if (/^(?:message|messages)(?:\/|$)/.test(relative)) return 'history'
    if (/^(?:conversation|conversations)(?:\/|$)/.test(relative)) return 'conversation'
    return undefined
}

export async function runMessageOwnerHttp<T>(options: {
    path: string
    captureContext: () => () => boolean
    run: (isCurrent?: () => boolean) => Promise<T>
}): Promise<T> {
    const kind = messageOwnerHttpKind(options.path)
    if (!kind) return options.run()
    const operation = beginImOwnerOperation(kind)
    const context = options.captureContext()
    const isCurrent = () => operation.isCurrent() && context()
    try {
        if (!isCurrent()) throw new ImOwnerAdmissionError('owner_stale')
        const response = await options.run(isCurrent)
        if (!isCurrent()) throw new ImOwnerAdmissionError('owner_stale')
        return response
    } catch (error) {
        if (!isCurrent()) throw new ImOwnerAdmissionError('owner_stale')
        throw error
    } finally {
        operation.release()
    }
}

/** Internal callback is never serialized as a header/body. */
export function assertMessageOwnerHttpCurrent(isCurrent?: () => boolean): void {
    if (isCurrent && !isCurrent()) throw new ImOwnerAdmissionError('owner_stale')
}
