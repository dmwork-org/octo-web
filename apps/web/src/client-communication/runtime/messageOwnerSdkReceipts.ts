import type WKSDK from 'wukongimjssdk';
import { Channel, type Message } from 'wukongimjssdk';
import { type ImOwnerAdmission, type ImOwnerOperation } from '@octo/base/src/im-runtime/ownerAdmission';
import { clearSdkOwnerTimer, type SdkOwnerReceipt } from './messageOwnerSdkBoundary';

/** Queued intent and in-flight receipt HTTP are independently owned and drained. */
export function installMessageOwnerSdkReceipts(
  sdk: WKSDK, admission: ImOwnerAdmission, state: SdkOwnerReceipt, captureContext: () => () => boolean,
) {
  const receipts = sdk.receiptManager;
  const queued = new Map<ImOwnerOperation, { key: string; messages: Message[]; contextCurrent: () => boolean }>();
  const pending = new Map<string, Promise<void>>();
  const originalAdd = receipts.addReceiptMessages.bind(receipts);
  function retireQueue(): void {
    for (const [ticket, batch] of queued) {
      const cache = state.channelMessagesMap.get(batch.key) ?? [];
      if (!batch.messages.some(message => cache.includes(message))) {
        queued.delete(ticket);
        ticket.release();
      }
    }
  }
  receipts.addReceiptMessages = (channel, messages) => {
    const contextCurrent = captureContext();
    const ticket = admission.begin('receipt');
    try {
      const unread = messages.filter(message => !message.remoteExtra.readed);
      originalAdd(channel, unread);
      if (unread.length) queued.set(ticket, { key: channel.getChannelKey(), messages: unread, contextCurrent });
      else ticket.release();
    } catch (error) {
      ticket.release();
      throw error;
    }
  };
  state.flush = key => {
    if (admission.snapshot().phase !== 'active' || pending.has(key)) return;
    for (const [ticket, batch] of queued) {
      if (ticket.isCurrent() && batch.contextCurrent()) continue;
      const stale = new Set(batch.messages);
      const cache = state.channelMessagesMap.get(batch.key) ?? [];
      state.channelMessagesMap.set(batch.key, cache.filter(message => !stale.has(message)));
      queued.delete(ticket);
      ticket.release();
    }
    const batch = [...(state.channelMessagesMap.get(key) ?? [])];
    if (!batch.length) return;
    const provider = sdk.config.provider;
    const callback = provider.messageReadedCallback;
    if (!callback) return;
    const contextCurrent = captureContext();
    const ticket = admission.begin('receipt');
    const channel = Channel.fromChannelKey(key);
    if (!channel) { ticket.release(); return; }
    const submittedChannel: Channel = channel;
    const submit = callback;
    // Set the in-flight sentinel before calling the provider, which may reenter flush.
    let resolveRaw!: () => void;
    const sentinel = new Promise<void>(resolve => { resolveRaw = resolve; });
    pending.set(key, sentinel);
    const work = run();
    pending.set(key, work);
    void work.then(() => {
      if (pending.get(key) === work) pending.delete(key);
      resolveRaw();
    });
    async function run(): Promise<void> {
      try {
        await submit.call(provider, submittedChannel, batch);
        if (!ticket.isCurrent() || !contextCurrent() || sdk.config.provider !== provider || provider.messageReadedCallback !== callback) return;
        const cache = state.channelMessagesMap.get(key);
        if (cache) {
          // Remove exactly the submitted identities; never consume a later generation's first N entries.
          const submitted = new Set(batch);
          state.channelMessagesMap.set(key, cache.filter(message => !submitted.has(message)));
        }
        retireQueue();
        for (const listener of [...receipts.listeners]) {
          if (!ticket.isCurrent() || !contextCurrent()) return;
          listener(submittedChannel, batch);
        }
      } catch {
        // Failure remains queued while active. No accepted notification or unhandled rejection.
      } finally {
        ticket.release();
      }
    }
  };
  state.flushLoop = () => {
    if (admission.snapshot().phase !== 'active') return;
    for (const key of state.channelMessagesMap.keys()) state.flush(key);
  };
  state.setup = interval => {
    clearSdkOwnerTimer(state.timer);
    state.timer = undefined;
    if (admission.snapshot().phase !== 'active') return;
    const generation = admission.snapshot().generation;
    state.timer = setInterval(() => {
      const current = admission.snapshot();
      if (current.phase === 'active' && current.generation === generation) state.flushLoop();
    }, interval);
  };
  state.setup(sdk.config.receiptFlushInterval);
  return {
    start: () => state.setup(sdk.config.receiptFlushInterval),
    stop(): void {
      clearSdkOwnerTimer(state.timer);
      state.timer = undefined;
      state.channelMessagesMap.clear();
      for (const ticket of queued.keys()) ticket.release();
      queued.clear();
    },
  };
}
