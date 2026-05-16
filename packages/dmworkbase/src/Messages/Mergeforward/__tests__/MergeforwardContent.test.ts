import { describe, it, expect, vi } from "vitest";

// Hoisted stubs are required because vi.mock is hoisted above any other code;
// referencing module-level `class` declarations inside the factory triggers
// "Cannot access ... before initialization" in vitest 4.
const hoisted = vi.hoisted(() => {
  class StubMessageContent {
    contentObj: any;
    // Do not initialize contentType as a field — MergeforwardContent
    // overrides it with a getter on the prototype, and a field initializer
    // on the base class would trigger "Cannot set property contentType
    // which has only a getter" when the subclass is instantiated.
    contentType!: number;
    encodeJSON(): any {
      return {};
    }
    decode(_: Uint8Array) {
      /* noop — content retained via decodeJSON fallback */
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

  const getMessageContent = vi.fn(() => {
    const c = new StubMessageContent();
    // simulate decode() populating contentObj from raw payload
    c.decode = (raw: Uint8Array) => {
      try {
        c.contentObj = JSON.parse(new TextDecoder().decode(raw));
        c.contentType = c.contentObj?.type ?? 0;
      } catch (_e) {
        c.contentObj = {};
      }
    };
    return c;
  });

  return { StubMessageContent, StubMessage, getMessageContent };
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
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    }),
  },
}));

// Don't import the full component module; only the content class is under test.
// The component module also imports React/UI that's not needed here, so stub them.
vi.mock("../../../Components/MergeforwardMessageList", () => ({
  default: () => null,
}));
vi.mock("../../Base", () => ({ default: () => null }));
vi.mock("../../Base/tail", () => ({ default: () => null }));
vi.mock("../../MessageCell", () => ({ MessageCell: class { } }));
vi.mock("../../../ui/message/MessageRow", () => ({ default: () => null }));
vi.mock("../../../ui/message/MergeforwardCard", () => ({
  default: () => null,
}));
vi.mock("../../../bridge/message/useMergeforwardMessageUI", () => ({
  getMergeforwardMessageUI: () => null,
}));
vi.mock("../../../Components/WKModal", () => ({ default: () => null }));
vi.mock("@douyinfe/semi-icons", () => ({ IconArrowLeft: () => null, IconClose: () => null }));
vi.mock("../index.css", () => ({}));

import MergeforwardContent from "../index";

describe("MergeforwardContent users external fields", () => {
  it("decodeJSON preserves is_external and source_space_name", () => {
    const content = new MergeforwardContent();
    content.decodeJSON({
      channel_type: 2,
      users: [
        { uid: "u1", name: "Alice" },
        {
          uid: "u2",
          name: "Bob",
          is_external: 1,
          source_space_name: "ExampleCorp",
        },
      ],
      msgs: [],
    });
    expect(content.users).toHaveLength(2);
    expect(content.users[0]).toEqual({ uid: "u1", name: "Alice" });
    expect(content.users[0]).not.toHaveProperty("is_external");
    expect(content.users[0]).not.toHaveProperty("source_space_name");
    expect(content.users[1]).toEqual({
      uid: "u2",
      name: "Bob",
      is_external: 1,
      source_space_name: "ExampleCorp",
    });
  });

  it("decodeJSON drops empty source_space_name but keeps is_external flag", () => {
    const content = new MergeforwardContent();
    content.decodeJSON({
      channel_type: 2,
      users: [
        { uid: "u3", name: "Carol", is_external: 0, source_space_name: "" },
      ],
      msgs: [],
    });
    expect(content.users).toHaveLength(1);
    expect(content.users[0].is_external).toBe(0);
    expect(content.users[0]).not.toHaveProperty("source_space_name");
  });

  it("decodeJSON deduplicates users by uid (preserves first occurrence)", () => {
    const content = new MergeforwardContent();
    content.decodeJSON({
      channel_type: 2,
      users: [
        {
          uid: "u1",
          name: "Alice",
          is_external: 1,
          source_space_name: "Space-A",
        },
        { uid: "u1", name: "Alice (dup)" },
      ],
      msgs: [],
    });
    expect(content.users).toHaveLength(1);
    expect(content.users[0]).toEqual({
      uid: "u1",
      name: "Alice",
      is_external: 1,
      source_space_name: "Space-A",
    });
  });

  it("encodeJSON round-trips external fields", () => {
    const users = [
      { uid: "u1", name: "Alice" },
      {
        uid: "u2",
        name: "Bob",
        is_external: 1,
        source_space_name: "ExampleCorp",
      },
    ];
    const content = new MergeforwardContent(2, users, []);
    const encoded = content.encodeJSON();
    expect(encoded.channel_type).toBe(2);
    expect(encoded.users).toEqual(users);
    expect(encoded.msgs).toEqual([]);
  });
});

/**
 * dmwork-web#1069：合并转发内嵌消息的 decode 路径（mapToMessage）必须透传
 * msg-level 的外部来源字段，否则外部成员在转发历史里的消息气泡
 * header 会缺失 @SpaceName 标记。与 Convert.toMessage 行为保持一致。
 */
describe("MergeforwardContent.mapToMessage external fields (dmwork-web#1069)", () => {
  it("stashes from_is_external / from_source_space_name on inner messages", () => {
    const content = new MergeforwardContent();
    content.decodeJSON({
      channel_type: 2,
      users: [],
      msgs: [
        {
          message_id: "1",
          from_uid: "u-ext",
          timestamp: 0,
          payload: { type: 1, content: "hi" },
          from_is_external: 1,
          from_source_space_name: "测试空间1",
        },
      ],
    });
    const inner: any = content.msgs[0];
    expect(inner.fromUID).toBe("u-ext");
    expect(inner.from_is_external).toBe(1);
    expect(inner.from_source_space_name).toBe("测试空间1");
  });

  it("stashes from_home_space_id / from_home_space_name on inner messages", () => {
    const content = new MergeforwardContent();
    content.decodeJSON({
      channel_type: 2,
      users: [],
      msgs: [
        {
          message_id: "2",
          from_uid: "u-ext",
          timestamp: 0,
          payload: { type: 1, content: "hi" },
          from_home_space_id: "668cc9ee13e14fd78e3c92fe0d937cd8",
          from_home_space_name: "测试空间1",
        },
      ],
    });
    const inner: any = content.msgs[0];
    expect(inner.from_home_space_id).toBe("668cc9ee13e14fd78e3c92fe0d937cd8");
    expect(inner.from_home_space_name).toBe("测试空间1");
  });

  it("leaves fields undefined when payload omits them (backward compat)", () => {
    const content = new MergeforwardContent();
    content.decodeJSON({
      channel_type: 2,
      users: [],
      msgs: [
        {
          message_id: "3",
          from_uid: "u-int",
          timestamp: 0,
          payload: { type: 1, content: "hi" },
        },
      ],
    });
    const inner: any = content.msgs[0];
    expect(inner.from_is_external).toBeUndefined();
    expect(inner.from_source_space_name).toBeUndefined();
    expect(inner.from_home_space_id).toBeUndefined();
    expect(inner.from_home_space_name).toBeUndefined();
  });

  it("non-1 truthy from_is_external collapses to 0 (strict boolean semantics)", () => {
    const content = new MergeforwardContent();
    content.decodeJSON({
      channel_type: 2,
      users: [],
      msgs: [
        {
          message_id: "4",
          from_uid: "u-int",
          timestamp: 0,
          payload: { type: 1, content: "hi" },
          from_is_external: "yes",
        },
      ],
    });
    const inner: any = content.msgs[0];
    expect(inner.from_is_external).toBe(0);
  });
});

/**
 * Bug: 二次转发合并转发消息时，消息类型从 mergeForward 退化为 text。
 * 根因测试：验证 messageToMap 在内嵌消息的 contentObj 为 undefined 时，
 * 是否正确设置 payload.type 字段。
 */
describe("MergeforwardContent.messageToMap type field (nested mergeforward bug)", () => {
  it("includes type field when contentObj exists", () => {
    const content = new MergeforwardContent();
    content.decodeJSON({
      channel_type: 2,
      users: [],
      msgs: [
        {
          message_id: "1",
          from_uid: "u1",
          timestamp: 123,
          payload: { type: 11, channel_type: 2, users: [], msgs: [] },
        },
      ],
    });

    const encoded = content.encodeJSON();
    expect(encoded.msgs).toHaveLength(1);
    expect(encoded.msgs[0].payload).toBeDefined();
    expect(encoded.msgs[0].payload.type).toBe(11); // 嵌套合并转发的 type 应为 11
  });

  it("includes type field when contentObj is undefined (fallback to encodeJSON)", () => {
    // 模拟一个内嵌消息，其 content.contentObj 为 undefined
    // 这种情况发生在消息是通过构造函数创建而非 decode() 得到的
    const innerMsg = new (hoisted.StubMessage as any)();
    innerMsg.messageID = "1";
    innerMsg.fromUID = "u1";
    innerMsg.timestamp = 123;
    innerMsg.content = {
      contentObj: undefined, // 关键：contentObj 为 undefined
      contentType: 11,
      encodeJSON: () => ({ channel_type: 2, users: [], msgs: [] }),
    };

    const content = new MergeforwardContent(2, [], [innerMsg as any]);
    const encoded = content.encodeJSON();

    expect(encoded.msgs).toHaveLength(1);
    expect(encoded.msgs[0].payload).toBeDefined();
    expect(encoded.msgs[0].payload.type).toBe(11); // 即使 contentObj 为 undefined，type 也应正确设置
  });

  it("adds type field when contentObj exists but type is undefined", () => {
    // 模拟边缘情况：contentObj 存在但没有 type 字段
    const innerMsg = new (hoisted.StubMessage as any)();
    innerMsg.messageID = "1";
    innerMsg.fromUID = "u1";
    innerMsg.timestamp = 123;
    innerMsg.content = {
      contentObj: { channel_type: 2, users: [], msgs: [] }, // 有 contentObj 但没有 type
      contentType: 11,
      encodeJSON: () => ({ channel_type: 2, users: [], msgs: [] }),
    };

    const content = new MergeforwardContent(2, [], [innerMsg as any]);
    const encoded = content.encodeJSON();

    expect(encoded.msgs).toHaveLength(1);
    expect(encoded.msgs[0].payload).toBeDefined();
    // 防护性检查应该添加 type 字段
    expect(encoded.msgs[0].payload.type).toBe(11);
  });

  it("full round-trip: decode → single forward → encode preserves nested mergeforward type", () => {
    // 模拟完整场景：
    // 1. 用户 A 发送合并转发 M1（包含多条文本消息）
    // 2. 用户 B 收到 M1，多选包含 M1，创建合并转发 M2
    // 3. 用户 C 收到 M2
    // 4. 用户 C 右键单条转发 M2 给用户 D
    // 5. 验证发送的 payload 中嵌套的 M1 的 type 是否正确

    // Step 3: 用户 C 收到 M2（服务器返回的 payload）
    const m2PayloadFromServer = {
      type: 11, // mergeforward
      channel_type: 2,
      users: [{ uid: "u1", name: "User1" }],
      msgs: [
        {
          message_id: "m1",
          from_uid: "u1",
          timestamp: 100,
          payload: {
            type: 11, // 嵌套的 M1 也是 mergeforward
            channel_type: 2,
            users: [{ uid: "u2", name: "User2" }],
            msgs: [
              {
                message_id: "t1",
                from_uid: "u2",
                timestamp: 50,
                payload: { type: 1, content: "Hello" },
              },
            ],
          },
        },
      ],
    };

    // 模拟 SDK decode() 流程
    const m2Content = new MergeforwardContent();
    // SDK 的 decode() 会先设置 contentObj，再调用 decodeJSON
    // 我们这里只调用 decodeJSON，因为测试环境中 decode() 是 stub
    m2Content.decodeJSON(m2PayloadFromServer);

    // Step 4: 用户 C 转发 M2 时，会调用 encodeJSON()
    const encoded = m2Content.encodeJSON();

    // Step 5: 验证嵌套的 M1 的 type 是否正确
    expect(encoded.msgs).toHaveLength(1);
    expect(encoded.msgs[0].payload).toBeDefined();
    // 这是关键检查：嵌套合并转发的 type 必须是 11，不能丢失
    expect(encoded.msgs[0].payload.type).toBe(11);

    // 进一步验证：M1 内部的文本消息的 type 也应正确
    expect(encoded.msgs[0].payload.msgs).toBeDefined();
    expect(encoded.msgs[0].payload.msgs[0].payload.type).toBe(1);
  });
});

describe("MergeforwardContent.encode() full payload (simulates SDK encode path)", () => {
  it("encode() produces payload with type=11 at top level for forwarded mergeforward", () => {
    // 模拟场景：用户收到一条合并转发消息，然后"逐条转发"它
    // SDK 的 encode() 调用 encodeJSON() 并添加 type = contentType
    const content = new MergeforwardContent();
    content.decodeJSON({
      type: 11,
      channel_type: 2,
      users: [{ uid: "u1", name: "User1" }],
      msgs: [
        {
          message_id: "m1",
          from_uid: "u1",
          timestamp: 100,
          payload: { type: 1, content: "Hello" },
        },
      ],
    });

    // 模拟 SDK 的 MessageContent.prototype.encode() 行为：
    // 1. 调用 this.encodeJSON()
    // 2. 添加 contentObj.type = this.contentType
    // 3. JSON.stringify
    const contentObj = content.encodeJSON();
    contentObj.type = content.contentType; // SDK 添加 type

    // 验证顶层 type 是 11（合并转发）
    expect(contentObj.type).toBe(11);
    // 验证结构完整
    expect(contentObj.channel_type).toBe(2);
    expect(contentObj.users).toHaveLength(1);
    expect(contentObj.msgs).toHaveLength(1);
    expect(contentObj.msgs[0].payload.type).toBe(1);

    // 验证 JSON 序列化后的完整 payload
    const payloadStr = JSON.stringify(contentObj);
    const parsed = JSON.parse(payloadStr);
    expect(parsed.type).toBe(11);
  });

  it("encode() works correctly when content was created via constructor (sendMergeforward path)", () => {
    // 模拟 sendMergeforward 路径：new MergeforwardContent(channelType, users, msgs)
    // 内嵌消息的 content.contentObj 可能是 undefined（自己发送的消息）
    const innerMsg = new (hoisted.StubMessage as any)();
    innerMsg.messageID = "m1";
    innerMsg.fromUID = "u1";
    innerMsg.timestamp = 100;
    innerMsg.content = {
      contentObj: { type: 1, content: "Hello" },
      contentType: 1,
      encodeJSON: () => ({ content: "Hello" }),
    };

    const content = new MergeforwardContent(2, [{ uid: "u1", name: "User1" }], [innerMsg as any]);

    const contentObj = content.encodeJSON();
    contentObj.type = content.contentType;

    expect(contentObj.type).toBe(11);
    expect(contentObj.msgs[0].payload.type).toBe(1);
  });
});

/**
 * 深度限制防护：防止深层嵌套转发导致栈溢出
 * 当转发深度超过 8 层时，停止解码内层消息，但保留 contentObj 以支持 re-forward
 */
describe("MergeforwardContent depth limit (prevent stack overflow)", () => {
  // 辅助函数：生成嵌套的转发 payload
  const createNestedPayload = (depth: number): any => {
    if (depth === 0) {
      return {
        message_id: "leaf",
        from_uid: "u1",
        timestamp: 0,
        payload: { type: 1, content: "Hello" },
      };
    }
    return {
      type: 11,
      channel_type: 2,
      users: [{ uid: "u1", name: "User1" }],
      msgs: [createNestedPayload(depth - 1)],
    };
  };

  it("shallow nesting (depth=4) decodes normally with all messages populated", () => {
    const payload = createNestedPayload(4);
    const content = new MergeforwardContent();

    expect(() => {
      content.decodeJSON(payload);
    }).not.toThrow();

    // 4 层深度应该完全解码
    expect(content.msgs).toHaveLength(1);
    expect(content.msgs[0]).toBeDefined();
    // 内层消息的内容应该存在
    expect(content.msgs[0].content).toBeDefined();
  });

  it("at-limit nesting (depth=8) decodes normally", () => {
    const payload = createNestedPayload(8);
    const content = new MergeforwardContent();

    expect(() => {
      content.decodeJSON(payload);
    }).not.toThrow();

    // 8 层是限制边界，应该完全解码
    expect(content.msgs).toHaveLength(1);
  });

  it("exceeds-limit nesting (depth=9) truncates at truncation point", () => {
    const payload = createNestedPayload(9);
    const content = new MergeforwardContent();

    expect(() => {
      content.decodeJSON(payload);
    }).not.toThrow();

    // 9 层会触发 truncation
    expect(content.msgs).toHaveLength(1);
    // 内层的内容应该被截断，msgs 为空
    if (content.msgs[0].content instanceof MergeforwardContent) {
      expect(content.msgs[0].content.msgs).toHaveLength(0);
    }
  });

  it("very deep nesting (depth=20) does not crash and preserves contentObj", () => {
    const payload = createNestedPayload(20);
    const content = new MergeforwardContent();

    // 设置 contentObj，模拟 SDK decode() 的行为
    content.contentObj = payload;

    expect(() => {
      content.decodeJSON(payload);
    }).not.toThrow();

    // 关键：contentObj 应该被保留用于 re-forward
    expect(content.contentObj).toEqual(payload);
    // 应该有消息（虽然内层会被截断）
    expect(content.msgs).toBeDefined();
  });

  it("depth counter resets correctly after exception during decode", () => {
    // 这个测试验证 try/finally 确保深度计数器正确还原
    const malformedPayload = {
      type: 11,
      channel_type: 2,
      users: [{ uid: "u1", name: "User1" }],
      msgs: [
        {
          message_id: "bad",
          from_uid: "u1",
          timestamp: 0,
          payload: null, // 这会导致问题
        },
      ],
    };

    const content1 = new MergeforwardContent();
    try {
      content1.decodeJSON(malformedPayload);
    } catch (_e) {
      // 忽略异常
    }

    // 即使异常，第二个 decode 也应该正常工作（深度计数器正确还原）
    const goodPayload = {
      type: 11,
      channel_type: 2,
      users: [{ uid: "u2", name: "User2" }],
      msgs: [
        {
          message_id: "msg1",
          from_uid: "u2",
          timestamp: 0,
          payload: { type: 1, content: "OK" },
        },
      ],
    };

    const content2 = new MergeforwardContent();
    expect(() => {
      content2.decodeJSON(goodPayload);
    }).not.toThrow();

    expect(content2.msgs).toHaveLength(1);
  });

  it("truncation preserves users dedup and external fields", () => {
    const payload = {
      type: 11,
      channel_type: 2,
      users: [
        { uid: "u1", name: "User1", is_external: 1, source_space_name: "Space1" },
        { uid: "u1", name: "User1 Dup" }, // 重复
      ],
      msgs: [createNestedPayload(15)], // 超深，会触发 truncation
    };

    const content = new MergeforwardContent();
    content.decodeJSON(payload);

    // 即使 truncation，users 也应该被去重和过滤
    expect(content.users).toHaveLength(1);
    expect(content.users[0]).toEqual({
      uid: "u1",
      name: "User1",
      is_external: 1,
      source_space_name: "Space1",
    });
    // truncation 时内层应该被截断
    expect(content.msgs).toHaveLength(1);
    if (content.msgs[0].content instanceof MergeforwardContent) {
      expect(content.msgs[0].content.msgs).toHaveLength(0);
    }
  });
});
