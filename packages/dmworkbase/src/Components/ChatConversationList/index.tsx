/**
 * ChatConversationList
 * Chat 页面会话列表的统一出口。
 * - 统一持有 useCategoryList，所有 filter 下只调用一次
 * - filter === 'group'：渲染 ConversationListGrouped（ViewToggle + 分组视图）
 * - 其他 filter：渲染 ConversationList，右键群聊有「移到分组」子菜单
 * - CreateCategoryModal 在此层管理，不依赖子组件挂载
 */
import React, { useState, useMemo } from "react"
import { Channel, ChannelTypeGroup, ChannelTypePerson } from "wukongimjssdk"
import { ChannelTypeCommunityTopic } from "../../Service/Const"
import WKApp from "../../App"
import { useCategoryList } from "../../Hooks/useCategoryList"
import { useFollowSidebar } from "../../Hooks/useFollowSidebar"
import FollowService from "../../Service/FollowService"
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

    // 关注 tab 的 DM/thread 数据来源（/sidebar/sync）。/categories 接口只返回群，
    // DM 关注关系存在 user_conversation_ext 表，由 sidebar 给出 (category_id → DMs) 映射。
    const {
        dmsByCategory,
        threadsByCategory,
        itemsByCategory,
        followedGroupNos,
        followedKeys,
        versionRef,
        bumpVersion,
        applyOptimisticSort,
        reload: reloadSidebar,
    } = useFollowSidebar()

    // 跨分组移群也会 bump 后端 follow_version；wrap useCategoryList 的实现，
    // 让本地 ref 同步乐观自增 + reload sidebar，避免下一次 sort CAS 冲突。
    const handleMoveGroupToCategory = React.useCallback(
        async (groupNo: string, categoryId: string) => {
            await moveGroupToCategory(groupNo, categoryId)
            bumpVersion()
            reloadSidebar()
        },
        [moveGroupToCategory, bumpVersion, reloadSidebar]
    )

    // 删除分组：后端级联取消关注分组下所有会话（spec #337），前端必须刷新 sidebar
    // 才能让 followedKeys 反映取消关注的项（否则最近 tab 右键这些会话还显示"取消关注"）。
    // useCategoryList.deleteCategory 只改本地 categories state 不动 sidebar，wrap 一下补上。
    const handleDeleteCategory = React.useCallback(
        async (categoryId: string) => {
            await deleteCategory(categoryId)
            bumpVersion()
            reloadSidebar()
        },
        [deleteCategory, bumpVersion, reloadSidebar]
    )
    // 后端每个 follow 写操作都会 bump user_follow_version，本地 ref 同步乐观自增，
    // 让随后的 sort 不必等 sidebar reload 就拿到正确版本号；若实际 bump >1（cascade）
    // 由 sort 的冲突重试兜底。
    const reloadAll = React.useCallback(() => {
        bumpVersion()
        reload()
        reloadSidebar()
    }, [bumpVersion, reload, reloadSidebar])

    // 同分组内手动排序：调 /v2/follow/sort 带 follow_version 做 CAS。
    // - 立刻乐观更新本地 items 顺序，避免 dnd-kit 把 item 放回原位 → API + reload 后再闪到新位置的视觉抖动
    // - 用 versionRef 读最新 version（避免闭包持有旧值在连续拖拽时 CAS 冲突）
    // - 成功后 bumpVersion() 乐观 +1，让下次拖拽不必等 reload
    // - 冲突时 reload 一次拿到新 version 再重试一次；失败由 reload 兜底回退本地状态
    const handleSortFollowItems = React.useCallback(
        async (items: { target_type: number; target_id: string }[]) => {
            applyOptimisticSort(items)
            const payload = {
                items: items.map((it, idx) => ({
                    target_type: it.target_type,
                    target_id: it.target_id,
                    sort: idx,
                })),
            }
            try {
                await FollowService.sort({ ...payload, version: versionRef.current })
                bumpVersion()
            } catch (err: any) {
                // APIClient response interceptor 把 400 reject 成 { error, msg, status }
                const errMsg = String(err?.msg || err?.message || err || '')
                if (errMsg.includes('version conflict')) {
                    // 拉新 version 后重试一次
                    await reloadSidebar()
                    try {
                        await FollowService.sort({ ...payload, version: versionRef.current })
                        bumpVersion()
                    } catch (retryErr) {
                        console.error('排序重试仍失败', retryErr)
                    }
                } else {
                    console.error('排序失败', err)
                }
            } finally {
                // 最终拉一次保证 UI 与服务端一致
                reloadSidebar()
            }
        },
        [applyOptimisticSort, versionRef, bumpVersion, reloadSidebar]
    )

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

    // 构建额外的右键菜单项
    // - 「移到分组」子菜单（仅关注 Tab 的群聊）
    // - 「添加到关注 / 取消关注」（最近 Tab）
    const buildExtraMenus = (conv: ConversationWrap | undefined): ContextMenusData[] => {
        if (!conv) return []

        const menus: ContextMenusData[] = []
        const channel = conv.channel
        // sidebar 是 follow 状态的唯一权威源。channelInfo.orgData.is_followed 在 IM sync
        // 路径上不一定填齐（特别是子区），优先用 sidebar 集合判定，回退到旧字段。
        const sidebarFollowed = followedKeys.has(`${channel.channelType}::${channel.channelID}`)
        const isFollowed = sidebarFollowed || conv.channelInfo?.orgData?.is_followed === true

        // 最近 Tab（filter !== 'group'）显示「添加到关注 / 取消关注」
        if (filter !== 'group') {
            if (isFollowed) {
                // 已关注 → 显示「取消关注」
                menus.push({
                    title: '取消关注',
                    onClick: async () => {
                        const channel = conv.channel
                        try {
                            if (channel.channelType === ChannelTypeGroup) {
                                await FollowService.unfollowChannel({ group_no: channel.channelID })
                            } else if (channel.channelType === ChannelTypePerson) {
                                await FollowService.unfollowDM(channel.channelID)
                            } else if (channel.channelType === ChannelTypeCommunityTopic) {
                                await FollowService.unfollowThread(channel.channelID)
                            }
                            // 刷新分组列表
                            reloadAll()
                        } catch (err) {
                            console.error('取消关注失败', err)
                        }
                    }
                })
            } else {
                // 未关注 → 显示「添加到关注」
                const channel = conv.channel

                // 子区：直接关注，后端 FollowThread 会级联关注父频道（PM #337 spec
                // "关注子区时子区和频道一同关注"）。子区"不支持单独关注"指的是不能仅关注
                // 子区不连带父频道，不是没有入口。
                if (channel.channelType === ChannelTypeCommunityTopic) {
                    menus.push({
                        title: '添加到关注',
                        onClick: async () => {
                            try {
                                await FollowService.followThread({ thread_channel_id: channel.channelID })
                                reloadAll()
                            } catch (err) {
                                console.error('关注子区失败', err)
                            }
                        }
                    })
                } else {
                    // 群聊和私聊需要选分组
                    const categoryItems: ContextMenusData[] = categories
                        .filter(cat => !cat.is_default && isValidCategoryItem(cat))
                        .map(cat => ({
                            title: cat.name,
                            onClick: async () => {
                                try {
                                    if (channel.channelType === ChannelTypeGroup) {
                                        await FollowService.refollowChannel({ group_no: channel.channelID })
                                        // 移到指定分组
                                        await moveGroupToCategory(channel.channelID, cat.category_id)
                                    } else if (channel.channelType === ChannelTypePerson) {
                                        await FollowService.followDM({ peer_uid: channel.channelID, category_id: cat.category_id })
                                    }
                                    reloadAll()
                                } catch (err) {
                                    console.error('添加到关注失败', err)
                                }
                            }
                        }))
                    categoryItems.push({ separator: true } as ContextMenusData)
                    categoryItems.push({
                        title: '+ 新建分组',
                        onClick: () => setCreateModalVisible(true)
                    })

                    menus.push({
                        title: '添加到关注',
                        children: categoryItems
                    })
                }
            }
        }

        // 关注 Tab 的群聊显示「移到分组」（保留原有逻辑）
        if (filter === 'group' && conv.channel.channelType === ChannelTypeGroup && categories.length > 0) {
            const groupNo = conv.channel.channelID
            const currentCategoryId = categories.find(
                cat => (cat.groups || []).some(g => g.group_no === groupNo)
            )?.category_id

            const moveItems: ContextMenusData[] = categories
                .filter(cat => !cat.is_default && isValidCategoryItem(cat))
                .map(cat => ({
                    title: cat.name,
                    checked: currentCategoryId === cat.category_id,
                    onClick: () => handleMoveGroupToCategory(groupNo, cat.category_id),
                }))
            moveItems.push({ separator: true } as ContextMenusData)
            moveItems.push({ title: '+ 新建分组', onClick: () => setCreateModalVisible(true) })

            menus.push({
                title: '移到分组',
                children: moveItems
            })
        }

        return menus
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
                    dmsByCategory={dmsByCategory}
                    threadsByCategory={threadsByCategory}
                    itemsByCategory={itemsByCategory}
                    followedGroupNos={followedGroupNos}
                    followedKeys={followedKeys}
                    onSortFollowItems={handleSortFollowItems}
                    isLoading={isLoading}
                    error={error}
                    onRetry={reloadAll}
                    onRenameCategory={renameCategory}
                    onDeleteCategory={handleDeleteCategory}
                    onSortCategories={sortCategories}
                    onMoveGroupToCategory={handleMoveGroupToCategory}
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
                    onUnfollow={reloadAll}
                />
            ) : (
                <ConversationList
                    conversations={filteredConversations}
                    select={select}
                    filter={filter}
                    onClick={onConversationClick}
                    onClearMessages={onClearMessages}
                    onThreadOverflowClick={onThreadOverflowClick}
                    extraContextMenus={buildExtraMenus}
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
