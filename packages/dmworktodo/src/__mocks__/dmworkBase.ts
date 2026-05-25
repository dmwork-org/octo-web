// Mock for @octo/base — provides WKApp stubs for tests
export const WKApp = {
  loginInfo: { token: 'test-token-abc', uid: 'test-uid' },
  shared: { currentSpaceId: 'space-123', logout: () => { }, avatarUser: () => '' },
  routeRight: { push: () => { }, replaceToRoot: () => { } },
  mittBus: { on: () => { }, off: () => { }, emit: () => { } },
  apiClient: {},
  endpoints: { showConversation: () => { } },
};

export const isSafeUrl = (url: string) => /^https?:\/\//.test(url);

// Thread enum / type re-exports — production code imports these from
// '@octo/base' (re-exported via dmworkbase/src/index.tsx). The vitest
// alias points '@octo/base' at this mock file, so we re-export the
// minimal surface the dmworktodo code touches.
export enum ThreadStatus {
  Active = 1,
  Archived = 2,
  Deleted = 3,
}

// Thread is type-only at runtime; export an empty interface to satisfy
// `import type { Thread } from '@octo/base'`.
export interface Thread {
  short_id: string;
  group_no: string;
  channel_id: string;
  channel_type: number;
  name: string;
  creator_uid: string;
  status: number;
  created_at: string;
  updated_at: string;
  is_member?: boolean;
  member_count?: number;
}
