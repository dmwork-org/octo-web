import {
    saveJoinSuccessNotice,
    consumeJoinSuccessNotice,
    clearJoinSuccessNotice,
    computeAndSaveJoinSuccess,
} from '../joinSuccessNotice';

/**
 * YUJ-106 / dmwork-web#1065 — tab-scoped post-join notice round-trip.
 *
 * Tests sessionStorage round-trip, consume-clears-key semantics, and
 * graceful fallback on malformed payloads.
 */
describe('joinSuccessNotice (sessionStorage round-trip)', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it('saves and consumes a cross-space notice', () => {
        saveJoinSuccessNotice({
            spaceId: 's-example',
            spaceName: 'ExampleCorp',
            entityName: '项目 A',
            crossSpace: true,
        });
        const notice = consumeJoinSuccessNotice();
        expect(notice).toBeTruthy();
        expect(notice?.spaceId).toBe('s-example');
        expect(notice?.spaceName).toBe('ExampleCorp');
        expect(notice?.entityName).toBe('项目 A');
        expect(notice?.crossSpace).toBe(true);
    });

    it('consume clears the key so we never fire twice', () => {
        saveJoinSuccessNotice({
            spaceId: 's1', spaceName: 'A', crossSpace: false,
        });
        expect(consumeJoinSuccessNotice()).toBeTruthy();
        expect(consumeJoinSuccessNotice()).toBeNull();
    });

    it('returns null (and purges key) on malformed JSON', () => {
        sessionStorage.setItem('pendingJoinSuccessNotice', '{not-json');
        expect(consumeJoinSuccessNotice()).toBeNull();
        // Ensure the malformed value was nuked so future reads stay clean
        expect(sessionStorage.getItem('pendingJoinSuccessNotice')).toBeNull();
    });

    it('returns null on missing required fields', () => {
        sessionStorage.setItem(
            'pendingJoinSuccessNotice',
            JSON.stringify({ crossSpace: true }), // missing spaceId/spaceName
        );
        expect(consumeJoinSuccessNotice()).toBeNull();
    });

    it('clearJoinSuccessNotice is a noop-safe cleanup helper', () => {
        expect(() => clearJoinSuccessNotice()).not.toThrow();
        saveJoinSuccessNotice({
            spaceId: 's1', spaceName: 'A', crossSpace: false,
        });
        clearJoinSuccessNotice();
        expect(consumeJoinSuccessNotice()).toBeNull();
    });
});

/**
 * YUJ-112 / dmwork-web#1068 Round 2 — computeAndSaveJoinSuccess helper shared by
 * InviteLanding (direct join) and Layout.onLogin (pendingInviteCode path).
 */
describe('computeAndSaveJoinSuccess (shared cross-path helper)', () => {
    beforeEach(() => {
        sessionStorage.clear();
    });

    it('flags crossSpace=true when targetSpaceId differs from currentSpaceId', () => {
        const notice = computeAndSaveJoinSuccess(
            { spaceId: 's-target', spaceName: 'Target' },
            's-prev',
        );
        expect(notice.crossSpace).toBe(true);
        expect(notice.spaceId).toBe('s-target');
        expect(notice.spaceName).toBe('Target');
        expect(notice.entityName).toBe('Target'); // defaults to spaceName
        // Also persisted to sessionStorage
        const consumed = consumeJoinSuccessNotice();
        expect(consumed?.crossSpace).toBe(true);
        expect(consumed?.spaceId).toBe('s-target');
    });

    it('flags crossSpace=false when currentSpaceId is empty (single space / first join)', () => {
        const notice = computeAndSaveJoinSuccess(
            { spaceId: 's-target', spaceName: 'Target' },
            '',
        );
        expect(notice.crossSpace).toBe(false);
    });

    it('flags crossSpace=false when joining the same space as current', () => {
        const notice = computeAndSaveJoinSuccess(
            { spaceId: 's-same', spaceName: 'Same' },
            's-same',
        );
        expect(notice.crossSpace).toBe(false);
    });

    it('keeps an explicit entityName distinct from spaceName', () => {
        const notice = computeAndSaveJoinSuccess(
            { spaceId: 's1', spaceName: 'ExampleCorp', entityName: '产品群' },
            's-prev',
        );
        expect(notice.entityName).toBe('产品群');
        expect(notice.spaceName).toBe('ExampleCorp');
    });
});
