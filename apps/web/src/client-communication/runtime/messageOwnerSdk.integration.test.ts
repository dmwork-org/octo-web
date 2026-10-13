// @vitest-environment node
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import WKSDK, { Channel, ConnectStatus, MessageText, type SendackPacket } from 'wukongimjssdk';
import { createImOwnerAdmission } from '@octo/base/src/im-runtime/ownerAdmission';
import { installMessageOwnerSdk } from './messageOwnerSdk';

const require = createRequire(import.meta.url);
// jsdom already owns ws in this test workspace; no production dependency is added.
const wsRequire = createRequire(require.resolve('jsdom'));
interface Peer {
  readyState: number; send(data: Buffer): void; terminate(): void;
  on(name: string, callback: (data: unknown) => void): void;
}
interface SocketServer {
  clients: Set<Peer>;
  on(name: 'connection', callback: (socket: Peer) => void): void;
  close(callback: () => void): void;
}
const ws = wsRequire('ws') as {
  WebSocket: typeof globalThis.WebSocket;
  WebSocketServer: new (options: { server: Server }) => SocketServer;
};
const sdkRequire = createRequire(require.resolve('wukongimjssdk/package.json'));
const curve = sdkRequire('curve25519-js') as { generateKeyPair(seed: Uint8Array): { public: Uint8Array } };

function string(value: string): Buffer {
  const bytes = Buffer.from(value); const length = Buffer.alloc(2);
  length.writeUInt16BE(bytes.length); return Buffer.concat([length, bytes]);
}
function frame(type: number, body: Buffer, flags = 0): Buffer {
  const length: number[] = []; let rest = body.length;
  do { let digit = rest % 128; rest = Math.floor(rest / 128); if (rest) digit |= 128; length.push(digit); } while (rest);
  return Buffer.concat([Buffer.from([(type << 4) | flags, ...length]), body]);
}
function connack(): Buffer {
  const key = Buffer.from(curve.generateKeyPair(randomBytes(32)).public).toString('base64');
  return frame(2, Buffer.concat([
    Buffer.from([5]), Buffer.alloc(8), Buffer.from([1]), string(key),
    string('0123456789abcdef0123456789abcdef'), Buffer.alloc(8),
  ]), 1);
}
function ack(seq: number): Buffer {
  const body = Buffer.alloc(17); body.writeBigUInt64BE(1001n); body.writeInt32BE(seq, 8);
  body.writeInt32BE(1, 12); body[16] = 1; return frame(4, body);
}
async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('loopback evidence timeout');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
async function loopback() {
  const server = createServer(); const sockets = new ws.WebSocketServer({ server });
  const evidence = { connections: 0, maxActive: 0, sends: [] as number[] };
  const pending = new Map<number, Peer>();
  sockets.on('connection', peer => {
    evidence.connections++; evidence.maxActive = Math.max(evidence.maxActive, sockets.clients.size);
    let buffer = Buffer.alloc(0);
    peer.on('error', () => {});
    peer.on('message', raw => {
      buffer = Buffer.concat([buffer, Buffer.from(raw as Uint8Array)]);
      while (buffer.length) {
        const type = buffer[0] >> 4;
        if (type === 7) { peer.send(Buffer.from([0x80])); buffer = buffer.subarray(1); continue; }
        let size = 0; let factor = 1; let offset = 1; let digit: number;
        do { if (offset >= buffer.length) return; digit = buffer[offset++]; size += (digit & 127) * factor; factor *= 128; } while (digit & 128);
        if (buffer.length < offset + size) return;
        const body = buffer.subarray(offset, offset + size); buffer = buffer.subarray(offset + size);
        if (type === 1) peer.send(connack());
        if (type === 3) {
          const seq = body.readInt32BE(1); evidence.sends.push(seq); pending.set(seq, peer);
        }
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('loopback address missing');
  return {
    url: `ws://127.0.0.1:${address.port}`, evidence, active: () => sockets.clients.size,
    acknowledge(seq: number) { pending.get(seq)?.send(ack(seq)); pending.delete(seq); },
    async stop() {
      for (const peer of sockets.clients) peer.terminate();
      await new Promise<void>(resolve => sockets.close(resolve));
      await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}

describe('real Web SDK owner loopback', () => {
  it('drains ACK/unknown and actual sockets before an explicit new grant', async () => {
    const network = await loopback();
    vi.stubGlobal('WebSocket', ws.WebSocket);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const sdk = WKSDK.shared();
    sdk.config.uid = 'fixture-user'; sdk.config.token = 'fixture-token'; sdk.config.addr = network.url;
    sdk.config.provider.connectAddrCallback = undefined as unknown as typeof sdk.config.provider.connectAddrCallback;
    sdk.config.sendFrequency = 5; sdk.config.heartbeatInterval = 10000; sdk.config.receiptFlushInterval = 10000;
    const owner = createImOwnerAdmission();
    const adapter = installMessageOwnerSdk(sdk, owner, { drainTimeoutMs: 3000, pollIntervalMs: 5 });
    const acknowledgements: SendackPacket[] = [];
    const listener = (packet: SendackPacket) => { acknowledgements.push(packet); };
    sdk.chatManager.addMessageStatusListener(listener);
    try {
      sdk.connect();
      await waitFor(() => sdk.connectManager.status === ConnectStatus.Connected);
      const confirmed = await sdk.chatManager.send(new MessageText('await ack'), new Channel('peer', 1));
      expect(owner.snapshot().pendingCount).toBe(1);
      await waitFor(() => network.evidence.sends.includes(confirmed.clientSeq));
      network.acknowledge(confirmed.clientSeq);
      await waitFor(() => acknowledgements.length === 1);
      expect(owner.snapshot().pendingCount).toBe(0);
      const unknown = await sdk.chatManager.send(new MessageText('unknown outcome'), new Channel('peer', 1));
      await waitFor(() => network.evidence.sends.includes(unknown.clientSeq));
      expect(owner.snapshot().pendingCount).toBe(1);
      const firstRaw = (sdk.connectManager as unknown as { ws: { ws: { readyState: number } } }).ws.ws;
      const stopped = adapter.quiesce(1);
      expect(owner.snapshot().phase).toBe('quiescing');
      await expect(sdk.chatManager.send(new MessageText('denied'), new Channel('peer', 1))).rejects.toMatchObject({ code: 'owner_denied' });
      await expect(stopped).resolves.toEqual({ generation: 1, pendingCount: 0, stopped: true, closed: true });
      expect(firstRaw.readyState).toBe(3);
      await waitFor(() => network.active() === 0);
      expect(acknowledgements).toHaveLength(1);
      expect(sdk.chatManager.sendingQueues.size).toBe(0);
      expect(sdk.chatManager.sendPacketQueue).toHaveLength(0);
      await adapter.prepare(2);
      await new Promise(resolve => setTimeout(resolve, 25));
      expect(network.evidence.connections).toBe(1);
      adapter.grant(2);
      await waitFor(() => sdk.connectManager.status === ConnectStatus.Connected && network.evidence.connections === 2);
      expect(network.evidence.maxActive).toBe(1);
      await expect(adapter.quiesce(3)).resolves.toMatchObject({ generation: 3, closed: true });
      expect(owner.snapshot().pendingCount).toBe(0);
    } finally {
      sdk.chatManager.removeMessageStatusListener(listener);
      if (owner.snapshot().phase === 'active') await adapter.quiesce(owner.snapshot().generation + 1);
      await network.stop();
      log.mockRestore(); vi.unstubAllGlobals();
    }
  }, 15000);
});
