import { afterEach, describe, expect, it, vi } from "vitest";

const app = vi.hoisted(() => ({
  shared: { currentSpaceId: "space-a", spaceRevision: 0 },
  loginInfo: { uid: "user-a", token: "token-a", sessionRevision: 0 },
  apiClient: { config: { apiURL: "https://api.invalid", originRevision: 0 } },
}));
vi.mock("../App", () => ({ default: app }));

import { captureCurrentImConversationSyncContext } from "./conversationSyncContext";
import { createImOwnerAdmission, type ImOwnerAdmission } from "./ownerAdmission";
import { installImOwnerAdmission, uninstallImOwnerAdmission } from "./ownerAdmissionHost";

let owner: ImOwnerAdmission | undefined;
afterEach(() => {
  if (owner) {
    if (owner.snapshot().phase === "active") owner.quiesce(owner.snapshot().generation + 1);
    uninstallImOwnerAdmission(owner);
    owner = undefined;
  }
});

describe("conversation publication context", () => {
  it.each(["space", "account", "origin"])("rejects %s A → B → A revisions", (kind) => {
    const isCurrent = captureCurrentImConversationSyncContext();
    expect(isCurrent()).toBe(true);
    if (kind === "space") {
      app.shared.currentSpaceId = "space-b";
      app.shared.spaceRevision++;
      app.shared.currentSpaceId = "space-a";
      app.shared.spaceRevision++;
    } else if (kind === "account") {
      app.loginInfo.uid = "user-b";
      app.loginInfo.sessionRevision++;
      app.loginInfo.uid = "user-a";
      app.loginInfo.sessionRevision++;
    } else {
      app.apiClient.config.apiURL = "https://other.invalid";
      app.apiClient.config.originRevision++;
      app.apiClient.config.apiURL = "https://api.invalid";
      app.apiClient.config.originRevision++;
    }
    expect(isCurrent()).toBe(false);
  });

  it("rejects a previous owner even when the account and Space remain unchanged", () => {
    owner = createImOwnerAdmission();
    installImOwnerAdmission(owner);
    const oldOwnerIsCurrent = captureCurrentImConversationSyncContext();
    owner.quiesce(1);
    const deniedIsCurrent = captureCurrentImConversationSyncContext();
    owner.prepare(2);
    owner.activate(2);
    expect(oldOwnerIsCurrent()).toBe(false);
    expect(deniedIsCurrent()).toBe(false);
    expect(captureCurrentImConversationSyncContext()()).toBe(true);
  });

  it("invalidates ordinary Web work when a managed owner is installed later", () => {
    const isCurrent = captureCurrentImConversationSyncContext();
    owner = createImOwnerAdmission();
    installImOwnerAdmission(owner);
    expect(isCurrent()).toBe(false);
  });
});
