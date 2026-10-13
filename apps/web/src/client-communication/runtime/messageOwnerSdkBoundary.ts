import type WKSDK from 'wukongimjssdk';
import type { Message, Packet, SendPacket } from 'wukongimjssdk';

/** SDK 1.3.5 private state is isolated here and validated before installing guards. */
export type SdkOwnerTimer = ReturnType<typeof setTimeout> | number | null | undefined;
export interface SdkOwnerRawSocket {
  readonly readyState: number;
  close(): void;
  send(data: unknown): void;
  onopen: ((event: Event) => unknown) | null;
  onmessage: ((event: MessageEvent) => unknown) | null;
  onclose: ((event: CloseEvent) => unknown) | null;
  onerror: ((event: Event) => unknown) | null;
}
export interface SdkOwnerSocket {
  ws: SdkOwnerRawSocket;
  destory: boolean;
  platform?: unknown;
  send(data: unknown): void;
  close(): void;
  onopen(callback: () => void): void;
  onmessage(callback: (data: unknown) => void): void;
  onclose(callback: (event: CloseEvent) => void): void;
  onerror(callback: (event: Event) => void): void;
}
export interface SdkOwnerConnection {
  ws?: SdkOwnerSocket;
  heartTimer: SdkOwnerTimer;
  reConnectTimeout: SdkOwnerTimer;
  pongRespTimer: SdkOwnerTimer;
  sendTimer: SdkOwnerTimer;
  sendPacketQueue: Packet[];
}
export interface SdkOwnerChat {
  sendTimer: SdkOwnerTimer;
  sendingQueues: Map<number, SendPacket>;
  sendPacketQueue: Packet[];
}
export interface SdkOwnerReceipt {
  timer: SdkOwnerTimer;
  channelMessagesMap: Map<string, Message[]>;
  setup(flushInterval: number): void;
  flush(channelKey: string): void;
  flushLoop(): void;
}
export interface SdkOwnerTasks {
  taskMap: Map<string, { cancel(): void }>;
}

export class MessageOwnerSdkError extends Error {
  constructor(readonly code: 'sdk_owner_incompatible' | 'sdk_owner_close_failed' | 'sdk_owner_drain_timeout') {
    super(code);
    this.name = 'MessageOwnerSdkError';
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function functions(value: Record<string, unknown>, keys: string[]): boolean {
  return keys.every(key => typeof value[key] === 'function');
}
function requireCompatible(ok: boolean): asserts ok {
  if (!ok) throw new MessageOwnerSdkError('sdk_owner_incompatible');
}
export function readSdkOwnerState(sdk: WKSDK) {
  const connection: unknown = sdk.connectManager;
  const chat: unknown = sdk.chatManager;
  const receipt: unknown = sdk.receiptManager;
  const tasks: unknown = sdk.taskManager;
  requireCompatible(object(connection) && Array.isArray(connection.sendPacketQueue) && functions(connection, [
    'connect', 'onlyConnect', 'connectWithAddr', 'reConnect', 'send', 'sendPacket', 'wssend',
    'restHeart', 'sendPing', 'disconnect', 'onPacket', 'sendRecvackPacket',
  ]));
  requireCompatible(object(chat) && chat.sendingQueues instanceof Map && Array.isArray(chat.sendPacketQueue) && functions(chat, [
    'send', 'sendWithOptions', 'getSendPacketWithOptions', 'sendSendPacket', 'notifyMessageStatusListeners',
  ]));
  requireCompatible(object(receipt) && receipt.channelMessagesMap instanceof Map && functions(receipt, [
    'setup', 'flush', 'flushLoop', 'addReceiptMessages', 'notifyListeners',
  ]));
  requireCompatible(object(tasks) && tasks.taskMap instanceof Map && functions(tasks, ['addTask']));
  return {
    connection: connection as unknown as SdkOwnerConnection,
    chat: chat as unknown as SdkOwnerChat,
    receipt: receipt as unknown as SdkOwnerReceipt,
    tasks: tasks as unknown as SdkOwnerTasks,
  };
}
export function readSdkOwnerSocket(value: unknown): SdkOwnerSocket {
  requireCompatible(object(value) && typeof value.destory === 'boolean' && !value.platform && functions(value, [
    'send', 'close', 'onopen', 'onmessage', 'onclose', 'onerror',
  ]));
  const raw = value.ws;
  requireCompatible(object(raw) && typeof raw.readyState === 'number' && functions(raw, ['close', 'send']));
  return value as unknown as SdkOwnerSocket;
}
export function clearSdkOwnerTimer(timer: SdkOwnerTimer): void {
  if (timer !== undefined && timer !== null) {
    clearInterval(timer);
    clearTimeout(timer);
  }
}

/** No SDK Disconnect status or wrapper onclose callback is accepted as CLOSED evidence. */
export async function waitForSdkOwnerClosed(
  sockets: Iterable<SdkOwnerRawSocket>, timeoutMs: number, pollIntervalMs: number,
): Promise<void> {
  const started = Date.now();
  const captured = Array.from(sockets);
  while (captured.some(socket => socket.readyState !== 3)) {
    if (Date.now() - started >= timeoutMs) throw new MessageOwnerSdkError('sdk_owner_drain_timeout');
    await new Promise<void>(resolve => setTimeout(resolve, pollIntervalMs));
  }
}
export async function waitForSdkOwnerDrain(promise: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new MessageOwnerSdkError('sdk_owner_drain_timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
