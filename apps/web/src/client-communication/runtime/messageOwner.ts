import {
  createImOwnerAdmission, ImOwnerAdmissionError, type ImOwnerAdmission,
} from '@octo/base/src/im-runtime/ownerAdmission';
import { installImOwnerAdmission } from '@octo/base/src/im-runtime/ownerAdmissionHost';
import { installImReadAttentionGate, isImReadAttentionAllowed } from '@octo/base/src/im-runtime/readAttentionHost';

export interface MessageOwnerSdkLifecycle {
  quiesce(generation: number): Promise<{
    generation: number; pendingCount: number; stopped: boolean; closed: boolean;
  }>;
  prepare(generation: number): void | Promise<void>;
  grant(generation: number): void;
}

export interface WebMessageOwnerDrain {
  owner: 'web'; generation: number; pendingCount: 0;
  stopped: true; closed: true; readAttentionRevoked: true;
}

/** Install before WKApp.startup: SDK connect can run synchronously during startup. */
export function installCommunicationMessageOwner(
  createSdkLifecycle: (admission: ImOwnerAdmission) => MessageOwnerSdkLifecycle,
) {
  const admission = createImOwnerAdmission();
  installImOwnerAdmission(admission);
  let installedGate: ReturnType<typeof installImReadAttentionGate> | undefined;
  let sdk: MessageOwnerSdkLifecycle;
  try {
    installedGate = installImReadAttentionGate(false);
    sdk = createSdkLifecycle(admission);
  }
  catch (error) {
    admission.quiesce(1);
    installedGate?.setAllowed(false);
    throw error;
  }
  const gate = installedGate;
  let running: { generation: number; promise: Promise<WebMessageOwnerDrain> } | undefined;

  function revoke(generation?: number): number {
    const state = admission.snapshot();
    const next = generation ?? (state.phase === 'quiescing' ? state.generation : state.generation + 1);
    admission.quiesce(next);
    // Retain the gate for the lifetime of this realm, including logout and failed stop.
    gate.setAllowed(false);
    return next;
  }
  function quiesce(generation: number): Promise<WebMessageOwnerDrain> {
    if (running) {
      if (running.generation === generation) return running.promise;
      return Promise.reject(new ImOwnerAdmissionError('owner_denied'));
    }
    revoke(generation);
    const promise = drain(generation);
    const current = { generation, promise };
    running = current;
    const settled = () => { if (running === current) running = undefined; };
    void promise.then(settled, settled);
    return promise;
  }
  async function drain(generation: number): Promise<WebMessageOwnerDrain> {
    const report = await sdk.quiesce(generation);
    const state = admission.snapshot();
    if (report.generation !== generation || report.pendingCount !== 0 || report.stopped !== true || report.closed !== true ||
        state.generation !== generation || state.phase !== 'quiescing' || state.pendingCount !== 0 ||
        isImReadAttentionAllowed()) {
      throw new ImOwnerAdmissionError('owner_denied');
    }
    return { owner: 'web', generation, pendingCount: 0, stopped: true, closed: true, readAttentionRevoked: true };
  }
  return {
    snapshot: admission.snapshot,
    revoke,
    quiesce,
    stop: () => quiesce(revoke()),
    setReadAttention(allowed: boolean): void {
      gate.setAllowed(allowed && admission.snapshot().phase === 'active');
    },
    async prepare(generation: number): Promise<void> {
      if (running) throw new ImOwnerAdmissionError('owner_denied');
      await sdk.prepare(generation);
      const state = admission.snapshot();
      if (state.generation !== generation || state.phase !== 'preparing' || state.pendingCount) {
        throw new ImOwnerAdmissionError('owner_stale');
      }
      gate.setAllowed(false);
    },
    grant(generation: number): void {
      const state = admission.snapshot();
      if (running || state.phase !== 'preparing' || state.generation !== generation || state.pendingCount) {
        throw new ImOwnerAdmissionError('owner_stale');
      }
      try { sdk.grant(generation); }
      catch (error) {
        const next = revoke();
        // Partial activation is denied immediately. Observe its actual cleanup Promise.
        void quiesce(next).catch(() => {});
        throw error;
      }
      const active = admission.snapshot();
      if (active.phase !== 'active' || active.generation !== generation) {
        revoke();
        throw new ImOwnerAdmissionError('owner_stale');
      }
    },
  };
}

export type CommunicationMessageOwner = ReturnType<typeof installCommunicationMessageOwner>;
