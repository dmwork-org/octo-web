import React from "react";
import { Toast } from "@douyinfe/semi-ui";
import "./index.css";

export interface JoinSuccessToastOptions {
    /** 已加入实体的名称（目前是 Space 名称） */
    entityName: string;
    /** 归属 Space 名称 */
    spaceName: string;
    /**
     * true 时展示双行 + 「切换过去」按钮；false 时走常规单行 toast。
     * 这是纯展示开关；由调用方基于「加入实体 spaceId 是否等于当前 currentSpaceId」判断。
     */
    crossSpace?: boolean;
    /** 用户点击「切换过去」时触发。toast 会立即关闭；实际切换逻辑由调用方实现。 */
    onSwitch?: () => void;
    /** 自动消失时间（秒）；默认 5s —— 双行需要更长停留。undefined 等同默认值。 */
    duration?: number;
}

/**
 * showJoinSuccessToast — YUJ-106 / dmwork-web#1065
 *
 * 产品语义：
 * - 单 Space / 已在归属 Space：
 *     `✅ 已加入「xxx」`
 * - 跨 Space（多 Space 用户在非归属 Space 点邀请）：
 *     `✅ 已加入「xxx 群聊」`
 *     `📍 位于「yyy 空间」    [切换过去 →]`
 * - YUJ-112 / dmwork-web#1068 Round 2：
 *   当 entityName === spaceName（纯加入 Space，没有独立的群名）时，双行会
 *   变成「已加入 ExampleCorp 群聊 / 位于 ExampleCorp 空间」这样的重复文案。此时
 *   退化为单行 `✅ 已加入「xxx」空间`（crossSpace 依然展示切换按钮），
 *   非跨 Space 也沿用同一简化版，避免和 spaceName 重复。
 *
 * 硬约束：
 * - 不在 toast 内部自动切换 currentSpace，必须 onSwitch 回调显式触发
 * - action 按钮点击后 toast 立即关闭
 * - 保留 auto-dismiss（duration 秒）
 */
export function showJoinSuccessToast(opts: JoinSuccessToastOptions): void {
    const { entityName, spaceName, crossSpace, onSwitch, duration } = opts;
    // YUJ-112: entityName === spaceName 时二者冗余，toast 只显示一次 Space 名称。
    const sameName = !!spaceName && entityName === spaceName;

    if (!crossSpace) {
        // 非跨 Space — 单行 toast；sameName 时带「空间」后缀突出 Space 加入语义。
        Toast.success({
            content: sameName
                ? `✅ 已加入「${spaceName}」空间`
                : `✅ 已加入「${entityName}」`,
            duration: duration ?? 3,
        });
        return;
    }

    // 双行 + action 按钮：借助 Semi Toast 的自定义 content
    const id = Toast.info({
        duration: duration ?? 5,
        showClose: true,
        content: sameName ? (
            <div className="wk-join-success-toast" data-testid="join-success-toast-cross-space">
                <div className="wk-join-success-toast__row">
                    <span className="wk-join-success-toast__line">
                        ✅ 已加入「{spaceName}」空间
                    </span>
                    <button
                        type="button"
                        className="wk-join-success-toast__switch"
                        data-testid="join-success-toast-switch"
                        onClick={() => {
                            try {
                                onSwitch?.();
                            } finally {
                                try { Toast.close(id); } catch { /* noop */ }
                            }
                        }}
                    >
                        切换过去 →
                    </button>
                </div>
            </div>
        ) : (
            <div className="wk-join-success-toast" data-testid="join-success-toast-cross-space">
                <div className="wk-join-success-toast__line">
                    ✅ 已加入「{entityName} 群聊」
                </div>
                <div className="wk-join-success-toast__row">
                    <span className="wk-join-success-toast__line wk-join-success-toast__line--muted">
                        📍 位于「{spaceName} 空间」
                    </span>
                    <button
                        type="button"
                        className="wk-join-success-toast__switch"
                        data-testid="join-success-toast-switch"
                        onClick={() => {
                            try {
                                onSwitch?.();
                            } finally {
                                // action 按钮点击 → toast 立即关闭
                                try { Toast.close(id); } catch { /* noop */ }
                            }
                        }}
                    >
                        切换过去 →
                    </button>
                </div>
            </div>
        ),
    });
}

export default showJoinSuccessToast;
