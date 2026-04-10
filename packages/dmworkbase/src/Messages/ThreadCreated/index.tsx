import { MessageContent, Channel, ChannelTypePerson } from "wukongimjssdk"
import React from "react"
import { Toast } from "@douyinfe/semi-ui"
import { MessageSquare } from "lucide-react"
import { MessageCell } from "../MessageCell"
import WKApp from "../../App"
import { ChannelTypeCommunityTopic } from "../../Service/Const"
import WKAvatar from "../../Components/WKAvatar"
import { getTimeStringAutoShort2 } from "../../Utils/time"
import { parseThreadChannelId } from "../../Service/Thread"
import "./index.css"

interface LastMessage {
  from_uid: string
  from_name: string
  content: string
  timestamp: number
}

interface Participant {
  uid: string
  name: string
}

export class ThreadCreatedContent extends MessageContent {
  content!: string
  from_uid!: string
  from_name!: string
  short_id!: string
  channel_id!: string
  channel_type!: number
  thread_name!: string
  message_count?: number
  last_message?: LastMessage
  participants?: Participant[]

  decodeJSON(contentObj: any) {
    this.content = contentObj["content"] || ""
    this.from_uid = contentObj["from_uid"] || ""
    this.from_name = contentObj["from_name"] || ""
    this.short_id = contentObj["short_id"] || ""
    this.channel_id = contentObj["channel_id"] || ""
    this.channel_type = contentObj["channel_type"] || ChannelTypeCommunityTopic
    this.thread_name = contentObj["thread_name"] || ""
    this.message_count = contentObj["message_count"]
    if (contentObj["last_message"]) {
      this.last_message = {
        from_uid: contentObj["last_message"]["from_uid"] || "",
        from_name: contentObj["last_message"]["from_name"] || "",
        content: contentObj["last_message"]["content"] || "",
        timestamp: contentObj["last_message"]["timestamp"] || 0,
      }
    }
    if (contentObj["participants"] && Array.isArray(contentObj["participants"])) {
      this.participants = contentObj["participants"].map((p: any) => ({
        uid: p.uid || "",
        name: p.name || "",
      }))
    }
  }

  get conversationDigest() {
    return `[子区] ${this.thread_name}`
  }
}

export class ThreadCreatedCell extends MessageCell {
  handleClick = async () => {
    const { message, context } = this.props
    const content = message.content as ThreadCreatedContent
    const threadInfo = parseThreadChannelId(content.channel_id)

    if (threadInfo) {
      try {
        // 先检查子区是否存在
        const resp = await WKApp.apiClient.get(
          `groups/${threadInfo.groupNo}/threads/${threadInfo.shortId}`
        )
        // status: 1=活跃, 2=归档, 3=删除
        if (resp.status === 3) {
          Toast.warning("该子区已删除")
          return
        }
        // 归档状态允许进入查看，但会在聊天界面禁用发送
      } catch (err: any) {
        Toast.warning("该子区已删除或不存在")
        return
      }
    }

    // 优先在右侧面板打开，如果不支持则跳转到独立会话
    if (context?.openThreadPanel) {
      context.openThreadPanel(content.channel_id, content.thread_name)
    } else {
      const channel = new Channel(content.channel_id, content.channel_type)
      WKApp.endpoints.showConversation(channel)
    }
  }

  render() {
    const { message } = this.props
    const content = message.content as ThreadCreatedContent
    const messageCount = content.message_count || 0
    const timeStr = content.last_message
      ? getTimeStringAutoShort2(content.last_message.timestamp * 1000, true)
      : getTimeStringAutoShort2(message.timestamp * 1000, true)

    // 参与者列表：优先使用 participants，回退到 last_message 发送者
    let participantUids: string[] = []
    if (content.participants && content.participants.length > 0) {
      participantUids = content.participants.slice(0, 3).map(p => p.uid)
    } else if (content.last_message?.from_uid) {
      participantUids = [content.last_message.from_uid]
    }

    return (
      <div className="wk-thread-created" onClick={this.handleClick}>
        {/* 消息图标 */}
        <MessageSquare className="wk-thread-created-icon" size={16} />

        {/* 文案：xxx 发起了子区: xxx */}
        <span className="wk-thread-created-text">
          <span className="wk-thread-created-creator">{content.from_name || '用户'}</span>
          <span className="wk-thread-created-label"> 发起了子区: </span>
          <span className="wk-thread-created-name">{content.thread_name}</span>
        </span>

        {/* 参与者头像（最多3个） */}
        {participantUids.length > 0 && (
          <div className="wk-thread-created-avatars">
            {participantUids.map((uid, idx) => (
              <WKAvatar
                key={uid}
                channel={new Channel(uid, ChannelTypePerson)}
                style={{
                  width: 18,
                  height: 18,
                  fontSize: 9,
                  borderRadius: '50%',
                  marginLeft: idx > 0 ? -6 : 0,
                  border: '1.5px solid var(--wk-bg-surface)',
                }}
              />
            ))}
          </div>
        )}

        {/* 回复数 */}
        {messageCount > 0 && (
          <span className="wk-thread-created-count">{messageCount}条回复</span>
        )}

        {/* 时间 */}
        <span className="wk-thread-created-dot">·</span>
        <span className="wk-thread-created-time">{timeStr}</span>
      </div>
    )
  }
}
