// 复制文本到剪贴板。优先使用 navigator.clipboard，不可用时降级到 textarea + execCommand("copy")，
// 适配 iOS Safari、非 HTTPS 等不支持 Clipboard API 的环境。返回是否复制成功。
export async function copyToClipboard(text: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // fall through to fallback
        }
    }

    let textarea: HTMLTextAreaElement | null = null;
    try {
        textarea = document.createElement("textarea");
        textarea.value = text;
        // iOS Safari 需要 readOnly + 非负 fontSize 才不会触发键盘和缩放
        textarea.readOnly = true;
        textarea.style.position = "fixed";
        textarea.style.top = "0";
        textarea.style.left = "0";
        textarea.style.opacity = "0";
        textarea.style.fontSize = "16px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        // iOS Safari：select() 不一定生效，再调一次 setSelectionRange 兜底
        textarea.setSelectionRange(0, text.length);
        return document.execCommand("copy");
    } catch {
        return false;
    } finally {
        if (textarea && textarea.parentNode) {
            textarea.parentNode.removeChild(textarea);
        }
    }
}
