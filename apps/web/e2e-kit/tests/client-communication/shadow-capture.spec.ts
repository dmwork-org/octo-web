/* eslint-disable no-undef -- Playwright executes this file in Node. */
import { test, expect } from "../../fixtures-authed";
import type { Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import {
  disposeCommunicationShadowCapture,
  disposeCommunicationSidebarCapture,
  markCommunicationShadowRead,
  readCommunicationSidebarCapture,
  readCommunicationShadowCapture,
  runCommunicationCategorySync,
  runCommunicationShadowHistory,
  runCommunicationSidebarSync,
  startCommunicationShadowCapture,
  waitForCommunicationShadowCapture,
} from "../../_kit/shadow-capture";
import type { MockMessageSeed } from "../../_kit/mock-im-runtime";
import type { MockSeed } from "../../_kit/mock-im-runtime";

const CAPTURE_MESSAGE: MockMessageSeed = {
  channelId: "shadow-capture-group",
  channelType: 2,
  messageSeq: 42,
  fromUid: "e2e-sender",
  timestamp: 1_700_000_042,
  content: { type: 1, text: "captured from Communication runtime" },
};

const HISTORY_MESSAGE: MockMessageSeed = {
  channelId: "shadow-capture-group",
  channelType: 2,
  messageSeq: 43,
  fromUid: "e2e-history-sender",
  timestamp: 1_700_000_043,
  content: { type: 1, text: "captured from history provider" },
};

const CAPTURE_SEED: MockSeed = {
  currentUid: "e2e-user",
  spaceId: "e2e-space",
  users: [],
  groups: [{ group_no: "shadow-capture-group", name: "Shadow capture" }],
  conversations: [{
    channelId: "shadow-capture-group",
    channelType: 2,
    unread: 3,
    timestamp: 1_700_000_042,
  }],
  messages: [CAPTURE_MESSAGE],
  subscribers: [],
};

async function installCommunicationHost(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const listeners = new Set<(command: unknown) => void>();
    const runtimeListeners = new Set<(command: unknown) => void>();
    const bootstrap = {
      bridgeVersion: 1,
      featureId: "communication",
      session: {
        uid: "e2e-user",
        token: "e2e-token",
        name: "E2E User",
        provider: "e2e",
        apiOrigin: "https://im.example.test",
      },
      space: { id: "e2e-space", name: "E2E Space" },
      appearance: { theme: "light", locale: "zh-CN" },
      initialPage: "chat",
      initialPresentation: "workspace",
      runtime: {
        version: 1,
        ownerId: "e2e-owner",
        contextId: "e2e-context",
        epoch: 1,
        summaryAttention: "disabled",
      },
    } as const;

    (globalThis as unknown as { octoBuddyCommunication: unknown }).octoBuddyCommunication = {
      getBootstrap: async () => bootstrap,
      reportReady: async () => {},
      reportNavigation: async () => {},
      reportUnread: () => {},
      reportAuthExpired: () => {},
      reportFatalError: () => {},
      openSummary: async () => {},
      reportRuntimeReady: async () => {},
      reportRuntimeSnapshot: () => {},
      reportRuntimeCommandResult: () => {},
      onCommand: (listener: (command: unknown) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      onRuntimeCommand: (listener: (command: unknown) => void) => {
        runtimeListeners.add(listener);
        return () => runtimeListeners.delete(listener);
      },
      // Keep the fixture explicit about its host boundary. The owner runtime
      // is started by the real Communication entry; the test targets the
      // Communication runtime that owns the WKSDK listeners and data store.
      __emitCommand: (command: unknown) => {
        for (const listener of Array.from(listeners)) listener(command);
      },
      __emitRuntimeCommand: (command: unknown) => {
        for (const listener of Array.from(runtimeListeners)) listener(command);
      },
    };
  });
}

test("Communication shadow capture exports an SDK event from the runtime listener path", async ({ pagePlain }, testInfo) => {
  await installCommunicationHost(pagePlain);
  await pagePlain.goto("/client-communication.html?shadowCapture=1");
  await waitForCommunicationShadowCapture(pagePlain);
  await pagePlain.evaluate((message) => {
    type Msw = {
      worker: { use: (...handlers: unknown[]) => void };
      http: {
        post: (path: string, resolver: (info: { request: Request }) => unknown) => unknown;
        put: (path: string, resolver: () => unknown) => unknown;
      };
      HttpResponse: { json: (body: unknown) => unknown };
    };
    const msw = (globalThis as unknown as { __msw?: Msw }).__msw;
    if (!msw) throw new Error("MSW worker unavailable");
    msw.worker.use(
      msw.http.post("*/message/channel/sync", async ({ request }) => {
        const body = (await request.json()) as { channel_id?: string; channel_type?: number };
        if (body.channel_id !== message.channelId || body.channel_type !== message.channelType) {
          return msw.HttpResponse.json({ messages: [] });
        }
        return msw.HttpResponse.json({
          messages: [{
            message_idstr: "mock-shadow-capture-group-43",
            client_msg_no: "mock-shadow-capture-group-43",
            message_seq: message.messageSeq,
            channel_id: message.channelId,
            channel_type: message.channelType,
            from_uid: message.fromUid,
            timestamp: message.timestamp,
            payload: { type: 1, content: message.content.text },
          }],
        });
      }),
      msw.http.put("*/conversation/clearUnread", () => msw.HttpResponse.json({})),
    );
  }, HISTORY_MESSAGE);

  // Replace the entry's empty default seed after boot, then ask the owner to
  // refresh through its real runtime command path. This keeps the test data
  // setup outside production UI and makes the read capture resolve against a
  // real SDK Conversation with a lastMessage sequence.
  await pagePlain.evaluate((seed) => {
    const install = (globalThis as unknown as {
      __installMockImRuntime__?: (value: unknown) => void;
    }).__installMockImRuntime__;
    if (typeof install !== "function") throw new Error("mock IM installer unavailable");
    install(seed);
    const emit = (globalThis as unknown as {
      octoBuddyCommunication?: { __emitRuntimeCommand?: (command: unknown) => void };
    }).octoBuddyCommunication?.__emitRuntimeCommand;
    if (typeof emit !== "function") throw new Error("runtime command seam unavailable");
    emit({
      version: 1,
      ownerId: "e2e-owner",
      contextId: "e2e-context",
      epoch: 1,
      type: "refresh",
    });
  }, CAPTURE_SEED);
  await pagePlain.waitForFunction((channelId) => {
    const sdkCtor = (globalThis as unknown as {
      WKSDK?: { shared?: () => { conversationManager?: { conversations?: Array<unknown> } } };
    }).WKSDK;
    const conversations = sdkCtor?.shared?.().conversationManager?.conversations ?? [];
    return conversations.some((conversation) =>
      conversation?.channel?.channelID === channelId &&
      conversation?.lastMessage?.messageSeq === 42,
    );
  }, CAPTURE_MESSAGE.channelId);

  await pagePlain.evaluate(() => {
    const setOpenChannel = (globalThis as unknown as {
      __octoCommunicationE2E__?: {
        setOpenChannel?: (channel: { channelID: string; channelType: number } | null) => void;
      };
    }).__octoCommunicationE2E__?.setOpenChannel;
    if (!setOpenChannel) throw new Error("Communication E2E channel seam unavailable");
    setOpenChannel({ channelID: "shadow-capture-group", channelType: 2 });
  });

  await startCommunicationShadowCapture(pagePlain, {
    captureReads: true,
    captureCommandOutcomes: true,
    manifest: {
      schemaVersion: 1,
      artifact: {
        name: "octo-web-client-communication",
        version: "e2e-fixture",
        commit: "shadow-capture-fixture",
        contractRevision: 3,
      },
      redaction: "plain-dto-v1",
    },
  });

  await pagePlain.evaluate(() => {
    const emit = (globalThis as unknown as {
      octoBuddyCommunication?: { __emitRuntimeCommand?: (command: unknown) => void };
    }).octoBuddyCommunication?.__emitRuntimeCommand;
    if (typeof emit !== "function") throw new Error("runtime command seam unavailable");
    emit({
      version: 1,
      ownerId: "e2e-owner",
      contextId: "e2e-context",
      epoch: 1,
      type: "activity",
      activity: {
        applicationActive: true,
        windowVisible: true,
        windowFocused: true,
        communicationSurfaceVisible: true,
      },
    });
  });

  await expect(
    runCommunicationShadowHistory(pagePlain, {
      channelID: HISTORY_MESSAGE.channelId,
      channelType: HISTORY_MESSAGE.channelType,
    }, { limit: 10 }),
  ).resolves.toMatchObject({ count: 1, messageSequences: [43] });
  await markCommunicationShadowRead(pagePlain, {
    channelID: CAPTURE_MESSAGE.channelId,
    channelType: CAPTURE_MESSAGE.channelType,
  });

  await pagePlain.evaluate((message) => {
    const emit = (globalThis as unknown as {
      __mockImEmitMessage__?: (value: unknown) => void;
    }).__mockImEmitMessage__;
    if (typeof emit !== "function") throw new Error("mock IM message emitter unavailable");
    emit(message);
  }, CAPTURE_MESSAGE);

  const liveDocument = await readCommunicationShadowCapture(pagePlain);
  expect(liveDocument?.events.some((event) => event.type === "message.upsert")).toBe(true);
  const document = await disposeCommunicationShadowCapture(pagePlain, testInfo);
  expect(document).not.toBeNull();
  expect(document?.manifest.artifact.commit).toBe("shadow-capture-fixture");
  expect(document?.events).toEqual(expect.arrayContaining([
    expect.objectContaining({
      type: "scope.open",
      scope: expect.objectContaining({
        account: "e2e-user",
        server: "https://im.example.test/v1/",
        channel: { id: "shadow-capture-group", type: 2 },
      }),
    }),
    expect.objectContaining({
      type: "message.upsert",
      source: "realtime",
      message: expect.objectContaining({
        id: "mock-shadow-capture-group-42",
        sequence: 42,
        payload: expect.objectContaining({ text: "captured from Communication runtime" }),
      }),
    }),
    expect.objectContaining({
      type: "message.upsert",
      source: "history",
      message: expect.objectContaining({
        id: "mock-shadow-capture-group-43",
        sequence: 43,
        payload: expect.objectContaining({ text: "captured from history provider" }),
      }),
    }),
    expect.objectContaining({
      type: "unread.read",
      channel: { id: "shadow-capture-group", type: 2 },
      readSequence: 42,
    }),
    expect.objectContaining({
      type: "command.outcome",
      outcome: expect.objectContaining({
        command: "history",
        status: "accepted",
        channel: { id: "shadow-capture-group", type: 2 },
      }),
    }),
  ]));
  expect(document?.events.some((event) => event.type === "command.outcome")).toBe(true);
});

test("Communication sidebar capture exports store, sidebar, and category facts from the same owner", async ({ pagePlain }, testInfo) => {
  await installCommunicationHost(pagePlain);
  await pagePlain.goto("/client-communication.html?shadowCapture=1");
  await waitForCommunicationShadowCapture(pagePlain);

  await pagePlain.evaluate(() => {
    type Msw = {
      worker: { use: (...handlers: unknown[]) => void };
      http: {
        post: (path: string, resolver: (info: { request: Request }) => unknown) => unknown;
        get: (path: string, resolver: () => unknown) => unknown;
      };
      HttpResponse: { json: (body: unknown) => unknown };
    };
    const msw = (globalThis as unknown as { __msw?: Msw }).__msw;
    if (!msw) throw new Error("MSW worker unavailable");
    let releaseRecent: (() => void) | undefined;
    let holdRecent = false;
    (globalThis as unknown as { __holdSidebarRecent__?: () => void }).__holdSidebarRecent__ = () => {
      holdRecent = true;
    };
    (globalThis as unknown as { __releaseSidebarRecent__?: () => void }).__releaseSidebarRecent__ = () => {
      releaseRecent?.();
    };
    msw.worker.use(
      msw.http.post("*/sidebar/sync", async ({ request }) => {
        const body = (await request.json()) as { tab?: string; device_uuid?: string };
        if (!body.device_uuid) throw new Error("sidebar device_uuid missing");
        if (body.tab === "recent") {
          if (!holdRecent) {
            return msw.HttpResponse.json({
              items: [{
                target_type: 2,
                target_id: "group-a",
                channel_type: 2,
                channel_id: "group-a",
                timestamp: 1_700_000_003,
                unread: 3,
                is_pinned: false,
                is_followed: true,
                category_id: "cat-a",
                category_sort: 1,
                follow_sort: 2,
              }],
              version: 30,
              follow_version: 12,
            });
          }
          await new Promise<void>((resolve) => {
            releaseRecent = resolve;
            (globalThis as unknown as { __sidebarRecentPending__?: boolean }).__sidebarRecentPending__ = true;
          });
          return msw.HttpResponse.json({
            items: [{
              target_type: 5,
              target_id: "group-a____thread-1",
              channel_type: 5,
              channel_id: "group-a____thread-1",
              parent_channel_id: "group-a",
              timestamp: 1_700_000_004,
              unread: 4,
              is_pinned: false,
              is_followed: true,
              status: 2,
              category_id: "cat-a",
              category_sort: 1,
              follow_sort: 3,
            }],
            version: 31,
            follow_version: 12,
          });
        }
        return msw.HttpResponse.json({
          items: [
            {
              target_type: 1,
              target_id: "user-b",
              channel_type: 1,
              channel_id: "user-b",
              timestamp: 1_700_000_002,
              unread: 2,
              is_pinned: false,
              is_followed: true,
              category_id: "cat-a",
              category_sort: 1,
              follow_sort: 1,
            },
            {
              target_type: 2,
              target_id: "group-a",
              channel_type: 2,
              channel_id: "group-a",
              timestamp: 1_700_000_003,
              unread: 1,
              is_pinned: true,
              is_followed: true,
              category_id: "cat-a",
              category_sort: 1,
              follow_sort: 2,
            },
          ],
          version: 30,
          follow_version: 12,
        });
      }),
      msw.http.get("*/spaces/e2e-space/categories", () => msw.HttpResponse.json([
        {
          category_id: "cat-a",
          name: "分类 A",
          sort: 1,
          is_default: false,
          groups: [{ group_no: "group-a", name: "Group A", category_sort: 1 }],
        },
        {
          category_id: "default",
          name: "默认",
          sort: 2,
          is_default: true,
          groups: [],
        },
      ])),
    );
  });

  await pagePlain.evaluate((seed) => {
    const install = (globalThis as unknown as {
      __installMockImRuntime__?: (value: unknown) => void;
    }).__installMockImRuntime__;
    if (typeof install !== "function") throw new Error("mock IM installer unavailable");
    install(seed);
    const emit = (globalThis as unknown as {
      octoBuddyCommunication?: { __emitRuntimeCommand?: (command: unknown) => void };
    }).octoBuddyCommunication?.__emitRuntimeCommand;
    if (typeof emit !== "function") throw new Error("runtime command seam unavailable");
    emit({ version: 1, ownerId: "e2e-owner", contextId: "e2e-context", epoch: 1, type: "refresh" });
  }, {
    ...CAPTURE_SEED,
    users: [...CAPTURE_SEED.users, { uid: "user-b", name: "E2E User B" }],
    groups: [...CAPTURE_SEED.groups, { group_no: "group-a", name: "Group A" }],
    conversations: [
      { channelId: "user-b", channelType: 1, unread: 2, timestamp: 1_700_000_002 },
      { channelId: "group-a", channelType: 2, unread: 3, timestamp: 1_700_000_003, categoryId: "cat-a" },
      { channelId: "group-a____thread-1", channelType: 5, unread: 4, timestamp: 1_700_000_004 },
    ],
    messages: [],
  });
  await pagePlain.waitForFunction(() => {
    const sdkCtor = (globalThis as unknown as {
      WKSDK?: { shared?: () => { conversationManager?: { conversations?: Array<unknown> } } };
    }).WKSDK;
    return (sdkCtor?.shared?.().conversationManager?.conversations ?? []).length >= 3;
  });

  await startCommunicationShadowCapture(pagePlain, {
    captureReads: false,
    manifest: {
      schemaVersion: 1,
      artifact: {
        name: "octo-web-client-communication",
        version: "e2e-sidebar-capture",
        commit: "sidebar-capture-e2e",
        contractRevision: 4,
      },
      redaction: "plain-dto-v1",
    },
  });
  await expect(runCommunicationSidebarSync(pagePlain, "follow")).resolves.toMatchObject({
    tab: "follow",
    followVersion: 12,
    accepted: true,
    items: expect.arrayContaining([
      expect.objectContaining({ target_type: 1, target_id: "user-b" }),
      expect.objectContaining({ target_type: 2, target_id: "group-a" }),
    ]),
  });
  await expect(runCommunicationSidebarSync(pagePlain, "recent")).resolves.toMatchObject({
    tab: "recent",
    accepted: true,
    items: expect.arrayContaining([expect.objectContaining({ target_id: "group-a" })]),
  });
  await expect(runCommunicationCategorySync(pagePlain, "e2e-space")).resolves.toMatchObject({
    categories: expect.arrayContaining([expect.objectContaining({ categoryId: "cat-a" })]),
  });

  const stableDocument = await readCommunicationSidebarCapture(pagePlain);
  const stableArtifactPath = process.env.OCTO_SIDEBAR_CAPTURE_STABLE_OUTPUT;
  if (stableArtifactPath && stableDocument) {
    await writeFile(stableArtifactPath, `${JSON.stringify(stableDocument, null, 2)}\n`, "utf8");
  }

  await pagePlain.evaluate(() => (globalThis as unknown as {
    __holdSidebarRecent__?: () => void;
  }).__holdSidebarRecent__?.());
  const staleRequest = runCommunicationSidebarSync(pagePlain, "recent");
  await pagePlain.waitForFunction(() => (globalThis as unknown as { __sidebarRecentPending__?: boolean }).__sidebarRecentPending__ === true);
  await pagePlain.evaluate(() => {
    const setSpace = (globalThis as unknown as {
      __octoCommunicationE2E__?: { setSpace?: (spaceId: string) => void };
    }).__octoCommunicationE2E__?.setSpace;
    if (typeof setSpace !== "function") throw new Error("Communication E2E space seam unavailable");
    setSpace("space-b");
  });
  await pagePlain.evaluate(() => (globalThis as unknown as {
    __releaseSidebarRecent__?: () => void;
  }).__releaseSidebarRecent__?.());
  await expect(staleRequest).resolves.toMatchObject({ accepted: false, staleReason: "scope" });

  const document = await readCommunicationSidebarCapture(pagePlain);
  expect(document?.events).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: "conversation.snapshot" }),
    expect.objectContaining({ type: "sidebar.sync", tab: "follow", response: expect.objectContaining({ follow_version: 12 }) }),
    expect.objectContaining({ type: "category.snapshot" }),
    expect.objectContaining({ type: "sidebar.sync", tab: "recent", accepted: false, staleReason: "scope" }),
  ]));
  const disposed = await disposeCommunicationSidebarCapture(pagePlain, testInfo);
  expect(disposed?.manifest.kind).toBe("web-sidebar-capture");
  const artifactPath = process.env.OCTO_SIDEBAR_CAPTURE_OUTPUT;
  if (artifactPath && disposed) {
    await writeFile(artifactPath, `${JSON.stringify(disposed, null, 2)}\n`, "utf8");
  }
});
