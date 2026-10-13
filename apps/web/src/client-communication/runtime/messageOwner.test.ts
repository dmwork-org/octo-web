import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImOwnerAdmission } from '@octo/base/src/im-runtime/ownerAdmission';
import { installCommunicationMessageOwner, type MessageOwnerSdkLifecycle } from './messageOwner';

const f = vi.hoisted(() => ({
  gate: { setAllowed: vi.fn(), dispose: vi.fn() },
  install: vi.fn(), gateInstall: vi.fn(),
}));
vi.mock('@octo/base/src/im-runtime/ownerAdmissionHost', () => ({ installImOwnerAdmission: f.install }));
vi.mock('@octo/base/src/im-runtime/readAttentionHost', () => ({
  installImReadAttentionGate: f.gateInstall,
  isImReadAttentionAllowed: () => false,
}));
beforeEach(() => {
  vi.clearAllMocks();
  f.gateInstall.mockReturnValue(f.gate);
});

function fixture() {
  let admission!: ImOwnerAdmission;
  const sdk: MessageOwnerSdkLifecycle = {
    quiesce: vi.fn(async generation => {
      await admission.waitForDrain();
      return { generation, pendingCount: 0, closed: true, stopped: true };
    }),
    prepare: vi.fn(generation => admission.prepare(generation)),
    grant: vi.fn(generation => admission.activate(generation)),
  };
  const create = vi.fn((value: ImOwnerAdmission) => { admission = value; return sdk; });
  const owner = installCommunicationMessageOwner(create);
  return { owner, sdk, create, get admission() { return admission; } };
}

describe('Communication message owner assembly', () => {
  it('installs admission and the read gate before any SDK setup or first connection', () => {
    const h = fixture();
    expect(h.create).toHaveBeenCalledOnce();
    expect(f.install.mock.invocationCallOrder[0]).toBeLessThan(f.gateInstall.mock.invocationCallOrder[0]);
    expect(f.gateInstall.mock.invocationCallOrder[0]).toBeLessThan(h.create.mock.invocationCallOrder[0]);
    expect(h.owner.snapshot().phase).toBe('active');
    expect(h.sdk.grant).not.toHaveBeenCalled();
    expect(h.sdk.prepare).not.toHaveBeenCalled();
  });

  it('denies synchronously and retains the gate while actual work settles', async () => {
    const h = fixture();
    const work = h.admission.begin('history');
    const stop = h.owner.quiesce(1);
    expect(h.owner.snapshot().phase).toBe('quiescing');
    expect(() => h.admission.begin('send')).toThrow('owner_denied');
    h.owner.setReadAttention(true);
    expect(f.gate.setAllowed).toHaveBeenLastCalledWith(false);
    expect(f.gate.dispose).not.toHaveBeenCalled();
    await expect(h.owner.prepare(2)).rejects.toThrow('owner_denied');
    expect(h.owner.quiesce(1)).toBe(stop);
    await expect(h.owner.quiesce(2)).rejects.toThrow('owner_denied');
    expect(h.owner.snapshot().generation).toBe(1);
    work.release();
    await expect(stop).resolves.toEqual({
      owner: 'web', generation: 1, pendingCount: 0, closed: true, stopped: true, readAttentionRevoked: true,
    });
  });

  it('requires explicit grant after preparation and keeps read attention denied', async () => {
    const h = fixture();
    await h.owner.quiesce(1);
    await h.owner.prepare(2);
    expect(h.owner.snapshot().phase).toBe('preparing');
    expect(h.sdk.grant).not.toHaveBeenCalled();
    expect(() => h.owner.grant(1)).toThrow('owner_stale');
    h.owner.grant(2);
    expect(h.owner.snapshot().phase).toBe('active');
    expect(f.gate.setAllowed).toHaveBeenLastCalledWith(false);
    h.owner.setReadAttention(true);
    expect(f.gate.setAllowed).toHaveBeenLastCalledWith(true);
  });

  it.each(['generation', 'pending', 'closed', 'stopped'] as const)('rejects invalid %s evidence', async invalid => {
    const h = fixture();
    vi.mocked(h.sdk.quiesce).mockImplementationOnce(async generation => ({
      generation: invalid === 'generation' ? generation + 1 : generation,
      pendingCount: invalid === 'pending' ? 1 : 0,
      closed: invalid !== 'closed', stopped: invalid !== 'stopped',
    }));
    await expect(h.owner.quiesce(1)).rejects.toThrow('owner_denied');
    expect(h.owner.snapshot().phase).toBe('quiescing');
    expect(f.gate.dispose).not.toHaveBeenCalled();
  });

  it('does not trust an endpoint zero count while admission has pending work', async () => {
    const h = fixture();
    const work = h.admission.begin('read');
    vi.mocked(h.sdk.quiesce).mockResolvedValueOnce({ generation: 1, pendingCount: 0, stopped: true, closed: true });
    await expect(h.owner.quiesce(1)).rejects.toThrow('owner_denied');
    work.release();
  });

  it('revokes partial activation synchronously and observes cleanup', async () => {
    const h = fixture();
    await h.owner.quiesce(1);
    await h.owner.prepare(2);
    vi.mocked(h.sdk.grant).mockImplementationOnce(generation => {
      h.admission.activate(generation);
      throw new Error('activation failed');
    });
    expect(() => h.owner.grant(2)).toThrow('activation failed');
    expect(h.owner.snapshot().phase).toBe('quiescing');
    expect(h.owner.snapshot().generation).toBe(3);
    await expect(h.owner.stop()).resolves.toMatchObject({ generation: 3, closed: true });
  });

  it('fails closed if initial SDK setup throws', () => {
    let admission!: ImOwnerAdmission;
    expect(() => installCommunicationMessageOwner(value => {
      admission = value;
      throw new Error('SDK setup failed');
    })).toThrow('SDK setup failed');
    expect(admission.snapshot().phase).toBe('quiescing');
    expect(f.gate.setAllowed).toHaveBeenLastCalledWith(false);
  });
});
