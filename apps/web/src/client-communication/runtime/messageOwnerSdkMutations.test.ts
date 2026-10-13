import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Channel, ChannelInfo, Conversation, ConversationExtra, Message, Reminder, Subscriber } from 'wukongimjssdk';
import { readSdkOwnerState } from './messageOwnerSdkBoundary';
import { deferred, sdkOwnerFixture, settleMicrotasks } from './messageOwnerSdkFixture';

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const channel = new Channel('peer', 1);
function receiptMessage(id: string): Message {
  const message = new Message();
  message.clientMsgNo = id;
  message.channel = channel;
  message.remoteExtra.readed = false;
  return message;
}

describe('Web SDK receipt intent and real HTTP drain', () => {
  it('serializes slow per-channel HTTP and preserves newly queued intent', async () => {
    const h = sdkOwnerFixture();
    const request = deferred<void>();
    const callback = vi.fn(() => request.promise);
    h.sdk.config.provider.messageReadedCallback = callback;
    const accepted = vi.fn();
    h.sdk.receiptManager.addListener(accepted);
    const state = readSdkOwnerState(h.sdk).receipt;
    const first = receiptMessage('first');
    h.sdk.receiptManager.addReceiptMessages(channel, [first]);
    expect(h.admission.snapshot().pendingCount).toBe(1);
    state.flush(channel.getChannelKey());
    state.flush(channel.getChannelKey());
    expect(callback).toHaveBeenCalledOnce();
    expect(h.admission.snapshot().pendingCount).toBe(2);
    const next = receiptMessage('next');
    h.sdk.receiptManager.addReceiptMessages(channel, [next]);
    request.resolve();
    await settleMicrotasks();
    expect(accepted).toHaveBeenCalledWith(expect.objectContaining({ channelID: 'peer' }), [first]);
    expect(state.channelMessagesMap.get(channel.getChannelKey())).toEqual([next]);
    expect(h.admission.snapshot().pendingCount).toBe(1);
    await h.lifecycle.quiesce(1);
  });

  it('keeps HTTP pending after queue disposal and never publishes its stale success', async () => {
    const h = sdkOwnerFixture();
    const request = deferred<void>();
    h.sdk.config.provider.messageReadedCallback = () => request.promise;
    const accepted = vi.fn();
    h.sdk.receiptManager.addListener(accepted);
    const state = readSdkOwnerState(h.sdk).receipt;
    h.sdk.receiptManager.addReceiptMessages(channel, [receiptMessage('pending')]);
    state.flush(channel.getChannelKey());
    const stop = h.lifecycle.quiesce(1);
    expect(state.channelMessagesMap.size).toBe(0);
    expect(h.admission.snapshot().pendingCount).toBe(1);
    let finished = false;
    void stop.then(() => { finished = true; });
    await settleMicrotasks();
    expect(finished).toBe(false);
    request.resolve();
    await stop;
    expect(accepted).not.toHaveBeenCalled();
  });

  it('observes HTTP failure, retains current queued intent, and emits no accepted notification', async () => {
    const h = sdkOwnerFixture();
    h.sdk.config.provider.messageReadedCallback = vi.fn().mockRejectedValue(new Error('private HTTP failure'));
    const accepted = vi.fn();
    h.sdk.receiptManager.addListener(accepted);
    const state = readSdkOwnerState(h.sdk).receipt;
    const message = receiptMessage('failed');
    h.sdk.receiptManager.addReceiptMessages(channel, [message]);
    state.flush(channel.getChannelKey());
    await settleMicrotasks();
    expect(state.channelMessagesMap.get(channel.getChannelKey())).toEqual([message]);
    expect(h.admission.snapshot().pendingCount).toBe(1);
    expect(accepted).not.toHaveBeenCalled();
    await h.lifecycle.quiesce(1);
  });

  it('drops queued intent from an old Space and rejects in-flight success after A→B→A', async () => {
    let revision = 0;
    const h = sdkOwnerFixture({ captureContext: () => { const origin = revision; return () => revision === origin; } });
    const state = readSdkOwnerState(h.sdk).receipt;
    const callback = vi.fn().mockResolvedValue(undefined);
    h.sdk.config.provider.messageReadedCallback = callback;
    const accepted = vi.fn();
    h.sdk.receiptManager.addListener(accepted);
    h.sdk.receiptManager.addReceiptMessages(channel, [receiptMessage('old queued')]);
    revision++;
    state.flush(channel.getChannelKey());
    expect(callback).not.toHaveBeenCalled();
    expect(h.admission.snapshot().pendingCount).toBe(0);
    const request = deferred<void>();
    callback.mockReturnValue(request.promise);
    h.sdk.receiptManager.addReceiptMessages(channel, [receiptMessage('old HTTP')]);
    state.flush(channel.getChannelKey());
    revision++;
    revision++;
    request.resolve();
    await settleMicrotasks();
    expect(accepted).not.toHaveBeenCalled();
    state.flush(channel.getChannelKey());
    expect(callback).toHaveBeenCalledOnce();
    expect(h.admission.snapshot().pendingCount).toBe(0);
    await h.lifecycle.quiesce(1);
  });
});

describe('Web SDK provider continuation admission and publication', () => {
  it('guards reminder.done before the SDK optimistic local mutation', async () => {
    const h = sdkOwnerFixture();
    const reminder = new Reminder();
    reminder.reminderID = 7;
    reminder.channel = channel;
    h.sdk.reminderManager.reminders = [reminder];
    const done = vi.fn().mockResolvedValue(undefined);
    h.sdk.config.provider.reminderDoneCallback = done;
    await h.lifecycle.quiesce(1);
    await expect(h.sdk.reminderManager.done([7])).rejects.toThrow('owner_denied');
    expect(reminder.done).toBe(false);
    expect(done).not.toHaveBeenCalled();
  });

  it('does not commit or notify stale conversation extras after true HTTP settlement', async () => {
    const h = sdkOwnerFixture();
    const conversation = new Conversation();
    conversation.channel = channel;
    h.sdk.conversationManager.conversations = [conversation];
    const originalExtra = conversation.remoteExtra;
    const extra = new ConversationExtra();
    extra.channel = channel;
    extra.version = 100;
    const request = deferred<ConversationExtra[]>();
    h.sdk.config.provider.syncConversationExtrasCallback = () => request.promise;
    const notify = vi.fn();
    h.sdk.conversationManager.addConversationListener(notify);
    const sync = h.sdk.conversationManager.syncExtra();
    const rejected = expect(sync).rejects.toThrow('owner_stale');
    const stop = h.lifecycle.quiesce(1);
    expect(h.admission.snapshot().pendingCount).toBe(1);
    request.resolve([extra]);
    await rejected;
    await stop;
    expect(conversation.remoteExtra).toBe(originalExtra);
    expect(h.sdk.conversationManager.maxExtraVersion).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it.each(['conversation', 'reminder', 'channel', 'subscribers'] as const)(
    'does not publish %s after account/Space A→B→A in the same owner generation', async kind => {
      let revision = 0;
      const h = sdkOwnerFixture({ captureContext: () => { const origin = revision; return () => origin === revision; } });
      const request = deferred<never[]>();
      let work: Promise<unknown>;
      const conversation = new Conversation(); conversation.channel = channel;
      const reminder = new Reminder(); reminder.channel = channel; reminder.reminderID = 8;
      const info = new ChannelInfo(); info.channel = channel;
      const subscriber = new Subscriber(); subscriber.uid = 'u'; subscriber.channel = channel;
      const accepted = vi.fn();
      if (kind === 'conversation') {
        h.sdk.config.provider.syncConversationsCallback = () => request.promise;
        work = h.sdk.conversationManager.sync();
      } else if (kind === 'reminder') {
        h.sdk.config.provider.syncRemindersCallback = () => request.promise;
        h.sdk.reminderManager.updateConversations = accepted;
        work = h.sdk.reminderManager.sync();
      } else if (kind === 'channel') {
        const channelRequest = deferred<ChannelInfo>();
        h.sdk.config.provider.channelInfoCallback = () => channelRequest.promise;
        h.sdk.channelManager.addListener(accepted);
        work = h.sdk.channelManager.fetchChannelInfo(channel);
        revision += 2;
        const rejected = expect(work).rejects.toThrow('owner_stale');
        channelRequest.resolve(info);
        await rejected;
        expect(h.sdk.channelManager.getChannelInfo(channel)).toBeUndefined();
        expect(accepted).not.toHaveBeenCalled();
        await h.lifecycle.quiesce(1);
        return;
      } else {
        h.sdk.config.provider.syncSubscribersCallback = () => request.promise;
        h.sdk.channelManager.addSubscriberChangeListener(accepted);
        work = h.sdk.channelManager.syncSubscribes(channel);
      }
      revision += 2;
      const rejected = expect(work).rejects.toThrow('owner_stale');
      // An empty result also mutates SDK caches in the original implementation.
      request.resolve([]);
      await rejected;
      expect(h.sdk.conversationManager.conversations).toEqual([]);
      expect(h.sdk.reminderManager.reminders).toEqual([]);
      expect(h.sdk.channelManager.subscribeCacheMap.has(channel.getChannelKey())).toBe(false);
      expect(accepted).not.toHaveBeenCalled();
      expect(h.admission.snapshot().pendingCount).toBe(0);
      await h.lifecycle.quiesce(1);
    },
  );
});
