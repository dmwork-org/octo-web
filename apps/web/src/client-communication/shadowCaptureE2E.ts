import {
  SyncMessageOptions,
  WKApp,
  createCurrentImShadowTrace,
  createCurrentImSidebarCapture,
} from "@octo/base";
import type {
  CurrentImShadowTrace,
  ShadowCaptureDocument,
  ShadowCaptureManifest,
  SidebarCaptureDocument,
  SidebarCaptureManifest,
} from "@octo/base";
import { Channel } from "wukongimjssdk";

/**
 * Test-only bridge for exporting the Communication owner's IM projection.
 *
 * This module is imported only from the VITE_E2E_MOCK_IM branch in the
 * communication entry. `start()` attaches listeners to the already-running
 * WKSDK realm; it never calls connect(), creates a provider, or starts a
 * conversation-store holder. The Web runtime therefore remains the only
 * connection owner while a bounded trace is active.
 */
export const COMMUNICATION_SHADOW_CAPTURE_KEY =
  "__octoCommunicationShadowCapture__" as const;

export type CommunicationShadowCaptureStartOptions = {
  manifest?: ShadowCaptureManifest;
  captureReads?: boolean;
  captureCommandOutcomes?: boolean;
};

export type CommunicationShadowChannelInput = {
  channelID: string;
  channelType: number;
};

export type CommunicationShadowSyncOptions = Partial<{
  startMessageSeq: number;
  endMessageSeq: number;
  limit: number;
  pullMode: number;
}>;

export type CommunicationShadowCaptureApi = {
  start(options?: CommunicationShadowCaptureStartOptions): {
    active: true;
    manifest: ShadowCaptureManifest;
  };
  read(): ShadowCaptureDocument | null;
  dispose(): ShadowCaptureDocument | null;
  isActive(): boolean;
  readSidebar(): SidebarCaptureDocument | null;
  disposeSidebar(): SidebarCaptureDocument | null;
  syncSidebar(
    tab: "recent" | "follow",
    options?: Partial<{
      version: number;
      last_msg_seqs: string;
      msg_count: number;
    }>,
  ): Promise<unknown>;
  syncCategories(spaceId?: string): Promise<unknown>;
  /** Test-only command seam; delegates to the installed provider unchanged. */
  syncMessages(
    channel: CommunicationShadowChannelInput,
    options?: CommunicationShadowSyncOptions,
  ): Promise<{ count: number; messageSequences: number[] }>;
  /** Test-only command seam; delegates to markConversationUnread(channel, unread). */
  markConversationUnread(
    channel: CommunicationShadowChannelInput,
    unread?: number,
  ): Promise<void>;
};

type CaptureWindow = Window & {
  [COMMUNICATION_SHADOW_CAPTURE_KEY]?: CommunicationShadowCaptureApi;
};

const DEFAULT_MANIFEST: ShadowCaptureManifest = {
  schemaVersion: 1,
  artifact: {
    name: "octo-web-client-communication",
    version: "e2e",
    commit: "e2e-runtime",
    contractRevision: 3,
  },
  redaction: "plain-dto-v1",
};

/** Install the opt-in browser bridge. Production callers receive no bridge. */
export function installCommunicationShadowCaptureHook(): CommunicationShadowCaptureApi | undefined {
  if (import.meta.env.VITE_E2E_MOCK_IM !== "1") return undefined;

  const view = window as CaptureWindow;
  const existing = view[COMMUNICATION_SHADOW_CAPTURE_KEY];
  if (existing) return existing;

  let active: CurrentImShadowTrace | undefined;
  let last: ShadowCaptureDocument | undefined;
  let activeSidebar: ReturnType<typeof createCurrentImSidebarCapture> | undefined;
  let lastSidebar: SidebarCaptureDocument | undefined;

  const api: CommunicationShadowCaptureApi = {
    start(options = {}) {
      if (active) throw new Error("Communication shadow capture is already active");

      const manifest = options.manifest ?? DEFAULT_MANIFEST;
      active = createCurrentImShadowTrace(manifest, {
        captureReads: options.captureReads ?? true,
        captureCommandOutcomes: options.captureCommandOutcomes ?? false,
      });
      const sidebarManifest: SidebarCaptureManifest = {
        schemaVersion: 1,
        kind: "web-sidebar-capture",
        source: "octo-web",
        requiredTabs: ["recent", "follow"],
        // This bridge is only installed with VITE_E2E_MOCK_IM=1.  Keep the
        // artifact explicitly contract/fixture scoped so it can never be
        // mistaken for production parity evidence.
        captureProfile: "contract",
        redaction: "plain-dto-v1",
        captureId: manifest.artifact.commit,
        artifact: manifest.artifact,
      };
      activeSidebar = createCurrentImSidebarCapture({ manifest: sidebarManifest });
      last = undefined;
      lastSidebar = undefined;
      return { active: true, manifest: active.toDocument().manifest };
    },

    read() {
      return active?.toDocument() ?? last ?? null;
    },

    dispose() {
      if (!active) {
        if (activeSidebar) {
          const sidebar = activeSidebar;
          activeSidebar = undefined;
          sidebar.dispose();
          lastSidebar = sidebar.toDocument();
        }
        return last ?? null;
      }
      const trace = active;
      active = undefined;
      trace.dispose();
      if (activeSidebar) {
        const sidebar = activeSidebar;
        activeSidebar = undefined;
        sidebar.dispose();
        lastSidebar = sidebar.toDocument();
      }
      last = trace.toDocument();
      return last;
    },

    isActive() {
      return active !== undefined;
    },

    readSidebar() {
      return activeSidebar?.toDocument() ?? lastSidebar ?? null;
    },

    disposeSidebar() {
      if (!activeSidebar) return lastSidebar ?? null;
      const capture = activeSidebar;
      activeSidebar = undefined;
      capture.dispose();
      lastSidebar = capture.toDocument();
      return lastSidebar;
    },

    syncSidebar(tab, options = {}) {
      if (!activeSidebar) throw new Error("Communication sidebar capture is not active");
      return activeSidebar.syncSidebar(tab, options);
    },

    syncCategories(spaceId) {
      if (!activeSidebar) throw new Error("Communication sidebar capture is not active");
      return activeSidebar.syncCategories(spaceId);
    },

    async syncMessages(channel, options = {}) {
      const opts = new SyncMessageOptions();
      Object.assign(opts, options);
      const messages = await WKApp.conversationProvider.syncMessages(
        toCommunicationChannel(channel),
        opts,
      );
      return {
        count: messages.length,
        messageSequences: messages
          .map((message) => message.messageSeq)
          .filter((sequence): sequence is number => Number.isSafeInteger(sequence)),
      };
    },

    markConversationUnread(channel, unread = 0) {
      return WKApp.conversationProvider.markConversationUnread(
        toCommunicationChannel(channel),
        unread,
      );
    },
  };

  Object.defineProperty(view, COMMUNICATION_SHADOW_CAPTURE_KEY, {
    configurable: true,
    enumerable: false,
    value: api,
    writable: false,
  });
  return api;
}

function toCommunicationChannel(input: CommunicationShadowChannelInput): Channel {
  return new Channel(input.channelID, input.channelType);
}

/** Resolve a stable manifest while keeping the default fixture deterministic. */
export function communicationShadowManifest(
  overrides: Partial<ShadowCaptureManifest["artifact"]> = {},
): ShadowCaptureManifest {
  return {
    ...DEFAULT_MANIFEST,
    artifact: {
      ...DEFAULT_MANIFEST.artifact,
      version: WKApp.config.appVersion || DEFAULT_MANIFEST.artifact.version,
      ...overrides,
    },
  };
}
