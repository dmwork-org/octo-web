/* eslint-disable no-undef -- Playwright page globals are intentionally opaque here. */
import type { Page, TestInfo } from "@playwright/test";
import type {
  ShadowCaptureDocument,
  ShadowCaptureManifest,
} from "@octo/base";

export const COMMUNICATION_SHADOW_CAPTURE_KEY = "__octoCommunicationShadowCapture__";

export type ShadowCapturePageApi = {
  start(options?: { manifest?: ShadowCaptureManifest; captureReads?: boolean }): {
    active: true;
    manifest: ShadowCaptureManifest;
  };
  read(): ShadowCaptureDocument | null;
  dispose(): ShadowCaptureDocument | null;
  isActive(): boolean;
};

export async function waitForCommunicationShadowCapture(page: Page): Promise<void> {
  await page.waitForFunction(
    (key) => typeof (globalThis as Record<string, unknown>)[key] === "object",
    COMMUNICATION_SHADOW_CAPTURE_KEY,
    { timeout: 15_000 },
  );
}

export async function startCommunicationShadowCapture(
  page: Page,
  options: { manifest?: ShadowCaptureManifest; captureReads?: boolean } = {},
): Promise<void> {
  await waitForCommunicationShadowCapture(page);
  await page.evaluate(
    ({ key, options: input }) => {
      const api = (globalThis as Record<string, unknown>)[key] as ShadowCapturePageApi | undefined;
      if (!api) throw new Error("Communication shadow capture hook is unavailable");
      api.start(input);
    },
    { key: COMMUNICATION_SHADOW_CAPTURE_KEY, options },
  );
}

export async function readCommunicationShadowCapture(
  page: Page,
): Promise<ShadowCaptureDocument | null> {
  await waitForCommunicationShadowCapture(page);
  return page.evaluate((key) => {
    const api = (globalThis as Record<string, unknown>)[key] as ShadowCapturePageApi | undefined;
    if (!api) throw new Error("Communication shadow capture hook is unavailable");
    return api.read();
  }, COMMUNICATION_SHADOW_CAPTURE_KEY);
}

export async function disposeCommunicationShadowCapture(
  page: Page,
  testInfo?: TestInfo,
  attachmentName = "communication-shadow-trace.json",
): Promise<ShadowCaptureDocument | null> {
  await waitForCommunicationShadowCapture(page);
  const document = await page.evaluate((key) => {
    const api = (globalThis as Record<string, unknown>)[key] as ShadowCapturePageApi | undefined;
    if (!api) throw new Error("Communication shadow capture hook is unavailable");
    return api.dispose();
  }, COMMUNICATION_SHADOW_CAPTURE_KEY);
  if (document && testInfo) {
    await testInfo.attach(attachmentName, {
      body: `${JSON.stringify(document, null, 2)}\n`,
      contentType: "application/json",
    });
  }
  return document;
}
