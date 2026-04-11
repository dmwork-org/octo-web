import React from "react"
import CategoryHeader from "../CategoryHeader"
import "./index.css"

export interface CategorySectionProps {
    category: {
        id: string
        name: string
        groupCount?: number
        unreadCount?: number
        isEmpty?: boolean
    }
    isCollapsed: boolean
    onToggle: () => void
    onContextMenu?: (e: React.MouseEvent) => void
    children?: React.ReactNode
}

const CategorySection: React.FC<CategorySectionProps> = ({
    category,
    isCollapsed,
    onToggle,
    onContextMenu,
    children,
}) => {
    // 优先用外部传入的 isEmpty，否则根据 children 判断
    const isEmpty = category.isEmpty ?? (!children || (Array.isArray(children) && children.length === 0))

    return (
        <div className="wk-category-section">
            <CategoryHeader
                name={category.name}
                groupCount={category.groupCount}
                unreadCount={category.unreadCount}
                isCollapsed={isCollapsed}
                isEmpty={isEmpty}
                onToggle={onToggle}
                onContextMenu={onContextMenu}
            />
            <div
                className={`wk-category-section__content ${
                    isCollapsed
                        ? "wk-category-section__content--collapsed"
                        : "wk-category-section__content--expanded"
                }`}
            >
                {isEmpty ? (
                    <div className="wk-category-section__empty">暂无群聊</div>
                ) : (
                    children
                )}
            </div>
        </div>
    )
}

export default CategorySection
