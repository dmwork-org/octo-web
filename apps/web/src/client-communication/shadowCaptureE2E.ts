import { WKApp, createCurrentImShadowTrace } from "@octo/base";
import type {
  CurrentImShadowTrace,
  ShadowCaptureDocument,
  ShadowCaptureManifest,
} from "@octo/base";

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
};

export type CommunicationShadowCaptureApi = {
  start(options?: CommunicationShadowCaptureStartOptions): {
    active: true;
    manifest: ShadowCaptureManifest;
  };
  read(): ShadowCaptureDocument | null;
  dispose(): ShadowCaptureDocument | null;
  isActive(): boolean;
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

  const api: CommunicationShadowCaptureApi = {
    start(options = {}) {
      if (active) throw new Error("Communication shadow capture is already active");

      const manifest = options.manifest ?? DEFAULT_MANIFEST;
      active = createCurrentImShadowTrace(manifest, {
        captureReads: options.captureReads ?? true,
      });
      last = undefined;
      return { active: true, manifest: active.toDocument().manifest };
    },

    read() {
      return active?.toDocument() ?? last ?? null;
    },

    dispose() {
      if (!active) return last ?? null;
      const trace = active;
      active = undefined;
      trace.dispose();
      last = trace.toDocument();
      return last;
    },

    isActive() {
      return active !== undefined;
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
