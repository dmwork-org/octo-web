export type RuntimeInstallPlatform = "macos" | "windows";

export const ENROLL_TOKEN_PLACEHOLDER = "{{ENROLL_TOKEN}}";

export function resolveRuntimeServerOrigin(
  configuredApiURL: string | undefined,
  apiURL: string | undefined,
  documentOrigin: string | undefined
): string {
  // Installers and the /agent-worker facade are served by Octo Web. Browser
  // builds must stay same-origin; packaged file:// shells fall back to API URL.
  for (const candidate of [documentOrigin, configuredApiURL, apiURL]) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol === "http:" || url.protocol === "https:")
        return url.origin;
    } catch {
      // Relative API paths are expected in web builds; try the next origin.
    }
  }
  return "";
}

export function buildRuntimeInstallCommand(
  platform: RuntimeInstallPlatform,
  serverOrigin: string,
  enrollToken = ENROLL_TOKEN_PLACEHOLDER
): string {
  const origin = serverOrigin.replace(/\/$/, "");

  if (platform === "windows") {
    return [
      `& ([scriptblock]::Create((irm ${origin}/octo-harness/install.ps1))) \``,
      `  "${origin}" \``,
      `  "${enrollToken}"`,
    ].join("\n");
  }

  return [
    `curl -fsSL ${origin}/octo-harness/install.sh \\`,
    "  | sh -s -- \\",
    `      "${origin}" \\`,
    `      "${enrollToken}"`,
  ].join("\n");
}
