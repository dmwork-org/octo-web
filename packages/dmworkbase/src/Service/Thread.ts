import { ChannelTypeCommunityTopic } from './Const'
export interface Thread {
  short_id: string
  group_no: string
  channel_id: string
  channel_type: number
  name: string
  creator_uid: string
  creator_name?: string
  source_message_id?: number
  status: number  // 1=活跃, 2=归档, 3=删除
  created_at: string
  updated_at: string
  is_member?: boolean  // 当前用户是否是成员
  member_count?: number  // 成员数量
  message_count?: number  // 消息数量
  unread_count?: number  // 未读数量
  last_message_content?: string  // 最后一条消息内容
  last_message_sender_name?: string  // 最后一条消息发送者名称

  // GROUP.md 相关
  has_thread_md?: boolean
  thread_md_version?: number
  thread_md_updated_at?: string

  // 补齐后端已有字段
  group_name?: string
  last_message_at?: string
}

export enum ThreadStatus {
  Active = 1,
  Archived = 2,
  Deleted = 3,
}

export const ThreadChannelIdSeparator = '____'

export function parseThreadChannelId(channelId: string): { groupNo: string; shortId: string } | null {
  const parts = channelId.split(ThreadChannelIdSeparator)
  if (parts.length !== 2) {
    return null
  }
  return { groupNo: parts[0], shortId: parts[1] }
}

export function buildThreadChannelId(groupNo: string, shortId: string): string {
  return `${groupNo}${ThreadChannelIdSeparator}${shortId}`
}

/** 从 pendingThread 等数据快速构造 Thread 存根（非完整数据，仅用于 UI 导航） */
export function buildThreadStub(shortId: string, groupNo: string, channelId: string, name: string): Thread {
  return {
    short_id: shortId,
    group_no: groupNo,
    channel_id: channelId,
    channel_type: ChannelTypeCommunityTopic,
    name,
    creator_uid: "",
    status: 1,
    created_at: "",
    updated_at: "",
  }
}
