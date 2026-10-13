import { afterEach, vi } from 'vitest';
import { createImOwnerAdmission } from '@octo/base/src/im-runtime/ownerAdmission';
import type { OwnerCutoverBinding, OwnerCutoverCommand, OwnerCutoverReport } from '../../client-feature/imOwnerCutoverContract';
import type { CommunicationMessageOwner, WebMessageOwnerDrain } from './messageOwner';
import { installMessageOwnerEndpoint } from './messageOwnerEndpoint';

export const binding: OwnerCutoverBinding = {
  version: 1, ownerCutoverVersion: 1, ownerId: 'owner', contextId: 'context', epoch: 4, bindingId: 'view',
};
export function command(operation: OwnerCutoverCommand['operation'], generation: number,
  requestId: string = operation, prepareRequestId = 'prepare'): OwnerCutoverCommand {
  const common = { ...binding, operation, generation, requestId };
  return operation === 'grant' ? { ...common, operation, prepareRequestId } : { ...common, operation };
}
export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}
export function drain(generation: number): WebMessageOwnerDrain {
  return { owner: 'web', generation, pendingCount: 0, stopped: true, closed: true, readAttentionRevoked: true };
}
const fixtures: Array<{ endpoint: ReturnType<typeof installMessageOwnerEndpoint> }> = [];
afterEach(async () => {
  for (const h of fixtures.splice(0)) h.endpoint.dispose();
  await flush();
});

export function fixture() {
  const admission = createImOwnerAdmission();
  const context = { current: true };
  let listener: ((value: unknown) => void) | undefined;
  const messages: CommunicationMessageOwner = {
    snapshot: admission.snapshot,
    revoke: vi.fn((next?: number) => {
      const state = admission.snapshot();
      const generation = next ?? (state.phase === 'quiescing' ? state.generation : state.generation + 1);
      admission.quiesce(generation);
      return generation;
    }),
    quiesce: vi.fn(async generation => {
      admission.quiesce(generation);
      await admission.waitForDrain();
      return drain(generation);
    }),
    prepare: vi.fn(async generation => admission.prepare(generation)),
    grant: vi.fn(generation => admission.activate(generation)),
    stop: vi.fn(async () => drain(admission.snapshot().generation)),
    setReadAttention: vi.fn(),
  };
  const off = vi.fn(() => { listener = undefined; });
  const bridge = {
    onOwnerCutoverCommand: vi.fn((fn: (value: unknown) => void) => { listener = fn; return off; }),
    reportOwnerCutoverResult: vi.fn(async (_report: OwnerCutoverReport) => true),
  };
  const endpoint = installMessageOwnerEndpoint({ binding, messages, bridge, isCurrent: () => context.current });
  const h = { admission, context, messages, bridge, endpoint, off,
    emit: (value: unknown) => listener?.(value),
    reports: () => bridge.reportOwnerCutoverResult.mock.calls.map(([value]) => value),
  };
  fixtures.push(h);
  return h;
}
export async function preparedFixture() {
  const h = fixture();
  h.emit(command('quiesce', 1));
  await flush();
  h.emit(command('prepare', 2));
  await flush();
  return h;
}
