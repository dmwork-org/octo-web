import WKSDK, {
  type ChannelInfo,
  type Conversation,
  ConversationAction,
} from "wukongimjssdk";
import WKApp from "../App";
import { addImChannelInfoListener } from "./channelRuntime";
import {
  addImMessageListener,
  removeImMessageListener,
  type ImChatListener,
} from "./chatRuntime";
import {
  getCurrentImConversationStore,
  type CurrentImConversationStore,
} from "./currentConversationStore";
import { isImReadAttentionAllowed } from "./readAttentionHost";
import {
  normalizeShadowConversation,
  normalizeShadowMessage,
  normalizeShadowUnread,
} from "./shadowCaptureAdapters";
import type {
  ShadowCaptureBindings,
  ShadowCaptureChannel,
  ShadowCaptureDocument,
  ShadowCaptureEvent,
  ShadowCaptureManifest,
  ShadowCaptureScope,
  ShadowCaptureSource,
  ShadowCaptureUnread,
} from "./shadowCapture";
import { attachShadowTraceCapture, ShadowTraceRecorder } from "./shadowCapture";

export type CurrentImShadowCaptureOptions = {
  sdk?: WKSDK;
  store?: CurrentImConversationStore;
  /** Keep scope construction injectable so fixtures can pin an artifact scope. */
  getScope?: () => ShadowCaptureScope | undefined;
  /** Capture successful `markConversationUnread(channel, 0)` calls. */
  captureReads?: boolean;
};

export type CurrentImShadowReadListener = (
  channel: ShadowCaptureChannel,
  readSequence: number
) => void;

type ReadCaptureEvent = Extract<ShadowCaptureEvent, { type: "unread.read" }>;
type ReadCaptureListener = (event: ReadCaptureEvent) => void;
type ReadCaptureState = {
  original: (channel: unknown, unread: number) => Promise<void> | void;
  wrapped: (channel: unknown, unread: number) => Promise<void>;
  listeners: Set<ReadCaptureListener>;
};

const readCaptureStates = new WeakMap<object, ReadCaptureState>();

export type CurrentImShadowTrace = {
  recorder: ShadowTraceRecorder;
  dispose: () => void;
  toDocument: () => ShadowCaptureDocument;
};

/** Attach one bounded recorder to the current Web owner. */
export function createCurrentImShadowTrace(
  manifest: ShadowCaptureManifest,
  options: CurrentImShadowCaptureOptions = {}
): CurrentImShadowTrace {
  const recorder = new ShadowTraceRecorder(manifest);
  const dispose = attachShadowTraceCapture(
    recorder,
    createCurrentImShadowCaptureBindings(options)
  );
  return { recorder, dispose, toDocument: () => recorder.toDocument() };
}

/**
 * Build read-only bindings for the already-installed Web IM runtime.
 *
 * The returned bindings never retain a store or start an IM connection. A
 * caller may attach them to `ShadowTraceRecorder` for a bounded diagnostic
 * window, then dispose the returned subscriptions. `captureReads` is opt-in
 * because it wraps the existing conversation provider only while capture is
 * active and restores its method on disposal.
 */
export function createCurrentImShadowCaptureBindings(
  options: CurrentImShadowCaptureOptions = {}
): ShadowCaptureBindings {
  const sdk = options.sdk ?? WKSDK.shared();
  const store = options.store ?? getCurrentImConversationStore();
  const getScope = options.getScope ?? getDefaultShadowScope;
  const scopeListeners = new Set<(scope: ShadowCaptureScope) => void>();
  const conversationListeners = new Set<
    (
      event: Extract<ShadowCaptureEvent, { type: "conversation.upsert" }>
    ) => void
  >();
  const unreadListeners = new Set<
    (event: Extract<ShadowCaptureEvent, { type: "unread.set" }>) => void
  >();
  const readListeners = new Set<
    (event: Extract<ShadowCaptureEvent, { type: "unread.read" }>) => void
  >();
  let sourceCleanup: (() => void) | undefined;
  let readCleanup: (() => void) | undefined;
  let previousScopeKey = scopeKey(getScope());

  const notifyScope = () => {
    const scope = getScope();
    const nextKey = scopeKey(scope);
    if (!scope || nextKey === previousScopeKey) return;
    previousScopeKey = nextKey;
    for (const listener of Array.from(scopeListeners)) listener(scope);
  };

  const emitConversation = (input: unknown, source: ShadowCaptureSource) => {
    const scope = getScope();
    const conversation = normalizeShadowConversation(input);
    if (!scope || !conversation) return;
    const event = {
      type: "conversation.upsert",
      scope,
      conversation,
      source,
    } as const;
    for (const listener of Array.from(conversationListeners)) listener(event);
  };

  const emitUnread = (
    input: unknown,
    source: ShadowCaptureSource,
    status?: ShadowCaptureUnread["status"]
  ) => {
    const scope = getScope();
    const unread = normalizeShadowUnread(input, status ?? store.freshness);
    if (!scope || !unread) return;
    const event = { type: "unread.set", scope, unread, source } as const;
    for (const listener of Array.from(unreadListeners)) listener(event);
  };

  const emitSnapshot = (source: ShadowCaptureSource) => {
    for (const conversation of store.conversations) {
      emitConversation(conversation, source);
      emitUnread(conversation, source);
    }
  };

  const emitConversationSnapshot = (source: ShadowCaptureSource) => {
    for (const conversation of store.conversations)
      emitConversation(conversation, source);
  };

  const emitUnreadSnapshot = (source: ShadowCaptureSource) => {
    for (const conversation of store.conversations)
      emitUnread(conversation, source);
  };

  const attachSources = () => {
    if (sourceCleanup) return;
    const cleanups: Array<() => void> = [];
    const onConversation = (
      conversation: Conversation,
      action: ConversationAction
    ) => {
      if (action === ConversationAction.remove) return;
      emitConversation(conversation, "realtime");
      emitUnread(conversation, "realtime");
    };
    const onChannelInfo = (channelInfo: ChannelInfo) => {
      const conversation = store.findConversation(channelInfo.channel);
      if (conversation) emitConversation(conversation, "realtime");
    };
    const onRefresh = () => emitSnapshot("history");
    const onSidebarOpened = () => notifyScope();
    const onSpaceChanged = () => notifyScope();
    const onAuthChanged = () => notifyScope();

    sdk.conversationManager.addConversationListener(onConversation);
    cleanups.push(() =>
      sdk.conversationManager.removeConversationListener(onConversation)
    );
    cleanups.push(addImChannelInfoListener(sdk, onChannelInfo));
    WKApp.mittBus.on("conversation-list-refreshed", onRefresh);
    cleanups.push(() =>
      WKApp.mittBus.off("conversation-list-refreshed", onRefresh)
    );
    WKApp.mittBus.on("wk:sidebar-conversation-opened", onSidebarOpened);
    cleanups.push(() =>
      WKApp.mittBus.off("wk:sidebar-conversation-opened", onSidebarOpened)
    );
    WKApp.mittBus.on("space-changed", onSpaceChanged);
    cleanups.push(() => WKApp.mittBus.off("space-changed", onSpaceChanged));
    WKApp.mittBus.on("wk:auth-state-changed", onAuthChanged);
    cleanups.push(() =>
      WKApp.mittBus.off("wk:auth-state-changed", onAuthChanged)
    );
    sourceCleanup = () => {
      for (const cleanup of cleanups.splice(0).reverse()) cleanup();
      sourceCleanup = undefined;
    };
  };

  const releaseSourcesIfIdle = () => {
    if (readListeners.size === 0) {
      readCleanup?.();
      readCleanup = undefined;
    }
    if (
      conversationListeners.size === 0 &&
      unreadListeners.size === 0 &&
      readListeners.size === 0 &&
      scopeListeners.size === 0
    ) {
      sourceCleanup?.();
      readCleanup?.();
      readCleanup = undefined;
    }
  };

  const subscribe = <T>(listeners: Set<T>, listener: T): (() => void) => {
    listeners.add(listener);
    attachSources();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      listeners.delete(listener);
      releaseSourcesIfIdle();
    };
  };

  const bindings: ShadowCaptureBindings = {
    getScope,
    onScopeChange(listener) {
      const release = subscribe(scopeListeners, listener);
      notifyScope();
      return release;
    },
    onMessage(listener) {
      const handler: ImChatListener<unknown> = (message) => {
        const scope = getScope();
        const normalized = normalizeShadowMessage(message, "realtime");
        if (!scope || !normalized) return;
        listener({
          type: "message.upsert",
          scope,
          message: normalized,
          source: "realtime",
        });
      };
      addImMessageListener(sdk as any, handler);
      return () => removeImMessageListener(sdk as any, handler);
    },
    onConversation(listener) {
      const release = subscribe(conversationListeners, listener);
      emitConversationSnapshot("history");
      return release;
    },
    onUnread(listener) {
      const release = subscribe(unreadListeners, listener);
      emitUnreadSnapshot("history");
      return release;
    },
    onRead(listener) {
      const release = subscribe(readListeners, listener);
      if (options.captureReads && !readCleanup) {
        readCleanup = installReadCapture(sdk, getScope, (event) => {
          for (const readListener of Array.from(readListeners))
            readListener(event);
        });
      }
      return release;
    },
  };

  return bindings;
}

function getDefaultShadowScope(): ShadowCaptureScope | undefined {
  const app = WKApp.shared;
  const login = WKApp.loginInfo;
  const config = WKApp.apiClient.config;
  const server = typeof config.apiURL === "string" ? config.apiURL : "";
  const account = typeof login.uid === "string" ? login.uid : "";
  if (!server || !account) return undefined;
  const channel = app.openChannel
    ? {
        id: app.openChannel.channelID,
        type: app.openChannel.channelType,
      }
    : undefined;
  const epoch = Math.max(
    1,
    revision(app.spaceRevision) +
      revision(login.sessionRevision) +
      revision(config.originRevision) +
      1
  );
  return {
    server,
    account,
    ...(app.currentSpaceId ? { space: app.currentSpaceId } : {}),
    ...(channel ? { channel } : {}),
    epoch,
    authGeneration: login.sessionRevision,
    transitionGeneration: epoch,
  };
}

function revision(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

function installReadCapture(
  sdk: WKSDK,
  getScope: () => ShadowCaptureScope | undefined,
  listener: ReadCaptureListener
): () => void {
  const provider = WKApp.conversationProvider as
    | {
        markConversationUnread?: (
          channel: unknown,
          unread: number
        ) => Promise<void> | void;
      }
    | undefined;
  const original = provider?.markConversationUnread;
  if (!provider || !original) return () => {};

  const existing = readCaptureStates.get(provider);
  if (existing) {
    existing.listeners.add(listener);
    return () => existing.listeners.delete(listener);
  }

  const wrapped = async function (
    this: unknown,
    channel: any,
    unread: number
  ): Promise<void> {
    const allowedAtStart = isImReadAttentionAllowed();
    await original.call(this, channel, unread);
    if (unread !== 0 || !allowedAtStart || !isImReadAttentionAllowed()) return;
    const sequence =
      sdk.conversationManager.findConversation(channel)?.lastMessage
        ?.messageSeq;
    const scope = getScope();
    if (!scope || !Number.isSafeInteger(sequence) || sequence < 0) return;
    const event: ReadCaptureEvent = {
      type: "unread.read",
      scope,
      channel: { id: channel.channelID, type: channel.channelType },
      readSequence: sequence,
    };
    for (const readListener of Array.from(state.listeners)) readListener(event);
  };
  const state: ReadCaptureState = {
    original,
    wrapped,
    listeners: new Set([listener]),
  };
  readCaptureStates.set(provider, state);
  provider.markConversationUnread = wrapped;
  return () => {
    state.listeners.delete(listener);
    if (state.listeners.size > 0) return;
    readCaptureStates.delete(provider);
    if (provider.markConversationUnread === wrapped)
      provider.markConversationUnread = original;
  };
}

function scopeKey(scope: ShadowCaptureScope | undefined): string {
  if (!scope) return "";
  return JSON.stringify({
    server: scope.server,
    account: scope.account,
    organization: scope.organization,
    space: scope.space,
    channel: scope.channel,
    epoch: scope.epoch,
    sessionId: scope.sessionId,
    authGeneration: scope.authGeneration,
    transitionGeneration: scope.transitionGeneration,
  });
}
