/**
 * ChatConversationList
 * Chat 页面会话列表的统一出口。
 * - 统一持有 useCategoryList，所有 filter 下只调用一次
 * - filter === 'group'：渲染 ConversationListGrouped（ViewToggle + 分组视图）
 * - 其他 filter：渲染 ConversationList，右键群聊有「移到分组」子菜单
 * - CreateCategoryModal 在此层管理，不依赖子组件挂载
 */
import React, { useState, useMemo } from "react"
import { Channel, ChannelTypeGroup } from "wukongimjssdk"
import { ChannelTypeCommunityTopic } from "../../Service/Const"
import WKApp from "../../App"
import { useCategoryList } from "../../Hooks/useCategoryList"
import { ConversationWrap } from "../../Service/Model"
import { ConvFilter } from "../ConversationList"
import ConversationList from "../ConversationList"
import ConversationListGrouped, { ValidCategoryItem, isValidCategoryItem } from "../ConversationListGrouped"
import CreateCategoryModal from "../CreateCategoryModal"
import { ContextMenusData } from "../ContextMenus"

export interface ChatConversationListProps {
    conversations: ConversationWrap[]
    filter: ConvFilter
    /** 是否隐藏 3 天不活跃的群聊（最近 Tab 使用） */
    hideInactiveGroups?: boolean
    select?: Channel
    onConversationClick: (conv: ConversationWrap) => void
    onClearMessages: (channel: Channel) => void
    onThreadOverflowClick: (groupNo: string) => void
    /** 外部触发「新建分组」Modal（如顶部 + 按钮），调用后 Modal 显示 */
    onOpenCreateCategoryRef?: React.MutableRefObject<(() => void) | null>
    /** 群聊创建成功后回调，用于刷新会话列表 */
    onGroupCreated?: () => void
}

const ChatConversationList: React.FC<ChatConversationListProps> = ({
    conversations,
    filter,
    hideInactiveGroups = false,
    select,
    onConversationClick,
    onClearMessages,
    onThreadOverflowClick,
    onOpenCreateCategoryRef,
    onGroupCreated,
}) => {
    const {
        categories,
        isLoading,
        error,
        reload,
        createCategory,
        renameCategory,
        deleteCategory,
        sortCategories,
        moveGroupToCategory,
    } = useCategoryList()

    const [createModalVisible, setCreateModalVisible] = useState(false)

    // 暴露「打开新建分组 Modal」给外层（如顶部 + 按钮）
    React.useEffect(() => {
        if (onOpenCreateCategoryRef) {
            onOpenCreateCategoryRef.current = () => setCreateModalVisible(true)
        }
        return () => {
            if (onOpenCreateCategoryRef) {
                onOpenCreateCategoryRef.current = null
            }
        }
    }, [onOpenCreateCategoryRef])

    const existingCategoryNames = categories.map(c => c.name)

    // 最近 Tab 3 天不活跃群聊隐藏逻辑
    // - 群聊（channelType=2）超过 3 天没有消息 → 隐藏
    // - 私聊（channelType=1）、子区（channelType=5）不受影响
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000
    const filteredConversations = useMemo(() => {
        if (!hideInactiveGroups) return conversations
        const now = Date.now()
        return conversations.filter(conv => {
            // 只过滤群聊
            if (conv.channel.channelType !== ChannelTypeGroup) return true
            // 子区不过滤（虽然子区走的是 ChannelTypeCommunityTopic，不是 ChannelTypeGroup）
            if (conv.channel.channelType === ChannelTypeCommunityTopic) return true
            // timestamp 是秒还是毫秒？SDK 用秒
            const lastMsgTime = conv.timestamp * 1000
            // 3 天内有活动则保留
            return (now - lastMsgTime) < THREE_DAYS_MS
        })
    }, [conversations, hideInactiveGroups])

    // 构建「移到分组」子菜单（含 ✓ 标识 + 新建分组入口）
    // 用于非 group filter 下的 ConversationList
    const buildMoveToGroupMenus = (conv: ConversationWrap | undefined): ContextMenusData[] => {
        if (!conv || conv.channel.channelType !== ChannelTypeGroup) return []
        if (categories.length === 0) return []

        const groupNo = conv.channel.channelID
        const currentCategoryId = categories.find(
            cat => (cat.groups || []).some(g => g.group_no === groupNo)
        )?.category_id

        // 过滤默认分组（is_default），不在「移到分组」子菜单里显示
        const items: ContextMenusData[] = categories
            .filter(cat => !cat.is_default && isValidCategoryItem(cat))
            .map(cat => ({
                title: cat.name,
                checked: currentCategoryId === cat.category_id,
                onClick: () => moveGroupToCategory(groupNo, cat.category_id),
            }))
        items.push({ separator: true } as ContextMenusData)
        items.push({ title: "+ 新建分组", onClick: () => setCreateModalVisible(true) })

        return items
    }

    return (
        <>
            {filter === 'group' ? (
                <ConversationListGrouped
                    conversations={filteredConversations}
                    select={select}
                    onConversationClick={onConversationClick}
                    onClearMessages={onClearMessages}
                    onThreadOverflowClick={onThreadOverflowClick}
                    categories={categories.filter(isValidCategoryItem)}
                    isLoading={isLoading}
                    error={error}
                    onRetry={reload}
                    onRenameCategory={renameCategory}
                    onDeleteCategory={deleteCategory}
                    onSortCategories={sortCategories}
                    onMoveGroupToCategory={moveGroupToCategory}
                    onOpenCreateCategory={() => setCreateModalVisible(true)}
                    onStartGroup={() => {
                        WKApp.endpoints.organizationalLayer(null, {
                            onSuccess: () => {
                                reload()
                                onGroupCreated?.()
                            }
                        })
                    }}
                    onCreateGroupInCategory={(categoryId: string) => {
                        WKApp.endpoints.organizationalLayer(null, {
                            defaultCategoryId: categoryId,
                            onSuccess: () => {
                                reload()
                                onGroupCreated?.()
                            }
                        })
                    }}
                />
            ) : (
                <ConversationList
                    conversations={filteredConversations}
                    select={select}
                    filter={filter}
                    onClick={onConversationClick}
                    onClearMessages={onClearMessages}
                    onThreadOverflowClick={onThreadOverflowClick}
                    extraContextMenus={buildMoveToGroupMenus}
                />
            )}

            {/* CreateCategoryModal 在此层统一管理，不依赖 ConversationListGrouped 挂载 */}
            <CreateCategoryModal
                visible={createModalVisible}
                existingNames={existingCategoryNames}
                onConfirm={async (name) => {
                    await createCategory(name)
                    setCreateModalVisible(false)
                }}
                onCancel={() => setCreateModalVisible(false)}
            />
        </>
    )
}

export default ChatConversationList
