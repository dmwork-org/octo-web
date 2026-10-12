import { describe, expect, it } from "vitest";
import {
  normalizeShadowChannel,
  normalizeShadowConversation,
  normalizeShadowMessage,
  normalizeShadowUnread,
} from "./shadowCaptureAdapters";

describe("Web shadow capture adapters", () => {
  it("normalizes the SDK message envelope without leaking methods or SDK names", () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const result = normalizeShadowMessage({
      messageID: "m1",
      messageSeq: 12,
      clientMsgNo: "client-1",
      channel: { channelID: "group-a", channelType: 2 },
      fromUID: "user-b",
      toUID: "user-a",
      timestamp: 1_700_000_001,
      contentType: 101,
      status: 2,
      header: { noPersist: true },
      setting: { receipt: 1 },
      messageExtra: { threadId: "thread-1" },
      remoteExtra: { unreadCount: 2, isEdit: true },
      reactions: [{ uid: "user-c", emoji: "👍" }],
      streamNo: "stream-1",
      streamSeq: 3,
      content: { text: "hello", nested: cycle, method() {} },
    }, "realtime");

    expect(result).toMatchObject({
      id: "m1",
      sequence: 12,
      clientMsgNo: "client-1",
      channel: { id: "group-a", type: 2 },
      fromUid: "user-b",
      toUid: "user-a",
      contentType: 101,
      status: 2,
      remoteExtra: { unreadCount: 2, isEdit: true },
      streamNo: "stream-1",
      streamSeq: 3,
    });
    expect((result?.payload as any).method).toBeUndefined();
    expect((result?.payload as any).nested.self).toBeUndefined();
  });

  it("separates raw conversation inputs from effective unread values", () => {
    const conversation = normalizeShadowConversation({
      channel: { channelID: "group-a", channelType: 2 },
      lastMessage: { messageID: "m7", messageSeq: 7, content: { text: "last" } },
      extra: { top: 1, spaceUnread: 4 },
      remoteExtra: { version: 9 },
    });
    const unread = normalizeShadowUnread({
      channel: { channelID: "group-a", channelType: 2 },
      unread: 2,
      extra: { spaceUnread: 4 },
      remoteExtra: { version: 9 },
    });

    expect(conversation).toEqual({
      channel: { id: "group-a", type: 2 },
      lastMessageId: "m7",
      lastMessageSequence: 7,
      pinned: true,
      version: 9,
    });
    expect(unread).toEqual({
      channel: { id: "group-a", type: 2 },
      status: "ready",
      count: 4,
      version: 9,
    });
  });

  it("rejects malformed channel and projection inputs instead of fabricating zero", () => {
    expect(normalizeShadowChannel({ channelID: "", channelType: 2 })).toBeUndefined();
    expect(normalizeShadowMessage({ messageID: "m1", messageSeq: -1 }, "history")).toBeUndefined();
    expect(normalizeShadowConversation({ channel: { channelID: "group-a", channelType: "2" } })).toBeUndefined();
    expect(normalizeShadowUnread({ channel: { channelID: "group-a", channelType: 2 }, unread: undefined })).toBeUndefined();
  });
});
