import WKSDK from "wukongimjssdk";
import { ChannelInfoListener } from "wukongimjssdk";
import { Channel, ChannelInfo, ChannelTypePerson, ChannelTypeGroup } from "wukongimjssdk";
import { ChannelTypeCommunityTopic } from "../../Service/Const";
import React, { Component } from "react";
import { Modal } from "@douyinfe/semi-ui";
import { ConversationWrap, MessageWrap } from "../../Service/Model";
import { getTimeStringAutoShort2 } from '../../Utils/time'
import classNames from "classnames";

import "./index.css"
import { Badge, Toast } from "@douyinfe/semi-ui";
import WKApp from "../../App";
import { EndpointID } from "../../Service/Const";
import ContextMenus, { ContextMenusContext } from "../ContextMenus";
import { ChannelSettingManager } from "../../Service/ChannelSetting";
import { TypingListener, TypingManager } from "../../Service/TypingManager";
import { BeatLoader } from "react-spinners";
import { RevokeCell } from "../../Messages/Revoke";
import { FlameMessageCell } from "../../Messages/Flame";
import WKAvatar from "../WKAvatar";
import AiBadge from "../AiBadge";
import ConversationVM from "../Conversation/vm";
export type ConvFilter = 'all' | 'human' | 'ai' | 'group'

export interface ConversationListProps {
    conversations: ConversationWrap[]
    select?: Channel
    /** 外部控制过滤，不传则内部默认 'all' */
    filter?: ConvFilter
    onClick?: (conversation: ConversationWrap) => void
    onClearMessages?: (channel: Channel) => void
    /** 点击 "+N 个子区" 时的回调，传入父群组 ID */
    onThreadOverflowClick?: (groupNo: string) => void
}

export interface ConversationListState {
    selectConversationWrap?: ConversationWrap
}

export default class ConversationList extends Component<ConversationListProps, ConversationListState>{
    channelListener!: ChannelInfoListener
    contextMenusContext!: ContextMenusContext
    typingListener!: TypingListener
    constructor(props: ConversationListProps) {
        super(props)

        this.state = {}
    }

    componentDidMount() {
        this.channelListener = (channelInfo: ChannelInfo) => {
            this.setState({})
        }
        WKSDK.shared().channelManager.addListener(this.channelListener)

        this.typingListener = (channel: Channel, add: boolean) => {
            this.setState({})
        }
        TypingManager.shared.addTypingListener(this.typingListener)

    }

    componentWillUnmount() {
        WKSDK.shared().channelManager.removeListener(this.channelListener)
        TypingManager.shared.removeTypingListener(this.typingListener)
    }

    _handleScroll = () => {
        this.contextMenusContext.hide()
    }
    _handleContextMenu(conversationWrap: ConversationWrap, event: React.MouseEvent) {
        this.contextMenusContext.show(event)
        this.setState({
            selectConversationWrap: conversationWrap
        })
    }

    _getTypingUI(conversationWrap: ConversationWrap) {
        const { select } = this.props
        const typing = TypingManager.shared.getTyping(conversationWrap.channel)
        const selected = select && select.isEqual(conversationWrap.channel)
        return <div className="wk-typing"><BeatLoader size={4} margin={3} color={selected ? "white" : "var(--wk-color-theme)"} />&nbsp;&nbsp;{conversationWrap.channel.channelType !== ChannelTypePerson ? typing?.fromName : ""}正在输入</div>
    }

    lastContent(conversationWrap: ConversationWrap) {
        if (!conversationWrap.lastMessage) {
            return
        }
        const draft = conversationWrap.remoteExtra.draft
        if(draft && draft!=="") {
            return draft
        }
        // 检查是否有进行中的 AI 折叠 session
        const foldPreview = ConversationVM.foldSessionPreview.get(conversationWrap.channel.getChannelKey())
        if (foldPreview) {
            return (
                <span className="wk-ai-collab-preview">
                    <span className="wk-ai-collab-tag">
                        <span className="wk-ai-collab-pulse" />
                        AI协作中
                    </span>
                    <span className="wk-ai-collab-text">{foldPreview.participants.join(' × ')} · {foldPreview.count}条</span>
                </span>
            )
        }
        const lastMessage = new MessageWrap(conversationWrap.lastMessage)
        if (lastMessage.isDeleted) {
            return ""
        }
        if (lastMessage.revoke) {
            return RevokeCell.tip(lastMessage)
        }
        if(lastMessage.flame) {
            return FlameMessageCell.tip(lastMessage)
        }
        if (lastMessage.channel.channelType === ChannelTypePerson) {
            return lastMessage.content?.conversationDigest
        } else {
            // 群组和子区频道都显示发送者名称
            let from = ""
            if (lastMessage.fromUID && lastMessage.fromUID !== "") {
                const fromChannel = new Channel(lastMessage.fromUID, ChannelTypePerson)
                const fromChannelInfo = WKSDK.shared().channelManager.getChannelInfo(fromChannel)
                if (fromChannelInfo) {
                    from = `${fromChannelInfo.title}: `
                } else {
                    WKSDK.shared().channelManager.fetchChannelInfo(fromChannel)
                }
            }

            return `${from}${lastMessage.content?.conversationDigest || ""}`
        }
    }

    getOnlineTip(channelInfo: ChannelInfo) {
        if (channelInfo.online) {
            return undefined
        }
        const nowTime = new Date().getTime() / 1000
        const btwTime = nowTime - channelInfo.lastOffline
        if (btwTime < 60) {
            return "刚刚"
        }
        return `${(btwTime / 60).toFixed(0)}分钟`
    }

    // 是否需要显示在线状态
    needShowOnlineStatus(channelInfo?: ChannelInfo) {
        if (!channelInfo) {
            return false
        }
        if (channelInfo.online) {
            return true
        }
        const nowTime = new Date().getTime() / 1000
        const btwTime = nowTime - channelInfo.lastOffline
        if (btwTime > 0 && btwTime < 60 * 60) { // 小于1小时才显示
            return true
        }
        return false
    }

    conversationItem(conversationWrap: ConversationWrap) {
        

        let channelInfo = conversationWrap.channelInfo
        if (!channelInfo) {
            WKSDK.shared().channelManager.fetchChannelInfo(conversationWrap.channel)
        }

        const avatarKey = WKApp.shared.getChannelAvatarTag(conversationWrap.channel);

        const { select, onClick } = this.props
        const typing = TypingManager.shared.getTyping(conversationWrap.channel)
        const selected = select && select.isEqual(conversationWrap.channel)
        const isThread = conversationWrap.channel.channelType === ChannelTypeCommunityTopic
        return <div key={conversationWrap.channel.getChannelKey()} onClick={() => {
            if (onClick) {
                onClick(conversationWrap)
            }
        }} className={classNames("wk-conversationlist-item", selected ? "wk-conversationlist-item-selected" : undefined, channelInfo?.top ? "wk-conversationlist-item-top" : undefined, conversationWrap.unread > 0 ? "wk-conversationlist-item-unread" : undefined, isThread ? "wk-conversationlist-item-thread" : undefined)} onContextMenu={(e) => {
            this._handleContextMenu(conversationWrap, e)
        }}>
            <div className="wk-conversationlist-item-content">
                {/* 子区不显示左侧图标区域 */}
                {!isThread && (
                    <div className="wk-conversationlist-item-left">
                        <div className="wk-conversationlist-item-avatar-box">
                            <WKAvatar channel={conversationWrap.channel} key={avatarKey}></WKAvatar>
                            {channelInfo && this.needShowOnlineStatus(channelInfo) ? <OnlineStatusBadge tip={this.getOnlineTip(channelInfo)}></OnlineStatusBadge> : undefined}
                        </div>
                    </div>
                )}
                <div className="wk-conversationlist-item-right">
                    <div className="wk-conversationlist-item-right-first-line">
                        <div className="wk-conversationlist-item-name">
                            <h3>
                                {conversationWrap.channel.channelType === ChannelTypeCommunityTopic && <span className="wk-thread-prefix">#</span>}
                                {channelInfo?.orgData.displayName}
                            </h3>
                            {channelInfo?.orgData?.robot === 1 && <AiBadge />}
                            {
                                channelInfo?.orgData.identityIcon ? <img style={{ "width": channelInfo?.orgData?.identitySize.width, "height": channelInfo?.orgData?.identitySize.height }} src={channelInfo?.orgData.identityIcon}></img> : undefined
                            }
                            <div style={{ "width": "14px", height: "14px", "display": "flex", "alignItems": "center" }}>
                                {
                                    channelInfo?.mute && <svg className="icon" viewBox="0 0 1131 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2755" width="14" height="14"><path d="M914.688 892.736L64 236.224l38.784-50.88L271.36 315.648a300.288 300.288 0 0 1 246.976-157.952v-33.28c0-16.64 13.504-30.08 30.08-30.08h2.304c16.576 0 30.08 13.44 30.08 30.08v32.96a299.776 299.776 0 0 1 284.928 299.136v294.272l45.504 58.624 48.768 37.696-45.312 45.632zM234.624 480.384l506.88 391.232H140.416l94.272-121.536-0.064-269.696z" fill="#bfbfbf" p-id="2756"></path></svg>
                                }

                            </div>
                            <div className="wk-conversationlist-item-time">
                                <span>{getTimeStringAutoShort2(conversationWrap.timestamp * 1000, true)}</span>
                            </div>
                        </div>

                    </div>
                    <div className="wk-conversationlist-item-right-second-line">
                        <div className="wk-conversationlist-item-lastmsg">
                            {
                                !typing?<label className="wk-reminder" style={{ display: conversationWrap.remoteExtra.draft  ? undefined : 'none' }}>[草稿]</label>:undefined
                            }
                            {
                                conversationWrap.simpleReminders && !typing &&  conversationWrap.simpleReminders.length>0 ?(
                                    conversationWrap.simpleReminders.filter((r)=>r.done === false).map((r)=>{
                                        return   <label key={r.reminderID} className="wk-reminder">{r.text}</label>
                                    })
                                ):undefined
                            }
                            {
                                typing ? this._getTypingUI(conversationWrap) : this.lastContent(conversationWrap)
                            }

                        </div>
                        <div className="wk-conversationlist-item-reddot">
                            {
                                conversationWrap.unread > 0 ? <Badge style={channelInfo?.mute ? { "border": "none", "backgroundColor": "var(--semi-color-text-2)" } : { "border": "none", "backgroundColor": "var(--wk-brand-primary)" }} count={conversationWrap.unread} type='danger'></Badge> : undefined
                            }
                        </div>
                    </div>
                </div>
            </div>
        </div>
    }

    onTop(channelInfo: ChannelInfo) {
        ChannelSettingManager.shared.top(!channelInfo.top, channelInfo.channel)
    }

    onMute(channelInfo: ChannelInfo) {
        ChannelSettingManager.shared.mute(!channelInfo.mute, channelInfo.channel)
    }

    onCloseChat(channel: Channel) { // 关闭聊天
        WKApp.conversationProvider.deleteConversation(channel)
    }

    async onClearMessages(channel: Channel) {
        if(this.props.onClearMessages) {
            this.props.onClearMessages(channel)
        }
    }

    filterConversation(conv: ConversationWrap): boolean {
        const filter = this.props.filter ?? 'all'
        if (filter === 'all') return true
        const channelInfo = conv.channelInfo
        // 群组和子区频道都归类到 group 过滤器
        if (filter === 'group') return conv.channel.channelType === ChannelTypeGroup || conv.channel.channelType === ChannelTypeCommunityTopic
        if (filter === 'ai') {
            if (conv.channel.channelType !== ChannelTypePerson) return false
            // channelInfo 未加载时隐藏，等 channelInfoListener 触发重渲后再显示
            if (!channelInfo) return false
            return channelInfo.orgData?.robot === 1
        }
        if (filter === 'human') {
            if (conv.channel.channelType !== ChannelTypePerson) return false
            // channelInfo 未加载时暂时归入 human，channelInfoListener 更新后自动修正
            if (!channelInfo) return true
            return channelInfo.orgData?.robot !== 1
        }
        return true
    }

    // 将子区放在父群组后面，最多显示2个，超出部分用计数表示
    private groupThreadsWithParent(convs: ConversationWrap[]): Array<ConversationWrap | { type: 'thread-overflow'; parentGroupId: string; count: number }> {
        const MAX_VISIBLE_THREADS = 2

        // 分离群组和子区
        const threads: ConversationWrap[] = []

        for (const conv of convs) {
            if (conv.channel.channelType === ChannelTypeCommunityTopic) {
                threads.push(conv)
            }
        }

        // 按父群组分组子区
        const threadsByParent = new Map<string, ConversationWrap[]>()
        for (const thread of threads) {
            const parentGroupNo = thread.channelInfo?.orgData?.parentGroupNo
            if (parentGroupNo) {
                const list = threadsByParent.get(parentGroupNo) || []
                list.push(thread)
                threadsByParent.set(parentGroupNo, list)
            }
        }

        // 重新组织：群组后面跟着其子区（最多2个）
        const result: Array<ConversationWrap | { type: 'thread-overflow'; parentGroupId: string; count: number }> = []
        const usedThreads = new Set<string>()

        for (const conv of convs) {
            if (conv.channel.channelType === ChannelTypeCommunityTopic) {
                // 子区会在父群组后面添加，这里跳过
                continue
            }
            result.push(conv)
            // 如果是群组，添加其子区（最多2个）
            if (conv.channel.channelType === ChannelTypeGroup) {
                const groupThreads = threadsByParent.get(conv.channel.channelID) || []
                const visibleThreads = groupThreads.slice(0, MAX_VISIBLE_THREADS)
                const overflowCount = groupThreads.length - MAX_VISIBLE_THREADS

                for (const thread of visibleThreads) {
                    result.push(thread)
                    usedThreads.add(thread.channel.channelID)
                }

                // 如果有超出的子区，添加溢出提示
                if (overflowCount > 0) {
                    result.push({
                        type: 'thread-overflow',
                        parentGroupId: conv.channel.channelID,
                        count: overflowCount
                    })
                }
            }
        }

        // 添加没有找到父群组的子区（父群组不在会话列表中）
        for (const thread of threads) {
            if (!usedThreads.has(thread.channel.channelID)) {
                result.push(thread)
            }
        }

        return result
    }

    render() {
        const { conversations, select } = this.props
        const { selectConversationWrap } = this.state

        const filtered = conversations?.filter(c => this.filterConversation(c)) ?? []
        const pinned = filtered.filter(c => c.channelInfo?.top)
        const recent = filtered.filter(c => !c.channelInfo?.top)

        // 将子区放在父群组后面（最多显示2个）
        const groupedPinned = this.groupThreadsWithParent(pinned)
        const groupedRecent = this.groupThreadsWithParent(recent)

        const { onThreadOverflowClick } = this.props
        const renderItem = (item: ConversationWrap | { type: 'thread-overflow'; parentGroupId: string; count: number }) => {
            if ('type' in item && item.type === 'thread-overflow') {
                return (
                    <div
                        key={`overflow-${item.parentGroupId}`}
                        className="wk-conversationlist-thread-overflow"
                        onClick={() => onThreadOverflowClick?.(item.parentGroupId)}
                    >
                        <span>+{item.count} 个子区</span>
                    </div>
                )
            }
            return this.conversationItem(item as ConversationWrap)
        }

        return <div id="wk-conversationlist" className="wk-conversationlist" onScroll={this._handleScroll}>
            {/* 置顶区 */}
            {groupedPinned.length > 0 && <>
                <div className="wk-conv-section">置顶</div>
                {groupedPinned.map(renderItem)}
            </>}

            {/* 最近 */}
            {groupedRecent.length > 0 && <>
                {groupedPinned.length > 0 && <div className="wk-conv-section">最近</div>}
                {groupedRecent.map(renderItem)}
            </>}
        

            <ContextMenus onContext={(ctx) => {
                this.contextMenusContext = ctx
            }} menus={[
                {
                    title: selectConversationWrap?.channelInfo?.top ? "取消置顶" : "置顶", onClick: () => {
                        if (selectConversationWrap?.channelInfo) this.onTop(selectConversationWrap.channelInfo)
                    }
                },
                {
                    title: selectConversationWrap?.channelInfo?.mute ? "关闭免打扰" : "开启免打扰", onClick: () => {
                        if (selectConversationWrap?.channelInfo) this.onMute(selectConversationWrap.channelInfo)
                    }
                },
                {
                    title: "关闭聊天窗口", onClick: () => {
                        Modal.confirm({
                            title: '确认关闭',
                            content: '确定要关闭此聊天窗口吗？',
                            okText: '确定',
                            cancelText: '取消',
                            onOk: () => {
                                this.onCloseChat(selectConversationWrap?.channel!)
                            },
                        })
                    }
                },
                {
                    title: "清空聊天记录", onClick: () => {
                        Modal.confirm({
                            title: '确认清空',
                            content: '确定要清空所有聊天记录吗？此操作不可撤销。',
                            okText: '确定',
                            cancelText: '取消',
                            onOk: () => {
                                this.onClearMessages(selectConversationWrap?.channel!)
                            },
                        })
                    }
                },
                {
                    title: "关闭窗口并清空聊天记录", onClick: () => {
                        Modal.confirm({
                            title: '确认关闭并清空',
                            content: '确定要关闭窗口并清空所有聊天记录吗？此操作不可撤销。',
                            okText: '确定',
                            cancelText: '取消',
                            onOk: () => {
                                this.onCloseChat(selectConversationWrap?.channel!)
                                this.onClearMessages(selectConversationWrap?.channel!)
                            },
                        })
                    }
                },
            ]} />
        </div>
    }
}


interface OnlineStatusBadgeProps {
    tip?: string
}
export class OnlineStatusBadge extends Component<OnlineStatusBadgeProps> {

    render(): React.ReactNode {
        const { tip } = this.props
        return <div className={classNames("wk-onlinestatusbadge", !tip ? "wk-onlinestatusbadge-empty" : undefined)}>
            <div className="wk-onlinestatusbadge-content">
                <div className="wk-onlinestatusbadge-content-tip">{tip}</div>
            </div>
        </div>
    }
}