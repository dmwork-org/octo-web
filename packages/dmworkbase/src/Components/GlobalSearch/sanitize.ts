/**
 * Sanitize HTML string to only allow <mark> tags (used for search highlighting).
 * All other HTML is escaped to prevent XSS.
 */
export function sanitizeHighlight(html: string): string {
    if (!html) return '';

    // Temporarily replace valid <mark> and </mark> with placeholders
    const MARK_OPEN = '\x00MARK_OPEN\x00';
    const MARK_CLOSE = '\x00MARK_CLOSE\x00';

    let result = html
        .replace(/<mark>/gi, MARK_OPEN)
        .replace(/<\/mark>/gi, MARK_CLOSE);

    // Escape all remaining HTML
    result = result
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    // Restore <mark> tags
    result = result
        .replace(new RegExp(MARK_OPEN, 'g'), '<mark>')
        .replace(new RegExp(MARK_CLOSE, 'g'), '</mark>');

    return result;
}
