import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const app = vi.hoisted(() => {
  const handlers = new Map<string, Set<(payload?: unknown) => void>>();
  const on = (event: string, listener: (payload?: unknown) => void) => {
    const listeners = handlers.get(event) ?? new Set();
    listeners.add(listener);
    handlers.set(event, listeners);
  };
  const off = (event: string, listener: (payload?: unknown) => void) => {
    handlers.get(event)?.delete(listener);
  };
  return {
    handlers,
    shared: {
      currentSpaceId: "space-a",
      openChannel: undefined as any,
      spaceRevision: 1,
      channelSpaceMap: new Map<string, string>(),
      channelMySourceSpaceMap: new Map<string, string>(),
      addMessageDeleteListener: vi.fn(),
      removeMessageDeleteListener: vi.fn(),
    },
    loginInfo: { uid: "user-a", token: "token-a", sessionRevision: 1 },
    apiClient: {
      config: { apiURL: "https://im.example.test", originRevision: 1 },
    },
    conversationProvider: {
      markConversationUnread: vi.fn().mockResolvedValue(undefined),
    },
    mittBus: {
      on,
      off,
      emit(event: string, payload?: unknown) {
        for (const listener of Array.from(handlers.get(event) ?? []))
          listener(payload);
      },
    },
  };
});

vi.mock("../App", () => ({ default: app }));
vi.mock("../Service/PinnedService", () => ({
  default: { list: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../Service/ProhibitwordsService", () => ({
  ProhibitwordsService: { shared: { filter: (value: string) => value } },
}));
vi.mock("../Service/SpaceService", () => ({
  shouldSkipChannelForSpace: () => false,
  shouldSkipPersonConversationForSpace: () => false,
  hasSpacePrefix: () => false,
}));
vi.mock("../Service/Thread", () => ({ parseThreadChannelId: () => undefined }));

import WKSDK, {
  Channel,
  Conversation,
  Message,
  ConversationAction,
} from "wukongimjssdk";
import { createCurrentImShadowTrace } from "./shadowCaptureRuntime";
import type {
  ShadowCaptureManifest,
  ShadowCaptureScope,
} from "./shadowCapture";

const manifest: ShadowCaptureManifest = {
  schemaVersion: 1,
  artifact: {
    name: "octo-web-client-communication",
    version: "1.0.12",
    commit: "dd90c017bd25bb6dda8617b6d49f6c91af115e1e",
    contractRevision: 3,
  },
  sdk: { name: "wukongimjssdk", version: "1.3.5" },
  redaction: "plain-dto-v1",
};

const scopeA: ShadowCaptureScope = {
  server: "https://im.example.test",
  account: "user-a",
  organization: "org-a",
  space: "space-a",
  channel: { id: "group-a", type: 2 },
  epoch: 1,
  sessionId: "fixture-session",
  transitionGeneration: 1,
};

const scopeB: ShadowCaptureScope = {
  ...scopeA,
  space: "space-b",
  epoch: 2,
  transitionGeneration: 2,
};

const sdk = WKSDK.shared();
const messageListeners = new Set<(message: Message) => void>();
let originalRemoveMessageListener: unknown;

function conversation(): Conversation {
  const value = new Conversation();
  value.channel = new Channel("group-a", 2);
  value.unread = 2;
  value.extra = { top: 1 };
  value.remoteExtra = { version: 4 };
  const last = new Message();
  last.messageID = "m1";
  last.messageSeq = 7;
  last.clientMsgNo = "client-1";
  last.channel = value.channel;
  last.content = { text: "hello" };
  value.lastMessage = last;
  value.timestamp = 100;
  return value;
}

beforeEach(() => {
  app.handlers.clear();
  app.shared.currentSpaceId = "space-a";
  app.shared.openChannel = new Channel("group-a", 2);
  app.loginInfo.uid = "user-a";
  app.loginInfo.token = "token-a";
  app.loginInfo.sessionRevision = 1;
  app.apiClient.config.apiURL = "https://im.example.test";
  app.apiClient.config.originRevision = 1;
  app.conversationProvider.markConversationUnread
    .mockClear()
    .mockResolvedValue(undefined);
  sdk.conversationManager.conversations = [];
  messageListeners.clear();
  const chatManager = sdk.chatManager as any;
  vi.spyOn(chatManager, "addMessageListener").mockImplementation(
    (listener: any) => {
      messageListeners.add(listener);
    }
  );
  originalRemoveMessageListener = chatManager.removeMessageListener;
  chatManager.removeMessageListener = (listener: any) => {
    messageListeners.delete(listener);
  };
});

afterEach(() => {
  (sdk.chatManager as any).removeMessageListener =
    originalRemoveMessageListener;
  vi.restoreAllMocks();
});

describe("current Web runtime shadow capture", () => {
  it("captures a deterministic pinned-artifact trace from SDK listeners, store refresh, and read persistence", async () => {
    let scope = scopeA;
    const current = conversation();
    sdk.conversationManager.conversations = [current];
    const store = {
      conversations: [current],
      freshness: "ready",
      findConversation: (channel: Channel) =>
        channel.isEqual(current.channel) ? current : undefined,
    } as any;

    const trace = createCurrentImShadowTrace(manifest, {
      sdk,
      store,
      getScope: () => scope,
      captureReads: true,
    });

    const incoming = new Message();
    incoming.messageID = "m2";
    incoming.messageSeq = 8;
    incoming.clientMsgNo = "client-2";
    incoming.channel = new Channel("group-a", 2);
    incoming.fromUID = "user-b";
    incoming.content = {
      text: "world",
      ignored() {
        return "function";
      },
    } as any;
    for (const listener of Array.from(messageListeners)) listener(incoming);

    const updated = conversation();
    updated.lastMessage!.messageID = "m2";
    updated.lastMessage!.messageSeq = 8;
    updated.unread = 3;
    sdk.conversationManager.notifyConversationListeners(
      updated,
      ConversationAction.update
    );
    await app.conversationProvider.markConversationUnread(current.channel, 0);

    scope = scopeB;
    app.shared.currentSpaceId = "space-b";
    app.mittBus.emit("space-changed", { space_id: "space-b" });
    trace.dispose();

    expect(trace.toDocument()).toMatchObject({
      manifest,
      events: expect.any(Array),
    });
    expect(trace.toDocument().events.map((event) => event.type)).toEqual([
      "scope.open",
      "conversation.upsert",
      "unread.set",
      "message.upsert",
      "conversation.upsert",
      "unread.set",
      "unread.read",
      "scope.switch",
    ]);
    expect(trace.toDocument().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "message.upsert",
          source: "realtime",
          message: expect.objectContaining({
            id: "m2",
            sequence: 8,
            channel: { id: "group-a", type: 2 },
            clientMsgNo: "client-2",
          }),
        }),
        expect.objectContaining({
          type: "unread.read",
          scope: scopeA,
          channel: { id: "group-a", type: 2 },
          readSequence: 7,
        }),
      ])
    );
    const messageEvent = trace
      .toDocument()
      .events.find((event) => event.type === "message.upsert") as any;
    expect(messageEvent.message.payload.ignored).toBeUndefined();
  });

  it("restores the provider method and listener ownership after capture disposal", async () => {
    const current = conversation();
    const store = {
      conversations: [current],
      freshness: "ready",
      findConversation: () => current,
    } as any;
    const original = app.conversationProvider.markConversationUnread;
    const trace = createCurrentImShadowTrace(manifest, {
      sdk,
      store,
      getScope: () => scopeA,
      captureReads: true,
    });
    expect(app.conversationProvider.markConversationUnread).not.toBe(original);
    trace.dispose();
    expect(app.conversationProvider.markConversationUnread).toBe(original);
    expect(messageListeners).toHaveLength(0);
    await app.conversationProvider.markConversationUnread(current.channel, 0);
    expect(
      trace.toDocument().events.filter((event) => event.type === "unread.read")
    ).toHaveLength(0);
  });
});
