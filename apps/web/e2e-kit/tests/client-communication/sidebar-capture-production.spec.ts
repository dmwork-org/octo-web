/* eslint-disable no-undef -- Playwright executes this file in Node. */
import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

type AuthFile = {
  accountId?: string;
  storage: { token: string; uid: string; name?: string; [key: string]: string | undefined };
};

async function installProductionCommunicationHost(page: Page, session: AuthFile, spaceId: string, apiOrigin: string): Promise<void> {
  await page.addInitScript(({ session, spaceId, apiOrigin }) => {
    const listeners = new Set<(command: unknown) => void>();
    const runtimeListeners = new Set<(command: unknown) => void>();
    const bootstrap = {
      bridgeVersion: 1 as const,
      featureId: "communication" as const,
      session: {
        uid: session.storage.uid,
        token: session.storage.token,
        name: session.storage.name || "Capture user",
        provider: "octo",
        apiOrigin,
      },
      space: { id: spaceId, name: "Capture Space" },
      appearance: { theme: "light" as const, locale: "zh-CN" as const },
      initialPage: "chat" as const,
      initialPresentation: "workspace" as const,
      runtime: {
        version: 1 as const,
        ownerId: "production-capture-owner",
        contextId: "production-capture-context",
        epoch: 1,
        summaryAttention: "disabled" as const,
      },
    };
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
    };
    (globalThis as unknown as {
      __emitProductionRuntimeCommand__?: (command: unknown) => void;
    }).__emitProductionRuntimeCommand__ = (command) => {
      for (const listener of runtimeListeners) listener(command);
    };
  }, { session, spaceId, apiOrigin });
}

test("captures real Web conversation/sidebar/category facts without mock IM", async ({ page, request, baseURL }, testInfo) => {
  const requestFailures: string[] = [];
  const responseFacts: string[] = [];
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "unknown";
    const url = new URL(request.url());
    requestFailures.push(`${request.method()} ${url.origin}${url.pathname} ${failure}`);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/v1/") && (url.pathname.includes("sidebar") || url.pathname.includes("categories"))) {
      responseFacts.push(`${response.request().method()} ${url.origin}${url.pathname} ${response.status()}`);
    }
  });
  const authPath = process.env.OCTO_CAPTURE_AUTH_FILE;
  const outputPath = process.env.OCTO_CAPTURE_OUTPUT || testInfo.outputPath("sidebar-production-capture.json");
  if (!authPath) throw new Error("OCTO_CAPTURE_AUTH_FILE is required");
  const session = JSON.parse(await readFile(authPath, "utf8")) as AuthFile;
  if (!session.storage?.uid || !session.storage.token) throw new Error("Capture auth file lacks a session");
  const artifactCommit = process.env.OCTO_CAPTURE_ARTIFACT_COMMIT;
  if (!artifactCommit?.trim()) throw new Error("OCTO_CAPTURE_ARTIFACT_COMMIT is required");
  const backendOrigin = process.env.OCTO_CAPTURE_BACKEND_ORIGIN || "https://im-test.deepminer.com.cn";
  const spaceId = process.env.OCTO_CAPTURE_SPACE_ID;
  if (!spaceId?.trim()) throw new Error("OCTO_CAPTURE_SPACE_ID is required");
  const authResponse = await request.get(`${backendOrigin}/v1/user/current`, {
    headers: { token: session.storage.token, "X-Space-Id": spaceId },
  });
  if (!authResponse.ok()) throw new Error(`Capture authentication preflight failed (HTTP ${authResponse.status()}); refresh the local auth file`);
  const currentUser = await authResponse.json();
  if (currentUser.uid !== session.storage.uid) throw new Error("Capture auth identity does not match the local session");
  // The local Vite server proxies /v1/* to the real backend. This keeps the
  // browser same-origin while preserving the production APIClient path,
  // including token and X-Space-Id headers that the backend must receive.
  const apiOrigin = baseURL!;
  await installProductionCommunicationHost(page, session, spaceId, apiOrigin);
  await page.goto("/client-communication.html?sidebarCapture=production");
  await page.waitForFunction(() => typeof (globalThis as { __octoProductionSidebarCapture__?: unknown }).__octoProductionSidebarCapture__ === "object", undefined, { timeout: 60_000 });

  let heldSidebarRequest = false;
  let staleProbeArmed = false;
  let releaseSidebarRequest!: () => void;
  await page.route("**/v1/sidebar/sync", async (route) => {
    if (!staleProbeArmed || heldSidebarRequest || JSON.parse(route.request().postData() || "{}").tab !== "recent") {
      await route.continue();
      return;
    }
    heldSidebarRequest = true;
    await new Promise<void>((resolve) => { releaseSidebarRequest = resolve; });
    const response = await route.fetch();
    await route.fulfill({ response });
  });

  staleProbeArmed = true;
  const staleProbePromise = page.evaluate(async ({ artifactCommit }) => {
    const capture = (globalThis as {
      __octoProductionSidebarCapture__?: {
        start: (options: { artifactCommit: string }) => unknown;
        captureSidebarTab: (tab: "recent" | "follow") => Promise<unknown>;
      };
    }).__octoProductionSidebarCapture__;
    if (!capture) throw new Error("production sidebar capture hook unavailable");
    try {
      capture.start({ artifactCommit });
      return { ok: true as const, probe: await capture.captureSidebarTab("recent") };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error
          ? { name: error.name, message: error.message }
          : { type: typeof error, keys: error && typeof error === "object" ? Object.keys(error) : [],
            status: error && typeof error === "object" ? (error as { status?: unknown }).status : undefined,
            code: error && typeof error === "object" ? (error as { code?: unknown }).code : undefined,
            msg: error && typeof error === "object" ? (error as { msg?: unknown }).msg : undefined },
      };
    }
  }, { artifactCommit });

  await expect.poll(() => heldSidebarRequest, { timeout: 30_000 }).toBe(true);

  // The request hold is controlled in Node; switch to a new runtime scope while
  // the old-space recent response is in flight, then return to the original
  // Space before the full artifact capture. The artifact must retain the
  // rejected late response and still contain a complete A-space snapshot.
  await page.evaluate(() => {
    const emit = (globalThis as { __emitProductionRuntimeCommand__?: (command: unknown) => void }).__emitProductionRuntimeCommand__;
    emit?.({
      version: 1,
      type: "spaceChanged",
      ownerId: "production-capture-owner",
      contextId: "production-capture-context",
      epoch: 1,
      next: { contextId: "production-capture-context-b", epoch: 2, space: { id: "capture-probe-space", name: "Capture Probe" } },
    });
  });
  releaseSidebarRequest();
  const staleProbeResult = await staleProbePromise;
  if (!staleProbeResult.ok) {
    throw new Error(`production sidebar stale probe failed: ${JSON.stringify({
      error: staleProbeResult.error,
      requestFailures,
      responseFacts,
    })}`);
  }

  await page.evaluate(() => {
    const emit = (globalThis as { __emitProductionRuntimeCommand__?: (command: unknown) => void }).__emitProductionRuntimeCommand__;
    emit?.({
      version: 1,
      type: "spaceChanged",
      ownerId: "production-capture-owner",
      contextId: "production-capture-context-b",
      epoch: 2,
      next: { contextId: "production-capture-context-a", epoch: 3, space: { id: "1a589505b1e74150b0c9682e635ba0d0", name: "Capture Space" } },
    });
  });

  const finalCapture = await page.evaluate(async ({ spaceId }) => {
    const capture = (globalThis as {
      __octoProductionSidebarCapture__?: {
        captureAll: (spaceId?: string) => Promise<unknown>;
        dispose: () => unknown;
      };
    }).__octoProductionSidebarCapture__;
    if (!capture) throw new Error("production sidebar capture hook unavailable");
    try {
      const result = await capture.captureAll(spaceId);
      capture.dispose();
      return { ok: true as const, result };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error
          ? { name: error.name, message: error.message }
          : { type: typeof error, keys: error && typeof error === "object" ? Object.keys(error) : [],
            status: error && typeof error === "object" ? (error as { status?: unknown }).status : undefined,
            code: error && typeof error === "object" ? (error as { code?: unknown }).code : undefined,
            msg: error && typeof error === "object" ? (error as { msg?: unknown }).msg : undefined },
      };
    }
  }, { spaceId });
  if (!finalCapture.ok) {
    throw new Error(`production sidebar capture failed: ${JSON.stringify({
      error: finalCapture.error,
      requestFailures,
      responseFacts,
    })}`);
  }
  const document = finalCapture.result;
  await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");

  const value = document as { manifest?: { captureProfile?: string }; events?: Array<Record<string, unknown>> };
  expect(value.manifest?.captureProfile).toBe("production");
  expect(value.events?.some(event => event.type === "conversation.snapshot")).toBe(true);
  expect(value.events?.some(event => event.type === "sidebar.sync" && event.tab === "recent")).toBe(true);
  expect(value.events?.some(event => event.type === "sidebar.sync" && event.tab === "follow")).toBe(true);
  expect(value.events?.some(event => event.type === "category.snapshot")).toBe(true);
  expect(value.events?.some(event => event.type === "scope.switch")).toBe(true);
  expect(value.events?.some(event => event.type === "sidebar.sync" && event.accepted === false && event.staleReason === "scope")).toBe(true);
});
