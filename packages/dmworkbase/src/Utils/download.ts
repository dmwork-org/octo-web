import { isSafeUrl } from "./security";

/**
 * Download a file via anchor-click.
 * CDN serves Content-Disposition header to provide the correct filename.
 * For cross-origin URLs, opens in a new tab as safety fallback.
 */
export function downloadFile(url: string, filename: string): void {
    if (!url) return;

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url, window.location.href);
    } catch {
        return;
    }

    const resolvedUrl = parsedUrl.href;
    if (!isSafeUrl(resolvedUrl)) return;

    try {
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
    } catch (err) {
        console.warn("downloadFile: anchor click failed, trying window.open", err);
        try {
            const w = window.open(resolvedUrl, "_blank");
            if (!w) {
                console.warn("downloadFile: window.open returned null (popup blocked?)");
            }
        } catch (err2) {
            console.warn("downloadFile: window.open also failed", err2);
        }
    }
}
