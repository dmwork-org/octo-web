import { isSafeUrl } from "./security";
import WKApp from "../App";
import { Dap } from "../Service/Dap";
import { getElectronIpcBridge, isElectronPowered } from "../electron/desktopBridge";
import { IPC_DOWNLOAD_STATUS, IPC_DOWNLOAD_URL } from "../../../../apps/web/src-election/shared/ipc-channels";
import { Toast } from "@douyinfe/semi-ui";
import { t } from "../i18n";

/**
 * message_file_downloaded 埋点用的已知扩展名白名单(低基数枚举)。
 *
 * 为什么需要它:本 sink 只拿得到 `filename` 字符串(见 downloadFile 唯一收口,15 个调用点
 * 都只传字符串,拿不到结构化 FileContent),而「最后一个点之后的子串」对
 * `2026Q3财报.客户机密并购项目` 这类名字会把 `客户机密并购项目` 当扩展名——那是用户可控的
 * 文件名正文,sanitizer 的 PROP_KEY_BLACKLIST 不匹配 `file_type`(见 Dap.test.ts finding 1,
 * 非黑名单字符串键会活到 envelope),会直接把 PII 透传到上报信封。
 *
 * 因此把候选后缀钳制到本白名单:命中 → 原样上报,不命中 → `"other"`,无后缀 → `""`。
 * 白名单对齐仓内既有的扩展名认知(Messages/File/index.tsx 的 getFileIconInfo / FileTypeIcon
 * 图标映射、FilePreviewPanel 的可预览类型),覆盖常见 doc/media/archive/code 类型。
 */
const KNOWN_FILE_TYPES = new Set<string>([
    // 文档
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "csv",
    // 图片
    "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp",
    // 视频 / 音频
    "mp4", "mov", "avi", "mkv", "mp3", "wav", "flac", "aac",
    // 压缩包
    "zip", "rar", "7z", "tar", "gz",
    // 代码 / 数据
    "json", "jsonl", "xml", "html", "yml", "yaml",
]);

/**
 * 把一个「后缀候选」钳制成上报用的低基数 `file_type`。
 *
 * 规则:`toLowerCase().trim()`;空 → `""`;校验为短纯字母数字 token
 * (`/^[a-z0-9]{1,8}$/`,排除 CJK / 空格 / 多段自由文本 / 超长串)→ 不满足一律 `"other"`;
 * 命中白名单原样返回,否则 `"other"`。任何情况下都不透传原始文件名片段。
 *
 * 入参已是「裸后缀」(不含点),不做 `lastIndexOf(".")` 切分——这样既可服务
 * `classifyDownloadFileType`(先切后缀再钳制),也可被结构化 `FileContent.extension`
 * (本就是裸后缀,无点)直接调用而不会被误判为 `""`(见 message_file_saved_to_drive)。
 */
export function clampFileType(candidate: string): string {
    const c = candidate.toLowerCase().trim();
    if (!c) return "";
    if (!/^[a-z0-9]{1,8}$/.test(c)) return "other";
    return KNOWN_FILE_TYPES.has(c) ? c : "other";
}

/**
 * 从文件名推导上报用的 `file_type`,把用户可控的文件名正文钳制成低基数枚举。
 *
 * 规则:取最后一个点之后子串,再交给 `clampFileType` 钳制(白名单 / `other` / `""`);
 * 无点 / 点在首位返回 `""`(保持原语义)。任何情况下都不透传原始文件名片段。
 */
export function classifyDownloadFileType(filename: string): string {
    const lastDot = filename.lastIndexOf(".");
    if (lastDot <= 0) return "";
    return clampFileType(filename.slice(lastDot + 1));
}

/**
 * Get a presigned download URL from the backend.
 * Falls back to the original URL on error.
 */
export async function getPresignedDownloadUrl(remotePath: string, filename: string): Promise<string> {
    try {
        const resp = await WKApp.apiClient.get(`file/download/url?path=${encodeURIComponent(remotePath)}&filename=${encodeURIComponent(filename)}`)
        if (resp && resp.url) {
            return resp.url
        }
    } catch (err) {
        console.warn("getPresignedDownloadUrl: failed, falling back to original URL", err)
    }
    return remotePath
}

/**
 * Get a presigned preview URL (Content-Disposition: inline) from the backend.
 * Falls back to the original URL on error.
 */
export async function getPresignedPreviewUrl(remotePath: string, filename: string): Promise<string> {
    try {
        const resp = await WKApp.apiClient.get(`file/download/url?path=${encodeURIComponent(remotePath)}&filename=${encodeURIComponent(filename)}&disposition=inline`)
        if (resp && resp.url) {
            return resp.url
        }
    } catch (err) {
        console.warn("getPresignedPreviewUrl: failed, falling back to original URL", err)
    }
    return remotePath
}

/**
 * Download a file via anchor-click.
 * For cross-origin URLs, fetches a presigned download URL from the backend.
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

    // message_file_downloaded(DAP-218 A 类):downloadFile 是消息文件下载的唯一收口
    //   (预览面板 / 折叠文件卡 / 合并转发 / 文件消息均经此)。
    // B-2(第三轮返工):**按 surface 拆语义,不再在发起前无条件计数**——否则桌面端取消/失败
    //   也被记为完成,违反本 PR 自己的 finding-4(失败不计)与仓内 doctrine(点击→resolve 后计)。
    //   · electron 路:订阅 IPC_DOWNLOAD_STATUS,仅 `completed` 分支计一次(见下),
    //     failed/cancelled/expired 不计——这是可观测完成的完成计数语义。
    //   · 浏览器 anchor 路:无法观测完成,保持 action 语义(发起即计,见下方 anchor 分支)。
    //   file_type 由 classifyDownloadFileType 钳制到已知扩展名白名单:命中原样上报,非白名单一律
    //   "other",无后缀为 ""——绝不透传原始文件名后缀片段(否则 `名字.客户机密项目` 会把正文当扩展名
    //   泄漏),保持低基数枚举。file_type 白名单钳制已在前轮确认修好,本轮只改 emit 时机/位置。
    const fileType = classifyDownloadFileType(filename);

    let downloadUrl = resolvedUrl;
    const isCrossOrigin = parsedUrl.origin !== window.location.origin;

    if (isCrossOrigin && filename) {
        downloadUrl = await getPresignedDownloadUrl(resolvedUrl, filename);
    }

    if (isElectronPowered()) {
        const ipc = getElectronIpcBridge();
        if (ipc) {
            const displayName = (value: string) => value.length > 48 ? `${value.slice(0, 45)}…` : value;
            const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
            let cleanup = () => undefined;
            const onStatus = (_event: unknown, ...args: unknown[]) => {
                    const status = (args[0] || {}) as { id?: string; state?: string; filename?: string };
                    if (status?.id !== id) return;
                    if (status.state === "completed") {
                        // B-2:electron 下载完成态才计 message_file_downloaded(完成计数语义)。
                        Dap.shared.track("message_file_downloaded", { file_type: fileType });
                        Toast.success({ content: t("base.download.completed", { values: { filename: displayName(status.filename || filename) } }), duration: 2.5 });
                        cleanup();
                    }
                    if (status.state === "failed") {
                        // failed/cancelled/expired 不计:取消/失败不是完成。
                        Toast.error({ content: t("base.download.failed", { values: { filename: displayName(status.filename || filename) } }), duration: 3 });
                        cleanup();
                    }
                    if (status.state === "cancelled" || status.state === "expired") {
                        cleanup();
                    }
            };
            cleanup = () => {
                ipc.removeListener(IPC_DOWNLOAD_STATUS, onStatus);
                if (cleanupTimer) clearTimeout(cleanupTimer);
            };
            ipc.on(IPC_DOWNLOAD_STATUS, onStatus);
            cleanupTimer = setTimeout(cleanup, 10 * 60 * 1000);
            try {
                await ipc.invoke(IPC_DOWNLOAD_URL, downloadUrl, filename, id);
                return;
            } catch (error) {
                cleanup();
                console.warn("downloadFile: Electron download failed, falling back to browser download", error);
            }
        }
    }

    try {
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = filename;
        if (isCrossOrigin) {
            a.target = "_blank";
            a.rel = "noopener";
        }
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // B-2:浏览器 anchor 路无法观测下载完成,保持 action 语义——发起(点击)即计一次。
        //   仅在 anchor 成功创建并点击后计,避免 URL 解析/安全校验被拒时误计。
        Dap.shared.track("message_file_downloaded", { file_type: fileType });
    } catch (err) {
        console.warn("downloadFile: anchor click failed, trying window.open", err);
        try {
            const w = window.open(downloadUrl, "_blank");
            if (!w) {
                console.warn("downloadFile: window.open returned null (popup blocked?)");
            }
        } catch (err2) {
            console.warn("downloadFile: window.open also failed", err2);
        }
    }
}
