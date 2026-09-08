import { describe, expect, it, vi } from "vitest";
import {
  requestRuntimeEnrollment,
  RUNTIME_ENROLLMENT_PATH,
  type RuntimeEnrollmentClient,
} from "./enrollment";

describe("runtime device enrollment", () => {
  it("requests a token for the active space", async () => {
    const post = vi.fn().mockResolvedValue({
      enrollment_token: "octo_enroll_once",
      expires_at: "2026-09-09T12:00:00Z",
    });

    await expect(
      requestRuntimeEnrollment(
        { post } as RuntimeEnrollmentClient,
        " space-1 ",
        "https://im-test.deepminer.com.cn"
      )
    ).resolves.toEqual({
      enrollmentToken: "octo_enroll_once",
      expiresAt: "2026-09-09T12:00:00Z",
    });
    expect(post).toHaveBeenCalledWith(
      RUNTIME_ENROLLMENT_PATH,
      {},
      {
        baseURL: "https://im-test.deepminer.com.cn",
        headers: { "X-Space-ID": "space-1" },
      }
    );
  });

  it("rejects missing spaces and malformed credentials", async () => {
    const post = vi.fn().mockResolvedValue({ enrollment_token: "not-a-token" });

    await expect(
      requestRuntimeEnrollment(
        { post } as RuntimeEnrollmentClient,
        "",
        "https://im-test.deepminer.com.cn"
      )
    ).rejects.toThrow("requires a space");
    await expect(
      requestRuntimeEnrollment(
        { post } as RuntimeEnrollmentClient,
        "space-1",
        "https://im-test.deepminer.com.cn"
      )
    ).rejects.toThrow("invalid runtime enrollment token");
  });
});
