import React from "react";
import { Badge } from "@douyinfe/semi-ui";
import { Space } from "wukongimjssdk";
import NavSpaceSwitcher from "./NavSpaceSwitcher";

export interface NavBottomProps {
    hasNewVersion?: boolean;
    settingSelected?: boolean;
    onSettingsClick?: () => void;
    // Space switcher
    spaces: Space[];
    currentSpaceId?: string;
    onSpaceSelect: (spaceId: string) => void;
    onCopyInviteLink?: (spaceId: string, e: React.MouseEvent) => void;
    onJoinSpace?: () => void;
    onCreateSpace?: () => void;
}

function IconSettings() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
    );
}

export default function NavBottom({
    hasNewVersion,
    onSettingsClick,
    spaces,
    currentSpaceId,
    onSpaceSelect,
    onCopyInviteLink,
    onJoinSpace,
    onCreateSpace,
}: NavBottomProps) {
    return (
        <div className="wk-navrail__bottom">
            {/* 设置上方分割线 */}
            <div className="wk-navrail__sep" />

            {/* 设置 */}
            <button
                type="button"
                className="wk-navrail__item"
                title="设置"
                aria-label="设置"
                onClick={onSettingsClick}
            >
                <IconSettings />
                {hasNewVersion && (
                    <span className="wk-navrail__settings-badge">
                        <Badge dot type="danger" />
                    </span>
                )}
            </button>

            {/* Space 切换器（底部，向上弹出） */}
            <NavSpaceSwitcher
                spaces={spaces}
                currentSpaceId={currentSpaceId}
                onSpaceSelect={onSpaceSelect}
                onCopyInviteLink={onCopyInviteLink}
                onJoinSpace={onJoinSpace}
                onCreateSpace={onCreateSpace}
            />
        </div>
    );
}
