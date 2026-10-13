import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Channel, ConnectStatus, MessageText, SendackPacket, SendOptions, SendPacket, SubscribeAction } from 'wukongimjssdk';
import { deferred, OwnerTestSocket, sdkOwnerFixture, settleMicrotasks } from './messageOwnerSdkFixture';

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Web message SDK owner native lifecycle', () => {
  it('captures the address callback assigned by startup and drains its actual settlement', async () => {
    const h = sdkOwnerFixture();
    const request = deferred<void>();
    let address!: (value: string) => void;
    h.sdk.config.provider.connectAddrCallback = callback => {
      address = callback;
      return request.promise;
    };
    h.sdk.connect();
    expect(h.admission.snapshot().pendingCount).toBe(1);
    const stop = h.lifecycle.quiesce(1);
    let finished = false;
    void stop.then(() => { finished = true; });
    address('ws://late.test');
    await settleMicrotasks();
    expect(OwnerTestSocket.instances).toHaveLength(0);
    expect(finished).toBe(false);
    request.resolve();
    await expect(stop).resolves.toMatchObject({ generation: 1, pendingCount: 0, stopped: true, closed: true });
  });

  it('does not release an async provider when it delivers before the Promise settles', async () => {
    const h = sdkOwnerFixture();
    const request = deferred<void>();
    h.sdk.config.provider.connectAddrCallback = callback => {
      callback('ws://early.test');
      return request.promise;
    };
    h.sdk.connect();
    expect(h.admission.snapshot().pendingCount).toBe(1);
    const stop = h.lifecycle.quiesce(1);
    h.closeAll();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.admission.snapshot().pendingCount).toBe(1);
    request.resolve();
    await expect(stop).resolves.toMatchObject({ closed: true });
  });

  it('blocks an old address callback even after a later explicit grant', async () => {
    const h = sdkOwnerFixture();
    let oldAddress!: (value: string) => void;
    h.sdk.config.provider.connectAddrCallback = callback => {
      oldAddress = callback;
      return Promise.resolve();
    };
    h.sdk.connect();
    await settleMicrotasks();
    await h.lifecycle.quiesce(1);
    h.lifecycle.prepare(2);
    expect(OwnerTestSocket.instances).toHaveLength(0);
    h.sdk.config.provider.connectAddrCallback = callback => callback('ws://new.test');
    h.lifecycle.grant(2);
    oldAddress('ws://old.test');
    expect(OwnerTestSocket.instances.map(socket => socket.url)).toEqual(['ws://new.test']);
    const stop = h.lifecycle.quiesce(3);
    h.closeAll();
    await vi.advanceTimersByTimeAsync(1);
    await stop;
  });

  it('requires every raw socket CLOSED despite SDK Disconnect and suppressed onclose', async () => {
    const h = sdkOwnerFixture();
    const first = h.connect();
    h.sdk.connectManager.status = ConnectStatus.Disconnect;
    h.sdk.connectManager.connectWithAddr('ws://second.test');
    const second = OwnerTestSocket.instances[1]!;
    expect(first.close).toHaveBeenCalledOnce();
    const stop = h.lifecycle.quiesce(1);
    let finished = false;
    void stop.then(() => { finished = true; });
    second.finishClose();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.sdk.connectManager.status).toBe(ConnectStatus.Disconnect);
    expect(finished).toBe(false);
    first.finishClose();
    await vi.advanceTimersByTimeAsync(1);
    await expect(stop).resolves.toMatchObject({ closed: true });
    expect(h.sdk.connectManager.ws).toBeUndefined();
  });

  it('fails closed on raw close timeout and permits a truthful retry after closure', async () => {
    const h = sdkOwnerFixture();
    h.connect();
    const stop = h.lifecycle.quiesce(1);
    const rejection = expect(stop).rejects.toThrow('sdk_owner_drain_timeout');
    await vi.advanceTimersByTimeAsync(101);
    await rejection;
    expect(h.admission.snapshot().phase).toBe('quiescing');
    expect(() => h.lifecycle.prepare(2)).toThrow('owner_denied');
    h.closeAll();
    await expect(h.lifecycle.quiesce(1)).resolves.toMatchObject({ closed: true });
  });

  it('propagates close failure with admission already revoked', async () => {
    const h = sdkOwnerFixture();
    const raw = h.connect();
    raw.close.mockImplementation(() => { throw new Error('private native details'); });
    await expect(h.lifecycle.quiesce(1)).rejects.toThrow('sdk_owner_close_failed');
    expect(h.admission.snapshot().phase).toBe('quiescing');
    expect(() => h.sdk.connect()).toThrow('owner_denied');
  });

  it('does not let a stale socket open handshake into its replacement', async () => {
    const h = sdkOwnerFixture();
    const first = h.connect();
    const staleOpen = first.onopen!;
    h.sdk.connectManager.status = ConnectStatus.Disconnect;
    h.sdk.connectManager.connectWithAddr('ws://second.test');
    const second = OwnerTestSocket.instances[1]!;
    second.readyState = 1;
    staleOpen(new Event('open'));
    expect(first.send).not.toHaveBeenCalled();
    expect(second.send).not.toHaveBeenCalled();
    const stop = h.lifecycle.quiesce(1);
    h.closeAll();
    await vi.advanceTimersByTimeAsync(1);
    await stop;
  });

  it('retains connection across Space changes while operation context becomes stale', async () => {
    let spaceRevision = 0;
    let accountRevision = 0;
    const h = sdkOwnerFixture({
      captureContext: () => { const captured = spaceRevision; return () => captured === spaceRevision; },
      captureConnectionContext: () => { const captured = accountRevision; return () => captured === accountRevision; },
    });
    const raw = h.connect();
    raw.readyState = 1;
    spaceRevision++;
    h.sdk.connectManager.send(new Uint8Array([1]));
    expect(raw.send).toHaveBeenCalledOnce();
    accountRevision++;
    h.sdk.connectManager.send(new Uint8Array([2]));
    expect(raw.send).toHaveBeenCalledOnce();
    const stop = h.lifecycle.quiesce(1);
    h.closeAll();
    await vi.advanceTimersByTimeAsync(1);
    await stop;
  });
});

describe('Web message SDK send unknown/ACK registry', () => {
  const channel = new Channel('peer', 1);
  it('keeps the local Message unknown until its originating ACK', async () => {
    const h = sdkOwnerFixture();
    h.connect().readyState = 1;
    const local = await h.sdk.chatManager.send(new MessageText('local unknown'), channel);
    expect(h.admission.snapshot().pendingCount).toBe(1);
    const ack = new SendackPacket();
    ack.clientSeq = local.clientSeq;
    await h.sdk.chatManager.onPacket(ack);
    expect(h.admission.snapshot().pendingCount).toBe(0);
    const stop = h.lifecycle.quiesce(1);
    h.closeAll();
    await vi.advanceTimersByTimeAsync(1);
    await stop;
  });

  it('handles an early ACK before local send Promise settles', async () => {
    const h = sdkOwnerFixture();
    h.connect().readyState = 1;
    h.sdk.chatManager.addMessageListener(message => {
      const ack = new SendackPacket();
      ack.clientSeq = message.clientSeq;
      h.sdk.chatManager.notifyMessageStatusListeners(ack);
    });
    await h.sdk.chatManager.sendWithOptions(new MessageText('early'), channel, new SendOptions());
    expect(h.admission.snapshot().pendingCount).toBe(0);
    const stop = h.lifecycle.quiesce(1);
    h.closeAll();
    await vi.advanceTimersByTimeAsync(1);
    await stop;
  });

  it('does not call late ACK listeners and drains unknown only after CLOSED and cleared queues', async () => {
    const h = sdkOwnerFixture();
    h.connect().readyState = 1;
    const listener = vi.fn();
    h.sdk.chatManager.addMessageStatusListener(listener);
    const local = await h.sdk.chatManager.send(new MessageText('uncertain'), channel);
    const stop = h.lifecycle.quiesce(1);
    expect(h.sdk.chatManager.sendingQueues.size).toBe(0);
    expect(h.sdk.chatManager.sendPacketQueue).toHaveLength(0);
    expect(h.admission.snapshot().pendingCount).toBe(1);
    const ack = new SendackPacket();
    ack.clientSeq = local.clientSeq;
    h.sdk.chatManager.notifyMessageStatusListeners(ack);
    expect(listener).not.toHaveBeenCalled();
    h.closeAll();
    await vi.advanceTimersByTimeAsync(1);
    await stop;
    h.lifecycle.prepare(2);
    h.lifecycle.grant(2);
    await vi.advanceTimersByTimeAsync(h.sdk.config.sendFrequency + 1);
    expect(OwnerTestSocket.instances[1]?.send).not.toHaveBeenCalled();
  });

  it('denies public send entrances and silent low-level task/timer entrances after revoke', async () => {
    const h = sdkOwnerFixture();
    const raw = h.connect();
    raw.readyState = 1;
    const stop = h.lifecycle.quiesce(1);
    await expect(h.sdk.chatManager.send(new MessageText('x'), channel)).rejects.toThrow('owner_denied');
    await expect(h.sdk.chatManager.sendWithOptions(new MessageText('x'), channel, new SendOptions())).rejects.toThrow('owner_denied');
    expect(() => h.sdk.chatManager.sendSendPacket(new SendPacket())).toThrow('owner_denied');
    h.sdk.connectManager.sendPacket(new SendPacket());
    h.sdk.connectManager.wssend(new SendPacket());
    h.sdk.connectManager.send(new Uint8Array([9]));
    expect(raw.send).not.toHaveBeenCalled();
    h.closeAll();
    await vi.advanceTimersByTimeAsync(1);
    await stop;
  });

  it('clears reconnect/heart/pong/send/receipt timers and resets reconnect lock', async () => {
    const h = sdkOwnerFixture();
    const raw = h.connect();
    raw.readyState = 1;
    h.sdk.connectManager.restHeart();
    h.sdk.connectManager.reConnect();
    h.sdk.connectManager.pongRespTimer = setTimeout(() => h.sdk.connect(), 3);
    await h.sdk.chatManager.send(new MessageText('queued'), channel);
    expect(vi.getTimerCount()).toBeGreaterThan(1);
    const stop = h.lifecycle.quiesce(1);
    h.closeAll();
    await vi.advanceTimersByTimeAsync(1);
    await stop;
    expect(vi.getTimerCount()).toBe(0);
    expect(h.sdk.connectManager.lockReconnect).toBe(false);
    await vi.advanceTimersByTimeAsync(10000);
    expect(OwnerTestSocket.instances).toHaveLength(1);
    expect(raw.send).not.toHaveBeenCalled();
  });
});

describe('Web SDK inbound fan-out stops at the owner boundary', () => {
  it('stops command listeners after the first listener revokes owner', async () => {
    const h = sdkOwnerFixture();
    const first = vi.fn(() => { void h.lifecycle.quiesce(1); });
    const second = vi.fn();
    h.sdk.chatManager.addCMDListener(first);
    h.sdk.chatManager.addCMDListener(second);
    h.sdk.chatManager.notifyCMDListeners(h.sdk.newMessage());
    await settleMicrotasks();
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    await h.lifecycle.quiesce(1).catch(() => {});
  });

  it('stops event listeners after the first listener changes the owner context', () => {
    let revision = 0;
    const h = sdkOwnerFixture({ captureContext: () => { const origin = revision; return () => origin === revision; } });
    const first = vi.fn(() => { revision++; });
    const second = vi.fn();
    const events = h.sdk.eventManager as unknown as { addEventListener(listener: (event: unknown) => void): void; notifyEventListeners(event: unknown): void };
    events.addEventListener(first);
    events.addEventListener(second);
    events.notifyEventListeners({ type: 'owner-event' });
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  it('stops channel subscription listeners after first listener revokes owner', async () => {
    const h = sdkOwnerFixture();
    const target = new Channel('peer', 1);
    const first = vi.fn(() => { void h.lifecycle.quiesce(1); });
    const second = vi.fn();
    // SDK onSubscribe coalesces one listener per channel. Build the runtime
    // context explicitly to exercise the real multi-listener fan-out guard.
    (h.sdk.channelManager as unknown as { subscriberContexts: unknown[] }).subscriberContexts.push({
      channel: target,
      listenerStates: [
        { action: SubscribeAction.subscribe, listener: first },
        { action: SubscribeAction.subscribe, listener: second },
      ],
    });
    const message = h.sdk.newMessage();
    message.channel = target;
    h.sdk.channelManager.notifySubscribeIfNeed(message);
    await settleMicrotasks();
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    await h.lifecycle.quiesce(1).catch(() => {});
  });

  it('releases connect operation when connection context capture itself throws', () => {
    const h = sdkOwnerFixture({ captureConnectionContext: () => { throw new Error('context unavailable'); } });
    expect(() => h.sdk.connect()).toThrow('context unavailable');
    expect(h.admission.snapshot().pendingCount).toBe(0);
  });
});
