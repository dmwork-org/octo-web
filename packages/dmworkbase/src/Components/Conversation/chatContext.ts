import { t } from "../../i18n"

const ChannelTypeGroup = 2
const ChannelTypePerson = 1
const ChannelTypeCommunityTopic = 5

export interface ChatContextMember {
    uid: string
    name?: string
    remark?: string
    isDeleted?: number
}

export interface ChatContextMessage {
    fromUID: string
    from?: { title?: string }
    content?: { text?: string }
}

export interface ChatContextChannelInfo {
    title?: string
    orgData?: { remark?: string }
}

export interface ChatContextResult {
    memberContext?: string   // "聊天成员：Alice,Bob" — undefined for DM
    chatContext?: string     // "[channel label]\n[Alice]: hi\n[Bob]: hello"
    channelType?: number     // pass-through for VoiceService to send as channel_type
}

export function buildChatContext(params: {
    messages: ChatContextMessage[]
    subscribers: ChatContextMember[]
    channelType: number
    loginUID: string
    channelInfo?: ChatContextChannelInfo | null
    groupName?: string
    threadName?: string
}): ChatContextResult {
    const { messages, subscribers, channelType, loginUID, channelInfo, groupName, threadName } = params
    const names: string[] = []

    const result: ChatContextResult = {
        channelType: channelType,
    }

    let channelLabel = ''
    if (channelType === ChannelTypePerson) {
        const peerName = channelInfo?.title?.trim() || channelInfo?.orgData?.remark?.trim() || ''
        if (peerName) {
            channelLabel = t("base.chatContext.direct", { values: { name: peerName } })
        }
    } else if (channelType === ChannelTypeCommunityTopic) {
        const parts: string[] = []
        if (groupName) parts.push(t("base.chatContext.group", { values: { name: groupName } }))
        if (threadName) parts.push(t("base.chatContext.thread", { values: { name: threadName } }))
        channelLabel = parts.join('- ') || ''

        if (subscribers.length <= 100) {
            for (const sub of subscribers) {
                if (sub.uid === loginUID) continue
                if (sub.isDeleted) continue
                if (sub.name?.trim()) names.push(sub.name)
                if (sub.remark?.trim() && sub.remark !== sub.name) {
                    names.push(sub.remark)
                }
            }
        } else {
            const activeUIDs = new Set<string>()
            for (let i = messages.length - 1; i >= 0 && activeUIDs.size < 100; i--) {
                const uid = messages[i].fromUID
                if (uid && uid !== loginUID) {
                    activeUIDs.add(uid)
                }
            }
            for (const sub of subscribers) {
                if (activeUIDs.has(sub.uid) && !sub.isDeleted) {
                    if (sub.name?.trim()) names.push(sub.name)
                    if (sub.remark?.trim() && sub.remark !== sub.name) {
                        names.push(sub.remark)
                    }
                }
            }
        }
    } else {
        if (groupName) {
            channelLabel = t("base.chatContext.group", { values: { name: groupName } })
        }

        if (channelType === ChannelTypeGroup) {
            if (subscribers.length <= 100) {
                for (const sub of subscribers) {
                    if (sub.uid === loginUID) continue
                    if (sub.isDeleted) continue
                    if (sub.name?.trim()) names.push(sub.name)
                    if (sub.remark?.trim() && sub.remark !== sub.name) {
                        names.push(sub.remark)
                    }
                }
            } else {
                const activeUIDs = new Set<string>()
                for (let i = messages.length - 1; i >= 0 && activeUIDs.size < 100; i--) {
                    const uid = messages[i].fromUID
                    if (uid && uid !== loginUID) {
                        activeUIDs.add(uid)
                    }
                }
                for (const sub of subscribers) {
                    if (activeUIDs.has(sub.uid) && !sub.isDeleted) {
                        if (sub.name?.trim()) names.push(sub.name)
                        if (sub.remark?.trim() && sub.remark !== sub.name) {
                            names.push(sub.remark)
                        }
                    }
                }
            }
        }
    }

    if (channelType !== ChannelTypePerson) {
        const uniqueNames = [...new Set(names)]
        if (uniqueNames.length > 0) {
            result.memberContext = t("base.chatContext.members", {
                values: { names: uniqueNames.join(",") },
            })
        }
    }

    const chatLines: string[] = []

    if (channelLabel) {
        chatLines.push(channelLabel)
    }

    if (messages && messages.length > 0) {
        const last10 = messages.slice(-10)
        for (const m of last10) {
            const senderName = m.from?.title || m.fromUID
            const text = m.content?.text || ''
            chatLines.push(`[${senderName}]: ${text}`)
        }
    }

    if (chatLines.length > 0) {
        result.chatContext = chatLines.join('\n')
    }

    return result
}
