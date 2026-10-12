import { describe, expect, it, vi } from "vitest";

import {
  addImCommandListener,
  addImMessageListener,
  addImMessageStatusListener,
  removeImMessageStatusListener,
  type ImChatRuntimeSdk,
} from "./chatRuntime";

function createSdk() {
  return {
    chatManager: {
      addCMDListener: vi.fn(),
      addMessageListener: vi.fn(),
      addMessageStatusListener: vi.fn(),
      removeMessageStatusListener: vi.fn(),
    },
  } satisfies ImChatRuntimeSdk;
}

describe("chatRuntime", () => {
  it("adds command listeners through the SDK chat manager", () => {
    const sdk = createSdk();
    const listener = vi.fn();

    addImCommandListener(sdk, listener);

    expect(sdk.chatManager.addCMDListener).toHaveBeenCalledWith(listener);
  });

  it("adds message listeners through the SDK chat manager", () => {
    const sdk = createSdk();
    const listener = vi.fn();

    addImMessageListener(sdk, listener);

    expect(sdk.chatManager.addMessageListener).toHaveBeenCalledWith(listener);
  });

  it("adds and removes message status listeners through the SDK chat manager", () => {
    const sdk = createSdk();
    const listener = vi.fn();

    addImMessageStatusListener(sdk, listener);
    removeImMessageStatusListener(sdk, listener);

    expect(sdk.chatManager.addMessageStatusListener).toHaveBeenCalledWith(listener);
    expect(sdk.chatManager.removeMessageStatusListener).toHaveBeenCalledWith(listener);
  });
});
