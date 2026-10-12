import WKSDK, {
  type ChannelInfo,
  type Conversation,
  ConnectStatus,
  ConversationAction,
} from "wukongimjssdk";
import WKApp from "../App";
import { addImChannelInfoListener } from "./channelRuntime";
import {
  clonePlain,
  addImMessageListener,
  addImMessageStatusListener,
  removeImMessageListener,
  removeImMessageStatusListener,
  type ImChatListener,
} from "./chatRuntime";
import {
  addImConnectStatusListener,
  removeImConnectStatusListener,
} from "./connectStatus";
import {
  getCurrentImConversationStore,
  type CurrentImConversationStore,
} from "./currentConversationStore";
import { isImReadAttentionAllowed } from "./readAttentionHost";
import {
  normalizeShadowConversation,
  normalizeShadowChannel,
  normalizeShadowMessage,
  normalizeShadowUnread,
} from "./shadowCaptureAdapters";
import type {
  ShadowCaptureBindings,
  ShadowCaptureChannel,
  ShadowCaptureCommandOutcome,
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
  /** Capture send ACKs, history outcomes, and connect status outcomes. */
  captureCommandOutcomes?: boolean;
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

type CommandOutcomeEvent = Extract<
  ShadowCaptureEvent,
  { type: "command.outcome" }
>;
type CommandOutcomeListener = (event: CommandOutcomeEvent) => void;
type HistoryCaptureState = {
  original: (...args: any[]) => Promise<unknown>;
  wrapped: (...args: any[]) => Promise<unknown>;
  listeners: Set<CommandOutcomeListener>;
  messageListeners: Set<(event: Extract<ShadowCaptureEvent, { type: "message.upsert" }>) => void>;
};

const readCaptureStates = new WeakMap<object, ReadCaptureState>();
const historyCaptureStates = new WeakMap<object, HistoryCaptureState>();

function notifyCapture<T>(listeners: ReadonlySet<(event: T) => void>, event: T): void {
  for (const listener of Array.from(listeners)) {
    try { listener(event); }
    catch { /* Capture observers cannot change the existing runtime outcome. */ }
  }
}

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
  const messageListeners = new Set<
    (event: Extract<ShadowCaptureEvent, { type: "message.upsert" }>) => void
  >();
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
  const commandOutcomeListeners = new Set<CommandOutcomeListener>();
  let sourceCleanup: (() => void) | undefined;
  let readCleanup: (() => void) | undefined;
  let commandCleanup: (() => void) | undefined;
  let previousScopeKey = scopeKey(getScope());

  const notifyScope = () => {
    const scope = getScope();
    const nextKey = scopeKey(scope);
    if (!scope || nextKey === previousScopeKey) return;
    previousScopeKey = nextKey;
    notifyCapture(scopeListeners, scope);
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
    notifyCapture(conversationListeners, event);
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
    notifyCapture(unreadListeners, event);
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
    if (commandOutcomeListeners.size === 0) {
      commandCleanup?.();
      commandCleanup = undefined;
    }
    if (
      conversationListeners.size === 0 &&
      unreadListeners.size === 0 &&
      readListeners.size === 0 &&
      scopeListeners.size === 0 &&
      commandOutcomeListeners.size === 0
    ) {
      sourceCleanup?.();
    }
  };

  const subscribe = <T>(
    listeners: Set<T>,
    listener: T,
    ensure: () => void = attachSources,
  ): (() => void) => {
    listeners.add(listener);
    ensure();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      listeners.delete(listener);
      releaseSourcesIfIdle();
    };
  };

  const attachCommandSources = () => {
    if (commandCleanup || !options.captureCommandOutcomes) return;
    const cleanups: Array<() => void> = [];
    const emitCommandOutcome = (
      outcome: CommandOutcomeEvent["outcome"],
      scope = getScope(),
    ) => {
      if (!scope) return;
      const event: CommandOutcomeEvent = {
        type: "command.outcome",
        scope,
        outcome,
      };
      notifyCapture(commandOutcomeListeners, event);
    };

    const onMessageStatus = (packet: unknown) => {
      const value = record(packet);
      if (!value) return;
      const reasonCode = numberValue(value.reasonCode);
      const clientSeq = numberValue(value.clientSeq);
      const messageSeq = numberValue(value.messageSeq);
      const messageId = stringValue(value.messageID);
      emitCommandOutcome({
        command: "send",
        status:
          reasonCode === 1
            ? "accepted"
            : reasonCode === undefined
              ? "unknown"
              : "rejected",
        errorCode:
          reasonCode !== undefined && reasonCode !== 1
            ? String(reasonCode)
            : undefined,
        detail: {
          ...(clientSeq !== undefined ? { clientSeq } : {}),
          ...(messageId ? { messageID: messageId } : {}),
          ...(messageSeq !== undefined ? { messageSeq } : {}),
          ...(reasonCode !== undefined ? { reasonCode } : {}),
        },
      });
    };
    addImMessageStatusListener(sdk as any, onMessageStatus);
    cleanups.push(() => removeImMessageStatusListener(sdk as any, onMessageStatus));

    const onConnectStatus = (status: unknown, reasonCode?: number) => {
      const detail = {
        status: typeof status === "number" ? status : String(status),
        ...(reasonCode !== undefined ? { reasonCode } : {}),
      };
      if (status === ConnectStatus.Connected) {
        emitCommandOutcome({ command: "reconnect", status: "accepted", detail });
      } else if (
        status === ConnectStatus.ConnectFail ||
        status === ConnectStatus.ConnectKick
      ) {
        emitCommandOutcome({
          command: "reconnect",
          status: "failed",
          ...(reasonCode !== undefined ? { errorCode: String(reasonCode) } : {}),
          detail,
        });
      }
    };
    addImConnectStatusListener(sdk as any, onConnectStatus);
    cleanups.push(() => removeImConnectStatusListener(sdk as any, onConnectStatus));

    const provider = WKApp.conversationProvider as
      | {
          syncMessages?: (...args: any[]) => Promise<unknown>;
        }
      | undefined;
    const original = provider?.syncMessages;
    if (provider && original) {
      const existing = historyCaptureStates.get(provider);
      const emitHistoryOutcome: CommandOutcomeListener = (event) => {
        notifyCapture(commandOutcomeListeners, event);
      };
      const emitHistoryMessage = (
        event: Extract<ShadowCaptureEvent, { type: "message.upsert" }>,
      ) => {
        notifyCapture(messageListeners, event);
      };
      if (existing) {
        existing.listeners.add(emitHistoryOutcome);
        existing.messageListeners.add(emitHistoryMessage);
        cleanups.push(() => {
          existing.listeners.delete(emitHistoryOutcome);
          existing.messageListeners.delete(emitHistoryMessage);
          releaseHistoryCaptureState(provider, existing);
        });
      } else {
        const wrapped = async function (this: unknown, ...args: any[]) {
          const channel = normalizeShadowChannel(args[0]);
          const scope = getScope();
          try {
            const result = await original.apply(this, args);
            if (scope) {
              if (Array.isArray(result)) {
                for (const input of result) {
                  const message = normalizeShadowMessage(input, "history");
                  if (!message) continue;
                  const event: Extract<ShadowCaptureEvent, { type: "message.upsert" }> = {
                    type: "message.upsert",
                    scope,
                    message,
                    source: "history",
                  };
                  notifyCapture(state.messageListeners, event);
                }
              }
              const event: CommandOutcomeEvent = {
                type: "command.outcome",
                scope,
                outcome: {
                  command: "history",
                  status: "accepted",
                  ...(channel ? { channel } : {}),
                },
              };
              notifyCapture(state.listeners, event);
            }
            return result;
          } catch (error) {
            if (scope) {
              const event: CommandOutcomeEvent = {
                type: "command.outcome",
                scope,
                outcome: {
                  command: "history",
                  status: "failed",
                  ...(channel ? { channel } : {}),
                  ...errorFields(error),
                },
              };
              notifyCapture(state.listeners, event);
            }
            throw error;
          }
        };
        const state: HistoryCaptureState = {
          original,
          wrapped,
          listeners: new Set([emitHistoryOutcome]),
          messageListeners: new Set([emitHistoryMessage]),
        };
        historyCaptureStates.set(provider, state);
        provider.syncMessages = wrapped;
        cleanups.push(() => {
          state.listeners.delete(emitHistoryOutcome);
          state.messageListeners.delete(emitHistoryMessage);
          releaseHistoryCaptureState(provider, state);
        });
      }
    }

    commandCleanup = () => {
      for (const cleanup of cleanups.splice(0).reverse()) cleanup();
      commandCleanup = undefined;
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
      messageListeners.add(listener);
      const handler: ImChatListener<unknown> = (message) => {
        const scope = getScope();
        const normalized = normalizeShadowMessage(message, "realtime");
        if (!scope || !normalized) return;
        notifyCapture(new Set([listener]), {
          type: "message.upsert",
          scope,
          message: normalized,
          source: "realtime",
        });
      };
      addImMessageListener(sdk as any, handler);
      return () => {
        messageListeners.delete(listener);
        removeImMessageListener(sdk as any, handler);
      };
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
          notifyCapture(readListeners, event);
        });
      }
      return release;
    },
    onCommandOutcome(listener) {
      return subscribe(commandOutcomeListeners, listener, attachCommandSources);
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

function releaseHistoryCaptureState(
  provider: { syncMessages?: (...args: any[]) => Promise<unknown> },
  state: HistoryCaptureState,
): void {
  if (state.listeners.size > 0 || state.messageListeners.size > 0) return;
  historyCaptureStates.delete(provider);
  if (provider.syncMessages === state.wrapped) provider.syncMessages = state.original;
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
    const scopeAtStart = getScope();
    const channelAtStart = normalizeShadowChannel(channel);
    await original.call(this, channel, unread);
    if (unread !== 0 || !allowedAtStart || !isImReadAttentionAllowed()) return;
    const sequence =
      sdk.conversationManager.findConversation(channel)?.lastMessage
        ?.messageSeq;
    if (!scopeAtStart || !channelAtStart || !Number.isSafeInteger(sequence) || sequence < 0) return;
    const event: ReadCaptureEvent = {
      type: "unread.read",
      scope: scopeAtStart,
      channel: channelAtStart,
      readSequence: sequence,
    };
    notifyCapture(state.listeners, event);
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

function record(value: unknown): Record<string, any> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function errorFields(error: unknown): Pick<
  ShadowCaptureCommandOutcome,
  "errorCode" | "detail"
> {
  const value = record(error);
  const errorCode = stringValue(value?.code ?? value?.status);
  const message = stringValue(value?.message);
  const name = stringValue(value?.name);
  return {
    ...(errorCode ? { errorCode } : {}),
    ...(message || name
      ? {
          detail: {
            ...(name ? { name } : {}),
            ...(message ? { message } : {}),
          },
        }
      : {}),
  };
}
