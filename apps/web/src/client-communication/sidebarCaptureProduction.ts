import {
  createCurrentImSidebarCapture,
  getCurrentImConversationStore,
  type CurrentImSidebarCapture,
  type SidebarCaptureDocument,
  type SidebarCaptureManifest,
} from "@octo/base";

export const COMMUNICATION_PRODUCTION_SIDEBAR_CAPTURE_KEY =
  "__octoProductionSidebarCapture__" as const;

export type CommunicationProductionSidebarCaptureApi = {
  start(options?: { captureId?: string; artifactCommit?: string }): {
    active: true;
    manifest: SidebarCaptureManifest;
  };
  read(): SidebarCaptureDocument | null;
  /** Capture one tab through the current owner, primarily for a stale-scope probe. */
  captureSidebarTab(tab: "recent" | "follow"): Promise<unknown>;
  captureAll(spaceId?: string): Promise<SidebarCaptureDocument>;
  dispose(): SidebarCaptureDocument | null;
};

type CaptureWindow = Window & {
  [COMMUNICATION_PRODUCTION_SIDEBAR_CAPTURE_KEY]?: CommunicationProductionSidebarCaptureApi;
};

/**
 * Explicit production capture seam. It is installed only in a capture build
 * (`VITE_SIDEBAR_CAPTURE=1`) and consumes the already-running Communication
 * owner. It does not create a second SDK, retain the conversation store, or
 * replace any visible UI owner.
 */
export function installCommunicationProductionSidebarCapture():
  CommunicationProductionSidebarCaptureApi | undefined {
  if (import.meta.env.VITE_SIDEBAR_CAPTURE !== "1" || isMockEnvironment()) return undefined;

  const view = window as CaptureWindow;
  const existing = view[COMMUNICATION_PRODUCTION_SIDEBAR_CAPTURE_KEY];
  if (existing) return existing;

  let active: CurrentImSidebarCapture | undefined;
  let last: SidebarCaptureDocument | undefined;
  let pendingManifest: SidebarCaptureManifest | undefined;
  const api: CommunicationProductionSidebarCaptureApi = {
    start(options = {}) {
      if (active || pendingManifest) throw new Error("Production sidebar capture is already active");
      assertProductionCaptureEnvironment();
      const artifactCommit = resolveArtifactCommit(options.artifactCommit);
      const manifest: SidebarCaptureManifest = {
        schemaVersion: 1,
        kind: "web-sidebar-capture",
        source: "octo-web",
        captureProfile: "production",
        requiredTabs: ["recent", "follow"],
        redaction: "plain-dto-v1",
        captureId: options.captureId || `sidebar-${Date.now().toString(36)}`,
        capturedAt: new Date().toISOString(),
        artifact: {
          name: "octo-web-sidebar-production-capture",
          version: import.meta.env.VITE_VERSION || "unknown",
          commit: artifactCommit,
          contractRevision: 5,
        },
      };
      // Defer recorder creation until captureAll has established a ready
      // conversation snapshot. This lets callers announce the capture and
      // provide provenance without recording a loading/empty snapshot.
      pendingManifest = manifest;
      last = undefined;
      return { active: true, manifest };
    },

    read() {
      return active?.toDocument() ?? last ?? null;
    },

    async captureAll(spaceId) {
      assertProductionCaptureEnvironment();
      const store = getCurrentImConversationStore();
      try {
        // Reuse the owner already installed by Communication. The store is
        // keyed by the shared SDK realm; ensureSnapshot only waits/calibrates
        // that owner and never creates another SDK connection or store.
        await ensureActiveCapture(store);
        const capture = active!;
        await capture.syncSidebar("recent");
        await capture.syncSidebar("follow");
        await capture.syncCategories(spaceId);
        if (store.freshness !== "ready") {
          throw new Error(`Production sidebar capture became stale during capture (got ${store.freshness})`);
        }
        return capture.toDocument();
      } catch (error) {
        // A failed/partial document must never be retained as a successful
        // production artifact. Dispose the recorder but clear `last` so
        // callers cannot read an incomplete production result afterward.
        if (active) {
          active.dispose();
          active = undefined;
        }
        pendingManifest = undefined;
        last = undefined;
        throw error;
      }
    },

    async captureSidebarTab(tab) {
      assertProductionCaptureEnvironment();
      const store = getCurrentImConversationStore();
      try {
        await ensureActiveCapture(store);
        return await active!.syncSidebar(tab);
      } catch (error) {
        if (active) {
          active.dispose();
          active = undefined;
        }
        pendingManifest = undefined;
        last = undefined;
        throw error;
      }
    },

    dispose() {
      if (!active) {
        pendingManifest = undefined;
        return last ?? null;
      }
      const capture = active;
      active = undefined;
      capture.dispose();
      pendingManifest = undefined;
      last = capture.toDocument();
      return last;
    },
  };

  view[COMMUNICATION_PRODUCTION_SIDEBAR_CAPTURE_KEY] = api;
  return api;

  async function ensureActiveCapture(store: ReturnType<typeof getCurrentImConversationStore>): Promise<void> {
    await store.ensureSnapshot();
    if (store.freshness !== "ready") {
      throw new Error(`Production sidebar capture requires a ready conversation snapshot (got ${store.freshness})`);
    }
    if (!active) {
      if (!pendingManifest) api.start();
      active = createCurrentImSidebarCapture({ manifest: pendingManifest! });
      pendingManifest = undefined;
    }
  }
}

function isMockEnvironment(): boolean {
  return import.meta.env.VITE_E2E_MOCK === "1" || import.meta.env.VITE_E2E_MOCK_IM === "1";
}

function assertProductionCaptureEnvironment(): void {
  if (isMockEnvironment()) {
    throw new Error("Production sidebar capture is disabled in mock environments");
  }
}

function resolveArtifactCommit(explicit?: string): string {
  const commit = explicit?.trim() || import.meta.env.VITE_GIT_COMMIT?.trim();
  if (!commit || commit === "unknown" || commit === "web-production-capture") {
    throw new Error("Production sidebar capture requires VITE_GIT_COMMIT or an explicit artifactCommit");
  }
  return commit;
}
