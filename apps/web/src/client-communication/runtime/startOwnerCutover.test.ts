import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startCommunicationRuntime } from './start';
import type { CommunicationBootstrap, OctoBuddyCommunicationBridge } from '../hostBridge';
import type { CommunicationMessageOwner } from './messageOwner';
import type { OwnerCutoverCommand } from '../../client-feature/imOwnerCutoverContract';

const f = vi.hoisted(() => ({
  events: [] as string[],
  store: {
    retain: vi.fn(() => vi.fn()), subscribe: vi.fn(() => vi.fn()),
    getSnapshot: () => ({ freshness: 'ready' }), refresh: vi.fn(async () => {}), dispose: vi.fn(),
  },
  app: {
    shared: { currentSpaceId: 'space', spaceRevision: 0, notifyListener: vi.fn() },
    loginInfo: { uid: 'user', token: 'session', sessionRevision: 0, logout: vi.fn() },
    apiClient: { config: { apiURL: 'https://api.test', originRevision: 0 }, logoutCallback: undefined as (() => void) | undefined },
    config: {},
  },
}));
vi.mock('@octo/base', () => ({
  WKApp: f.app, ThemeMode: {}, i18n: {},
  getCurrentImConversationStore: () => f.store,
  getCurrentImUnreadObserver: () => ({ getSnapshot: () => 1, subscribe: () => () => {} }),
  installImReadAttentionGate: () => { throw new Error('unexpected legacy gate'); },
  applyImSpaceContext: ({ space_id }: { space_id: string }) => {
    f.app.shared.currentSpaceId = space_id; f.app.shared.spaceRevision++;
  },
}));
vi.mock('@octo/base/src/im-runtime/connectStatus', () => ({ isImConnected: () => true }));
vi.mock('wukongimjssdk', () => ({ WKSDK: { shared: () => ({ disconnect: vi.fn() }) } }));
vi.mock('@dmwork/summary/src/runtime/desktopAttention', () => ({ createDesktopSummaryAttention: vi.fn() }));
vi.mock('@octo/base/src/Messages/DocumentShareCard/preview', () => ({ resetDocPreviewCache: vi.fn() }));
vi.mock('../documentPreview', () => ({ installHostDocumentPreview: () => () => {} }));
vi.mock('../summaryRequests', () => ({ installSummaryRequests: () => () => {} }));
vi.mock('./lazyDocumentForward', () => ({ installLazyDocumentForward: () => ({
  subscribe: () => () => {}, dispose: vi.fn(), invalidate: vi.fn(),
}) }));

const runtime = { version: 1 as const, ownerId: 'owner', contextId: 'context', epoch: 1, summaryAttention: 'disabled' as const };
const binding = { version: 1 as const, ownerCutoverVersion: 1 as const,
  ownerId: runtime.ownerId, contextId: runtime.contextId, epoch: runtime.epoch, bindingId: 'view' };
const bootstrap = { runtime, ownerCutover: binding, space: { id: 'space', name: '' },
  initialPage: 'chat', initialPresentation: 'workspace' } as CommunicationBootstrap;

function fixture() {
  let ownerCommand: ((value: unknown) => void) | undefined;
  let runtimeCommand: ((value: unknown) => void) | undefined;
  let generation = 0;
  let phase: 'active' | 'preparing' | 'quiescing' = 'active';
  const messages: CommunicationMessageOwner = {
    snapshot: () => ({ generation, phase, pendingCount: 0 }),
    revoke: vi.fn((next?: number) => { generation = next ?? generation + 1; phase = 'quiescing'; return generation; }),
    quiesce: vi.fn(async next => {
      generation = next; phase = 'quiescing';
      return { owner: 'web', generation: next, pendingCount: 0, closed: true, stopped: true, readAttentionRevoked: true };
    }),
    stop: vi.fn(async () => ({ owner: 'web', generation, pendingCount: 0, closed: true, stopped: true, readAttentionRevoked: true })),
    prepare: vi.fn(async next => { generation = next; phase = 'preparing'; }),
    grant: vi.fn(next => { generation = next; phase = 'active'; }), setReadAttention: vi.fn(),
  };
  const methods = {
    onCommand: vi.fn(() => () => {}),
    onRuntimeCommand: vi.fn((fn: (value: unknown) => void) => { runtimeCommand = fn; return () => { runtimeCommand = undefined; }; }),
    reportRuntimeReady: vi.fn(async () => { f.events.push('runtime-ready'); }),
    reportRuntimeSnapshot: vi.fn(), reportRuntimeCommandResult: vi.fn(),
    onOwnerCutoverCommand: vi.fn((fn: (value: unknown) => void) => {
      f.events.push('subscribe'); ownerCommand = fn; return () => { ownerCommand = undefined; };
    }),
    reportOwnerCutoverReady: vi.fn(async () => { f.events.push('owner-ready'); }),
    reportOwnerCutoverResult: vi.fn(async () => true),
  };
  return { messages, methods, host: methods as unknown as OctoBuddyCommunicationBridge,
    ownerCommand: (value: unknown) => ownerCommand?.(value), hasOwnerListener: () => !!ownerCommand,
    runtimeCommand: (value: unknown) => runtimeCommand?.({ version: 1, ...runtime, ...value as object }),
  };
}
function command(operation: OwnerCutoverCommand['operation'], generation: number, requestId = operation): OwnerCutoverCommand {
  return { ...binding, operation, generation, requestId,
    ...(operation === 'grant' ? { prepareRequestId: 'prepare' } : {}),
  } as OwnerCutoverCommand;
}

beforeEach(() => {
  vi.clearAllMocks(); f.events.length = 0;
  f.app.shared.currentSpaceId = 'space'; f.app.shared.spaceRevision = 0;
  f.app.loginInfo.token = 'session'; f.app.loginInfo.sessionRevision = 0;
  f.app.apiClient.config.apiURL = 'https://api.test'; f.app.apiClient.config.originRevision = 0;
  f.app.apiClient.logoutCallback = undefined;
});

describe('owner cutover runtime composition', () => {
  it.each(['onOwnerCutoverCommand', 'reportOwnerCutoverReady', 'reportOwnerCutoverResult'] as const)(
    'requires %s before acquiring runtime data', async key => {
      const h = fixture(); h.host[key] = undefined;
      await expect(startCommunicationRuntime(h.host, bootstrap, h.messages)).rejects.toThrow('protocol');
      expect(f.store.retain).not.toHaveBeenCalled();
    },
  );

  it('requires the installed message owner for a capable bootstrap', async () => {
    const h = fixture();
    await expect(startCommunicationRuntime(h.host, bootstrap)).rejects.toThrow();
    expect(h.methods.reportOwnerCutoverReady).not.toHaveBeenCalled();
    expect(f.store.retain).not.toHaveBeenCalled();
  });

  it('subscribes before ready, preserves lifecycle identity across drain, and requires an explicit grant', async () => {
    const h = fixture();
    h.methods.reportOwnerCutoverReady.mockImplementationOnce(async () => {
      f.events.push('owner-ready'); h.ownerCommand(command('quiesce', 1));
    });
    const owner = await startCommunicationRuntime(h.host, bootstrap, h.messages);
    try {
      expect(f.events).toEqual(['subscribe', 'owner-ready', 'runtime-ready']);
      await vi.waitFor(() => expect(h.methods.reportOwnerCutoverResult).toHaveBeenCalledWith(expect.objectContaining({ status: 'drained' })));
      h.ownerCommand(command('prepare', 2));
      await vi.waitFor(() => expect(h.methods.reportOwnerCutoverResult).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready' })));
      expect(h.messages.grant).not.toHaveBeenCalled();
      h.ownerCommand(command('grant', 2));
      await vi.waitFor(() => expect(h.methods.reportOwnerCutoverResult).toHaveBeenCalledWith(expect.objectContaining({ status: 'granted' })));
      expect(h.messages.grant).toHaveBeenCalledExactlyOnceWith(2);
    } finally { owner.dispose(); }
    expect(h.hasOwnerListener()).toBe(false);
  });

  it.each(['session', 'origin', 'space'] as const)('cancels startup after %s changes during ready report', async kind => {
    const h = fixture();
    h.methods.reportOwnerCutoverReady.mockImplementationOnce(async () => {
      if (kind === 'session') f.app.loginInfo.token = 'rotated';
      if (kind === 'origin') f.app.apiClient.config.originRevision++;
      if (kind === 'space') f.app.shared.spaceRevision++;
    });
    await expect(startCommunicationRuntime(h.host, bootstrap, h.messages)).rejects.toThrow('owner_context_revoked');
    expect(h.hasOwnerListener()).toBe(false);
    expect(h.messages.revoke).toHaveBeenCalled();
    expect(h.messages.stop).toHaveBeenCalled();
    expect(f.store.retain).not.toHaveBeenCalled();
  });

  it('observes a failed ready report and removes the endpoint', async () => {
    const h = fixture();
    h.methods.reportOwnerCutoverReady.mockRejectedValueOnce(new Error('denied'));
    await expect(startCommunicationRuntime(h.host, bootstrap, h.messages)).rejects.toThrow('denied');
    expect(h.hasOwnerListener()).toBe(false);
    expect(h.messages.stop).toHaveBeenCalled();
    expect(h.methods.reportRuntimeReady).not.toHaveBeenCalled();
  });

  it('rejects stale binding commands after a live Space switch', async () => {
    const h = fixture(); const owner = await startCommunicationRuntime(h.host, bootstrap, h.messages);
    try {
      h.runtimeCommand({ type: 'spaceChanged', next: { contextId: 'next', epoch: 2, space: { id: 'next-space', name: '' } } });
      h.ownerCommand(command('prepare', 2));
      await Promise.resolve();
      expect(h.messages.prepare).not.toHaveBeenCalled();
      expect(h.messages.grant).not.toHaveBeenCalled();
    } finally { owner.dispose(); }
  });
});
