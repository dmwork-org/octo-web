import React from "react"
import CategoryHeader from "../CategoryHeader"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useI18n } from "../../i18n"
import "./index.css"

export interface CategorySectionProps {
    category: {
        id: string
        name: string
        groupCount?: number
        unreadCount?: number
        hasMention?: boolean
        isEmpty?: boolean
    }
    isCollapsed: boolean
    onToggle: () => void
    onContextMenu?: (e: React.MouseEvent) => void
    children?: React.ReactNode
    isActive?: boolean   // 右键菜单打开时高亮
    isEditing?: boolean  // 行内重命名编辑态
    onRenameConfirm?: (newName: string) => void
    onRenameCancel?: () => void
    /** 是否启用拖拽（不传则不使用 dnd-kit hook） */
    draggable?: boolean
}

export interface DragHandleProps extends React.HTMLAttributes<HTMLSpanElement> {
    ref?: React.Ref<HTMLSpanElement>
}

const CategorySectionInner: React.FC<CategorySectionProps> = ({
    category,
    isCollapsed,
    onToggle,
    onContextMenu,
    children,
    isActive,
    isEditing,
    onRenameConfirm,
    onRenameCancel,
}) => {
    const { t } = useI18n()
    // useSortable：分组整体排序（同时作为 droppable，接受 group item 的 drop）
    // 注意：setNodeRef 移到拖拽 handle 上，避免整个 section 拦截 pointer 事件导致折叠点击失效
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isOver,
    } = useSortable({ id: `cat::${category.id}`, data: { type: 'category', categoryId: category.id } })

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : undefined,
    }

    const isEmpty = category.isEmpty ?? (!children || (Array.isArray(children) && children.length === 0))

    // 把 setNodeRef 和 listeners 都绑到拖拽 handle 上，header 其他区域可正常响应点击
    const dragHandleProps: DragHandleProps = {
        ref: setNodeRef,
        ...attributes,
        ...listeners,
    }

    return (
        <div
            style={style}
            className={`wk-category-section${isOver ? ' wk-category-section--drop-over' : ''}${isDragging ? ' wk-category-section--dragging' : ''}`}
        >
            <CategoryHeader
                name={category.name}
                groupCount={category.groupCount}
                unreadCount={category.unreadCount}
                hasMention={category.hasMention}
                isCollapsed={isCollapsed}
                isEmpty={isEmpty}
                onToggle={onToggle}
                onContextMenu={onContextMenu}
                isActive={isActive}
                isEditing={isEditing}
                onRenameConfirm={onRenameConfirm}
                onRenameCancel={onRenameCancel}
                dragHandleProps={dragHandleProps}
            />
            <div
                className={`wk-category-section__content ${
                    isCollapsed
                        ? "wk-category-section__content--collapsed"
                        : "wk-category-section__content--expanded"
                }`}
            >
                {isEmpty ? (
                    <div className="wk-category-section__empty">{t("base.categorySection.noGroups")}</div>
                ) : (
                    children
                )}
            </div>
        </div>
    )
}

// 静态版本（不启用拖拽时用，避免 hook 报错）
const CategorySectionStatic: React.FC<CategorySectionProps> = ({
    category,
    isCollapsed,
    onToggle,
    onContextMenu,
    children,
    isActive,
    isEditing,
    onRenameConfirm,
    onRenameCancel,
}) => {
    const { t } = useI18n()
    const isEmpty = category.isEmpty ?? (!children || (Array.isArray(children) && children.length === 0))

    return (
        <div className="wk-category-section">
            <CategoryHeader
                name={category.name}
                groupCount={category.groupCount}
                unreadCount={category.unreadCount}
                hasMention={category.hasMention}
                isCollapsed={isCollapsed}
                isEmpty={isEmpty}
                onToggle={onToggle}
                onContextMenu={onContextMenu}
                isActive={isActive}
                isEditing={isEditing}
                onRenameConfirm={onRenameConfirm}
                onRenameCancel={onRenameCancel}
            />
            <div
                className={`wk-category-section__content ${
                    isCollapsed
                        ? "wk-category-section__content--collapsed"
                        : "wk-category-section__content--expanded"
                }`}
            >
                {isEmpty ? (
                    <div className="wk-category-section__empty">{t("base.categorySection.noGroups")}</div>
                ) : (
                    children
                )}
            </div>
        </div>
    )
}

const CategorySection: React.FC<CategorySectionProps> = (props) => {
    if (props.draggable) return <CategorySectionInner {...props} />
    return <CategorySectionStatic {...props} />
}

export default CategorySection
