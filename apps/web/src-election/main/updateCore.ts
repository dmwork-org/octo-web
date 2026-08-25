export type UpdaterPlatform = "macos" | "windows" | "linux";

export interface DesktopUpdateInfo {
  version: string;
  url: string;
  notes?: string;
  pub_date?: string;
  signature?: string;
  forceUpdate?: boolean;
}

export function getUpdaterPlatform(platform: NodeJS.Platform = process.platform): UpdaterPlatform {
  if (platform === "darwin") return "macos";
  if (platform === "win32") return "windows";
  return "linux";
}

export function buildUpdaterCheckUrl(options: {
  updaterApiUrl: string;
  version: string;
  platform?: NodeJS.Platform;
}): string {
  const base = options.updaterApiUrl.endsWith("/")
    ? options.updaterApiUrl
    : `${options.updaterApiUrl}/`;
  return new URL(
    `${getUpdaterPlatform(options.platform)}/${encodeURIComponent(options.version)}`,
    base,
  ).toString();
}

export function parseUpdateInfo(raw: unknown): DesktopUpdateInfo {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const version = typeof value.version === "string" ? value.version.trim() : "";
  const urlValue = value.url ?? value.download_url ?? value.downloadUrl;
  const url = typeof urlValue === "string" ? urlValue.trim() : "";
  if (!version) throw new Error("Updater response is missing version");
  if (!url) throw new Error("Updater response is missing url");
  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error("Updater response url must be http(s)");
  }
  return {
    version,
    url: parsedUrl.toString(),
    notes: typeof value.notes === "string" ? value.notes : "",
    pub_date: typeof value.pub_date === "string" ? value.pub_date : "",
    signature: typeof value.signature === "string" ? value.signature : "",
    forceUpdate: parseForceUpdate(value),
  };
}

function parseForceUpdate(value: Record<string, unknown>): boolean {
  const raw = value.forceUpdate ?? value.force_update ?? value.force ?? value.required ?? value.mandatory;
  return raw === true || raw === 1 || raw === "1" || raw === "true";
}

export function getDownloadedUpdateFileName(url: string, version: string, platform: UpdaterPlatform): string {
  let name = "";
  try {
    const pathname = new URL(url).pathname;
    name = pathname.endsWith("/") ? "" : decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "");
  } catch {
    name = "";
  }
  const fallbackExt = platform === "windows" ? "exe" : platform === "macos" ? "dmg" : "AppImage";
  const fallback = `OCTO-${version}.${fallbackExt}`;
  const candidate = name || fallback;
  return candidate.replace(/[\\/:*?"<>|]/g, "_");
}

export function isZipUpdatePackage(filePathOrUrl: string): boolean {
  const pathName = (() => {
    try {
      return new URL(filePathOrUrl).pathname;
    } catch {
      return filePathOrUrl;
    }
  })();
  return pathName.toLowerCase().endsWith(".zip");
}

export function getMacAppBundlePath(execPath: string): string {
  const parts = execPath.split("/");
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (parts[index]?.toLowerCase().endsWith(".app")) {
      return parts.slice(0, index + 1).join("/") || "/";
    }
  }
  throw new Error("Current executable is not inside a macOS app bundle");
}
