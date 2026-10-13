import {
  parseOwnerCutoverBinding, parseOwnerCutoverCommand, sameOwnerCutoverBinding,
  type OwnerCutoverBinding, type OwnerCutoverCommand, type OwnerCutoverFailureCode, type OwnerCutoverReport,
} from '../../client-feature/imOwnerCutoverContract';
import type { CommunicationMessageOwner } from './messageOwner';

type Options = Readonly<{
  binding: OwnerCutoverBinding;
  messages: CommunicationMessageOwner;
  isCurrent(): boolean;
  bridge: {
    onOwnerCutoverCommand(listener: (command: unknown) => void): () => void;
    reportOwnerCutoverResult(report: OwnerCutoverReport): Promise<boolean>;
  };
}>;
type Pending = {
  command: OwnerCutoverCommand; workSettled: boolean;
  work: Promise<void>; settleWork(): void;
};
const codes = new Set<OwnerCutoverFailureCode>([
  'owner_denied', 'owner_stale', 'owner_operation_failed', 'owner_protocol_invalid', 'owner_context_revoked',
]);
const failure = (code: OwnerCutoverFailureCode) => new Error(code);
const REQUEST_LIMIT = 512;

/** Main decides authority. This adapter validates command association and owns Web cleanup. */
export function installMessageOwnerEndpoint(options: Options) {
  const binding = parseOwnerCutoverBinding(options.binding);
  const seen = new Set<string>();
  const pending = new Map<string, Pending>();
  const cleanups = new Set<Promise<void>>();
  let prepared: { generation: number; requestId: string } | undefined;
  let disposed = false;
  let exhausted = false;
  let cleanupFailed = false;
  let generation = 0;
  let deniedThrough = 0;

  function current(): boolean {
    if (disposed) return false;
    try { return options.isCurrent(); } catch { return false; }
  }
  function activeAttempt(command: OwnerCutoverCommand): boolean {
    return current() && !cleanupFailed && command.generation === generation && command.generation > deniedThrough;
  }
  function clearPrepared(): void { prepared = undefined; }
  function observeCleanup(next: number): void {
    // Quiesce includes physical closure; revoke reports themselves never claim drain.
    let work: Promise<void>;
    try { work = options.messages.quiesce(next).then(() => undefined, () => { cleanupFailed = true; }); }
    catch { cleanupFailed = true; return; }
    cleanups.add(work);
    void work.then(() => { cleanups.delete(work); });
  }
  function denyAndClean(next: number): void {
    // Older completions cannot revoke a newer preparation/owner.
    const state = options.messages.snapshot();
    if (state.generation > next) return;
    clearPrepared();
    deniedThrough = Math.max(deniedThrough, next);
    try { options.messages.revoke(next); } catch { cleanupFailed = true; }
    observeCleanup(next);
  }
  function failed(command: OwnerCutoverCommand, code: OwnerCutoverFailureCode): OwnerCutoverReport {
    return { ...command, owner: 'web', status: 'failed', code };
  }
  async function report(value: OwnerCutoverReport): Promise<boolean> {
    try { return await options.bridge.reportOwnerCutoverResult(value) === true; }
    catch { return false; }
  }
  function workPending(): boolean {
    return [...pending.values()].some(value => !value.workSettled) || cleanups.size > 0;
  }

  async function execute(entry: Pending): Promise<void> {
    const command = entry.command;
    try {
      if (command.operation === 'quiesce') {
        clearPrepared();
        deniedThrough = Math.max(deniedThrough, command.generation);
        options.messages.revoke(command.generation);
        const preparing = [...pending.values()].filter(value => value !== entry &&
          (value.command.operation === 'prepare' || value.command.operation === 'grant'));
        let drained = await options.messages.quiesce(command.generation);
        if (preparing.length) {
          // Cancel is advisory. A late resource-creating operation must actually
          // settle, then every resource must be quiesced again before drain proof.
          await Promise.all(preparing.map(value => value.work));
          drained = await options.messages.quiesce(command.generation);
        }
        const state = options.messages.snapshot();
        if (!current() || generation !== command.generation || drained.owner !== 'web' ||
            drained.generation !== command.generation || drained.pendingCount !== 0 || drained.closed !== true ||
            drained.stopped !== true || drained.readAttentionRevoked !== true || state.generation !== command.generation ||
            state.phase !== 'quiescing' || state.pendingCount !== 0) throw failure('owner_context_revoked');
        entry.settleWork();
        cleanupFailed = false;
        await report({ ...command, operation: 'quiesce', owner: 'web', status: 'drained',
          pendingCount: 0, stopped: true, closed: true, readAttentionRevoked: true });
        return;
      }
      if (command.operation === 'prepare') {
        await options.messages.prepare(command.generation);
        const state = options.messages.snapshot();
        if (!activeAttempt(command) || state.phase !== 'preparing' ||
            state.generation !== command.generation || state.pendingCount !== 0) throw failure('owner_context_revoked');
        const preparation = { generation: command.generation, requestId: command.requestId };
        prepared = preparation;
        entry.settleWork();
        // Install association before sending: Main may grant before invoke resolves in Web.
        const accepted = await report({ ...command, operation: 'prepare', owner: 'web', status: 'ready', ready: true });
        if (!accepted || !activeAttempt(command)) {
          if (prepared === preparation) clearPrepared();
          denyAndClean(command.generation);
        }
        return;
      }
      if (command.operation === 'grant') {
        if (!activeAttempt(command) || !prepared || prepared.generation !== command.generation ||
            prepared.requestId !== command.prepareRequestId) throw failure('owner_denied');
        // Consume before activation, including partial activation failures and reentrant commands.
        clearPrepared();
        options.messages.grant(command.generation);
        const state = options.messages.snapshot();
        if (!activeAttempt(command) || state.phase !== 'active' || state.generation !== command.generation) {
          throw failure('owner_context_revoked');
        }
        entry.settleWork();
        const accepted = await report({ ...command, operation: 'grant', owner: 'web',
          status: 'granted', active: true });
        if (!accepted || !activeAttempt(command)) denyAndClean(command.generation);
        return;
      }
      clearPrepared();
      deniedThrough = Math.max(deniedThrough, command.generation);
      // Deny synchronously before publishing revoked. Cleanup has independent lifetime.
      options.messages.revoke(command.generation);
      observeCleanup(command.generation);
      entry.settleWork();
      await report({ ...command, operation: 'revoke', owner: 'web', status: 'revoked', readAttentionRevoked: true });
    } catch (error) {
      if (command.operation === 'prepare' || command.operation === 'grant') denyAndClean(command.generation);
      const code = error instanceof Error && codes.has(error.message as OwnerCutoverFailureCode)
        ? error.message as OwnerCutoverFailureCode : 'owner_operation_failed';
      entry.settleWork();
      await report(failed(command, code));
    } finally { entry.settleWork(); pending.delete(command.requestId); }
  }

  function accept(value: unknown): void {
    if (disposed) return;
    let command: OwnerCutoverCommand;
    try { command = parseOwnerCutoverCommand(value); } catch { return; }
    if (!sameOwnerCutoverBinding(binding, command) || seen.has(command.requestId)) return;
    if (!current()) { void report(failed(command, 'owner_context_revoked')); return; }
    if (exhausted || seen.size >= REQUEST_LIMIT) {
      exhausted = true;
      denyAndClean(Math.max(1, generation, options.messages.snapshot().generation));
      void report(failed(command, 'owner_denied'));
      return;
    }
    seen.add(command.requestId);
    const state = options.messages.snapshot();
    if (command.generation < Math.max(generation, state.generation)) {
      void report(failed(command, 'owner_stale')); return;
    }
    if (command.operation === 'prepare' &&
        (command.generation <= generation || workPending() || cleanupFailed || state.phase !== 'quiescing')) {
      void report(failed(command, 'owner_denied')); return;
    }
    if (command.operation === 'grant' && command.generation !== generation) {
      void report(failed(command, 'owner_stale')); return;
    }
    generation = command.generation;
    let finish!: () => void;
    const work = new Promise<void>(resolve => { finish = resolve; });
    const entry: Pending = { command, work, workSettled: false, settleWork() {
      if (entry.workSettled) return;
      entry.workSettled = true;
      finish();
    } };
    pending.set(command.requestId, entry);
    void execute(entry);
  }

  const off = options.bridge.onOwnerCutoverCommand(accept);
  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      denyAndClean(Math.max(1, generation, options.messages.snapshot().generation));
      // Unsubscription is not admission revocation or resource-close proof.
      // A broken bridge must still leave the owner denied and cleanup observed.
      try { off(); } catch { cleanupFailed = true; }
    },
    snapshot: () => Object.freeze({ valid: current() && !exhausted, generation, pendingCount: pending.size,
      preparedGeneration: prepared?.generation ?? null, cleanupPending: cleanups.size, cleanupFailed }),
  };
}
