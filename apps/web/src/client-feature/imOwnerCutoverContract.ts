import type { RuntimeScope } from './runtimeContract'

export type OwnerCutoverBinding = RuntimeScope & Readonly<{
  version: 1
  ownerCutoverVersion: 1
  bindingId: string
}>

export type OwnerCutoverOperation = 'quiesce' | 'prepare' | 'grant' | 'revoke'
export type OwnerCutoverReportStatus = 'drained' | 'ready' | 'granted' | 'revoked' | 'failed'
export type OwnerCutoverFailureCode =
  | 'owner_denied'
  | 'owner_stale'
  | 'owner_operation_failed'
  | 'owner_protocol_invalid'
  | 'owner_context_revoked'

type OwnerCutoverCommon = OwnerCutoverBinding & Readonly<{
  requestId: string
  generation: number
  operation: OwnerCutoverOperation
}>

export type OwnerCutoverCommand = OwnerCutoverCommon & Readonly<{
  operation: Exclude<OwnerCutoverOperation, 'grant'>
}> | OwnerCutoverCommon & Readonly<{
  operation: 'grant'
  prepareRequestId: string
}>

type OwnerCutoverReportBase = OwnerCutoverCommon & Readonly<{
  owner: 'web'
  status: OwnerCutoverReportStatus
}>

export type OwnerCutoverReport =
  | OwnerCutoverReportBase & Readonly<{
      operation: 'quiesce'
      status: 'drained'
      pendingCount: 0
      stopped: true
      closed: true
      readAttentionRevoked: true
    }>
  | OwnerCutoverReportBase & Readonly<{
      operation: 'prepare'
      status: 'ready'
      ready: true
    }>
  | OwnerCutoverReportBase & Readonly<{
      operation: 'grant'
      status: 'granted'
      prepareRequestId: string
      active: true
    }>
  | OwnerCutoverReportBase & Readonly<{
      operation: 'revoke'
      status: 'revoked'
      readAttentionRevoked: true
    }>
  | OwnerCutoverReportBase & Readonly<{
      operation: OwnerCutoverOperation
      status: 'failed'
      code: OwnerCutoverFailureCode
      prepareRequestId?: string
    }>

const bindingKeys = ['version', 'ownerCutoverVersion', 'ownerId', 'contextId', 'epoch', 'bindingId'] as const
const commonKeys = [...bindingKeys, 'requestId', 'generation', 'operation'] as const
const failures = new Set<OwnerCutoverFailureCode>([
  'owner_denied', 'owner_stale', 'owner_operation_failed', 'owner_protocol_invalid', 'owner_context_revoked',
])

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('Invalid owner cutover object')
  }
  const input = value as Record<string, unknown>
  onlyKeys(input, keys)
  return input
}

function onlyKeys(input: Record<string, unknown>, keys: readonly string[]): void {
  if (Reflect.ownKeys(input).some(key => typeof key !== 'string' || !keys.includes(key))) throw new Error('Unexpected owner cutover field')
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256) throw new Error(`Invalid owner cutover ${label}`)
  return value
}

function generation(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid owner cutover generation')
  return value
}

function bindingFrom(input: Record<string, unknown>): OwnerCutoverBinding {
  if (input.version !== 1 || input.ownerCutoverVersion !== 1) throw new Error('Unsupported owner cutover capability')
  if (typeof input.epoch !== 'number' || !Number.isSafeInteger(input.epoch) || input.epoch < 0) {
    throw new Error('Invalid owner cutover epoch')
  }
  return Object.freeze({
    version: 1,
    ownerCutoverVersion: 1,
    ownerId: identifier(input.ownerId, 'ownerId'),
    contextId: identifier(input.contextId, 'contextId'),
    epoch: input.epoch,
    bindingId: identifier(input.bindingId, 'bindingId'),
  })
}

export function parseOwnerCutoverBinding(value: unknown): OwnerCutoverBinding {
  return bindingFrom(record(value, bindingKeys))
}

export function sameOwnerCutoverBinding(a: RuntimeScope & { bindingId?: string }, b: RuntimeScope & { bindingId?: string }): boolean {
  return a.ownerId === b.ownerId && a.contextId === b.contextId && a.epoch === b.epoch && a.bindingId === b.bindingId
}

function commonFrom(value: unknown, allowed: readonly string[]): { input: Record<string, unknown>; binding: OwnerCutoverBinding } {
  const input = record(value, allowed)
  return { input, binding: bindingFrom(input) }
}

export function parseOwnerCutoverCommand(value: unknown): OwnerCutoverCommand {
  const { input, binding } = commonFrom(value, [...commonKeys, 'prepareRequestId'])
  const requestId = identifier(input.requestId, 'requestId')
  const nextGeneration = generation(input.generation)
  if (input.operation === 'grant') {
    if (!input.prepareRequestId) throw new Error('Owner grant requires prepareRequestId')
    return Object.freeze({ ...binding, requestId, generation: nextGeneration, operation: 'grant', prepareRequestId: identifier(input.prepareRequestId, 'prepareRequestId') })
  }
  if (input.operation !== 'quiesce' && input.operation !== 'prepare' && input.operation !== 'revoke') {
    throw new Error('Invalid owner cutover operation')
  }
  if (Object.prototype.hasOwnProperty.call(input, 'prepareRequestId')) throw new Error('Unexpected prepareRequestId')
  return Object.freeze({ ...binding, requestId, generation: nextGeneration, operation: input.operation })
}

export function parseOwnerCutoverReport(value: unknown): OwnerCutoverReport {
  const { input, binding } = commonFrom(value, [...commonKeys, 'owner', 'status', 'pendingCount', 'stopped', 'closed', 'readAttentionRevoked', 'ready', 'prepareRequestId', 'active', 'code'])
  const common = { ...binding, requestId: identifier(input.requestId, 'requestId'), generation: generation(input.generation), operation: input.operation as OwnerCutoverOperation, owner: input.owner as 'web', status: input.status as OwnerCutoverReportStatus }
  if (input.owner !== 'web') throw new Error('Invalid owner cutover report owner')
  if (input.operation !== 'quiesce' && input.operation !== 'prepare' && input.operation !== 'grant' && input.operation !== 'revoke') throw new Error('Invalid owner cutover operation')
  if (input.status === 'failed') {
    onlyKeys(input, [...commonKeys, 'owner', 'status', 'code', ...(input.operation === 'grant' ? ['prepareRequestId'] : [])])
    if (!failures.has(input.code as OwnerCutoverFailureCode)) throw new Error('Invalid owner cutover failure code')
    if (input.operation === 'grant' && typeof input.prepareRequestId !== 'string') throw new Error('Failed grant requires prepareRequestId')
    return Object.freeze({ ...common, status: 'failed', code: input.code as OwnerCutoverFailureCode, ...(input.prepareRequestId === undefined ? {} : { prepareRequestId: identifier(input.prepareRequestId, 'prepareRequestId') }) }) as OwnerCutoverReport
  }
  if (input.operation === 'quiesce' && input.status === 'drained' && input.pendingCount === 0 && input.stopped === true && input.closed === true && input.readAttentionRevoked === true) {
    onlyKeys(input, [...commonKeys, 'owner', 'status', 'pendingCount', 'stopped', 'closed', 'readAttentionRevoked'])
    return Object.freeze({ ...common, operation: 'quiesce', status: 'drained', pendingCount: 0, stopped: true, closed: true, readAttentionRevoked: true }) as OwnerCutoverReport
  }
  if (input.operation === 'prepare' && input.status === 'ready' && input.ready === true) {
    onlyKeys(input, [...commonKeys, 'owner', 'status', 'ready'])
    return Object.freeze({ ...common, operation: 'prepare', status: 'ready', ready: true }) as OwnerCutoverReport
  }
  if (input.operation === 'grant' && input.status === 'granted' && input.prepareRequestId !== undefined && input.active === true) {
    onlyKeys(input, [...commonKeys, 'owner', 'status', 'prepareRequestId', 'active'])
    return Object.freeze({ ...common, operation: 'grant', status: 'granted', prepareRequestId: identifier(input.prepareRequestId, 'prepareRequestId'), active: true }) as OwnerCutoverReport
  }
  if (input.operation === 'revoke' && input.status === 'revoked' && input.readAttentionRevoked === true) {
    onlyKeys(input, [...commonKeys, 'owner', 'status', 'readAttentionRevoked'])
    return Object.freeze({ ...common, operation: 'revoke', status: 'revoked', readAttentionRevoked: true }) as OwnerCutoverReport
  }
  throw new Error('Invalid owner cutover report evidence')
}
