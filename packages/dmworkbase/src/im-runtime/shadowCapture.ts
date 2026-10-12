/**
 * Transport-neutral shadow capture for the Communication owner.
 *
 * The recorder is deliberately independent from WKSDK, React, and the
 * renderer store.  Runtime adapters feed it already-normalized protocol and
 * projection facts; the resulting JSON can be replayed by the Client
 * ShadowProjection without giving the Client access to Web objects.
 */

export type ShadowCaptureChannel = {
  id: string
  type: number
}

export type ShadowCaptureScope = {
  server: string
  account: string
  organization?: string
  space?: string
  channel?: ShadowCaptureChannel
  epoch: number
  sessionId?: string
  authGeneration?: string | number
  credentialFingerprint?: string
  transitionGeneration?: number
}

export type ShadowCaptureMessage = {
  id: string
  sequence: number
  clientMsgNo?: string
  timestamp?: number
  channel?: ShadowCaptureChannel
  fromUid?: string
  toUid?: string
  payload: unknown
  deleted?: boolean
  revoked?: boolean
  messageExtra?: unknown
  remoteExtra?: unknown
  reactions?: unknown
  header?: unknown
  setting?: unknown
  contentType?: string | number
  status?: string | number
  noPersist?: boolean
  streamNo?: string | number
  streamSeq?: number
  stream?: unknown
}

export type ShadowCaptureConversation = {
  channel: ShadowCaptureChannel
  lastMessageId?: string
  lastMessageSequence?: number
  archived?: boolean
  pinned?: boolean
  version?: number
}

export type ShadowCaptureUnread = {
  channel: ShadowCaptureChannel
  status: 'ready' | 'stale' | 'loading' | 'unavailable'
  count: number | null
  readSequence?: number
  version?: number
}

export type ShadowCaptureCommandOutcome = {
  command: 'send' | 'history' | 'read' | 'reconnect'
  status: 'accepted' | 'rejected' | 'unknown' | 'failed'
  clientMsgNo?: string
  channel?: ShadowCaptureChannel
  errorCode?: string
  detail?: unknown
}

export type ShadowCaptureEvent =
  | { type: 'scope.open'; scope: ShadowCaptureScope }
  | { type: 'scope.switch'; scope: ShadowCaptureScope }
  | { type: 'message.upsert'; scope: ShadowCaptureScope; message: ShadowCaptureMessage; source: 'history' | 'realtime' | 'local' }
  | { type: 'conversation.upsert'; scope: ShadowCaptureScope; conversation: ShadowCaptureConversation; source: 'history' | 'realtime' | 'local' }
  | { type: 'unread.set'; scope: ShadowCaptureScope; unread: ShadowCaptureUnread; source: 'history' | 'realtime' | 'local' }
  | { type: 'unread.read'; scope: ShadowCaptureScope; channel: ShadowCaptureChannel; readSequence: number }
  | { type: 'command.outcome'; scope: ShadowCaptureScope; outcome: ShadowCaptureCommandOutcome }

export type ShadowCaptureManifest = {
  schemaVersion: 1
  artifact: {
    name: string
    version: string
    commit: string
    contractRevision: number
    digest?: string
  }
  sdk?: { name: string; version: string }
  server?: { revision?: string; capabilityRevision?: string }
  redaction: 'plain-dto-v1'
}

export type ShadowCaptureDocument = {
  manifest: ShadowCaptureManifest
  events: readonly ShadowCaptureEvent[]
}

export interface ShadowCaptureBindings {
  getScope(): ShadowCaptureScope | undefined
  onScopeChange?(listener: (scope: ShadowCaptureScope) => void): () => void
  onMessage?(listener: (event: Extract<ShadowCaptureEvent, { type: 'message.upsert' }>) => void): () => void
  onConversation?(listener: (event: Extract<ShadowCaptureEvent, { type: 'conversation.upsert' }>) => void): () => void
  onUnread?(listener: (event: Extract<ShadowCaptureEvent, { type: 'unread.set' }>) => void): () => void
  onRead?(listener: (event: Extract<ShadowCaptureEvent, { type: 'unread.read' }>) => void): () => void
  onCommandOutcome?(listener: (event: Extract<ShadowCaptureEvent, { type: 'command.outcome' }>) => void): () => void
}

export class ShadowTraceRecorder {
  private readonly events: ShadowCaptureEvent[] = []

  constructor(readonly manifest: ShadowCaptureManifest) {}

  record(event: ShadowCaptureEvent): void {
    this.events.push(clonePlain(event) as ShadowCaptureEvent)
  }

  getEvents(): readonly ShadowCaptureEvent[] {
    return this.events.map(event => clonePlain(event) as ShadowCaptureEvent)
  }

  toDocument(): ShadowCaptureDocument {
    return {
      manifest: clonePlain(this.manifest),
      events: this.getEvents(),
    }
  }
}

/** Attach read-only listeners to the existing Web owner. */
export function attachShadowTraceCapture(
  recorder: ShadowTraceRecorder,
  bindings: ShadowCaptureBindings,
): () => void {
  const cleanups: Array<() => void> = []
  const initial = bindings.getScope()
  if (initial) recorder.record({ type: 'scope.open', scope: initial })

  if (bindings.onScopeChange) {
    let current = initial
    cleanups.push(bindings.onScopeChange(scope => {
      recorder.record({ type: current ? 'scope.switch' : 'scope.open', scope })
      current = scope
    }))
  }
  if (bindings.onMessage) cleanups.push(bindings.onMessage(event => recorder.record(event)))
  if (bindings.onConversation) cleanups.push(bindings.onConversation(event => recorder.record(event)))
  if (bindings.onUnread) cleanups.push(bindings.onUnread(event => recorder.record(event)))
  if (bindings.onRead) cleanups.push(bindings.onRead(event => recorder.record(event)))
  if (bindings.onCommandOutcome) cleanups.push(bindings.onCommandOutcome(event => recorder.record(event)))

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  }
}

function clonePlain<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'function' ? undefined as T : value
  }
  if (seen.has(value)) return undefined as T
  seen.add(value)
  if (Array.isArray(value)) return value.map(item => clonePlain(item, seen)) as T
  if (value instanceof Date) return value.toISOString() as T
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'function' || typeof item === 'symbol' || item === undefined) continue
    output[key] = clonePlain(item, seen)
  }
  return output as T
}
