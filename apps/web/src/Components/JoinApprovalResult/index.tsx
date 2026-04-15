import React from "react";
import { Button } from "@douyinfe/semi-ui";
import type { JoinApprovalStatus } from "@octo/base";
import "./index.css";

interface JoinApprovalResultProps {
    status: JoinApprovalStatus;
    onDismiss: () => void;
}

/**
 * 加入 Space 审批结果页
 * - need_approval：申请已提交，等待管理员审批
 * - pending：已有申请在审批中，无需重复提交
 *
 * 由 Layout state 统一渲染，不依赖各业务入口自己处理。
 */
export default function JoinApprovalResult({ status, onDismiss }: JoinApprovalResultProps) {
    const isPending = status === "pending";

    return (
        <div className="wk-join-approval">
            <div className="wk-join-approval-card">
                <div className="wk-join-approval-icon">
                    {isPending ? "⏳" : "✅"}
                </div>
                <h2 className="wk-join-approval-title">
                    {isPending ? "申请审批中" : "申请已提交"}
                </h2>
                <p className="wk-join-approval-desc">
                    {isPending
                        ? "你已有一个申请正在审批中，请耐心等待管理员处理。"
                        : "你的加入申请已提交，请等待管理员审批通过后即可加入。"}
                </p>
                <Button
                    type="primary"
                    size="large"
                    className="wk-join-approval-btn"
                    onClick={onDismiss}
                >
                    知道了
                </Button>
            </div>
        </div>
    );
}
