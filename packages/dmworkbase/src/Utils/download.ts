import { isSafeUrl } from "./security";

/**
 * Download a file via anchor-click.
 * CDN serves Content-Disposition header to provide the correct filename.
 * For cross-origin URLs, opens in a new tab as safety fallback.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
    if (!url) return;

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url, window.location.href);
    } catch {
        return;
    }

    const resolvedUrl = parsedUrl.href;
    if (!isSafeUrl(resolvedUrl)) return;

    const a = document.createElement("a");
    a.href = resolvedUrl;
    a.download = filename;
    if (parsedUrl.origin !== window.location.origin) {
        a.target = "_blank";
        a.rel = "noopener";
    }
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}
