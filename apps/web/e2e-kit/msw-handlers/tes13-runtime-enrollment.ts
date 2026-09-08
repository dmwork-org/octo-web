/* eslint-disable no-undef -- e2e code runs in Node */
import type { Page } from "@playwright/test";

export interface TES13EnrollmentObservation {
  method: string;
  token: string | null;
  spaceId: string | null;
}

/** TES13: issue a deterministic one-time Runtime enrollment credential. */
export async function registerTES13RuntimeEnrollment(
  page: Page,
  enrollmentToken: string
): Promise<void> {
  await page.evaluate((token) => {
    type MSW = {
      worker: { use: (...handlers: unknown[]) => void };
      http: {
        post: (
          path: string | RegExp,
          resolver: (info: { request: Request }) => unknown
        ) => unknown;
      };
      HttpResponse: { json: (body: unknown, init?: unknown) => unknown };
    };
    const target = window as unknown as {
      __msw?: MSW;
      __tes13EnrollmentObservation?: TES13EnrollmentObservation;
    };
    const msw = target.__msw;
    if (!msw) throw new Error("[TES13] MSW worker is not ready");
    const { worker, http, HttpResponse } = msw;
    worker.use(
      http.post(
        /\/agent-worker\/api\/v1\/device_enrollments$/,
        ({ request }) => {
          target.__tes13EnrollmentObservation = {
            method: request.method,
            token: request.headers.get("token"),
            spaceId: request.headers.get("x-space-id"),
          };
          return HttpResponse.json(
            {
              enrollment_token: token,
              expires_at: "2026-09-09T12:00:00Z",
            },
            { status: 201 }
          );
        }
      )
    );
  }, enrollmentToken);
}
