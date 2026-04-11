import React from "react"
import "./index.css"

export interface CategoryHeaderProps {
    name: string
    /** 分组内群聊总数（折叠时显示） */
    groupCount?: number
    unreadCount?: number
    isCollapsed: boolean
    /** 空分组（无群聊）时为 true */
    isEmpty?: boolean
    onToggle: () => void
    onContextMenu?: (e: React.MouseEvent) => void
}

const CategoryHeader: React.FC<CategoryHeaderProps> = ({
    name,
    groupCount,
    unreadCount,
    isCollapsed,
    isEmpty,
    onToggle,
    onContextMenu,
}) => {
    return (
        <div
            className={`wk-category-header${isEmpty ? " wk-category-header--empty" : ""}`}
            onClick={onToggle}
            onContextMenu={onContextMenu}
        >
            {/* 折叠箭头 */}
            <span className={`wk-category-header__arrow${isCollapsed ? " wk-category-header__arrow--collapsed" : ""}`}>
                <svg viewBox="0 0 24 24">
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </span>

            {/* 分组名 */}
            <span className="wk-category-header__name">{name}</span>

            {/* 折叠态：显示 (N) 数量；空分组：显示 (空) */}
            {isEmpty ? (
                <span className="wk-category-header__count wk-category-header__count--empty">(空)</span>
            ) : isCollapsed && groupCount !== undefined ? (
                <span className="wk-category-header__count">({groupCount})</span>
            ) : null}

            {/* 未读 badge（空分组不显示） */}
            {!isEmpty && !!unreadCount && unreadCount > 0 && (
                <span className="wk-category-header__badge">
                    {unreadCount > 99 ? "99+" : unreadCount}
                </span>
            )}
        </div>
    )
}

export default CategoryHeader
