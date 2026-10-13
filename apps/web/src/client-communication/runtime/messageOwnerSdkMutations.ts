import type WKSDK from 'wukongimjssdk';
import { ConversationAction } from 'wukongimjssdk';
import { ImOwnerAdmissionError, type ImOwnerAdmission, type ImOwnerOperationKind } from '@octo/base/src/im-runtime/ownerAdmission';

/** Guard the SDK's commit, as well as the provider HTTP boundary. */
export function installMessageOwnerSdkMutations(
  sdk: WKSDK, admission: ImOwnerAdmission, captureContext: () => () => boolean,
): void {
  async function run<T>(kind: ImOwnerOperationKind, action: (assertCurrent: () => void) => Promise<T>): Promise<T> {
    const contextCurrent = captureContext();
    const ticket = admission.begin(kind);
    const assertCurrent = () => {
      ticket.assertCurrent();
      if (!contextCurrent()) throw new ImOwnerAdmissionError('owner_stale');
    };
    try { assertCurrent(); return await action(assertCurrent); }
    finally { ticket.release(); }
  }
  const conversations = sdk.conversationManager;
  conversations.sync = filter => run('conversation', async assertCurrent => {
    const provider = sdk.config.provider;
    const callback = provider.syncConversationsCallback;
    const result = await callback.call(provider, filter);
    assertCurrent();
    if (sdk.config.provider !== provider || provider.syncConversationsCallback !== callback) throw new ImOwnerAdmissionError('owner_stale');
    conversations.conversations = result;
    for (const conversation of result) {
      assertCurrent();
      if (conversation.remoteExtra.version > conversations.maxExtraVersion) {
        conversations.maxExtraVersion = conversation.remoteExtra.version;
      }
    }
    // Preserve fire-and-forget reminder hydration, observing its rejection.
    void sdk.reminderManager.sync().catch(() => {});
    return result;
  });
  conversations.syncExtra = () => run('conversation', async assertCurrent => {
    const provider = sdk.config.provider;
    const callback = provider.syncConversationExtrasCallback;
    if (!callback) return;
    const extras = await callback.call(provider, conversations.maxExtraVersion);
    assertCurrent();
    if (sdk.config.provider !== provider || provider.syncConversationExtrasCallback !== callback) throw new ImOwnerAdmissionError('owner_stale');
    for (const extra of extras ?? []) {
      assertCurrent();
      if (extra.version > conversations.maxExtraVersion) conversations.maxExtraVersion = extra.version;
      for (const conversation of conversations.conversations) {
        assertCurrent();
        if (conversation.channel.isEqual(extra.channel)) {
          conversation.remoteExtra = extra;
          assertCurrent();
          conversations.notifyConversationListeners(conversation, ConversationAction.update);
        }
      }
    }
    return extras;
  });
  const reminders = sdk.reminderManager;
  reminders.sync = () => run('conversation', async assertCurrent => {
    const provider = sdk.config.provider;
    const callback = provider.syncRemindersCallback;
    if (!callback) return;
    const result = await callback.call(provider, reminders.maxReminderVersion());
    assertCurrent();
    if (sdk.config.provider !== provider || provider.syncRemindersCallback !== callback) throw new ImOwnerAdmissionError('owner_stale');
    const channels = new Set<(typeof result)[number]['channel']>();
    for (const reminder of result ?? []) {
      assertCurrent();
      channels.add(reminder.channel);
      const index = reminders.reminders.findIndex(value => value.reminderID === reminder.reminderID);
      if (index === -1) reminders.reminders.push(reminder);
      else reminders.reminders[index] = reminder;
    }
    for (const channel of channels) {
      assertCurrent();
      // One channel at a time: a listener can synchronously quiesce before the next channel.
      for (const conversation of conversations.findConversations([channel]) ?? []) {
        assertCurrent();
        conversation.reminders = reminders.getWaitDoneReminders(conversation.channel);
        assertCurrent();
        conversations.notifyConversationListeners(conversation, ConversationAction.update);
      }
    }
  });
  reminders.done = ids => run('read', async assertCurrent => {
    // The SDK marks reminders done before invoking its provider; admission must precede it.
    const provider = sdk.config.provider;
    const callback = provider.reminderDoneCallback;
    if (!callback) return;
    assertCurrent();
    const affected = reminders.getRemindersWithIDs(ids);
    for (const reminder of affected) {
      assertCurrent();
      reminder.done = true;
    }
    const affectedChannels = new Set(affected.map(reminder => reminder.channel));
    for (const channel of affectedChannels) {
      for (const conversation of conversations.findConversations([channel]) ?? []) {
        assertCurrent();
        conversation.reminders = reminders.getWaitDoneReminders(conversation.channel);
        assertCurrent();
        conversations.notifyConversationListeners(conversation, ConversationAction.update);
      }
    }
    assertCurrent();
    await callback.call(provider, ids);
    assertCurrent();
    if (sdk.config.provider !== provider || provider.reminderDoneCallback !== callback) throw new ImOwnerAdmissionError('owner_stale');
  });
  const channels = sdk.channelManager;
  channels.fetchChannelInfo = channel => run('conversation', async assertCurrent => {
    const key = channel.getChannelKey();
    if (channels.requestQueueMap.has(key)) return;
    channels.requestQueueMap.set(key, true);
    const provider = sdk.config.provider;
    const callback = provider.channelInfoCallback;
    try {
      if (!callback) return;
      const result = await callback.call(provider, channel);
      assertCurrent();
      if (sdk.config.provider !== provider || provider.channelInfoCallback !== callback) throw new ImOwnerAdmissionError('owner_stale');
      if (result) {
        // Preserve the SDK request-key cache behavior for bare Space aliases.
        result.channel = channel;
        assertCurrent();
        channels.setChannleInfoForCache(result);
        assertCurrent();
        channels.notifyListeners(result);
      }
    } finally {
      // A new generation cannot start until this ticket settles.
      channels.requestQueueMap.delete(key);
    }
  });
  channels.syncSubscribes = channel => run('conversation', async assertCurrent => {
    const key = channel.getChannelKey();
    if (channels.requestSubscribeQueueMap.has(key)) return;
    channels.requestSubscribeQueueMap.set(key, true);
    const provider = sdk.config.provider;
    const callback = provider.syncSubscribersCallback;
    const previous = channels.subscribeCacheMap.get(key) ?? [];
    try {
      const result = await callback.call(provider, channel, previous[previous.length - 1]?.version ?? 0);
      assertCurrent();
      if (sdk.config.provider !== provider || provider.syncSubscribersCallback !== callback) throw new ImOwnerAdmissionError('owner_stale');
      const accepted = [...previous];
      for (const subscriber of result ?? []) {
        assertCurrent();
        const index = accepted.findIndex(value => value.uid === subscriber.uid);
        if (index === -1) accepted.push(subscriber);
        else accepted[index] = subscriber;
      }
      channels.subscribeCacheMap.set(key, accepted);
      assertCurrent();
      channels.notifySubscribeChangeListeners(channel);
    } finally {
      channels.requestSubscribeQueueMap.delete(key);
    }
  });
  const syncMessages = sdk.chatManager.syncMessages.bind(sdk.chatManager);
  const syncExtras = sdk.chatManager.syncMessageExtras.bind(sdk.chatManager);
  sdk.chatManager.syncMessages = (...args) => run('history', async assertCurrent => {
    const value = await syncMessages(...args);
    assertCurrent();
    return value;
  });
  sdk.chatManager.syncMessageExtras = (...args) => run('history', async assertCurrent => {
    const value = await syncExtras(...args);
    assertCurrent();
    return value;
  });

  // A listener may synchronously change Space or revoke ownership. Stop the remainder
  // of the same notification dispatch instead of publishing to listeners in the new scope.
  function notify<T>(listeners: ((value: T) => void)[], value: T): void {
    const generation = admission.snapshot().generation;
    const contextCurrent = captureContext();
    for (const listener of [...listeners]) {
      const current = admission.snapshot();
      if (current.phase !== 'active' || current.generation !== generation || !contextCurrent()) return;
      listener(value);
    }
  }
  channels.notifyListeners = value => notify(channels.listeners, value);
  channels.notifySubscribeChangeListeners = value => notify(channels.subscriberChangeListeners, value);
  conversations.notifyConversationListeners = (value, action) => {
    const generation = admission.snapshot().generation;
    const contextCurrent = captureContext();
    for (const listener of [...conversations.listeners]) {
      const current = admission.snapshot();
      if (current.phase !== 'active' || current.generation !== generation || !contextCurrent()) return;
      listener(value, action);
    }
  };
}
