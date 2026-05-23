import { describe, it, expect, vi, beforeEach } from "vitest"
import { hasSpacePrefix } from "../SpacePrefix"

// A valid 32-char hex spaceId for testing
const SPACE_ID = "a1b2c3d4e5f60718293a4b5c6d7e8f90"

describe("hasSpacePrefix", () => {
    it("returns false for a regular UID not starting with 's'", () => {
        expect(hasSpacePrefix("alice")).toBe(false)
        expect(hasSpacePrefix("bob_bot")).toBe(false)
        expect(hasSpacePrefix("user123")).toBe(false)
    })

    it("returns false for a bot UID starting with 's' (e.g. stevejobs_bot)", () => {
        expect(hasSpacePrefix("stevejobs_bot")).toBe(false)
        expect(hasSpacePrefix("support")).toBe(false)
        expect(hasSpacePrefix("sam_admin")).toBe(false)
        expect(hasSpacePrefix("system")).toBe(false)
    })

    it("returns true for a Space-prefixed channelID (s + 32 hex + _)", () => {
        expect(hasSpacePrefix(`s${SPACE_ID}_alice`)).toBe(true)
        expect(hasSpacePrefix(`s${SPACE_ID}_group123`)).toBe(true)
    })

    it("returns false for 's' prefix with non-hex or wrong-length spaceId", () => {
        // Too short (31 chars)
        expect(hasSpacePrefix("sa1b2c3d4e5f60718293a4b5c6d7e8f9_uid")).toBe(false)
        // Too long (33 chars)
        expect(hasSpacePrefix("sa1b2c3d4e5f60718293a4b5c6d7e8f900_uid")).toBe(false)
        // Contains non-hex char 'g'
        expect(hasSpacePrefix("sg1b2c3d4e5f60718293a4b5c6d7e8f90_uid")).toBe(false)
        // Missing trailing underscore
        expect(hasSpacePrefix(`s${SPACE_ID}alice`)).toBe(false)
    })

    it("returns false for empty string", () => {
        expect(hasSpacePrefix("")).toBe(false)
    })
})

// Test extractUID logic in isolation (same algorithm as DataSourceModule.extractUID)
function extractUID(channelID: string): string {
    if (hasSpacePrefix(channelID)) {
        const idx = channelID.indexOf("_")
        return channelID.substring(idx + 1)
    }
    return channelID
}

describe("extractUID", () => {
    it("returns stevejobs_bot unchanged", () => {
        expect(extractUID("stevejobs_bot")).toBe("stevejobs_bot")
    })

    it("returns a regular UID unchanged", () => {
        expect(extractUID("alice")).toBe("alice")
        expect(extractUID("user_123")).toBe("user_123")
    })

    it("extracts uid from a Space-prefixed ID", () => {
        expect(extractUID(`s${SPACE_ID}_alice`)).toBe("alice")
        expect(extractUID(`s${SPACE_ID}_bob_bot`)).toBe("bob_bot")
    })
})

// Test shouldSkipChannelForSpace filtering logic
// We test the prefix-matching branch in isolation since the full function depends on WKApp
describe("shouldSkipChannelForSpace prefix logic", () => {
    const currentSpaceId = SPACE_ID
    const otherSpaceId = "00000000000000000000000000000000"

    function wouldFilterByPrefix(cid: string): boolean | null {
        if (!hasSpacePrefix(cid)) return null // not a Space-prefixed ID, other logic applies
        return !cid.startsWith(`s${currentSpaceId}_`)
    }

    it("does not filter regular UIDs (returns null = not handled by prefix branch)", () => {
        expect(wouldFilterByPrefix("alice")).toBeNull()
        expect(wouldFilterByPrefix("stevejobs_bot")).toBeNull()
    })

    it("does not filter Space-prefixed ID when Space matches", () => {
        expect(wouldFilterByPrefix(`s${currentSpaceId}_alice`)).toBe(false)
        expect(wouldFilterByPrefix(`s${currentSpaceId}_group1`)).toBe(false)
    })

    it("filters Space-prefixed ID when Space does not match", () => {
        expect(wouldFilterByPrefix(`s${otherSpaceId}_alice`)).toBe(true)
        expect(wouldFilterByPrefix(`s${otherSpaceId}_group1`)).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// shouldSkipChannelForSpace external-group escape hatch
//
// When the group's orgData.space_id doesn't match currentSpaceId but the
// logged-in user joined as an external member sourced from currentSpaceId
// (subscriber.orgData.source_space_id === currentSpaceId), the group should
// NOT be skipped — it must appear in the external joiner's own Space view.
// ---------------------------------------------------------------------------

const mockState = vi.hoisted(() => ({
    channelSpaceMap: new Map<string, string>(),
    subscribesByChannel: new Map<string, any[]>(),
    channelInfoByChannel: new Map<string, any>(),
    currentSpaceId: "",
    loginUid: "",
}))

vi.mock("../../App", () => ({
    default: {
        shared: {
            get currentSpaceId() {
                return mockState.currentSpaceId
            },
            set currentSpaceId(v: string) {
                mockState.currentSpaceId = v
            },
            channelSpaceMap: mockState.channelSpaceMap,
        },
        loginInfo: {
            get uid() {
                return mockState.loginUid
            },
            set uid(v: string) {
                mockState.loginUid = v
            },
        },
    },
}))

vi.mock("wukongimjssdk", async () => {
    const actual: any = await vi.importActual("wukongimjssdk")
    return {
        ...actual,
        WKSDK: {
            shared: () => ({
                channelManager: {
                    getSubscribes: (ch: any) =>
                        mockState.subscribesByChannel.get(ch.channelID) || [],
                    getChannelInfo: (ch: any) =>
                        mockState.channelInfoByChannel.get(ch.channelID),
                },
            }),
        },
    }
})

import { shouldSkipChannelForSpace } from "../SpaceService"
import { Channel, ChannelTypeGroup } from "wukongimjssdk"
import { ChannelTypeCommunityTopic } from "../Const"
import { ThreadChannelIdSeparator } from "../Thread"

const SPACE_A = "a".repeat(32)
const SPACE_B = "b".repeat(32)

describe("shouldSkipChannelForSpace — external group", () => {
    beforeEach(() => {
        mockState.channelSpaceMap.clear()
        mockState.subscribesByChannel.clear()
        mockState.channelInfoByChannel.clear()
        mockState.currentSpaceId = ""
        mockState.loginUid = "u_external"
    })

    it("skips a group owned by Space A when viewing Space B and I am not a member", () => {
        mockState.currentSpaceId = SPACE_B
        const ch = new Channel("g1", ChannelTypeGroup)
        mockState.channelSpaceMap.set(`g1_${ChannelTypeGroup}`, SPACE_A)
        expect(shouldSkipChannelForSpace(ch)).toBe(true)
    })

    it("does NOT skip a group owned by Space A when I joined as an external member sourced from Space B (currentSpaceId)", () => {
        mockState.currentSpaceId = SPACE_B
        const ch = new Channel("g1", ChannelTypeGroup)
        mockState.channelSpaceMap.set(`g1_${ChannelTypeGroup}`, SPACE_A)
        mockState.subscribesByChannel.set("g1", [
            { uid: "u_owner", orgData: { source_space_id: "" } },
            { uid: "u_external", orgData: { is_external: 1, source_space_id: SPACE_B, source_space_name: "Space B" } },
        ])
        expect(shouldSkipChannelForSpace(ch)).toBe(false)
    })

    it("still skips when my subscriber's source_space_id is a third Space (not currentSpaceId)", () => {
        mockState.currentSpaceId = SPACE_B
        const otherSpace = "c".repeat(32)
        const ch = new Channel("g1", ChannelTypeGroup)
        mockState.channelSpaceMap.set(`g1_${ChannelTypeGroup}`, SPACE_A)
        mockState.subscribesByChannel.set("g1", [
            { uid: "u_external", orgData: { is_external: 1, source_space_id: otherSpace } },
        ])
        expect(shouldSkipChannelForSpace(ch)).toBe(true)
    })

    it("does NOT skip a group whose orgData.space_id matches currentSpaceId (unchanged)", () => {
        mockState.currentSpaceId = SPACE_A
        const ch = new Channel("g1", ChannelTypeGroup)
        mockState.channelSpaceMap.set(`g1_${ChannelTypeGroup}`, SPACE_A)
        expect(shouldSkipChannelForSpace(ch)).toBe(false)
    })

    it("uses channelInfo.orgData.space_id fallback and still honors external member (subscriber) check", () => {
        mockState.currentSpaceId = SPACE_B
        const ch = new Channel("g2", ChannelTypeGroup)
        mockState.channelInfoByChannel.set("g2", { orgData: { space_id: SPACE_A } })
        mockState.subscribesByChannel.set("g2", [
            { uid: "u_external", orgData: { is_external: 1, source_space_id: SPACE_B } },
        ])
        expect(shouldSkipChannelForSpace(ch)).toBe(false)
    })

    it("falls back to skipping when subscribers cache empty and group is clearly from another Space", () => {
        mockState.currentSpaceId = SPACE_B
        const ch = new Channel("g3", ChannelTypeGroup)
        mockState.channelInfoByChannel.set("g3", { orgData: { space_id: SPACE_A } })
        expect(shouldSkipChannelForSpace(ch)).toBe(true)
    })

    it("ignores legacy is_external=1 without source_space_id (no id to match against currentSpaceId)", () => {
        mockState.currentSpaceId = SPACE_B
        const ch = new Channel("g4", ChannelTypeGroup)
        mockState.channelSpaceMap.set(`g4_${ChannelTypeGroup}`, SPACE_A)
        mockState.subscribesByChannel.set("g4", [
            { uid: "u_external", orgData: { is_external: 1, source_space_name: "Space B" } },
        ])
        expect(shouldSkipChannelForSpace(ch)).toBe(true)
    })
})

// ---------------------------------------------------------------------------
// shouldSkipChannelForSpace — CommunityTopic (子区) branch (PR #105)
//
// Threads inherit their parent group's Space membership. The channelID format
// is `{groupNo}____{shortId}` (see Thread.ts:40). The new branch parses the
// parent groupNo, reuses the group's channelSpaceMap / channelInfo lookup,
// and fail-closes when the parent's Space is unknown — preventing cross-Space
// thread leaks in the recent tab.
// ---------------------------------------------------------------------------

function threadCid(groupNo: string, shortId: string) {
    return `${groupNo}${ThreadChannelIdSeparator}${shortId}`
}

describe("shouldSkipChannelForSpace — CommunityTopic (thread)", () => {
    beforeEach(() => {
        mockState.channelSpaceMap.clear()
        mockState.subscribesByChannel.clear()
        mockState.channelInfoByChannel.clear()
        mockState.currentSpaceId = ""
        mockState.loginUid = "u_self"
    })

    it("does NOT skip when parent group is in current Space (cache hit)", () => {
        mockState.currentSpaceId = SPACE_A
        mockState.channelSpaceMap.set(`g1_${ChannelTypeGroup}`, SPACE_A)
        const thread = new Channel(threadCid("g1", "t1"), ChannelTypeCommunityTopic)
        expect(shouldSkipChannelForSpace(thread)).toBe(false)
    })

    it("skips when parent group belongs to another Space (cache hit)", () => {
        mockState.currentSpaceId = SPACE_A
        mockState.channelSpaceMap.set(`g1_${ChannelTypeGroup}`, SPACE_B)
        const thread = new Channel(threadCid("g1", "t1"), ChannelTypeCommunityTopic)
        expect(shouldSkipChannelForSpace(thread)).toBe(true)
    })

    it("falls back to parent channelInfo.orgData.space_id when cache misses", () => {
        mockState.currentSpaceId = SPACE_A
        mockState.channelInfoByChannel.set("g1", { orgData: { space_id: SPACE_B } })
        const thread = new Channel(threadCid("g1", "t1"), ChannelTypeCommunityTopic)
        expect(shouldSkipChannelForSpace(thread)).toBe(true)
    })

    it("writes parent cache when resolving via channelInfo", () => {
        mockState.currentSpaceId = SPACE_A
        mockState.channelInfoByChannel.set("g1", { orgData: { space_id: SPACE_A } })
        const thread = new Channel(threadCid("g1", "t1"), ChannelTypeCommunityTopic)
        shouldSkipChannelForSpace(thread)
        expect(mockState.channelSpaceMap.get(`g1_${ChannelTypeGroup}`)).toBe(SPACE_A)
    })

    it("fail-closes (skip) when parent Space is completely unknown — no cache, no channelInfo", () => {
        mockState.currentSpaceId = SPACE_A
        const thread = new Channel(threadCid("g_unknown", "t1"), ChannelTypeCommunityTopic)
        expect(shouldSkipChannelForSpace(thread)).toBe(true)
    })

    it("does NOT skip when I'm an external member of the parent group sourced from currentSpaceId", () => {
        mockState.currentSpaceId = SPACE_B
        mockState.channelSpaceMap.set(`g1_${ChannelTypeGroup}`, SPACE_A)
        mockState.subscribesByChannel.set("g1", [
            { uid: "u_self", orgData: { is_external: 1, source_space_id: SPACE_B } },
        ])
        const thread = new Channel(threadCid("g1", "t1"), ChannelTypeCommunityTopic)
        expect(shouldSkipChannelForSpace(thread)).toBe(false)
    })

    it("fail-closes on malformed thread channelID (cannot parse parent)", () => {
        mockState.currentSpaceId = SPACE_A
        const malformed = new Channel("not_a_thread_id", ChannelTypeCommunityTopic)
        expect(shouldSkipChannelForSpace(malformed)).toBe(true)
    })

    it("does NOT filter when no current Space (Space mode off)", () => {
        mockState.currentSpaceId = ""
        const thread = new Channel(threadCid("g_unknown", "t1"), ChannelTypeCommunityTopic)
        expect(shouldSkipChannelForSpace(thread)).toBe(false)
    })
})

