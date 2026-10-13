import WKSDK, { ConnectStatus, SubscribeAction, type Message } from 'wukongimjssdk';
import { ImOwnerAdmissionError, type ImOwnerAdmission } from '@octo/base/src/im-runtime/ownerAdmission';
import type { MessageOwnerSdkLifecycle } from './messageOwner';
import {
  clearSdkOwnerTimer, MessageOwnerSdkError, readSdkOwnerSocket, readSdkOwnerState,
  waitForSdkOwnerClosed, waitForSdkOwnerDrain, type SdkOwnerRawSocket, type SdkOwnerSocket,
} from './messageOwnerSdkBoundary';
import { installMessageOwnerSdkSends } from './messageOwnerSdkSends';
import { installMessageOwnerSdkReceipts } from './messageOwnerSdkReceipts';
import { installMessageOwnerSdkMutations } from './messageOwnerSdkMutations';

export interface MessageOwnerSdkOptions {
  drainTimeoutMs?: number;
  pollIntervalMs?: number;
  /** Captures account/Space revision; returning to the same IDs must not revive old work. */
  captureContext?: () => () => boolean;
  /** Socket lifetime follows account/session/API origin and survives an ordinary Space switch. */
  captureConnectionContext?: () => () => boolean;
}
const installed = new WeakSet<WKSDK>();

/** Browser SDK 1.3.5 owner adapter. Install before WKApp.startup or any SDK connection. */
export function installMessageOwnerSdk(
  sdk: WKSDK, admission: ImOwnerAdmission, options: MessageOwnerSdkOptions = {},
): MessageOwnerSdkLifecycle {
  if (installed.has(sdk)) throw new ImOwnerAdmissionError('owner_denied');
  const state = readSdkOwnerState(sdk);
  const timeoutMs = options.drainTimeoutMs ?? 5000;
  const pollMs = options.pollIntervalMs ?? 10;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(pollMs) || pollMs <= 0) {
    throw new MessageOwnerSdkError('sdk_owner_incompatible');
  }
  installed.add(sdk);
  const captureContext = options.captureContext ?? (() => () => true);
  const captureConnectionContext = options.captureConnectionContext ?? captureContext;
  const manager = sdk.connectManager;
  const sockets = new Map<SdkOwnerRawSocket, SdkOwnerSocket>();
  const socketContexts = new WeakMap<SdkOwnerSocket, () => boolean>();
  let socket = state.connection.ws;
  const originalWithAddr = manager.connectWithAddr.bind(manager);
  const originalSend = manager.send.bind(manager);
  const originalPacket = manager.sendPacket.bind(manager);
  const originalWsSend = manager.wssend.bind(manager);
  const originalRecvack = manager.sendRecvackPacket.bind(manager);
  const originalOnPacket = manager.onPacket.bind(manager);
  const originalChatPacket = sdk.chatManager.onPacket.bind(sdk.chatManager);

  function current(generation: number, contextCurrent: () => boolean): boolean {
    const value = admission.snapshot();
    return value.phase === 'active' && value.generation === generation && contextCurrent();
  }
  function requireActive(): void {
    if (admission.snapshot().phase !== 'active') throw new ImOwnerAdmissionError('owner_denied');
  }
  function transportCurrent(): boolean {
    return admission.snapshot().phase === 'active' && !!socket && socketContexts.get(socket)?.() === true;
  }
  function remember(value: SdkOwnerSocket): void {
    if (sockets.has(value.ws)) return;
    const generation = admission.snapshot().generation;
    const contextCurrent = captureConnectionContext();
    const isCurrent = () => socket === value && !value.destory && current(generation, contextCurrent);
    sockets.set(value.ws, value);
    socketContexts.set(value, isCurrent);
    const send = value.send.bind(value);
    value.send = data => { if (isCurrent()) send(data); };
    const open = value.onopen.bind(value);
    const message = value.onmessage.bind(value);
    const close = value.onclose.bind(value);
    const error = value.onerror.bind(value);
    value.onopen = callback => open(() => { if (isCurrent()) callback(); });
    value.onmessage = callback => message(data => { if (isCurrent()) callback(data); });
    value.onclose = callback => close(event => { if (isCurrent()) callback(event); });
    value.onerror = callback => error(event => { if (isCurrent()) callback(event); });
    // Also guard handlers already registered when a caller installed after SDK initialization.
    const raw = value.ws;
    const existingOpen = raw.onopen;
    const existingMessage = raw.onmessage;
    const existingClose = raw.onclose;
    const existingError = raw.onerror;
    raw.onopen = event => { if (isCurrent()) existingOpen?.call(raw, event); };
    raw.onmessage = event => { if (isCurrent()) existingMessage?.call(raw, event); };
    raw.onclose = event => { if (isCurrent()) existingClose?.call(raw, event); };
    raw.onerror = event => { if (isCurrent()) existingError?.call(raw, event); };
  }
  if (socket) { socket = readSdkOwnerSocket(socket); remember(socket); }
  Object.defineProperty(manager, 'ws', {
    configurable: false,
    enumerable: true,
    get: () => socket,
    set: (value: unknown) => {
      if (value === undefined || value === null) { socket = undefined; return; }
      const next = readSdkOwnerSocket(value);
      remember(next);
      if (admission.snapshot().phase !== 'active') {
        next.close();
        throw new ImOwnerAdmissionError('owner_denied');
      }
      // SDK connectWithAddr replaces ws without closing it. Retain and close every predecessor.
      if (socket && socket !== next && socket.ws.readyState !== 3) socket.close();
      socket = next;
    },
  });

  manager.connectWithAddr = address => {
    const ticket = admission.begin('connect');
    try {
      const contextCurrent = captureConnectionContext();
      if (!contextCurrent()) throw new ImOwnerAdmissionError('owner_stale');
      originalWithAddr(address);
    } finally { ticket.release(); }
  };
  manager.onlyConnect = () => {
    const ticket = admission.begin('connect');
    if (manager.status === ConnectStatus.Connecting) { ticket.release(); return; }
    const provider = sdk.config.provider;
    const callback = provider.connectAddrCallback;
    let mode: 'calling' | 'promise' | 'callback' = 'calling';
    let callbackFinished = false;
    try {
      const contextCurrent = captureConnectionContext();
      if (!contextCurrent()) throw new ImOwnerAdmissionError('owner_stale');
      if (!callback) {
        manager.connectWithAddr(sdk.config.addr);
        ticket.release();
        return;
      }
      let delivered = false;
      // Captured before invoking the current provider; startup may replace the property later.
      const result: unknown = callback.call(provider, address => {
        if (delivered) return;
        delivered = true;
        try {
          if (ticket.isCurrent() && contextCurrent() && sdk.config.provider === provider &&
              provider.connectAddrCallback === callback) manager.connectWithAddr(address);
        } finally {
          callbackFinished = true;
          if (mode === 'callback') ticket.release();
        }
      });
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        mode = 'promise';
        // Settlement is evidence even when no address was returned. Observe rejection too.
        void Promise.resolve(result).then(() => ticket.release(), () => ticket.release());
      } else {
        // A callback-style provider remains pending until it really delivers an address.
        mode = 'callback';
        if (callbackFinished) ticket.release();
      }
    } catch (error) {
      ticket.release();
      throw error;
    }
  };
  manager.connect = () => {
    requireActive();
    manager.needReconnect = true;
    manager.onlyConnect();
  };
  manager.reConnect = () => {
    if (admission.snapshot().phase !== 'active' || !manager.needReconnect || manager.lockReconnect) return;
    const generation = admission.snapshot().generation;
    const contextCurrent = captureConnectionContext();
    manager.lockReconnect = true;
    clearSdkOwnerTimer(state.connection.reConnectTimeout);
    state.connection.reConnectTimeout = setTimeout(() => {
      if (!current(generation, contextCurrent)) return;
      if (socket) socket.close();
      manager.ws = undefined;
      manager.lockReconnect = false;
      manager.onlyConnect();
    }, 3000);
  };
  manager.restHeart = () => {
    clearSdkOwnerTimer(state.connection.heartTimer);
    clearSdkOwnerTimer(state.connection.pongRespTimer);
    state.connection.heartTimer = undefined;
    state.connection.pongRespTimer = undefined;
    if (!transportCurrent()) return;
    const generation = admission.snapshot().generation;
    const contextCurrent = captureConnectionContext();
    state.connection.heartTimer = setInterval(() => {
      if (!current(generation, contextCurrent) || !transportCurrent()) return;
      manager.sendPing();
      if (manager.pingRetryCount > manager.pingMaxRetryCount) {
        manager.notifyConnectDelayListeners(9999);
        manager.onlyDisconnect();
        if (current(generation, contextCurrent)) manager.connect();
      }
    }, sdk.config.heartbeatInterval);
  };
  manager.notifyConnectStatusListeners = (reasonCode, connack) => {
    const contextCurrent = captureConnectionContext();
    const generation = admission.snapshot().generation;
    for (const listener of [...manager.connectStatusListeners]) {
      const value = admission.snapshot();
      if (value.phase !== 'active' || value.generation !== generation || !contextCurrent()) return;
      const nodeId = connack?.nodeId;
      listener(manager.status, reasonCode, connack && {
        nodeId: typeof nodeId === 'number' ? nodeId : Number(nodeId?.toString?.() ?? 0),
      });
    }
  };
  manager.notifyConnectDelayListeners = delay => {
    const contextCurrent = captureConnectionContext();
    const generation = admission.snapshot().generation;
    for (const listener of [...manager.connectDelayListeners]) {
      const value = admission.snapshot();
      if (value.phase !== 'active' || value.generation !== generation || !contextCurrent()) return;
      listener(delay);
    }
  };
  const sends = installMessageOwnerSdkSends(sdk, admission, state.chat, captureContext);
  manager.send = data => { if (transportCurrent()) originalSend(data); };
  manager.sendPacket = packet => {
    if (transportCurrent() && sends.packetCurrent(packet)) originalPacket(packet);
  };
  manager.wssend = packet => {
    if (transportCurrent() && sends.packetCurrent(packet)) originalWsSend(packet);
  };
  manager.sendRecvackPacket = packet => { if (transportCurrent()) originalRecvack(packet); };
  manager.onPacket = data => {
    if (!transportCurrent()) return;
    try {
      const result: unknown = originalOnPacket(data) as unknown;
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        void Promise.resolve(result).catch(() => {});
      }
    } catch { /* stale or malformed inbound packets cannot revive the owner */ }
  };
  sdk.chatManager.onPacket = packet => {
    if (!transportCurrent()) return Promise.resolve();
    try {
      const result = originalChatPacket(packet);
      return Promise.resolve(result).catch(() => {});
    } catch {
      return Promise.resolve();
    }
  };
  const receipts = installMessageOwnerSdkReceipts(sdk, admission, state.receipt, captureContext);
  installMessageOwnerSdkMutations(sdk, admission, captureContext);
  const channels = sdk.channelManager;
  channels.notifySubscribeIfNeed = (message: Message) => {
    const contextCurrent = captureContext();
    const generation = admission.snapshot().generation;
    for (const context of channels.subscriberContexts) {
      if (context.channel.channelID !== message.channel.channelID || context.channel.channelType !== message.channel.channelType) continue;
      for (const state of [...context.listenerStates]) {
        const current = admission.snapshot();
        if (current.phase !== 'active' || current.generation !== generation || !contextCurrent()) return;
        if (state.listener && state.action === SubscribeAction.subscribe) {
          (state.listener as unknown as (message: Message) => void)(message);
        }
      }
      return;
    }
  };
  channels.handleSuback = ack => {
    const contextCurrent = captureContext();
    const generation = admission.snapshot().generation;
    for (const context of [...channels.subscriberContexts]) {
      if (context.channel.channelID !== ack.channelID || context.channel.channelType !== ack.channelType) continue;
      for (const state of [...context.listenerStates]) {
        const current = admission.snapshot();
        if (current.phase !== 'active' || current.generation !== generation || !contextCurrent()) return;
        if (state.handleOk) continue;
        state.handleOk = true;
        if (ack.action === SubscribeAction.subscribe && state.action === SubscribeAction.subscribe) {
          (state.listener as unknown as (listenerMessage: undefined, reasonCode: number) => void)(undefined, ack.reasonCode);
        } else if (ack.action === SubscribeAction.unsubscribe && state.action === SubscribeAction.unsubscribe) {
          (state.listener as unknown as (reasonCode: number) => void)(ack.reasonCode);
        }
      }
      if (ack.action === SubscribeAction.unsubscribe) {
        const index = channels.subscriberContexts.indexOf(context);
        if (index >= 0) channels.subscriberContexts.splice(index, 1);
      }
      return;
    }
  };
  const events = sdk.eventManager as unknown as {
    eventListeners: Array<(event: unknown) => void>;
    notifyEventListeners(event: unknown): void;
  };
  events.notifyEventListeners = event => {
    const contextCurrent = captureContext();
    const generation = admission.snapshot().generation;
    for (const listener of [...events.eventListeners]) {
      const current = admission.snapshot();
      if (current.phase !== 'active' || current.generation !== generation || !contextCurrent()) return;
      listener(event);
    }
  };

  function stop(): void {
    manager.needReconnect = false;
    manager.lockReconnect = false;
    for (const field of ['heartTimer', 'reConnectTimeout', 'pongRespTimer', 'sendTimer'] as const) {
      clearSdkOwnerTimer(state.connection[field]);
      state.connection[field] = undefined;
    }
    state.connection.sendPacketQueue.length = 0;
    manager.tempBufferData.length = 0;
    sends.stop();
    receipts.stop();
    let failed = false;
    for (const task of state.tasks.taskMap.values()) {
      try { task.cancel(); } catch { failed = true; }
    }
    state.tasks.taskMap.clear();
    for (const [raw, wrapper] of sockets) {
      wrapper.destory = true;
      if (raw.readyState !== 3) {
        try { raw.close(); } catch { failed = true; }
      }
    }
    manager.status = ConnectStatus.Disconnect;
    if (failed) throw new MessageOwnerSdkError('sdk_owner_close_failed');
  }
  return {
    async quiesce(generation) {
      admission.quiesce(generation);
      stop();
      await waitForSdkOwnerClosed(sockets.keys(), timeoutMs, pollMs);
      // Queues are now cleared and every raw socket is CLOSED. Unknown sends may drain safely.
      sends.finishUnknown();
      await waitForSdkOwnerDrain(admission.waitForDrain(), timeoutMs);
      const snapshot = admission.snapshot();
      if (snapshot.phase !== 'quiescing' || snapshot.generation !== generation || snapshot.pendingCount) {
        throw new ImOwnerAdmissionError('owner_stale');
      }
      manager.ws = undefined;
      sockets.clear();
      return { generation, pendingCount: 0, stopped: true, closed: true };
    },
    prepare(generation) {
      if (Array.from(sockets.keys()).some(raw => raw.readyState !== 3)) throw new ImOwnerAdmissionError('owner_denied');
      admission.prepare(generation);
    },
    grant(generation) {
      admission.activate(generation);
      receipts.start();
      manager.connect();
    },
  };
}
