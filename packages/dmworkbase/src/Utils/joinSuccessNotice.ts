/**
 * joinSuccessNotice — cross-page post-join UX notice.
 *
 * YUJ-106 / dmwork-web#1065:
 * 多 Space 用户通过邀请链接加入一个属于「非当前 Space」的群/Space 时，
 * 点击 InviteLanding → handleJoin 后页面会 full-reload 到主界面，Toast 无法
 * 跨 location.href 持续。我们把「刚加入了什么 / 归属哪个 Space」的信息
 * 暂存到 sessionStorage，让主界面挂载时弹出带有「切换过去」action 的 toast。
 *
 * 约束：
 * - 只写 sessionStorage（tab 级；不影响其他 tab；浏览器关闭即失效）
 * - 解析失败时返回 null，静默降级
 * - consumeJoinSuccessNotice() 总是清理，避免反复弹窗
 */

const KEY = "pendingJoinSuccessNotice";

export interface JoinSuccessNotice {
    /** 加入的实体（目前是 Space；未来可拓展 group）的归属 Space ID */
    spaceId: string;
    /** 归属 Space 名称 —— 显示在「位于 xxx 空间」那一行 */
    spaceName: string;
    /** 加入实体的展示名称（用于「已加入 xxx」那一行）。当前 = spaceName */
    entityName?: string;
    /**
     * true 表示 joinedSpaceId !== prevCurrentSpaceId（跨 Space 加入），
     * 需要展示带「切换过去」按钮的双行 toast。
     * false 表示单 Space 或已在归属 Space，展示常规 toast。
     */
    crossSpace: boolean;
    /**
     * YUJ-170 / dmwork-web#1100 扩展：加入实体类型。
     * - 'space'（默认/未设置）：加入 Space 本身，原 YUJ-106 行为
     * - 'group'：加入某 Space 下的群组（由 dmworkim H5 join_group.html 在 scanjoin
     *   成功且 crossSpace 时写入）。Toast 渲染「已加入「<groupName> 群聊」」+
     *   「位于「<spaceName> 空间」」+「切换过去 →」。
     * 消费方必须按 optional 处理，兼容 YUJ-106 存量 payload。
     */
    kind?: "space" | "group";
    /** YUJ-170：群编号（仅 kind='group' 写入，供调试 / 埋点）*/
    groupNo?: string;
    /** YUJ-170：群名称（仅 kind='group' 写入，Toast 文案使用）*/
    groupName?: string;
}

function getSessionStorage(): Storage | null {
    try {
        if (typeof sessionStorage !== "undefined") return sessionStorage;
    } catch {
        /* ignored — SSR / restricted mode */
    }
    return null;
}

export function saveJoinSuccessNotice(notice: JoinSuccessNotice): void {
    const ss = getSessionStorage();
    if (!ss) return;
    try {
        ss.setItem(KEY, JSON.stringify(notice));
    } catch {
        /* storage full / disabled — drop silently */
    }
}

export function consumeJoinSuccessNotice(): JoinSuccessNotice | null {
    const ss = getSessionStorage();
    if (!ss) return null;
    try {
        const raw = ss.getItem(KEY);
        if (!raw) return null;
        ss.removeItem(KEY);
        const parsed = JSON.parse(raw) as JoinSuccessNotice;
        if (!parsed || typeof parsed.spaceId !== "string" || typeof parsed.spaceName !== "string") {
            return null;
        }
        return parsed;
    } catch {
        // Malformed payload — nuke it to avoid loops.
        try { ss.removeItem(KEY); } catch {}
        return null;
    }
}

/** Testing / reset helper */
export function clearJoinSuccessNotice(): void {
    const ss = getSessionStorage();
    if (!ss) return;
    try { ss.removeItem(KEY); } catch {}
}

export interface JoinSuccessInfo {
    /** 加入实体的归属 Space ID（= targetSpaceId） */
    spaceId: string;
    /** 归属 Space 名称 */
    spaceName: string;
    /** 加入实体的展示名称（省略时默认为 spaceName，纯加入 Space 场景） */
    entityName?: string;
}

/**
 * computeAndSaveJoinSuccess — shared helper for every post-join code path
 * (InviteLanding direct join / Layout.onLogin pendingInviteCode auto-join).
 *
 * - 计算 crossSpace = spaceId && currentSpaceId && currentSpaceId !== spaceId
 * - 写入 sessionStorage（saveJoinSuccessNotice）
 * - 返回最终的 notice，便于调用方据此决定是否更新 localStorage.currentSpaceId
 *
 * 永不抛：saveJoinSuccessNotice 内部静默降级，调用方可放心继续 navigation。
 */
export function computeAndSaveJoinSuccess(
    info: JoinSuccessInfo,
    currentSpaceId: string,
): JoinSuccessNotice {
    const spaceId = info.spaceId || "";
    const spaceName = info.spaceName || "";
    const entityName = info.entityName ?? spaceName;
    const crossSpace = !!(
        spaceId && currentSpaceId && currentSpaceId !== spaceId
    );
    const notice: JoinSuccessNotice = {
        spaceId,
        spaceName,
        entityName,
        crossSpace,
    };
    saveJoinSuccessNotice(notice);
    return notice;
}
