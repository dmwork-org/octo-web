import WKSDK from 'wukongimjssdk';
import { vi } from 'vitest';
import { createImOwnerAdmission } from '@octo/base/src/im-runtime/ownerAdmission';
import { installMessageOwnerSdk, type MessageOwnerSdkOptions } from './messageOwnerSdk';

/** Real SDK managers, with only the native browser socket replaced for controlled timing. */
export class OwnerTestSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: OwnerTestSocket[] = [];
  readyState = 0;
  binaryType = '';
  onopen: ((event: Event) => unknown) | null = null;
  onmessage: ((event: MessageEvent) => unknown) | null = null;
  onclose: ((event: CloseEvent) => unknown) | null = null;
  onerror: ((event: Event) => unknown) | null = null;
  send = vi.fn<(data: unknown) => void>();
  close = vi.fn(() => { this.readyState = 2; });
  constructor(readonly url: string) { OwnerTestSocket.instances.push(this); }
  open(): void { this.readyState = 1; this.onopen?.(new Event('open')); }
  finishClose(): void { this.readyState = 3; this.onclose?.(new CloseEvent('close')); }
}
export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export async function settleMicrotasks(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}
export function sdkOwnerFixture(options: MessageOwnerSdkOptions = {}) {
  vi.stubGlobal('WebSocket', OwnerTestSocket);
  OwnerTestSocket.instances = [];
  const old = WKSDK.shared();
  for (const manager of [
    old.connectManager, old.chatManager, old.channelManager, old.conversationManager,
    old.reminderManager, old.receiptManager, old.messageContentManager, old.securityManager,
  ]) Reflect.set(manager.constructor, 'instance', undefined);
  Reflect.set(WKSDK, 'instance', undefined);
  vi.clearAllTimers();
  const sdk = WKSDK.shared();
  sdk.config.addr = 'ws://owner.test';
  sdk.config.uid = 'owner-test-user';
  sdk.securityManager.aesKey = '0123456789abcdef';
  sdk.securityManager.aesIV = '0123456789abcdef';
  const admission = createImOwnerAdmission();
  const lifecycle = installMessageOwnerSdk(sdk, admission, { drainTimeoutMs: 100, pollIntervalMs: 1, ...options });
  const connect = () => {
    sdk.connect();
    return OwnerTestSocket.instances[OwnerTestSocket.instances.length - 1]!;
  };
  const closeAll = () => {
    for (const socket of OwnerTestSocket.instances) socket.finishClose();
  };
  return { sdk, admission, lifecycle, connect, closeAll };
}
