import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const publication = vi.hoisted(() => ({ publish: vi.fn() }));
vi.mock("react-virtuoso", () => ({ TableVirtuoso: () => null, Virtuoso: () => null, VirtuosoGrid: () => null }));
vi.mock("../../../features/documentTitle", async (importOriginal) => ({
  ...await importOriginal<object>(),
  getBrowserUnreadConversationSync: () => publication,
}));

import { Toast } from "@douyinfe/semi-ui";
import WKSDK, { Channel, ReminderType } from "wukongimjssdk";
import WKApp from "../../../App";
import { t } from "../../../i18n";
import ConversationList from "../index";
import { createImOwnerAdmission, type ImOwnerAdmission } from "../../../im-runtime/ownerAdmission";
import { installImOwnerAdmission, uninstallImOwnerAdmission } from "../../../im-runtime/ownerAdmissionHost";
import { installImReadAttentionGate, type ImReadAttentionGate } from "../../../im-runtime/readAttentionHost";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no });
  return { promise, resolve, reject };
}

async function settleContinuation() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

/** Exercise the actual rendered menu callback, provider call and SDK publication. */
describe("ConversationList mark-read owner acceptance", () => {
  const sdk = WKSDK.shared();
  const channel = new Channel("person", 1);
  let owner: ImOwnerAdmission;
  let gate: ImReadAttentionGate | undefined;
  let clearUnread: ReturnType<typeof vi.fn>;
  let notify: ReturnType<typeof vi.spyOn>;
  let done: ReturnType<typeof vi.spyOn>;
  let emit: ReturnType<typeof vi.spyOn>;
  let toast: ReturnType<typeof vi.spyOn>;
  let previousProvider: typeof WKApp.conversationProvider;

  beforeEach(() => {
    owner = createImOwnerAdmission();
    installImOwnerAdmission(owner);
    WKApp.loginInfo.uid = "user-a";
    WKApp.loginInfo.token = "token-a";
    WKApp.shared.currentSpaceId = "space-a";
    previousProvider = WKApp.conversationProvider;
    clearUnread = vi.fn().mockResolvedValue(undefined);
    WKApp.conversationProvider = { markConversationUnread: clearUnread } as any;
    notify = vi.spyOn(sdk.conversationManager, "notifyConversationListeners").mockImplementation(() => {});
    done = vi.spyOn(sdk.reminderManager, "done").mockResolvedValue(undefined);
    emit = vi.spyOn(WKApp.mittBus, "emit").mockImplementation(() => {});
    toast = vi.spyOn(Toast, "error").mockImplementation(() => "toast");
    publication.publish.mockReset();
  });

  afterEach(() => {
    if (owner.snapshot().phase === "active") owner.quiesce(owner.snapshot().generation + 1);
    uninstallImOwnerAdmission(owner);
    gate?.dispose();
    gate = undefined;
    WKApp.conversationProvider = previousProvider;
    vi.restoreAllMocks();
  });

  function menu() {
    const conversation = { channel, unread: 5, extra: { spaceUnread: 5 } };
    const conv: any = {
      channel,
      unread: 5,
      conversation,
      extra: {},
      remoteExtra: {},
      channelInfo: { channel, title: "Person" },
      reminders: [{ reminderID: 42, messageSeq: 5, reminderType: ReminderType.ReminderTypeMentionMe, done: false }],
    };
    const list: any = new ConversationList({ conversations: [] });
    list.state.selectConversationWrap = conv;
    let markAsRead: { onClick(): void } | undefined;
    const visit = (node: any) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node.props?.menus)) {
        markAsRead = node.props.menus.find((item: any) => item.title === t("base.conversationList.context.markAsRead"));
      }
      const children = node.props?.children;
      if (Array.isArray(children)) children.forEach(visit);
      else visit(children);
    };
    visit(list.render());
    expect(markAsRead).toBeDefined();
    return { list, conversation, click: () => markAsRead!.onClick() };
  }

  it("clears the captured conversation, broadcasts the captured account/Space, then finishes mentions", async () => {
    const target = menu();
    target.click();
    await settleContinuation();
    expect(clearUnread).toHaveBeenCalledWith(channel, 0);
    expect(target.conversation.unread).toBe(0);
    expect(target.conversation.extra.spaceUnread).toBe(0);
    expect(notify).toHaveBeenCalledOnce();
    expect(publication.publish).toHaveBeenCalledWith({
      accountId: "user-a", spaceId: "space-a", channelId: "person", channelType: 1, unread: 0,
    });
    expect(emit).toHaveBeenCalledWith("sidebar-unread-updated", { channelId: "person", channelType: 1, unread: 0 });
    expect(emit).toHaveBeenCalledWith("sidebar-reload");
    expect(done).toHaveBeenCalledWith([42]);
    expect(toast).not.toHaveBeenCalled();
  });

  it.each(["owner-denied", "read-denied"])("does not dispatch a clearUnread request when %s", async (reason) => {
    if (reason === "owner-denied") owner.quiesce(1);
    else gate = installImReadAttentionGate(false);
    const target = menu();
    target.click();
    await settleContinuation();
    expect(clearUnread).not.toHaveBeenCalled();
    expect(target.conversation.unread).toBe(5);
    expect(done).not.toHaveBeenCalled();
  });

  for (const scope of ["owner", "account", "space", "unmount", "remount", "attention-aba"] as const) {
    for (const settlement of ["success", "failure"] as const) {
      it(`${scope}: ignores late clearUnread ${settlement} without notifying or finishing reminders`, async () => {
        if (scope === "attention-aba") gate = installImReadAttentionGate(true);
        const response = deferred();
        clearUnread.mockReturnValue(response.promise);
        const target = menu();
        target.click();
        if (scope === "owner") {
          owner.quiesce(1);
          owner.prepare(2);
          owner.activate(2);
        } else if (scope === "account") {
          WKApp.loginInfo.uid = "user-b";
          WKApp.loginInfo.uid = "user-a";
        } else if (scope === "space") {
          WKApp.shared.currentSpaceId = "space-b";
          WKApp.shared.currentSpaceId = "space-a";
        } else if (scope === "unmount" || scope === "remount") {
          target.list.componentWillUnmount();
          if (scope === "remount") target.list.componentDidMount();
        } else {
          gate!.setAllowed(false);
          gate!.setAllowed(true);
        }
        if (settlement === "success") response.resolve();
        else response.reject({ msg: "old clearUnread failed" });
        await settleContinuation();
        expect(target.conversation.unread).toBe(5);
        expect(target.conversation.extra.spaceUnread).toBe(5);
        expect(notify).not.toHaveBeenCalled();
        expect(emit).not.toHaveBeenCalled();
        expect(publication.publish).not.toHaveBeenCalled();
        expect(done).not.toHaveBeenCalled();
        expect(toast).not.toHaveBeenCalled();
        if (scope === "remount") target.list.componentWillUnmount();
      });
    }
  }

  it("stops publications and reminder completion when notifying local unread reentrantly revokes the owner", async () => {
    notify.mockImplementation(() => { owner.quiesce(1); });
    const target = menu();
    target.click();
    await settleContinuation();
    expect(target.conversation.unread).toBe(0);
    expect(emit).not.toHaveBeenCalled();
    expect(publication.publish).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
  });

  it("checks context again before reminder.done after sidebar reload listeners switch Space", async () => {
    emit.mockImplementation((type: any) => {
      if (type === "sidebar-reload") WKApp.shared.currentSpaceId = "space-b";
    });
    menu().click();
    await settleContinuation();
    expect(publication.publish).toHaveBeenCalledWith(expect.objectContaining({ spaceId: "space-a" }));
    expect(done).not.toHaveBeenCalled();
  });

  it("shows a current clearUnread failure without changing unread data", async () => {
    clearUnread.mockRejectedValue({ msg: "clear failed" });
    const target = menu();
    target.click();
    await settleContinuation();
    expect(target.conversation.unread).toBe(5);
    expect(toast).toHaveBeenCalledWith("clear failed");
    expect(done).not.toHaveBeenCalled();
  });

  it.each(["current", "stale"])("observes a %s asynchronous reminder failure and only reports it to its current owner", async (scope) => {
    const response = deferred();
    done.mockReturnValue(response.promise);
    menu().click();
    await settleContinuation();
    expect(done).toHaveBeenCalledOnce();
    if (scope === "stale") owner.quiesce(1);
    response.reject({ msg: "reminder failed" });
    await settleContinuation();
    if (scope === "current") expect(toast).toHaveBeenCalledWith("reminder failed");
    else expect(toast).not.toHaveBeenCalled();
  });
});
