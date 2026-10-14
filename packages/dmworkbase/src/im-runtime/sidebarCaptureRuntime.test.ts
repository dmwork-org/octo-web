import { afterEach, describe, expect, it, vi } from "vitest";
import { Channel, Conversation, Message } from "wukongimjssdk";
import {
  createCurrentImSidebarCapture,
  type SidebarCaptureManifest,
} from "./sidebarCaptureRuntime";

const manifest: SidebarCaptureManifest = {
  schemaVersion: 1,
  kind: "web-sidebar-capture",
  source: "octo-web",
  captureId: "capture-test-1",
};

const scope = {
  server: "https://im.example.test/v1/",
  account: "user-a",
  space: "space-a",
  epoch: 1,
  transitionGeneration: 1,
};

function conversation(channelId: string, channelType: number, unread: number) {
  const value = new Conversation();
  value.channel = new Channel(channelId, channelType);
  value.unread = unread;
  value.timestamp = 1_700_000_001;
  const lastMessage = new Message();
  lastMessage.messageID = `message-${channelId}`;
  lastMessage.messageSeq = 17;
  lastMessage.channel = value.channel;
  value.lastMessage = lastMessage;
  return value;
}

describe("current Web sidebar capture", () => {
  afterEach(() => vi.restoreAllMocks());

  it("exports conversation store facts and real sidebar/categories responses from one owner", async () => {
    const sidebarService = {
      sync: vi.fn()
        .mockResolvedValueOnce({
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
          ],
          version: 9,
          follow_version: 12,
        })
        .mockResolvedValueOnce({
          items: [{
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
          }],
          version: 10,
          follow_version: 12,
        }),
    };
    const categoryService = {
      list: vi.fn().mockResolvedValue([
        {
          category_id: "cat-a",
          name: "A",
          sort: 1,
          is_default: false,
          groups: [{ group_no: "group-a", name: "Group A", category_sort: 1 }],
        },
      ]),
    };
    const store = {
      conversations: [
        conversation("group-a", 2, 3),
        conversation("thread-a", 5, 4),
      ],
      freshness: "ready",
      retain: vi.fn(),
      refresh: vi.fn(),
    };

    const capture = createCurrentImSidebarCapture({
      manifest,
      getScope: () => scope,
      store: store as any,
      sidebarService: sidebarService as any,
      categoryService: categoryService as any,
    });

    await expect(capture.syncSidebar("follow")).resolves.toMatchObject({
      tab: "follow",
      version: 9,
      followVersion: 12,
      items: [{ target_type: 1, target_id: "user-b" }],
    });
    await expect(capture.syncSidebar("recent")).resolves.toMatchObject({
      tab: "recent",
      version: 10,
      items: [{ target_type: 2, target_id: "group-a" }],
    });
    await expect(capture.syncCategories("space-a")).resolves.toMatchObject({
      categories: [{ categoryId: "cat-a", groups: [{ groupNo: "group-a" }] }],
    });

    const document = capture.toDocument();
    expect(document.manifest).toMatchObject(manifest);
    expect(document.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "scope.open", scope }),
      expect.objectContaining({
        type: "conversation.snapshot",
        conversations: expect.arrayContaining([
          expect.objectContaining({ targetId: "group-a", channel: { id: "group-a", type: 2 }, unread: 3 }),
          expect.objectContaining({ targetId: "thread-a", channel: { id: "thread-a", type: 5 }, unread: 4 }),
        ]),
      }),
      expect.objectContaining({ type: "sidebar.sync", tab: "follow", response: expect.objectContaining({ follow_version: 12 }) }),
      expect.objectContaining({ type: "sidebar.sync", tab: "recent", response: expect.objectContaining({ version: 10 }) }),
      expect.objectContaining({ type: "category.snapshot", scope, version: 1 }),
    ]));

    capture.dispose();
    expect(capture.toDocument().events).toHaveLength(document.events.length);
    expect(sidebarService.sync).toHaveBeenCalledTimes(2);
    expect(categoryService.list).toHaveBeenCalledWith("space-a");
    expect(store.retain).not.toHaveBeenCalled();
    expect(store.refresh).not.toHaveBeenCalled();
  });

  it("keeps a late response as rejected evidence when the Space changes", async () => {
    let currentScope = { ...scope };
    let release!: (response: unknown) => void;
    const sidebarService = {
      sync: vi.fn(() => new Promise<any>((resolve) => { release = resolve; })),
    };
    const capture = createCurrentImSidebarCapture({
      manifest,
      getScope: () => currentScope,
      store: { conversations: [], freshness: "ready" } as any,
      sidebarService: sidebarService as any,
      categoryService: { list: vi.fn().mockResolvedValue([]) } as any,
      deviceUuid: "device-a",
    });

    const pending = capture.syncSidebar("recent");
    currentScope = { ...scope, space: "space-b", epoch: 2, transitionGeneration: 2 };
    release({ items: [], version: 1, follow_version: 1 });
    await expect(pending).resolves.toMatchObject({ accepted: false, staleReason: "scope" });
    expect(capture.toDocument().events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "scope.switch", scope: currentScope }),
      expect.objectContaining({ type: "sidebar.sync", accepted: false, staleReason: "scope" }),
    ]));
  });
});
