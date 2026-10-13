import { describe, expect, it, vi } from 'vitest';
import { binding, command, drain, fixture, flush, preparedFixture } from './messageOwnerEndpointFixture';

describe('Communication owner cutover endpoint', () => {
  it('reports drain, requires associated explicit grant, and revokes admission synchronously', async () => {
    const h = fixture();
    const work = h.admission.begin('history');
    h.emit(command('quiesce', 1));
    expect(h.messages.snapshot().phase).toBe('quiescing');
    expect(() => h.admission.begin('send')).toThrow('owner_denied');
    await flush();
    expect(h.reports()).toEqual([]);
    work.release();
    await flush();
    expect(h.reports()[0]).toEqual({ ...command('quiesce', 1), ...drain(1), status: 'drained' });
    h.emit(command('prepare', 2));
    await flush();
    expect(h.messages.snapshot().phase).toBe('preparing');
    expect(h.messages.grant).not.toHaveBeenCalled();
    expect(h.endpoint.snapshot().preparedGeneration).toBe(2);
    h.emit(command('grant', 2));
    await flush();
    expect(h.messages.grant).toHaveBeenCalledExactlyOnceWith(2);
    expect(h.messages.snapshot().phase).toBe('active');
    h.emit(command('revoke', 2));
    expect(h.messages.snapshot()).toEqual({ generation: 2, phase: 'quiescing', pendingCount: 0 });
    expect(h.reports().at(-1)).toMatchObject({ operation: 'revoke', status: 'revoked', readAttentionRevoked: true });
    expect(h.reports().at(-1)).not.toHaveProperty('closed');
  });

  it.each(['ready', 'granted'] as const)('revokes the commanded generation after rejected %s result', async status => {
    const h = fixture();
    h.bridge.reportOwnerCutoverResult.mockImplementation(async report => report.status !== status);
    h.emit(command('quiesce', 1));
    await flush();
    h.emit(command('prepare', 2));
    await flush();
    if (status === 'granted') {
      h.emit(command('grant', 2));
      expect(h.messages.snapshot().phase).toBe('active');
      await flush();
    }
    expect(h.messages.snapshot()).toEqual({ generation: 2, phase: 'quiescing', pendingCount: 0 });
    expect(h.messages.revoke).toHaveBeenLastCalledWith(2);
    expect(h.messages.quiesce).toHaveBeenLastCalledWith(2);
    expect(h.endpoint.snapshot().preparedGeneration).toBeNull();
    h.emit(command('grant', 2, 'late-grant'));
    await flush();
    expect(h.reports().at(-1)).toMatchObject({ requestId: 'late-grant', status: 'failed', code: 'owner_denied' });
  });

  it('consumes prepare association once even when a second distinct grant reuses it', async () => {
    const h = await preparedFixture();
    h.emit(command('grant', 2));
    await flush();
    h.emit(command('grant', 2, 'second-grant'));
    await flush();
    expect(h.messages.grant).toHaveBeenCalledOnce();
    expect(h.reports().at(-1)).toMatchObject({ requestId: 'second-grant', status: 'failed', code: 'owner_denied' });
    expect(h.messages.snapshot().phase).toBe('quiescing');
  });

  it('rejects wrong prepare association and prevents retry using the former preparation', async () => {
    const h = await preparedFixture();
    h.emit(command('grant', 2, 'wrong-grant', 'another-prepare'));
    await flush();
    expect(h.messages.grant).not.toHaveBeenCalled();
    expect(h.reports().at(-1)).toMatchObject({ requestId: 'wrong-grant', status: 'failed', code: 'owner_denied' });
    h.emit(command('grant', 2, 'retry-grant'));
    await flush();
    expect(h.messages.grant).not.toHaveBeenCalled();
    expect(h.endpoint.snapshot().preparedGeneration).toBeNull();
  });

  it('ignores replayed requestIds and exact binding mismatches without advancing generation', async () => {
    const h = await preparedFixture();
    const calls = h.reports().length;
    h.emit(command('prepare', 2));
    h.emit(command('grant', 2, 'prepare'));
    for (const mismatch of [{ ownerId: 'other' }, { contextId: 'other' }, { epoch: binding.epoch + 1 }, { bindingId: 'other' }]) {
      h.emit({ ...command('revoke', 50, `wrong-${Object.keys(mismatch)[0]}`), ...mismatch });
    }
    h.emit({ ...command('grant', 2), generation: 0 });
    h.emit({ ...command('grant', 2), unrecognized: true });
    await flush();
    expect(h.reports()).toHaveLength(calls);
    expect(h.messages.prepare).toHaveBeenCalledOnce();
    expect(h.messages.snapshot()).toEqual({ generation: 2, phase: 'preparing', pendingCount: 0 });
    h.emit(command('grant', 2));
    await flush();
    expect(h.messages.grant).toHaveBeenCalledOnce();
  });

  it('observes a thrown result report as rejection and cleanup failure as non-drain evidence', async () => {
    const h = await preparedFixture();
    h.bridge.reportOwnerCutoverResult.mockRejectedValueOnce(new Error('IPC closed'));
    vi.mocked(h.messages.quiesce).mockRejectedValueOnce(new Error('socket still open'));
    h.emit(command('grant', 2));
    await flush();
    expect(h.messages.snapshot().phase).toBe('quiescing');
    expect(h.endpoint.snapshot().cleanupFailed).toBe(true);
    expect(h.reports().filter(report => report.status === 'drained')).toHaveLength(1);
    h.emit(command('prepare', 3, 'unsafe-prepare'));
    await flush();
    expect(h.messages.prepare).toHaveBeenCalledOnce();
    h.emit(command('quiesce', 3, 'verified-drain'));
    await flush();
    expect(h.reports().at(-1)).toMatchObject({ requestId: 'verified-drain', status: 'drained' });
    h.emit(command('prepare', 4, 'safe-prepare'));
    await flush();
    expect(h.endpoint.snapshot().preparedGeneration).toBe(4);
  });
});
