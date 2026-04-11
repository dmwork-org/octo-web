import React, { useRef, useEffect } from "react"
import "./index.css"

export interface CategoryHeaderProps {
    name: string
    groupCount?: number
    unreadCount?: number
    isCollapsed: boolean
    isEmpty?: boolean
    onToggle: () => void
    onContextMenu?: (e: React.MouseEvent) => void
    // 右键菜单打开时高亮
    isActive?: boolean
    // 行内重命名
    isEditing?: boolean
    onRenameConfirm?: (newName: string) => void
    onRenameCancel?: () => void
}

const CategoryHeader: React.FC<CategoryHeaderProps> = ({
    name,
    groupCount,
    unreadCount,
    isCollapsed,
    isEmpty,
    onToggle,
    onContextMenu,
    isActive,
    isEditing,
    onRenameConfirm,
    onRenameCancel,
}) => {
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [isEditing])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            const val = inputRef.current?.value.trim()
            if (val) onRenameConfirm?.(val)
        }
        if (e.key === "Escape") {
            onRenameCancel?.()
        }
    }

    if (isEditing) {
        return (
            <div className="wk-category-header wk-category-header--editing" onClick={e => e.stopPropagation()}>
                <span className={`wk-category-header__arrow${isCollapsed ? " wk-category-header__arrow--collapsed" : ""}`}>
                    <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
                </span>
                <input
                    ref={inputRef}
                    className="wk-category-header__rename-input"
                    defaultValue={name}
                    onKeyDown={handleKeyDown}
                    onBlur={e => {
                        const val = e.target.value.trim()
                        if (val && val !== name) onRenameConfirm?.(val)
                        else onRenameCancel?.()
                    }}
                    onClick={e => e.stopPropagation()}
                />
            </div>
        )
    }

    return (
        <div
            className={[
                "wk-category-header",
                isEmpty ? "wk-category-header--empty" : "",
                isActive ? "wk-category-header--active" : "",
            ].filter(Boolean).join(" ")}
            onClick={onToggle}
            onContextMenu={onContextMenu}
        >
            <span className={`wk-category-header__arrow${isCollapsed ? " wk-category-header__arrow--collapsed" : ""}`}>
                <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9" /></svg>
            </span>
            <span className="wk-category-header__name">
                {name}
                {isEmpty ? (
                    <span className="wk-category-header__count wk-category-header__count--empty"> (空)</span>
                ) : isCollapsed && groupCount !== undefined ? (
                    <span className="wk-category-header__count"> ({groupCount})</span>
                ) : null}
            </span>
            {!isEmpty && !!unreadCount && unreadCount > 0 && (
                <span className="wk-category-header__badge">
                    {unreadCount > 99 ? "99+" : unreadCount}
                </span>
            )}
        </div>
    )
}

export default CategoryHeader
