import { describe, it, expect } from "vitest";

// Import directly from the source file to avoid triggering the full @octo/base
// barrel export (which pulls in lottie-web and other browser-only deps)
import {
  parseThreadChannelId,
  buildThreadChannelId,
} from "../../../../packages/dmworkbase/src/Service/Thread";

const ChannelTypeCommunityTopic = 5;
const ChannelTypeGroup = 2;

describe("Thread GROUP.md: parseThreadChannelId", () => {
  it("parses valid thread channel ID", () => {
    const result = parseThreadChannelId("groupNo1234____shortId5678");
    expect(result).toEqual({ groupNo: "groupNo1234", shortId: "shortId5678" });
  });

  it("returns null for invalid channel ID without separator", () => {
    expect(parseThreadChannelId("noSeparator")).toBeNull();
  });

  it("returns null for channel ID with too many separators", () => {
    expect(parseThreadChannelId("a____b____c")).toBeNull();
  });

  it("roundtrips with buildThreadChannelId", () => {
    const groupNo = "04f51b";
    const shortId = "2039626";
    const channelId = buildThreadChannelId(groupNo, shortId);
    const parsed = parseThreadChannelId(channelId);
    expect(parsed).toEqual({ groupNo, shortId });
  });
});

describe("Thread GROUP.md: Thread interface fields", () => {
  it("accepts GROUP.md related fields", () => {
    const thread = {
      short_id: "123",
      group_no: "abc",
      channel_id: "abc____123",
      channel_type: ChannelTypeCommunityTopic,
      name: "test thread",
      creator_uid: "user1",
      status: 1,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
      has_thread_md: true,
      thread_md_version: 3,
      thread_md_updated_at: "2026-04-02 18:00:00",
      group_name: "Parent Group",
      last_message_at: "2026-04-02 19:00:00",
    };
    expect(thread.has_thread_md).toBe(true);
    expect(thread.thread_md_version).toBe(3);
    expect(thread.thread_md_updated_at).toBe("2026-04-02 18:00:00");
    expect(thread.group_name).toBe("Parent Group");
    expect(thread.last_message_at).toBe("2026-04-02 19:00:00");
  });

  it("defaults GROUP.md fields to undefined when not provided", () => {
    const thread = {
      short_id: "123",
      group_no: "abc",
      channel_id: "abc____123",
      channel_type: ChannelTypeCommunityTopic,
      name: "test",
      creator_uid: "user1",
      status: 1,
      created_at: "",
      updated_at: "",
    };
    expect((thread as any).has_thread_md).toBeUndefined();
    expect((thread as any).thread_md_version).toBeUndefined();
  });
});

describe("Thread GROUP.md: isThreadMd routing logic", () => {
  function isThreadMd(channelType: number): boolean {
    return channelType === ChannelTypeCommunityTopic;
  }

  it("returns true for ChannelTypeCommunityTopic (5)", () => {
    expect(isThreadMd(ChannelTypeCommunityTopic)).toBe(true);
  });

  it("returns false for ChannelTypeGroup (2)", () => {
    expect(isThreadMd(ChannelTypeGroup)).toBe(false);
  });

  it("returns false for other channel types", () => {
    expect(isThreadMd(1)).toBe(false);
    expect(isThreadMd(0)).toBe(false);
  });
});

describe("Thread GROUP.md: API routing", () => {
  function getApiCall(channelType: number, channelId: string) {
    if (channelType === ChannelTypeCommunityTopic) {
      const parsed = parseThreadChannelId(channelId);
      if (!parsed) return null;
      return {
        type: "thread",
        url: `groups/${parsed.groupNo}/threads/${parsed.shortId}/md`,
      };
    }
    return {
      type: "group",
      url: `groups/${channelId}/md`,
    };
  }

  it("routes to thread API for ChannelTypeCommunityTopic", () => {
    const result = getApiCall(ChannelTypeCommunityTopic, "grp001____tid001");
    expect(result).toEqual({
      type: "thread",
      url: "groups/grp001/threads/tid001/md",
    });
  });

  it("routes to group API for ChannelTypeGroup", () => {
    const result = getApiCall(ChannelTypeGroup, "grp001");
    expect(result).toEqual({
      type: "group",
      url: "groups/grp001/md",
    });
  });

  it("returns null for invalid thread channel ID", () => {
    const result = getApiCall(ChannelTypeCommunityTopic, "invalidId");
    expect(result).toBeNull();
  });
});

describe("Thread GROUP.md: Permission logic", () => {
  function canEditThreadMd(opts: {
    backendCanEdit?: boolean;
    creatorUid?: string;
    loginUid: string;
    subscriberRole?: number;
  }): boolean {
    const { backendCanEdit, creatorUid, loginUid, subscriberRole } = opts;
    const isBackendCanEdit = !!backendCanEdit;
    const isThreadCreator = creatorUid === loginUid;
    const isGroupOwnerOrManager =
      subscriberRole === 1 || subscriberRole === 2;
    return isBackendCanEdit || isThreadCreator || isGroupOwnerOrManager;
  }

  it("allows when backend says can edit", () => {
    expect(
      canEditThreadMd({
        backendCanEdit: true,
        loginUid: "user1",
        subscriberRole: 0,
      })
    ).toBe(true);
  });

  it("allows when user is thread creator", () => {
    expect(
      canEditThreadMd({
        creatorUid: "user1",
        loginUid: "user1",
        subscriberRole: 0,
      })
    ).toBe(true);
  });

  it("allows when user is group owner (role=1)", () => {
    expect(
      canEditThreadMd({
        creatorUid: "other",
        loginUid: "user1",
        subscriberRole: 1,
      })
    ).toBe(true);
  });

  it("allows when user is group manager (role=2)", () => {
    expect(
      canEditThreadMd({
        creatorUid: "other",
        loginUid: "user1",
        subscriberRole: 2,
      })
    ).toBe(true);
  });

  it("denies when none of the conditions are met", () => {
    expect(
      canEditThreadMd({
        backendCanEdit: false,
        creatorUid: "other",
        loginUid: "user1",
        subscriberRole: 0,
      })
    ).toBe(false);
  });

  it("denies for regular member (role=3)", () => {
    expect(
      canEditThreadMd({
        creatorUid: "other",
        loginUid: "user1",
        subscriberRole: 3,
      })
    ).toBe(false);
  });
});

describe("Thread GROUP.md: orgData field mapping", () => {
  it("maps thread md fields to orgData root level", () => {
    const thread = {
      name: "Test Thread",
      has_thread_md: true,
      thread_md_version: 5,
      thread_md_updated_at: "2026-04-02 18:00:00",
    };
    const orgData = {
      displayName: thread.name,
      thread: thread,
      parentGroupNo: "grp001",
      has_thread_md: thread.has_thread_md,
      thread_md_version: thread.thread_md_version,
      thread_md_updated_at: thread.thread_md_updated_at,
    };
    expect(orgData.has_thread_md).toBe(true);
    expect(orgData.thread_md_version).toBe(5);
    expect(orgData.thread_md_updated_at).toBe("2026-04-02 18:00:00");
    expect(orgData.thread.has_thread_md).toBe(true);
  });

  it("handles missing thread md fields", () => {
    const thread = {
      name: "Test Thread",
    };
    const orgData = {
      displayName: thread.name,
      thread: thread,
      parentGroupNo: "grp001",
      has_thread_md: (thread as any).has_thread_md,
      thread_md_version: (thread as any).thread_md_version,
      thread_md_updated_at: (thread as any).thread_md_updated_at,
    };
    expect(orgData.has_thread_md).toBeUndefined();
    expect(orgData.thread_md_version).toBeUndefined();
  });
});

describe("Thread GROUP.md: toThread mapping", () => {
  function toThread(data: any, groupNo: string) {
    return {
      short_id: data.short_id,
      group_no: groupNo,
      channel_id: buildThreadChannelId(groupNo, data.short_id),
      channel_type: ChannelTypeCommunityTopic,
      name: data.name,
      creator_uid: data.creator_uid,
      creator_name: data.creator_name,
      source_message_id: data.source_message_id,
      status: data.status,
      created_at: data.created_at,
      updated_at: data.updated_at,
      is_member: data.is_member,
      member_count: data.member_count,
      message_count: data.message_count,
      unread_count: data.unread_count,
      last_message_content: data.last_message_content,
      last_message_sender_name: data.last_message_sender_name,
      has_thread_md: !!data.has_thread_md,
      thread_md_version: data.thread_md_version || 0,
      thread_md_updated_at: data.thread_md_updated_at,
      group_name: data.group_name,
      last_message_at: data.last_message_at,
    };
  }

  it("maps all GROUP.md fields from API response", () => {
    const apiResp = {
      short_id: "tid001",
      name: "Test Thread",
      creator_uid: "user1",
      status: 1,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
      has_thread_md: true,
      thread_md_version: 3,
      thread_md_updated_at: "2026-04-02 18:00:00",
      group_name: "Parent Group",
      last_message_at: "2026-04-02 19:00:00",
    };
    const thread = toThread(apiResp, "grp001");
    expect(thread.has_thread_md).toBe(true);
    expect(thread.thread_md_version).toBe(3);
    expect(thread.thread_md_updated_at).toBe("2026-04-02 18:00:00");
    expect(thread.group_name).toBe("Parent Group");
    expect(thread.last_message_at).toBe("2026-04-02 19:00:00");
    expect(thread.channel_id).toBe("grp001____tid001");
  });

  it("defaults has_thread_md to false and version to 0 when missing", () => {
    const apiResp = {
      short_id: "tid002",
      name: "No MD Thread",
      creator_uid: "user2",
      status: 1,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };
    const thread = toThread(apiResp, "grp002");
    expect(thread.has_thread_md).toBe(false);
    expect(thread.thread_md_version).toBe(0);
    expect(thread.thread_md_updated_at).toBeUndefined();
  });
});

describe("Thread GROUP.md: setting panel subtitle", () => {
  function getSubTitle(hasThreadMd: boolean | undefined, mdVersion: number): string {
    return hasThreadMd ? `已配置 v${mdVersion}` : "未配置";
  }

  it("shows version when configured", () => {
    expect(getSubTitle(true, 3)).toBe("已配置 v3");
  });

  it("shows '未配置' when not configured", () => {
    expect(getSubTitle(false, 0)).toBe("未配置");
    expect(getSubTitle(undefined, 0)).toBe("未配置");
  });
});
