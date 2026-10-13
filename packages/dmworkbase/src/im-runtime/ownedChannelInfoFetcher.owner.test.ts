import { afterEach, describe, expect, it, vi } from 'vitest';
import WKSDK, { Channel, ChannelInfo } from 'wukongimjssdk';
const app = vi.hoisted(() => ({
  shared: { currentSpaceId: 'space', spaceRevision: 1 },
  loginInfo: { uid: 'user', token: 'token', sessionRevision: 1 },
  apiClient: { config: { apiURL: 'https://api.invalid', originRevision: 1 } },
}));
vi.mock('../App', () => ({ default: app }));
import { createOwnedChannelInfoFetcher } from './ownedChannelInfoFetcher';
import * as channelRuntime from './channelRuntime';
import { createImOwnerAdmission } from './ownerAdmission';
import { installImOwnerAdmission, uninstallImOwnerAdmission } from './ownerAdmissionHost';

let owner: ReturnType<typeof createImOwnerAdmission> | undefined;
afterEach(() => {
  if (owner) {
    owner.quiesce(owner.snapshot().generation + 1);
    uninstallImOwnerAdmission(owner);
    owner = undefined;
  }
  vi.restoreAllMocks();
});
function fixture() {
  owner = createImOwnerAdmission();
  installImOwnerAdmission(owner);
  const sdk = WKSDK.shared();
  const channel = new Channel('owner-channel', 2);
  sdk.channelManager.channelInfocacheMap = {};
  const notify = vi.spyOn(channelRuntime, 'notifyImChannelInfoListeners');
  return { sdk, channel, notify, owner, fetch: createOwnedChannelInfoFetcher(sdk, () => true) };
}

describe('runtime channel fetch owner drain', () => {
  it.each(['resolve', 'reject'] as const)('retains real %s work after revoke without publishing into a new owner', async mode => {
    const h = fixture();
    let resolve!: (value: ChannelInfo) => void;
    let reject!: (error: Error) => void;
    const provider = vi.fn(() => new Promise<ChannelInfo>((yes, no) => { resolve = yes; reject = no; }));
    h.sdk.config.provider.channelInfoCallback = provider;
    const pending = h.fetch(h.channel);
    expect(h.owner.snapshot().pendingCount).toBe(1);
    h.owner.quiesce(1);
    expect(h.owner.snapshot().pendingCount).toBe(1);
    const value = new ChannelInfo(); value.channel = h.channel;
    if (mode === 'resolve') resolve(value);
    else reject(new Error('old provider failed'));
    await expect(pending).resolves.toBeUndefined();
    expect(h.owner.snapshot().pendingCount).toBe(0);
    expect(h.sdk.channelManager.channelInfocacheMap[h.channel.getChannelKey()]).toBeUndefined();
    expect(h.notify).not.toHaveBeenCalled();
    h.owner.prepare(2); h.owner.activate(2);
    provider.mockResolvedValue(value);
    await expect(h.fetch(h.channel)).resolves.toBe(value);
    expect(h.notify).toHaveBeenCalledOnce();
  });

  it('never invokes the provider when denied and releases synchronous failures', async () => {
    const h = fixture();
    const provider = vi.fn(() => { throw new Error('provider failed'); });
    h.sdk.config.provider.channelInfoCallback = provider;
    await expect(h.fetch(h.channel)).rejects.toThrow('provider failed');
    expect(h.owner.snapshot().pendingCount).toBe(0);
    h.owner.quiesce(1);
    await expect(h.fetch(h.channel)).resolves.toBeUndefined();
    expect(provider).toHaveBeenCalledOnce();
  });
});
