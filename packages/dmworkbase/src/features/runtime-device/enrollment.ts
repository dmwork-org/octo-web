export const RUNTIME_ENROLLMENT_PATH =
  "/agent-worker/api/v1/device_enrollments";

export interface RuntimeEnrollment {
  enrollmentToken: string;
  expiresAt?: string;
}

export interface RuntimeEnrollmentClient {
  post(
    path: string,
    data: Record<string, never>,
    config: { baseURL: string; headers: Record<string, string> }
  ): Promise<unknown>;
}

function readOptionalString(
  value: Record<string, unknown>,
  key: string
): string | undefined {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.length > 0
    ? candidate
    : undefined;
}

export async function requestRuntimeEnrollment(
  client: RuntimeEnrollmentClient,
  spaceId: string,
  serverOrigin: string
): Promise<RuntimeEnrollment> {
  const normalizedSpaceId = spaceId.trim();
  if (!normalizedSpaceId)
    throw new Error("runtime enrollment requires a space");
  if (!serverOrigin)
    throw new Error("runtime enrollment requires a server origin");

  const response = await client.post(
    RUNTIME_ENROLLMENT_PATH,
    {},
    {
      baseURL: serverOrigin,
      headers: { "X-Space-ID": normalizedSpaceId },
    }
  );
  if (!response || typeof response !== "object") {
    throw new Error("invalid runtime enrollment response");
  }

  const value = response as Record<string, unknown>;
  const enrollmentToken = readOptionalString(value, "enrollment_token");
  if (!enrollmentToken?.startsWith("octo_enroll_")) {
    throw new Error("invalid runtime enrollment token");
  }

  return {
    enrollmentToken,
    expiresAt: readOptionalString(value, "expires_at"),
  };
}
