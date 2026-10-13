import type WKSDK from 'wukongimjssdk';
import { PacketType, SendPacket, type Packet } from 'wukongimjssdk';
import { ImOwnerAdmissionError, type ImOwnerAdmission, type ImOwnerOperation } from '@octo/base/src/im-runtime/ownerAdmission';
import { clearSdkOwnerTimer, type SdkOwnerChat } from './messageOwnerSdkBoundary';

interface PendingSend {
  ticket: ImOwnerOperation;
  settled: boolean;
  acknowledged: boolean;
  finalUnknown: boolean;
  contextCurrent: () => boolean;
}

/** A local SDK Message is unknown. Only its originating ACK or closed transport drains it. */
export function installMessageOwnerSdkSends(
  sdk: WKSDK, admission: ImOwnerAdmission, state: SdkOwnerChat, captureContext: () => () => boolean,
) {
  const chat = sdk.chatManager;
  const sends = new Map<number, PendingSend>();
  let issuing: PendingSend | undefined;
  const originalGetPacket = chat.getSendPacketWithOptions.bind(chat);
  const originalSend = chat.send.bind(chat);
  const originalWithOptions = chat.sendWithOptions.bind(chat);
  function release(entry: PendingSend): void {
    if (entry.settled && (entry.acknowledged || entry.finalUnknown)) {
      entry.ticket.release();
      for (const [seq, value] of sends) if (value === entry) sends.delete(seq);
    }
  }
  chat.getSendPacketWithOptions = (...args) => {
    if (!issuing) throw new ImOwnerAdmissionError('owner_denied');
    issuing.ticket.assertCurrent();
    if (!issuing.contextCurrent()) throw new ImOwnerAdmissionError('owner_stale');
    const packet = originalGetPacket(...args);
    sends.set(packet.clientSeq, issuing);
    return packet;
  };
  chat.send = (...args) => {
    // Original send delegates to sendWithOptions; count only the actual issuance.
    if (admission.snapshot().phase !== 'active') return Promise.reject(new ImOwnerAdmissionError('owner_denied'));
    return originalSend(...args);
  };
  chat.sendWithOptions = async (...args) => {
    const contextCurrent = captureContext();
    const entry: PendingSend = {
      ticket: admission.begin('send'), settled: false, acknowledged: false, finalUnknown: false,
      contextCurrent,
    };
    const previous = issuing;
    let local: ReturnType<typeof originalWithOptions>;
    try {
      issuing = entry;
      local = originalWithOptions(...args);
    } catch (error) {
      entry.settled = true;
      if (!Array.from(sends.values()).includes(entry)) entry.ticket.release();
      throw error;
    } finally {
      issuing = previous;
    }
    try {
      const message = await local;
      entry.ticket.assertCurrent();
      if (!entry.contextCurrent()) throw new ImOwnerAdmissionError('owner_stale');
      return message;
    } finally {
      if (!entry.contextCurrent()) {
        entry.finalUnknown = true;
        const clientSeqs = new Set<number>();
        for (const [clientSeq, value] of sends) {
          if (value === entry) {
            clientSeqs.add(clientSeq);
            sends.delete(clientSeq);
            state.sendingQueues.delete(clientSeq);
          }
        }
        state.sendPacketQueue = state.sendPacketQueue.filter(packet =>
          !(packet instanceof SendPacket && clientSeqs.has(packet.clientSeq)),
        );
      }
      entry.settled = true;
      if (!Array.from(sends.values()).includes(entry)) entry.ticket.release();
      release(entry);
    }
  };
  chat.notifyMessageStatusListeners = packet => {
    const entry = sends.get(packet.clientSeq);
    if (!entry) return;
    const current = entry.ticket.isCurrent() && entry.contextCurrent();
    const generation = entry.ticket.generation;
    entry.acknowledged = true;
    // Retire independently of consumer listeners throwing or a local send still settling.
    release(entry);
    if (current) {
      for (const listener of [...chat.sendStatusListeners]) {
        const state = admission.snapshot();
        if (state.phase !== 'active' || state.generation !== generation || !entry.contextCurrent()) return;
        listener(packet);
      }
    }
  };
  chat.notifyMessageListeners = message => {
    const generation = admission.snapshot().generation;
    const contextCurrent = captureContext();
    for (const listener of [...chat.listeners]) {
      const state = admission.snapshot();
      if (state.phase !== 'active' || state.generation !== generation || !contextCurrent()) return;
      listener(message);
    }
  };
  chat.notifyCMDListeners = message => {
    const generation = admission.snapshot().generation;
    const contextCurrent = captureContext();
    for (const listener of [...chat.cmdListeners]) {
      const state = admission.snapshot();
      if (state.phase !== 'active' || state.generation !== generation || !contextCurrent()) return;
      listener(message);
    }
  };
  function packetCurrent(packet: Packet): boolean {
    if (packet instanceof SendPacket || packet.packetType === PacketType.SEND) {
      const entry = sends.get((packet as SendPacket).clientSeq);
      return entry?.ticket.isCurrent() === true && entry.contextCurrent();
    }
    return admission.snapshot().phase === 'active';
  }
  chat.sendSendPacket = packet => {
    if (!packetCurrent(packet)) throw new ImOwnerAdmissionError('owner_denied');
    state.sendPacketQueue.push(packet);
    if (state.sendTimer) return;
    const generation = admission.snapshot().generation;
    state.sendTimer = setInterval(() => {
      const current = admission.snapshot();
      if (current.phase !== 'active' || current.generation !== generation) return;
      const data: number[] = [];
      for (let count = 0; state.sendPacketQueue.length && count < sdk.config.sendCountOfEach; count++) {
        const pending = state.sendPacketQueue.shift();
        if (pending && packetCurrent(pending)) data.push(...sdk.config.proto.encode(pending));
      }
      if (data.length) sdk.connectManager.send(new Uint8Array(data));
    }, sdk.config.sendFrequency);
  };
  const originalFlush = chat.flushSendingQueue.bind(chat);
  chat.flushSendingQueue = () => {
    if (admission.snapshot().phase === 'active') originalFlush();
  };
  const tasks = new WeakMap<object, { generation: number; contextCurrent: () => boolean }>();
  const originalAddTask = sdk.taskManager.addTask.bind(sdk.taskManager);
  const taskManager = sdk.taskManager as unknown as {
    listeners: Array<(task: unknown) => void>;
  };
  sdk.taskManager.addTask = task => {
    const current = admission.snapshot();
    if (current.phase !== 'active' || (tasks.has(task) && (
      tasks.get(task)?.generation !== current.generation || !tasks.get(task)?.contextCurrent()
    ))) {
      throw new ImOwnerAdmissionError('owner_denied');
    }
    tasks.set(task, { generation: current.generation, contextCurrent: captureContext() });
    originalAddTask(task);
  };
  sdk.taskManager.notifyListeners = task => {
    const current = admission.snapshot();
    const origin = tasks.get(task);
    if (current.phase !== 'active' || origin?.generation !== current.generation || !origin.contextCurrent()) return;
    for (const listener of [...taskManager.listeners]) {
      const state = admission.snapshot();
      if (state.phase !== 'active' || state.generation !== origin.generation || !origin.contextCurrent()) return;
      listener(task);
    }
  };
  return {
    packetCurrent,
    stop(): void {
      clearSdkOwnerTimer(state.sendTimer);
      state.sendTimer = undefined;
      state.sendPacketQueue.length = 0;
      state.sendingQueues.clear();
    },
    finishUnknown(): void {
      for (const entry of Array.from(sends.values())) {
        entry.finalUnknown = true;
        release(entry);
      }
    },
  };
}
