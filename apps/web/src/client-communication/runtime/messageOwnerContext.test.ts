import { beforeEach, describe, expect, it, vi } from 'vitest';
const app = vi.hoisted(() => ({
  loginInfo: { uid: 'a', token: 'token', sessionRevision: 1 },
  shared: { currentSpaceId: 'space-a', spaceRevision: 1 },
  apiClient: { config: { apiURL: 'https://api.invalid', originRevision: 1 } },
}));
vi.mock('@octo/base', () => ({ WKApp: app }));
import { captureCommunicationConnectionContext } from './messageOwnerContext';
beforeEach(() => {
  app.loginInfo = { uid: 'a', token: 'token', sessionRevision: 1 };
  app.shared = { currentSpaceId: 'space-a', spaceRevision: 1 };
  app.apiClient.config = { apiURL: 'https://api.invalid', originRevision: 1 };
});
describe('Communication connection context', () => {
  it('preserves an account socket across Space switches', () => {
    const current = captureCommunicationConnectionContext();
    app.shared.currentSpaceId = 'space-b'; app.shared.spaceRevision++;
    expect(current()).toBe(true);
    app.shared.currentSpaceId = 'space-a'; app.shared.spaceRevision++;
    expect(current()).toBe(true);
  });
  it.each(['session', 'origin', 'login', 'config'] as const)('invalidates %s replacement even when values return', field => {
    const current = captureCommunicationConnectionContext();
    if (field === 'session') app.loginInfo.sessionRevision += 2;
    if (field === 'origin') app.apiClient.config.originRevision += 2;
    if (field === 'login') app.loginInfo = { ...app.loginInfo };
    if (field === 'config') app.apiClient.config = { ...app.apiClient.config };
    expect(current()).toBe(false);
  });
});
