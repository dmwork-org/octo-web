import { describe, expect, it, vi } from 'vitest';
import { command, deferred, drain, fixture, flush, preparedFixture } from './messageOwnerEndpointFixture';

describe('Communication owner cutover races', () => {
  it('denies active admission and observes cleanup even if unsubscribe throws', async () => {
    const h = await preparedFixture();
    h.emit(command('grant', 2));
    await flush();
    const cleanup = deferred<ReturnType<typeof drain>>();
    vi.mocked(h.messages.quiesce).mockReturnValueOnce(cleanup.promise);
    h.off.mockImplementationOnce(() => { throw new Error('bridge unavailable'); });
    expect(() => h.endpoint.dispose()).not.toThrow();
    expect(h.messages.snapshot().phase).toBe('quiescing');
    expect(() => h.admission.begin('send')).toThrow('owner_denied');
    expect(h.endpoint.snapshot()).toMatchObject({ valid: false, cleanupPending: 1, cleanupFailed: true });
    const reports = h.reports().length;
    h.emit(command('prepare', 3, 'after-dispose'));
    cleanup.resolve(drain(2));
    await flush();
    expect(h.endpoint.snapshot().cleanupPending).toBe(0);
    expect(h.reports()).toHaveLength(reports);
    h.endpoint.dispose();
    expect(h.off).toHaveBeenCalledOnce();
  });

  it('waits for raw prepare settlement then drains late resources again', async () => {
    const h = fixture();
    h.emit(command('quiesce', 1));
    await flush();
    const preparing = deferred<void>();
    let resourceCount = 0;
    vi.mocked(h.messages.prepare).mockImplementationOnce(async generation => {
      h.admission.prepare(generation);
      await preparing.promise;
      resourceCount++;
    });
    vi.mocked(h.messages.quiesce).mockImplementation(async generation => {
      h.admission.quiesce(generation);
      resourceCount = 0;
      return drain(generation);
    });
    h.emit(command('prepare', 2));
    h.emit(command('revoke', 2));
    h.emit(command('quiesce', 3, 'drain-preparing'));
    await flush();
    expect(h.reports().find(report => report.requestId === 'drain-preparing')).toBeUndefined();
    expect(h.reports().find(report => report.requestId === 'prepare')).toBeUndefined();
    expect(h.messages.snapshot().phase).toBe('quiescing');
    preparing.resolve();
    await flush();
    expect(resourceCount).toBe(0);
    expect(vi.mocked(h.messages.quiesce).mock.calls.filter(([generation]) => generation === 3)).toHaveLength(2);
    expect(h.reports().find(report => report.requestId === 'prepare')).toMatchObject({ status: 'failed', code: 'owner_context_revoked' });
    expect(h.reports().find(report => report.requestId === 'drain-preparing')).toMatchObject({ status: 'drained', generation: 3 });
    expect(h.messages.grant).not.toHaveBeenCalled();
  });

  it('accepts grant after ready was sent even before its report acknowledgment resolves', async () => {
    const h = fixture();
    const ready = deferred<boolean>();
    h.bridge.reportOwnerCutoverResult.mockImplementation(async report => report.status === 'ready' ? ready.promise : true);
    h.emit(command('quiesce', 1));
    await flush();
    h.emit(command('prepare', 2));
    await flush();
    expect(h.endpoint.snapshot()).toMatchObject({ pendingCount: 1, preparedGeneration: 2 });
    h.emit(command('grant', 2));
    await flush();
    expect(h.messages.grant).toHaveBeenCalledExactlyOnceWith(2);
    ready.resolve(true);
    await flush();
    expect(h.messages.snapshot().phase).toBe('active');
  });

  it('late rejected grant reports cannot revoke a newer active generation', async () => {
    const h = await preparedFixture();
    const granted = deferred<boolean>();
    h.bridge.reportOwnerCutoverResult.mockImplementation(async report => report.requestId === 'grant' ? granted.promise : true);
    h.emit(command('grant', 2));
    await flush();
    h.emit(command('quiesce', 3, 'new-quiesce'));
    await flush();
    h.emit(command('prepare', 4, 'new-prepare'));
    await flush();
    h.emit(command('grant', 4, 'new-grant', 'new-prepare'));
    await flush();
    expect(h.messages.snapshot().phase).toBe('active');
    const revoked = vi.mocked(h.messages.revoke).mock.calls.length;
    granted.resolve(false);
    await flush();
    expect(vi.mocked(h.messages.revoke).mock.calls).toHaveLength(revoked);
    expect(h.messages.snapshot()).toEqual({ generation: 4, phase: 'active', pendingCount: 0 });
  });

  it.each(['context', 'dispose'] as const)('denies late ready after %s invalidates the endpoint', async reason => {
    const h = fixture();
    h.emit(command('quiesce', 1));
    await flush();
    const preparing = deferred<void>();
    vi.mocked(h.messages.prepare).mockImplementationOnce(async generation => {
      h.admission.prepare(generation);
      await preparing.promise;
    });
    h.emit(command('prepare', 2));
    if (reason === 'context') h.context.current = false;
    else h.endpoint.dispose();
    preparing.resolve();
    await flush();
    expect(h.reports().find(report => report.requestId === 'prepare')).toMatchObject({ status: 'failed', code: 'owner_context_revoked' });
    expect(h.messages.snapshot()).toEqual({ generation: 2, phase: 'quiescing', pendingCount: 0 });
    expect(h.endpoint.snapshot().valid).toBe(false);
    h.emit(command('grant', 2));
    await flush();
    expect(h.messages.grant).not.toHaveBeenCalled();
    if (reason === 'dispose') expect(h.off).toHaveBeenCalledOnce();
  });
});
