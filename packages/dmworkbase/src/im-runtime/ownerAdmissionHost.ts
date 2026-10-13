import {
    ImOwnerAdmissionError, type ImOwnerAdmission, type ImOwnerOperation, type ImOwnerOperationKind,
} from './ownerAdmission'

let installed: ImOwnerAdmission | undefined

/** Install before startup/connection. A realm has at most one message owner. */
export function installImOwnerAdmission(admission: ImOwnerAdmission): void {
    if (installed) throw new ImOwnerAdmissionError('owner_denied')
    installed = admission
}

export function isImOwnerWorkAllowed(): boolean {
    return !installed || installed.snapshot().phase === 'active'
}

/** Capture without counting work; useful for deferred publication and viewport callbacks. */
export function captureImOwnerWorkContext(): () => boolean {
    const owner = installed
    const generation = owner?.snapshot().generation
    const allowed = !owner || owner.snapshot().phase === 'active'
    return () => allowed && installed === owner && (!owner || (
        owner.snapshot().phase === 'active' && owner.snapshot().generation === generation
    ))
}

/** Ordinary Web remains allowed, but a later host install invalidates old work. */
export function beginImOwnerOperation(kind: ImOwnerOperationKind, onQuiesce?: () => void): ImOwnerOperation {
    if (installed) return installed.begin(kind, onQuiesce)
    let released = false
    const ticket: ImOwnerOperation = {
        generation: 0,
        isCurrent: () => !released && !installed,
        assertCurrent() {
            if (!ticket.isCurrent()) throw new ImOwnerAdmissionError('owner_stale')
        },
        release: () => { released = true },
    }
    return ticket
}

/** Keep the ticket until the real Promise settles; ignore neither failure nor stale completion. */
export async function withImOwnerOperation<T>(
    kind: ImOwnerOperationKind,
    run: (operation: ImOwnerOperation) => T | Promise<T>,
): Promise<T> {
    const operation = beginImOwnerOperation(kind)
    try {
        operation.assertCurrent()
        const value = await run(operation)
        operation.assertCurrent()
        return value
    } finally {
        operation.release()
    }
}

/** Only release a drained, denied host. Production teardown retains deny for the realm. */
export function uninstallImOwnerAdmission(admission: ImOwnerAdmission): void {
    if (installed !== admission) return
    const state = admission.snapshot()
    if (state.phase === 'active' || state.pendingCount) throw new ImOwnerAdmissionError('owner_denied')
    installed = undefined
}
