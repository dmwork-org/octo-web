/** Admission is independent of SDK, HTTP, React and the host IPC protocol. */
export type ImOwnerOperationKind = 'connect' | 'send' | 'history' | 'conversation' | 'read' | 'receipt' | 'upload'
export type ImOwnerAdmissionPhase = 'active' | 'quiescing' | 'preparing'

export class ImOwnerAdmissionError extends Error {
    readonly code: 'owner_denied' | 'owner_stale'
    constructor(code: 'owner_denied' | 'owner_stale') {
        super(code)
        this.name = 'ImOwnerAdmissionError'
        this.code = code
    }
}

export interface ImOwnerOperation {
    readonly generation: number
    isCurrent(): boolean
    assertCurrent(): void
    release(): void
}

export interface ImOwnerAdmissionSnapshot {
    generation: number
    phase: ImOwnerAdmissionPhase
    pendingCount: number
}

export interface ImOwnerAdmission {
    snapshot(): ImOwnerAdmissionSnapshot
    begin(kind: ImOwnerOperationKind, onQuiesce?: () => void): ImOwnerOperation
    quiesce(generation: number): void
    prepare(generation: number): void
    activate(generation: number): void
    waitForDrain(): Promise<void>
}

function validGeneration(value: number): boolean {
    return Number.isSafeInteger(value) && value >= 0
}

/** generation 0 represents the existing Web owner before the first cutover. */
export function createImOwnerAdmission(): ImOwnerAdmission {
    let generation = 0
    let phase: ImOwnerAdmissionPhase = 'active'
    const operations = new Map<ImOwnerOperation, { kind: ImOwnerOperationKind; cancel?: () => void }>()
    const waiters = new Set<() => void>()

    function requireGeneration(next: number): void {
        if (!validGeneration(next) || next <= generation) throw new ImOwnerAdmissionError('owner_stale')
    }
    return {
        snapshot: () => ({ generation, phase, pendingCount: operations.size }),
        begin(kind, onQuiesce) {
            if (phase !== 'active') throw new ImOwnerAdmissionError('owner_denied')
            const capturedGeneration = generation
            let released = false
            const ticket: ImOwnerOperation = {
                generation: capturedGeneration,
                isCurrent: () => !released && phase === 'active' && generation === capturedGeneration,
                assertCurrent() {
                    if (!ticket.isCurrent()) throw new ImOwnerAdmissionError('owner_stale')
                },
                release() {
                    if (released) return
                    released = true
                    operations.delete(ticket)
                    if (operations.size === 0) {
                        const pending = Array.from(waiters)
                        waiters.clear()
                        for (const resolve of pending) resolve()
                    }
                },
            }
            operations.set(ticket, { kind, cancel: onQuiesce })
            return ticket
        },
        quiesce(next) {
            if (phase === 'quiescing' && next === generation) return
            requireGeneration(next)
            // Revoke before invoking callbacks: reentrant work is denied too.
            generation = next
            phase = 'quiescing'
            for (const [ticket, entry] of Array.from(operations)) {
                if (!operations.has(ticket)) continue
                // Cancellation is a request, never settlement or drain evidence.
                try { entry.cancel?.() } catch { /* The ticket remains pending. */ }
            }
        },
        prepare(next) {
            if (operations.size || phase !== 'quiescing') throw new ImOwnerAdmissionError('owner_denied')
            requireGeneration(next)
            generation = next
            phase = 'preparing'
        },
        activate(next) {
            if (phase !== 'preparing' || next !== generation || operations.size) {
                throw new ImOwnerAdmissionError('owner_stale')
            }
            phase = 'active'
        },
        waitForDrain() {
            if (operations.size === 0) return Promise.resolve()
            return new Promise<void>(resolve => waiters.add(resolve))
        },
    }
}
