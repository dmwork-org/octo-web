import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createImOwnerAdmission, type ImOwnerAdmission } from '../../../dmworkbase/src/im-runtime/ownerAdmission';
import { installImOwnerAdmission, uninstallImOwnerAdmission } from '../../../dmworkbase/src/im-runtime/ownerAdmissionHost';
import { WKApp } from "@octo/base";
import { legacySummaryMessagingPort } from "./legacySummaryMessaging";
import { SummaryForwardContextExpiredError } from "./forwardErrors";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  send: vi.fn(),
  interpret: vi.fn(),
}));

vi.mock("@octo/base", async (importOriginal) => {
  const original = await importOriginal<typeof import("@octo/base")>();
  return {
    ...original,
    ForwardService: { send: mocks.send },
    interpretForwardResult: mocks.interpret,
    WKApp: {
      ...original.WKApp,
      shared: {
        ...original.WKApp.shared,
        baseContext: { showConversationSelect: mocks.select },
      },
    },
  };
});

function startForward() {
  const handlers = { onComplete: vi.fn(), onError: vi.fn(), onCancel: vi.fn() };
  legacySummaryMessagingPort.requestForward({ content: "Summary", title: "Forward", ...handlers });
  return { ...handlers, confirm: mocks.select.mock.calls[0][0], cancel: mocks.select.mock.calls[0][3] };
}

beforeEach(() => {
  vi.clearAllMocks();
  WKApp.shared.currentSpaceId = "space-a";
  mocks.send.mockResolvedValue({});
  mocks.interpret.mockReturnValue({ kind: "success", total: 1, failed: 0 });
});
let owner: ImOwnerAdmission | undefined;
afterEach(() => {
  if (!owner) return;
  owner.quiesce(owner.snapshot().generation + 1);
  uninstallImOwnerAdmission(owner);
  owner = undefined;
});

describe("Summary forwarding context", () => {
  it('rejects an old picker after the same Web realm was reactivated', async () => {
    owner = createImOwnerAdmission();
    installImOwnerAdmission(owner);
    const forward = startForward();
    owner.quiesce(1); owner.prepare(2); owner.activate(2);
    await forward.confirm([]);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(forward.onError).toHaveBeenCalledWith(expect.any(SummaryForwardContextExpiredError));
  });
  it("reports expiration instead of silently cancelling after a Space switch", async () => {
    const forward = startForward();
    WKApp.shared.currentSpaceId = "space-b";
    await forward.confirm([]);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(forward.onError).toHaveBeenCalledWith(expect.any(SummaryForwardContextExpiredError));
    expect(forward.onCancel).not.toHaveBeenCalled();
  });

  it("keeps user cancellation silent", () => {
    const forward = startForward();
    forward.cancel();
    expect(forward.onCancel).toHaveBeenCalledOnce();
    expect(forward.onError).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("does not report success in another Space when the send completes late", async () => {
    let finish!: () => void;
    mocks.send.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const forward = startForward();
    const sending = forward.confirm([]);
    WKApp.shared.currentSpaceId = "space-b";
    finish();
    await sending;
    expect(forward.onComplete).not.toHaveBeenCalled();
    expect(forward.onError).toHaveBeenCalledWith(expect.any(SummaryForwardContextExpiredError));
  });

  it("preserves normal completion and the captured Space", async () => {
    const forward = startForward();
    await forward.confirm([]);
    expect(mocks.send).toHaveBeenCalledWith([], expect.any(Function), expect.objectContaining({ spaceId: "space-a" }));
    expect(forward.onComplete).toHaveBeenCalledWith({ kind: "success", total: 1, failed: 0 });
    expect(forward.onError).not.toHaveBeenCalled();
  });
});
