import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CurrentImSidebarCapture,
  SidebarCaptureDocument,
  SidebarCaptureManifest,
} from "@octo/base";

const base = vi.hoisted(() => ({
  createCurrentImSidebarCapture: vi.fn(),
  getCurrentImConversationStore: vi.fn(),
}));

vi.mock("@octo/base", () => base);

import {
  COMMUNICATION_PRODUCTION_SIDEBAR_CAPTURE_KEY,
  installCommunicationProductionSidebarCapture,
} from "./sidebarCaptureProduction";

type FakeStore = {
  freshness: "loading" | "ready" | "stale" | "unavailable";
  ensureSnapshot: ReturnType<typeof vi.fn>;
};

function documentFor(manifest: SidebarCaptureManifest): SidebarCaptureDocument {
  return {
    manifest,
    events: [{
      type: "scope.open",
      scope: { server: "https://im.example.test/v1/", account: "user-a", space: "space-a", epoch: 1 },
    }, {
      type: "conversation.snapshot",
      scope: { server: "https://im.example.test/v1/", account: "user-a", space: "space-a", epoch: 1 },
      source: "conversation-sync",
      requestRevision: 1,
      version: 1,
      follow_version: 0,
      freshness: "ready",
      conversations: [],
    }],
  } as SidebarCaptureDocument;
}

function setupStore(freshness: FakeStore["freshness"] = "loading"): FakeStore {
  const store: FakeStore = {
    freshness,
    ensureSnapshot: vi.fn(),
  };
  base.getCurrentImConversationStore.mockReturnValue(store);
  return store;
}

function setupCapture(): { capture: CurrentImSidebarCapture } {
  let manifest!: SidebarCaptureManifest;
  const document = () => documentFor(manifest);
  const capture = {
    syncSidebar: vi.fn().mockResolvedValue(undefined),
    syncCategories: vi.fn().mockResolvedValue(undefined),
    snapshotConversationStore: vi.fn(),
    toDocument: vi.fn(() => document()),
    dispose: vi.fn(),
  } as unknown as CurrentImSidebarCapture;
  base.createCurrentImSidebarCapture.mockImplementation(({ manifest: value }: { manifest: SidebarCaptureManifest }) => {
    manifest = value;
    return capture;
  });
  return { capture };
}

describe("production sidebar capture hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("VITE_SIDEBAR_CAPTURE", "1");
    delete (window as any)[COMMUNICATION_PRODUCTION_SIDEBAR_CAPTURE_KEY];
  });

  afterEach(() => {
    delete (window as any)[COMMUNICATION_PRODUCTION_SIDEBAR_CAPTURE_KEY];
    vi.unstubAllEnvs();
  });

  it.each(["VITE_E2E_MOCK", "VITE_E2E_MOCK_IM"]) (
    "fails closed when %s enables a mock runtime",
    (name) => {
      vi.stubEnv(name, "1");
      expect(installCommunicationProductionSidebarCapture()).toBeUndefined();
      expect(base.createCurrentImSidebarCapture).not.toHaveBeenCalled();
    },
  );

  it("defers recorder creation until the existing store reaches ready", async () => {
    const store = setupStore("loading");
    store.ensureSnapshot.mockImplementation(async () => {
      store.freshness = "ready";
    });
    const { capture } = setupCapture();
    const api = installCommunicationProductionSidebarCapture();
    expect(api).toBeDefined();

    const started = api!.start({ captureId: "capture-1", artifactCommit: "abc123" });
    expect(started.manifest.captureProfile).toBe("production");
    expect(base.createCurrentImSidebarCapture).not.toHaveBeenCalled();
    expect(api!.read()).toBeNull();

    const result = await api!.captureAll("space-a");
    expect(store.ensureSnapshot).toHaveBeenCalledTimes(1);
    expect(base.createCurrentImSidebarCapture).toHaveBeenCalledTimes(1);
    expect(base.createCurrentImSidebarCapture.mock.invocationCallOrder[0])
      .toBeGreaterThan(store.ensureSnapshot.mock.invocationCallOrder[0]);
    expect(capture.syncSidebar).toHaveBeenNthCalledWith(1, "recent");
    expect(capture.syncSidebar).toHaveBeenNthCalledWith(2, "follow");
    expect(capture.syncCategories).toHaveBeenCalledWith("space-a");
    expect(result.manifest.artifact.commit).toBe("abc123");
    expect(result.events.some((event) => event.type === "conversation.snapshot" && event.freshness === "ready")).toBe(true);
  });

  it("captures a single tab through the same owner for a stale-scope probe", async () => {
    const store = setupStore("ready");
    const { capture } = setupCapture();
    const api = installCommunicationProductionSidebarCapture()!;
    api.start({ artifactCommit: "abc123" });

    await api.captureSidebarTab("recent");
    expect(store.ensureSnapshot).toHaveBeenCalledTimes(1);
    expect(capture.syncSidebar).toHaveBeenCalledWith("recent");
    expect(base.createCurrentImSidebarCapture).toHaveBeenCalledTimes(1);
  });

  it("rejects capture without a traceable commit and does not create a recorder", () => {
    setupStore("ready");
    const api = installCommunicationProductionSidebarCapture();
    expect(() => api!.start()).toThrow(/artifactCommit|VITE_GIT_COMMIT/);
    expect(base.createCurrentImSidebarCapture).not.toHaveBeenCalled();
  });

  it("uses the build commit when the caller does not provide one", () => {
    vi.stubEnv("VITE_GIT_COMMIT", "build-commit-42");
    setupStore("ready");
    const api = installCommunicationProductionSidebarCapture()!;
    expect(api.start().manifest.artifact.commit).toBe("build-commit-42");
  });

  it("does not retain a failed snapshot as production success", async () => {
    const store = setupStore("loading");
    store.ensureSnapshot.mockRejectedValue(new Error("snapshot unavailable"));
    setupCapture();
    const api = installCommunicationProductionSidebarCapture()!;
    api.start({ artifactCommit: "abc123" });

    await expect(api.captureAll()).rejects.toThrow("snapshot unavailable");
    expect(api.read()).toBeNull();
    expect(base.createCurrentImSidebarCapture).not.toHaveBeenCalled();
    expect(api.dispose()).toBeNull();
  });

  it("fails closed when ensureSnapshot resolves without a ready freshness", async () => {
    const store = setupStore("stale");
    store.ensureSnapshot.mockResolvedValue(undefined);
    setupCapture();
    const api = installCommunicationProductionSidebarCapture()!;
    api.start({ artifactCommit: "abc123" });

    await expect(api.captureAll()).rejects.toThrow(/requires a ready conversation snapshot/);
    expect(base.createCurrentImSidebarCapture).not.toHaveBeenCalled();
    expect(api.read()).toBeNull();
  });

  it("clears a partial document when the store becomes stale during capture", async () => {
    const store = setupStore("ready");
    const { capture } = setupCapture();
    capture.syncSidebar = vi.fn(async () => {
      store.freshness = "stale";
    }) as never;
    const api = installCommunicationProductionSidebarCapture()!;
    api.start({ artifactCommit: "abc123" });

    await expect(api.captureAll()).rejects.toThrow(/became stale/);
    expect(capture.dispose).toHaveBeenCalledTimes(1);
    expect(api.read()).toBeNull();
  });
});
