import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const hoisted = vi.hoisted(() => {
  class StubMessageContent {
    contentObj: any;
    contentType!: number;
    encodeJSON(): any {
      return {};
    }
    decode(raw: Uint8Array) {
      this.contentObj = JSON.parse(new TextDecoder().decode(raw));
      // contentType may be a read-only getter on subclasses (e.g. MergeforwardContent)
      try { this.contentType = this.contentObj?.type ?? 0; } catch (_e) {}
      // Mirror real SDK: MessageContent.decode() calls decodeJSON()
      if (typeof (this as any).decodeJSON === "function") {
        (this as any).decodeJSON(this.contentObj);
      }
    }
    get conversationDigest() {
      return "";
    }
  }

  class StubMessage {
    messageID: string = "";
    timestamp: number = 0;
    fromUID: string = "";
    content: any;
  }

  // Configurable factory so tests can inject real MergeforwardContent for type=11
  let contentFactory: (type: number) => any = (type) => {
    return new StubMessageContent();
  };

  const getMessageContent = vi.fn((type: number) => contentFactory(type));

  return {
    StubMessageContent,
    StubMessage,
    getMessageContent,
    setContentFactory: (f: (type: number) => any) => {
      contentFactory = f;
    },
  };
});

vi.mock("wukongimjssdk", () => ({
  Channel: class {
    channelID: string;
    channelType: number;
    constructor(channelID: string, channelType: number) {
      this.channelID = channelID;
      this.channelType = channelType;
    }
  },
  ChannelTypeGroup: 2,
  ChannelTypePerson: 1,
  Message: hoisted.StubMessage,
  MessageContent: hoisted.StubMessageContent,
  WKSDK: {
    shared: () => ({
      getMessageContent: hoisted.getMessageContent,
      channelManager: {
        getChannelInfo: () => undefined,
        fetchChannelInfo: () => undefined,
      },
    }),
  },
}));

vi.mock("../../../Components/MergeforwardMessageList", () => ({
  default: () => null,
}));
vi.mock("../../Base", () => ({ default: () => null }));
vi.mock("../../Base/tail", () => ({ default: () => null }));
vi.mock("../../MessageCell", () => ({ MessageCell: class {} }));
vi.mock("../../../ui/message/MessageRow", () => ({ default: () => null }));
vi.mock("../../../ui/message/MergeforwardCard", () => ({ default: () => null }));
vi.mock("../../../bridge/message/useMergeforwardMessageUI", () => ({
  getMergeforwardMessageUI: () => null,
}));
vi.mock("../../../Components/WKModal", () => ({ default: () => null }));
vi.mock("@douyinfe/semi-icons", () => ({
  IconArrowLeft: () => null,
  IconClose: () => null,
}));
vi.mock("../index.css", () => ({}));

import MergeforwardContent from "../index";

// For type=11, return a real MergeforwardContent so decodeDepth is actually exercised
hoisted.setContentFactory((type: number) => {
  if (type === 11) return new MergeforwardContent();
  const c = new hoisted.StubMessageContent();
  return c;
});

/**
 * Wire-format helper: builds a properly-shaped message map at each level.
 * Each entry in msgs[] must be { message_id, from_uid, timestamp, payload }.
 * depth=0 → leaf text message; depth=N → merge-forward wrapping depth=N-1.
 */
function createNestedMsgMap(depth: number): any {
  if (depth === 0) {
    return {
      message_id: "leaf",
      from_uid: "u0",
      timestamp: 0,
      payload: { type: 1, content: "Hello" },
    };
  }
  return {
    message_id: `n${depth}`,
    from_uid: `u${depth}`,
    timestamp: depth,
    payload: {
      type: 11,
      channel_type: 2,
      users: [{ uid: `u${depth}`, name: `User${depth}` }],
      msgs: [createNestedMsgMap(depth - 1)],
    },
  };
}

describe("MergeforwardContent depth limit", () => {
  it("shallow nesting (depth=4) decodes all levels without truncation", () => {
    const content = new MergeforwardContent();
    content.decodeJSON(createNestedMsgMap(4).payload);

    expect(content.msgs).toHaveLength(1);

    // Walk down and confirm every level decoded its one message
    let cur: MergeforwardContent = content;
    for (let i = 0; i < 3; i++) {
      const inner = cur.msgs[0].content;
      expect(inner).toBeInstanceOf(MergeforwardContent);
      expect((inner as MergeforwardContent).msgs).toHaveLength(1);
      cur = inner as MergeforwardContent;
    }
  });

  it("depth=8 (at limit) decodes without truncation", () => {
    const content = new MergeforwardContent();
    content.decodeJSON(createNestedMsgMap(8).payload);

    expect(content.msgs).toHaveLength(1);
    // The deepest level still has its one nested message
    let cur: MergeforwardContent = content;
    let levels = 0;
    while (
      cur.msgs.length > 0 &&
      cur.msgs[0].content instanceof MergeforwardContent
    ) {
      cur = cur.msgs[0].content as MergeforwardContent;
      levels++;
    }
    // 7 inner MergeforwardContent levels below the root (total depth = 8)
    expect(levels).toBe(7);
  });

  it("depth=9 (one over limit) truncates at the 9th level deterministically", () => {
    const content = new MergeforwardContent();
    content.decodeJSON(createNestedMsgMap(9).payload);

    // Root and first 8 inner levels should have msgs
    let cur: MergeforwardContent = content;
    for (let i = 0; i < 8; i++) {
      expect(cur.msgs).toHaveLength(1);
      expect(cur.msgs[0].content).toBeInstanceOf(MergeforwardContent);
      cur = cur.msgs[0].content as MergeforwardContent;
    }

    // The 9th inner MergeforwardContent hits MAX_DECODE_DEPTH and must have msgs=[]
    expect(cur.msgs).toHaveLength(0);
  });

  it("very deep nesting (depth=20) does not throw", () => {
    const content = new MergeforwardContent();
    expect(() => content.decodeJSON(createNestedMsgMap(20).payload)).not.toThrow();
    expect(content.msgs).toHaveLength(1);
  });

  it("decodeDepth resets to 0 after decodeJSON (counter cleanup via finally)", () => {
    const content = new MergeforwardContent();
    content.decodeJSON(createNestedMsgMap(20).payload);

    // A second call at depth=1 should not be affected by the previous call
    const second = new MergeforwardContent();
    second.decodeJSON(createNestedMsgMap(4).payload);
    expect(second.msgs).toHaveLength(1);
  });
});
