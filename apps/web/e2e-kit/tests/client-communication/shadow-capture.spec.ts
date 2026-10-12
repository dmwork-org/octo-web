/* eslint-disable no-undef -- Playwright executes this file in Node. */
import { test, expect } from "../../fixtures-authed";
import type { Page } from "@playwright/test";
import {
  disposeCommunicationShadowCapture,
  readCommunicationShadowCapture,
  startCommunicationShadowCapture,
  waitForCommunicationShadowCapture,
} from "../../_kit/shadow-capture";
import type { MockMessageSeed } from "../../_kit/mock-im-runtime";

const CAPTURE_MESSAGE: MockMessageSeed = {
  channelId: "shadow-capture-group",
  channelType: 2,
  messageSeq: 42,
  fromUid: "e2e-sender",
  timestamp: 1_700_000_042,
  content: { type: 1, text: "captured from Communication runtime" },
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
    captureReads: false,
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
        payload: { text: "captured from Communication runtime" },
      }),
    }),
  ]));
  expect(document?.events.some((event) => event.type === "command.outcome")).toBe(false);
});
