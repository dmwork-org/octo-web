import {
  Channel,
  ChannelTypeGroup,
  ChannelTypePerson,
  ConversationAction,
  WKSDK,
  Mention,
  Message,
  MessageContent,
  Reminder,
  ReminderType,
  Reply,
  MessageText,
  MessageContentType,
  MediaMessageContent,
  TaskStatus,
  MessageTask,
  MessageStatus,
} from "wukongimjssdk";
import React, { Component, HTMLProps } from "react";

import moment from "moment";
import Provider from "../../Service/Provider";
import ConversationVM from "./vm";
import "./index.css";
import { EmojiInfo, MentionInfo } from "../../Messages/Text/MarkdownContent";
import MarkdownContent from "../../Messages/Text/MarkdownContent";
import { MessageWrap, Part, PartType } from "../../Service/Model";
import WKApp from "../../App";
import { RevokeCell } from "../../Messages/Revoke";
import {
  MessageContentTypeConst,
  ChannelTypeCommunityTopic,
} from "../../Service/Const";
import ConversationContext from "./context";
import { subscriberDisplayName } from "../../Utils/displayName";
import {
  buildMessageMentions as buildMentionRenderInfo,
  readMentionFlags,
} from "../../Utils/mentionRender";
import MessageInput, {
  MentionModel,
  MessageInputContext,
  EditorContentBlock,
} from "../MessageInput";
import { BotCommand } from "../SlashCommandMenu";
import ContextMenus, { ContextMenusContext } from "../ContextMenus";
import classNames from "classnames";
import WKAvatar from "../WKAvatar";
import AiBadge from "../AiBadge";
import { IconClose, IconEdit, IconReply } from "@douyinfe/semi-icons";
import { Toast, Spin } from "@douyinfe/semi-ui";
import { wkConfirm } from "../WKModal";
import { FlameMessageCell } from "../../Messages/Flame";
import FoldSessionCard, { FoldSessionCardParticipant } from "./FoldSessionCard";
import { BeatLoader } from "react-spinners";
import { ConversationRenderItem, FoldSessionViewModel } from "./vm";
import {
  getFoldSessionSummaryState,
  isFoldSessionSummaryMessage,
} from "./foldSessionSummary";
import {
  shouldPulldownOnWheel,
  TOP_HISTORY_TRIGGER_OFFSET,
} from "./historyScroll";
import {
  FileContent,
  formatFileSize,
  getFileIconInfo,
  getExtension,
  resolveSafeFileUrl,
} from "../../Messages/File";
import { ImageContent } from "../../Messages/Image";
import { downloadFile } from "../../Utils/download";
import Lightbox from "yet-another-react-lightbox";
import Download from "yet-another-react-lightbox/plugins/download";
import { buildChatContext, ChatContextChannelInfo } from "./chatContext";
import { shouldClearDraftAfterSend } from "../../Utils/draftLifecycle";
import {
  isSuccessfulSendAck,
  messageStatusWaitResult,
  taskStatusWaitResult,
} from "../../Utils/sendWaitResult";
import { parseThreadChannelId } from "../../Service/Thread";
import FoldSessionExpandedList from "./FoldSessionExpandedList";
import VoiceFeedback from "../../Service/VoiceFeedback";
import { precheckUploadCredentials } from "../../Service/UploadCredentials";
import { isMessageSelectable } from "../../Service/messageSelection";
import { I18nContext, t } from "../../i18n";

/**
 * 取消息的有效内容：如果消息被编辑过，返回编辑后的 contentEdit；否则返回原始 content
 */
function getEffectiveContent(message: Message): MessageContent {
  if (message.remoteExtra?.isEdit && message.remoteExtra?.contentEdit) {
    return message.remoteExtra.contentEdit;
  }
  return message.content;
}

/**
 * 从消息 content 里提取附件信息 (file_name + file_url), 供
 * POST /matters/extract 和 POST /matters/:id/timeline 使用。
 *
 * 覆盖的 content type (对齐 Service/Const.ts MessageContentTypeConst):
 *   - 文件 (8): FileContent { name, url, extension }
 *   - 图片 (2): ImageContent { name?, url } — 没 name 时合成 'image.{ext}'
 *   - 语音 (4): VoiceContent { url } — 合成 'voice.amr'
 *   - 小视频 (5): VideoContent { url } — 合成 'video.mp4'
 * 其它类型 (文本/卡片/gif/合并转发/系统消息等) 不返回附件, 因为它们要么没有
 * 文件 URL, 要么语义上不是 "消息附件"。
 *
 * 返回空数组, 不返回 null/undefined — 让调用方可以直接传给后端
 * (后端 json binding 接受空数组)。
 */
function extractMessageAttachments(
  m: Message | undefined | null,
): { file_name: string; file_url: string }[] {
  if (!m || !m.content) return [];
  const contentType = (m.content as { contentType?: number }).contentType;
  const anyContent = m.content as Record<string, unknown>;
  const url = typeof anyContent.url === "string" ? (anyContent.url as string) : "";
  // remoteUrl 是 MediaMessageContent 在 decode 后设置的真实 CDN URL, 优先用
  const remoteUrl =
    typeof anyContent.remoteUrl === "string"
      ? (anyContent.remoteUrl as string)
      : "";
  const effectiveUrl = remoteUrl || url;
  if (!effectiveUrl) return [];

  const explicitName =
    typeof anyContent.name === "string" ? (anyContent.name as string) : "";

  switch (contentType) {
    case MessageContentTypeConst.file: {
      // 文件: 用真实文件名; 兜底合成
      const ext =
        typeof anyContent.extension === "string"
          ? (anyContent.extension as string)
          : "";
      const fallback = ext ? `file.${ext}` : "file";
      return [{ file_name: explicitName || fallback, file_url: effectiveUrl }];
    }
    case MessageContentTypeConst.image: {
      // 图片一般没 name, 用 URL 末尾的文件名, 失败就合成 image.jpg
      return [
        {
          file_name: explicitName || guessFileNameFromUrl(effectiveUrl, "image.jpg"),
          file_url: effectiveUrl,
        },
      ];
    }
    case MessageContentTypeConst.voice:
      return [
        {
          file_name: guessFileNameFromUrl(effectiveUrl, "voice.amr"),
          file_url: effectiveUrl,
        },
      ];
    case MessageContentTypeConst.smallVideo:
      return [
        {
          file_name: guessFileNameFromUrl(effectiveUrl, "video.mp4"),
          file_url: effectiveUrl,
        },
      ];
    default:
      return [];
  }
}

function guessFileNameFromUrl(url: string, fallback: string): string {
  try {
    const u = new URL(url, "http://x"); // 允许相对路径
    const parts = u.pathname.split("/");
    const last = parts[parts.length - 1];
    // 必须有真正的文件名 (带扩展名), 否则用 fallback
    if (last && last.includes(".")) return last;
  } catch {
    // ignore
  }
  return fallback;
}

/**
 * 从 WuKongIM Message 对象解析发送人的展示名。
 *
 * WuKongIM SDK 的 Message 只带 fromUID, 不带 fromName; name 必须前端自己解析。
 * 参考 useMessageRow.ts + Messages/Base/index.tsx 的群成员名字解析路径:
 *
 *   1. 群消息: 从 channelManager.getSubscribes(groupChannel) 拉群成员列表,
 *      按 uid 匹配后用 subscriberDisplayName (remark > real_name > name)
 *      — 群内用户大概率没开过 1v1, Person channelInfo 缓存常 miss,
 *      群成员列表缓存命中率高得多, 是主路径
 *   2. fallback: Person channelInfo.title (用户真开过 1v1 时才有)
 *   3. 最终兜底: 空串 (后端 from_uname optional)
 *
 * 注意: 这是同步函数, 不做 fetch; 拿不到就返回空。
 * 后端 LLM 接收到空 from_uname 时会用 from_uid 代替, 不会致命。
 */
function resolveFromUName(m: Message | undefined | null): string {
  if (!m || !m.fromUID) return "";
  const fromUID = m.fromUID;

  // 1. 优先从群成员列表拿 (群聊场景命中率最高)
  try {
    const ch = m.channel;
    if (ch && ch.channelType === ChannelTypeGroup) {
      const subs = WKSDK.shared().channelManager.getSubscribes(ch) as
        | { uid?: string; name?: string; remark?: string; orgData?: Record<string, unknown> }[]
        | null
        | undefined;
      const member = subs?.find((s) => s && s.uid === fromUID);
      if (member) {
        const name = subscriberDisplayName(member);
        if (name) return name;
      }
    }
  } catch {
    // channelManager 未初始化 / 缓存 miss, 降级
  }

  // 2. Person channelInfo 兜底
  try {
    const info = WKSDK.shared()
      .channelManager.getChannelInfo(new Channel(fromUID, ChannelTypePerson));
    if (info?.title) return info.title;
  } catch {
    // ignore
  }

  return "";
}

const foldSessionAvatarIcon = new URL(
  "./fold-session-avatar.svg",
  import.meta.url,
).href;

const FoldImage: React.FC<{ src: string }> = ({ src }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="wk-fold-img" onClick={() => setOpen(true)}>
      <img src={src} alt="" />
      <Lightbox
        open={open}
        close={() => setOpen(false)}
        slides={[{ src, alt: "", download: src }]}
        plugins={[Download]}
        carousel={{ finite: true }}
        controller={{ closeOnBackdropClick: true }}
        render={{ buttonPrev: () => null, buttonNext: () => null }}
      />
    </div>
  );
};

export interface ConversationProps {
  channel: Channel;
  chatBg?: string; // 聊天背景
  shouldShowHistorySplit?: boolean;
  initLocateMessageSeq?: number;
  onContext?: (ctx: ConversationContext) => void;
  onOpenThreadPanel?: (threadChannelId: string, threadName: string) => void;
  onSelectionStateChange?: (state: {
    editOn: boolean;
    checkedCount: number;
  }) => void;
  /** 展示在输入框上方的轻量提示。 */
  inputNotice?: React.ReactNode;
  /** 当前会话发送完成后的回调。 */
  onMessageSent?: () => void;
  /** 当前正在预览的文件消息 ID（用于文件卡片激活态） */
  activePreviewMessageId?: string | null;
}

const ConversationSelectionStateBridge: React.FC<{
  editOn: boolean;
  checkedCount: number;
  onChange?: (state: { editOn: boolean; checkedCount: number }) => void;
}> = ({ editOn, checkedCount, onChange }) => {
  React.useEffect(() => {
    if (onChange) {
      onChange({ editOn, checkedCount });
    }
  }, [checkedCount, editOn]);
  return null;
};

interface ConversationState {
  inputExpanded: boolean;
  contextMenuMessageID: string | null;
}

export class Conversation
  extends Component<ConversationProps, ConversationState>
  implements ConversationContext
{
  static contextType = I18nContext;
  declare context: React.ContextType<typeof I18nContext>;

  // 缓存各会话的引用/回复状态，切换会话时保留
  private static replyStateCache: Map<
    string,
    { message: Message; handlerType: number }
  > = new Map();
  private static readonly REPLY_STATE_CACHE_MAX_SIZE = 50;
  vm!: ConversationVM;
  contextMenusContext!: ContextMenusContext;
  avatarMenusContext!: ContextMenusContext; // 点击头像弹出的菜单
  _messageInputContext!: MessageInputContext;
  private _pendingInsertText?: string;
  private _pendingRestoreDraft?: string;
  scrollTimer: number | null = null;
  updateBrowseToMessageSeqAndReminderDoneing: boolean = false;
  private _dragFileCallback?: (file: File) => void;
  private _cachedSelectedText: string | null = null;
  private _beforeUnloadHandler: () => void;
  private _matterSendMessageHandler?: (data: {
    channelId: string;
    channelType: number;
  }) => void;
  private _guardId: symbol = Symbol("pendingAttachmentGuard");
  private draftSaveGeneration = 0;
  private latestSavedDraft = "";
  private _addAttachmentFn?: (
    files: File[],
    source?: "paste" | "upload",
  ) => void;
  private onOpenThreadPanel?: (
    threadChannelId: string,
    threadName: string,
  ) => void;

  constructor(props: any) {
    super(props);
    this.state = {
      inputExpanded: false,
      contextMenuMessageID: null as string | null,
    };
    this.onOpenThreadPanel = props.onOpenThreadPanel;
    this._beforeUnloadHandler = () => {
      // Use sendBeacon for reliable delivery during page unload
      if (this.vm && this.vm.needSetUnread) {
        const apiURL = WKApp.apiClient.config.apiURL;
        const url = `${apiURL}conversation/clearUnread`;
        const data = JSON.stringify({
          channel_id: this.props.channel.channelID,
          channel_type: this.props.channel.channelType,
          unread: this.vm.unreadCount > 0 ? this.vm.unreadCount : 0,
        });
        const token = WKApp.loginInfo.token || "";
        fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json", token: token },
          body: data,
          keepalive: true,
        });
      }
      this.dealloc();
    };
  }

  async sendMessage(
    content: MessageContent,
    channel?: Channel,
  ): Promise<Message> {
    // const { channel } = this.props
    let c = channel;
    if (!c) {
      c = this.props.channel;
    }
    const message = await this.vm.sendMessage(content, c);
    return message;
  }

  fowardMessageUI(message: Message): void {
    WKApp.shared.baseContext.showConversationSelect((channels: Channel[]) => {
      const cloneContent = getEffectiveContent(message);
      for (const channel of channels) {
        this.sendMessage(cloneContent, channel);
      }
    });
  }
  openThreadPanel(threadChannelId: string, threadName: string): void {
    this.onOpenThreadPanel?.(threadChannelId, threadName);
  }
  getActivePreviewMessageId(): string | null {
    return this.props.activePreviewMessageId ?? null;
  }
  replyToMessageId(messageId: string): void {
    const messageWrap = this.vm.findMessageWithMessageID(messageId);
    if (messageWrap) {
      this.reply(messageWrap.message, 1);
    }
  }

  private addReplyMention(fromUID: string): void {
    if (
      this.props.channel.channelType === ChannelTypePerson ||
      fromUID === WKApp.loginInfo.uid
    ) {
      return;
    }
    const channelInfo = WKSDK.shared().channelManager.getChannelInfo(
      new Channel(fromUID, ChannelTypePerson),
    );
    this._messageInputContext?.addMention(fromUID, channelInfo?.title || "");
  }

  replyToFileMessage(info: {
    messageId: string;
    messageSeq: number;
    fromUID: string;
    conversationDigest: string;
    channelId: string;
    channelType: number;
  }): void {
    // 首先尝试从当前消息列表中查找（如果找到则使用完整信息）
    const messageWrap = this.vm.findMessageWithMessageID(info.messageId);
    if (messageWrap) {
      this.reply(messageWrap.message, 1);
      return;
    }

    // 消息不在当前列表中，使用传入的信息构造 Message 对象
    // 用于设置回复状态
    const channel = new Channel(info.channelId, info.channelType);
    // 使用 MessageText 作为 content，它有正确的 encode() 方法
    // SDK 在序列化 reply.content 时会调用 content.encode()，普通对象没有这个方法会导致回复内容丢失
    // MessageText 的 conversationDigest getter 返回的就是 text，所以传入 conversationDigest 作为 text 即可
    // 注意：MessageText 的 contentType 是文本类型，与原始消息类型可能不同，但 ReplyView 只读取 conversationDigest，所以不影响显示
    // Message 构造函数会将 remoteExtra 默认初始化为空的 MessageExtra，不会导致 isEdit 为 truthy
    const fakeMessage = new Message();
    fakeMessage.messageID = info.messageId;
    fakeMessage.messageSeq = info.messageSeq;
    fakeMessage.fromUID = info.fromUID;
    fakeMessage.channel = channel;
    fakeMessage.content = new MessageText(info.conversationDigest);

    this.addReplyMention(info.fromUID);

    // 设置回复状态
    this.vm.currentHandlerType = 1;
    this.vm.currentReplyMessage = fakeMessage;
    // 自动聚焦输入框
    this._messageInputContext?.focus();
  }
  async resendMessage(message: Message): Promise<Message> {
    await this.vm.deleteMessagesFromLocal([message]);
    const newMessage = await this.vm.sendMessage(
      message.content,
      message.channel,
    );
    return newMessage;
  }

  /**
   * 发送媒体消息并等待上传完成 + 服务端 ack 后才返回。
   * 保证多条消息严格顺序发送，且本地回显排序正确（每条消息的 messageSeq 确定后再发下一条）。
   * 超时 30s 自动 resolve（避免网络断开时永久阻塞）。
   */
  private async sendMediaAndWait(
    content: MessageContent,
    channel?: Channel,
  ): Promise<boolean> {
    // 非媒体消息（或无文件需上传）无需等待上传，直接发送并等 ack
    if (
      !(content instanceof MediaMessageContent) ||
      !(content as MediaMessageContent).file
    ) {
      return this.sendTextAndWaitAck(content, channel);
    }

    const TIMEOUT = 30_000;
    let settled = false;
    let clientSeq: number | null = null;
    let ackSucceeded = false;
    let uploadSucceeded = false;

    const { promise, resolve } = (() => {
      let res: (sent: boolean) => void;
      const p = new Promise<boolean>((r) => {
        res = r;
      });
      return { promise: p, resolve: res! };
    })();

    const done = (sent: boolean) => {
      if (settled) return;
      settled = true;
      pendingAcks = []; // 释放暂存引用
      queueMicrotask(() => {
        WKSDK.shared().taskManager.removeListener(taskListener);
        WKSDK.shared().chatManager.removeMessageStatusListener(ackListener);
      });
      clearTimeout(timer);
      resolve(sent);
    };

    const timer = setTimeout(() => done(false), TIMEOUT);

    // ── 所有 listener 在 sendMessage 之前注册，避免快速完成时错过事件 ──

    const markUploadSuccess = () => {
      uploadSucceeded = true;
      if (ackSucceeded) {
        done(true);
      }
    };

    const taskListener = (task: any) => {
      if (settled) return;
      if (
        task instanceof MessageTask &&
        clientSeq !== null &&
        task.message.clientSeq === clientSeq &&
        (task.status === TaskStatus.success || task.status === TaskStatus.fail)
      ) {
        if (task.status === TaskStatus.fail) {
          done(false);
          return;
        }
        markUploadSuccess();
      }
    };
    WKSDK.shared().taskManager.addListener(taskListener);

    let pendingAcks: any[] = [];
    const ackListener = (ackPacket: any) => {
      if (settled) return;
      if (clientSeq === null) {
        pendingAcks.push(ackPacket);
        return;
      }
      if (ackPacket.clientSeq === clientSeq) {
        if (!isSuccessfulSendAck(ackPacket)) {
          done(false);
          return;
        }
        ackSucceeded = true;
        if (uploadSucceeded) {
          done(true);
        }
      }
    };
    WKSDK.shared().chatManager.addMessageStatusListener(ackListener);

    // 发送消息（内部会 addTask → task.start()，所有 listener 已就绪）
    let message: Message;
    try {
      message = await this.sendMessage(content, channel);
    } catch (err) {
      done(false);
      throw err;
    }
    clientSeq = message.clientSeq;

    // sendMessage 返回后主动检查
    if (!settled) {
      const taskMap = (WKSDK.shared().taskManager as any).taskMap as
        | Map<string, { status: TaskStatus }>
        | undefined;
      const task = taskMap?.get(message.clientMsgNo);
      const taskResult = taskStatusWaitResult(
        task?.status,
        TaskStatus.success,
        TaskStatus.fail,
      );
      if (taskResult === false) {
        done(false);
      }
      if (!settled && taskResult === true) {
        markUploadSuccess();
      }

      // 检查暂存的 ack（ack 在 clientSeq 赋值前到达的情况）
      const found = pendingAcks.some((p) => p.clientSeq === clientSeq);
      const matchedAck = pendingAcks.find((p) => p.clientSeq === clientSeq);
      pendingAcks = []; // 立即释放无关 ack 引用
      if (found) {
        if (!isSuccessfulSendAck(matchedAck)) {
          done(false);
        } else {
          ackSucceeded = true;
          if (uploadSucceeded) {
            done(true);
          }
        }
      }
      // 最终 fallback：检查 message.status（VM 可能已经处理了 ack）
      const statusResult = messageStatusWaitResult(
        message.status,
        MessageStatus.Normal,
        MessageStatus.Fail,
      );
      if (!settled && statusResult === false) {
        done(false);
      }
      if (!settled && statusResult === true) {
        ackSucceeded = true;
        if (uploadSucceeded) done(true);
      }
    }

    return promise;
  }

  /**
   * 发送文本消息并等待服务端 ack 回来后才返回。
   * 用于连续发送多条消息时保证本地回显顺序与服务端一致：
   * 每条消息拿到 messageSeq 后 order 被正确设置，再发下一条时 fillOrder 不会乱。
   * 超时 10s 自动 resolve（文本消息不需要上传，ack 应该很快回来）。
   */
  private async sendTextAndWaitAck(
    content: MessageContent,
    channel?: Channel,
  ): Promise<boolean> {
    const TIMEOUT = 10_000;
    let settled = false;
    let clientSeq: number | null = null;

    const { promise, resolve } = (() => {
      let res: (sent: boolean) => void;
      const p = new Promise<boolean>((r) => {
        res = r;
      });
      return { promise: p, resolve: res! };
    })();

    const done = (sent: boolean) => {
      if (settled) return;
      settled = true;
      pendingAcks = []; // 释放暂存引用
      queueMicrotask(() => {
        WKSDK.shared().chatManager.removeMessageStatusListener(statusListener);
      });
      clearTimeout(timer);
      resolve(sent);
    };

    const timer = setTimeout(() => done(false), TIMEOUT);

    // 在 sendMessage 之前注册 listener，避免快速 ack 竞态
    let pendingAcks: any[] = [];
    const statusListener = (ackPacket: any) => {
      if (settled) return;
      if (clientSeq === null) {
        pendingAcks.push(ackPacket);
        return;
      }
      if (ackPacket.clientSeq === clientSeq) {
        done(isSuccessfulSendAck(ackPacket));
      }
    };
    WKSDK.shared().chatManager.addMessageStatusListener(statusListener);

    let message: Message;
    try {
      message = await this.sendMessage(content, channel);
    } catch (err) {
      done(false);
      throw err;
    }
    clientSeq = message.clientSeq;

    // fallback：检查暂存的 ack 或已处理的 status
    if (!settled) {
      const found = pendingAcks.some((p) => p.clientSeq === clientSeq);
      const matchedAck = pendingAcks.find((p) => p.clientSeq === clientSeq);
      pendingAcks = []; // 立即释放无关 ack 引用
      if (found) {
        done(isSuccessfulSendAck(matchedAck));
      }
      const statusResult = messageStatusWaitResult(
        message.status,
        MessageStatus.Normal,
        MessageStatus.Fail,
      );
      if (!settled && statusResult !== undefined) {
        done(statusResult);
      }
    }

    return promise;
  }

  scrollToBottom(animate?: boolean): void {
    this.vm.scrollToBottom(animate || false);
  }
  insertText(text: string): void {
    const ctx = this.messageInputContext();
    if (ctx) {
      ctx.insertText(text);
    } else {
      // MessageInput 的 useEffect 尚未执行，延迟重试
      this._pendingInsertText = text;
    }
  }
  /** 恢复草稿内容（替换编辑器内容，解析 @[uid:label] 为 mention 节点） */
  restoreDraft(text: string): void {
    const ctx = this.messageInputContext();
    if (ctx) {
      ctx.restoreDraft(text);
    } else {
      // MessageInput 的 useEffect 尚未执行，延迟重试
      this._pendingRestoreDraft = text;
    }
  }
  editOn(): boolean {
    return this.vm.editOn;
  }
  setEditOn(edit: boolean): void {
    this.vm.editOn = edit;
    if (this.vm.selectMessage && edit && isMessageSelectable(this.vm.selectMessage)) {
      this.vm.checkedMessage(this.vm.selectMessage, true);
    }
  }
  getCheckedMessageCount(): number {
    return this.vm.getCheckedMessages().length;
  }
  clearCheckedMessages(): void {
    this.vm.unCheckAllMessages();
  }
  checkeMessage(message: Message, checked: boolean): void {
    this.vm.checkedMessage(message, checked);
  }
  deleteMessages(messages: Message[]): void {
    this.vm.deleteMessages(messages);
  }
  revokeMessage(message: Message): Promise<void> {
    return this.vm.revokeMessage(message);
  }
  editMessage(
    messageID: String,
    messageSeq: number,
    channelID: String,
    channelType: number,
    content: String,
  ): Promise<void> {
    return this.vm.editMessage(
      messageID,
      messageSeq,
      channelID,
      channelType,
      content,
    );
  }
  onTapAvatar(uid: string, event: React.MouseEvent<Element, MouseEvent>): void {
    this.vm.selectUID = uid;
    this.avatarMenusContext.show(event);
  }

  // 定位消息
  locateMessage(messageSeq: number) {
    const messageWrap = this.vm.findMessageWithMessageSeq(messageSeq);
    if (messageWrap) {
      const foldSession = this.vm.findFoldSessionByMessageSeq(messageSeq);
      if (foldSession) {
        const isSummaryMessage = isFoldSessionSummaryMessage(
          foldSession,
          messageSeq,
        );
        if (isSummaryMessage) {
          this.vm.highlightFoldSessionSummary(foldSession.sessionId, () => {
            this.vm.scrollToFoldSession(foldSession.sessionId);
          });
          return;
        }
        this.vm.setFoldSessionExpanded(
          foldSession.sessionId,
          true,
          false,
          () => {
            messageWrap.locateRemind = true;
            this.vm.scrollToMessage(messageWrap);
            this.vm.notifyListener();
          },
        );
        return;
      }
      this.vm.scrollToMessage(messageWrap);
      messageWrap.locateRemind = true;
      this.vm.notifyListener();
      return;
    }
    this.vm.requestMessagesOfFirstPage(messageSeq, () => {
      if (this.vm.findMessageWithMessageSeq(messageSeq)) {
        this.locateMessage(messageSeq);
      }
    });
  }

  // 显示用户信息
  showUser(uid: string) {
    let fromChannel: Channel | undefined;
    let vercode: string | undefined;
    if (this.vm.channel.channelType === ChannelTypeGroup) {
      fromChannel = this.vm.channel;
      const subscriber = this.vm.subscriberWithUID(uid);
      if (subscriber?.orgData?.vercode) {
        vercode = subscriber?.orgData?.vercode;
      }
    }
    WKApp.shared.baseContext.showUserInfo(uid, fromChannel, vercode);
  }

  // 回复消息
  reply(message: Message, handlerType: number): void {
    this.addReplyMention(message.fromUID);
    if (handlerType === 2) {
      let content = message.remoteExtra?.isEdit
        ? message.remoteExtra?.contentEdit?.conversationDigest
        : message.content.conversationDigest;
      this.insertText(content);
    }
    this.vm.currentHandlerType = handlerType;
    this.vm.currentReplyMessage = message;
    // 自动聚焦输入框
    this._messageInputContext?.focus();
  }

  setDragFileCallback(f: (file: File) => void): void {
    this._dragFileCallback = f;
  }

  // ── Attachment Queue (#143 / #144) ──────────────────────────────────────

  getPendingAttachments(): File[] {
    // 从编辑器中获取附件文件
    return this._messageInputContext?.getAttachmentFiles() || [];
  }

  addPendingAttachments(
    files: File[],
    source: "paste" | "upload" = "upload",
  ): string | null {
    const BLOCKED_EXTENSIONS = [
      "exe",
      "bat",
      "sh",
      "cmd",
      "msi",
      "dll",
      "php",
      "jsp",
      "apk",
      "com",
      "scr",
      "pif",
      "vbs",
      "js",
      "wsf",
      "ps1",
    ];
    const incoming = Array.from(files);

    // 检查类型黑名单
    for (const f of incoming) {
      const ext = f.name.substring(f.name.lastIndexOf(".") + 1).toLowerCase();
      if (BLOCKED_EXTENSIONS.includes(ext)) {
        return t("base.conversation.upload.blockedExtension", {
          values: { extension: ext },
        });
      }
    }

    // 调用编辑器的 addAttachment 方法插入附件节点
    if (this._addAttachmentFn) {
      this._addAttachmentFn(incoming, source);
    }
    return null;
  }

  removePendingAttachment(_index: number): void {
    // 附件现在由编辑器管理，通过编辑器节点删除
    // 此方法保留以兼容接口，但不再需要手动调用
  }

  clearPendingAttachments(): void {
    // 附件现在由编辑器管理，清空编辑器内容时会自动清除
    // 此方法保留以兼容接口
  }

  channel(): Channel {
    return this.vm.channel;
  }

  // 显示消息上下文菜单
  showContextMenus(message: Message, event: React.MouseEvent) {
    this.vm.selectMessage = message;
    this.setState({ contextMenuMessageID: message.messageID });

    // 缓存当前选区文本（仅当选区完全在当前消息气泡内时）
    this._cachedSelectedText = null;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const text = selection.toString();
      if (text.length > 0) {
        const range = selection.getRangeAt(0);
        const target = event.target as HTMLElement;
        // 兼容旧气泡（.wk-message-base-bubble）和新 MessageRow 组件（.wk-msg-row-body）
        const bubble =
          target.closest(".wk-message-base-bubble") ??
          target.closest(".wk-msg-row-body");
        if (bubble && bubble.contains(range.commonAncestorContainer)) {
          this._cachedSelectedText = text;
        }
      }
    }

    this.contextMenusContext.show(event);
  }
  hideContextMenus(): void {
    this.contextMenusContext.hide();
    this.setState({ contextMenuMessageID: null });
  }

  isContextMenuOpen(message: Message): boolean {
    return this.state.contextMenuMessageID === message.messageID;
  }

  getCachedSelectedText(): string | null {
    return this._cachedSelectedText;
  }

  messageInputContext(): MessageInputContext | undefined {
    return this._messageInputContext;
  }

  forceStandaloneMessage(message: Message): boolean {
    // 紧跟在折叠卡片后的消息，强制独立（避免 preMessage 仍指向卡片内消息导致头像丢失）
    if (this.vm.afterFoldSessionClientMsgNos.has(message.clientMsgNo)) {
      return true;
    }

    const foldSession =
      message.messageSeq > 0
        ? this.vm.findFoldSessionByMessageSeq(message.messageSeq)
        : undefined;
    if (foldSession?.isExpanded) {
      return foldSession.expandedMessages.some(
        (expandedMessage) =>
          expandedMessage.clientMsgNo === message.clientMsgNo,
      );
    }
    for (const item of this.vm.renderItems) {
      if (item.type !== "foldSession" || !item.session.isExpanded) {
        continue;
      }
      if (
        item.session.expandedMessages.some(
          (expandedMessage) =>
            expandedMessage.clientMsgNo === message.clientMsgNo,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  componentDidMount() {
    const { channel, onContext } = this.props;
    if (onContext) {
      onContext(this);
    }
    WKApp.shared.openChannel = channel;

    // 注册附件发送守卫：返回 false 表示有未发送附件，需弹确认
    WKApp.shared.pendingAttachmentGuard = () =>
      this.getPendingAttachments().length === 0;
    WKApp.shared.pendingAttachmentGuardId = this._guardId;

    if (this.vm.hasDraft()) {
      this.restoreDraft(this.vm.draft());
    }
    // 恢复引用/回复状态
    const channelKey = `${channel.channelID}-${channel.channelType}`;
    const cachedReplyState = Conversation.replyStateCache.get(channelKey);
    if (cachedReplyState) {
      this.vm.currentReplyMessage = cachedReplyState.message;
      this.vm.currentHandlerType = cachedReplyState.handlerType;
      Conversation.replyStateCache.delete(channelKey);
    }

    // Listen for matter-send-and-create: send current editor content (with mention), then clear
    this._matterSendMessageHandler = (data: {
      channelId: string;
      channelType: number;
    }) => {
      const { channel } = this.props;
      if (
        data.channelId === channel.channelID &&
        data.channelType === channel.channelType
      ) {
        this._messageInputContext?.send();
      }
    };
    WKApp.mittBus.on(
      "wk:matter-created-from-input",
      this._matterSendMessageHandler,
    );

    this._exitMultipleModeHandler = () => {
      this.vm.editOn = false;
      this.vm.unCheckAllMessages();
      this.forceUpdate();
    };
    WKApp.mittBus.on("wk:exit-multiple-mode", this._exitMultipleModeHandler);

    window.addEventListener("beforeunload", this._beforeUnloadHandler);

    this.vm.onFirstMessagesLoaded = () => {
      this.updateBrowseToMessageSeqAndReminderDoneIfNeed();

      this.uploadReadedIfNeed();
    };

    this.vm.markUnread();
  }

  componentWillUnmount() {
    if (this._matterSendMessageHandler) {
      WKApp.mittBus.off(
        "wk:matter-created-from-input",
        this._matterSendMessageHandler,
      );
      this._matterSendMessageHandler = undefined;
    }
    if (this._exitMultipleModeHandler) {
      WKApp.mittBus.off("wk:exit-multiple-mode", this._exitMultipleModeHandler);
      this._exitMultipleModeHandler = undefined;
    }
    window.removeEventListener("beforeunload", this._beforeUnloadHandler);
    // 注销附件守卫：只清除自己注册的，防止新实例 guard 被旧实例 unmount 覆盖
    if (WKApp.shared.pendingAttachmentGuardId === this._guardId) {
      WKApp.shared.pendingAttachmentGuard = undefined;
      WKApp.shared.pendingAttachmentGuardId = undefined;
    }
    // 附件现在由编辑器管理，组件卸载时编辑器会自动清理
    this.dealloc();
  }
  dealloc() {
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
      this.scrollTimer = null;
    }
    // 保存引用/回复状态到缓存
    const channelKey = `${this.props.channel.channelID}-${this.props.channel.channelType}`;
    if (this.vm.currentReplyMessage) {
      Conversation.replyStateCache.set(channelKey, {
        message: this.vm.currentReplyMessage,
        handlerType: this.vm.currentHandlerType,
      });
      // Evict oldest entries when cache exceeds max size
      if (
        Conversation.replyStateCache.size >
        Conversation.REPLY_STATE_CACHE_MAX_SIZE
      ) {
        const firstKey = Conversation.replyStateCache.keys().next().value;
        if (firstKey !== undefined) {
          Conversation.replyStateCache.delete(firstKey);
        }
      }
    } else {
      Conversation.replyStateCache.delete(channelKey);
    }
    this.vm.markUnread();
    this.markConversationExtra();
    WKApp.shared.openChannel = undefined;
    WKSDK.shared().conversationManager.openConversation = undefined;
  }

  markConversationExtra() {
    let draft = this.messageInputContext()?.text();
    this.draftSaveGeneration += 1;
    this.latestSavedDraft = draft || "";
    void this.updateConversationExtra(draft || "");
  }

  updateConversationExtra(draft: string) {
    const conversationLastMessageSeq = this.vm.conversationLastMessageSeq();
    const lastVisiableMessage = this.lastVisiableMessage(null);
    let keepMessageSeq = 0;
    if (
      lastVisiableMessage &&
      lastVisiableMessage.messageSeq >= conversationLastMessageSeq
    ) {
      keepMessageSeq = 0;
    } else {
      const firstVisiableMessage = this.firstVisiableMessage(null);
      keepMessageSeq = firstVisiableMessage?.messageSeq || 0;
    }

    return WKApp.dataSource.channelDataSource.conversationExtraUpdate({
      channel: this.vm.channel,
      browseTo: 0,
      keepMessageSeq: keepMessageSeq,
      keepOffsetY: 0,
      draft,
      version: 0,
    });
  }

  async clearDraftAfterSend(
    sendDraftGeneration: number,
    remoteDraftAtSend: string,
  ) {
    const remoteExtra = this.vm.currentConversation?.remoteExtra;
    if (!shouldClearDraftAfterSend({
      liveDraft: this.messageInputContext()?.text() || "",
      remoteDraft: remoteExtra?.draft || "",
      remoteDraftAtSend,
      draftSavedAfterSend: this.draftSaveGeneration !== sendDraftGeneration,
      latestSavedDraft: this.latestSavedDraft,
    })) {
      return;
    }

    if (remoteExtra) {
      remoteExtra.draft = "";
    }
    try {
      await this.updateConversationExtra("");
    } catch (err) {
      console.warn("[Conversation] clear draft after send failed", err);
    }
    if (this.vm.currentConversation) {
      WKSDK.shared().conversationManager.notifyConversationListeners(
        this.vm.currentConversation,
        ConversationAction.update,
      );
    }
  }

  _handleContextMenus(event: React.MouseEvent) {
    this.contextMenusContext.show(event);
  }

  getMessageElement(message: Message | MessageWrap) {
    const element = document.getElementById(message.clientMsgNo);
    if (element) {
      return element;
    }
    if (!message.messageSeq || message.messageSeq <= 0) {
      return null;
    }
    const foldSession = this.vm.findFoldSessionByMessageSeq(message.messageSeq);
    if (!foldSession) {
      return null;
    }
    return document.getElementById(foldSession.anchorId);
  }

  getMessageMentions(message: MessageWrap): MentionInfo[] {
    // ── 三态 mention 高亮（render matrix） ───────────────────────────
    // 在普通 @member 的 Parts 之外，额外注入以下三个虚拟 highlight token，
    // 让 MarkdownContent 用现有 @member 胶囊样式标亮文本中的
    // "@所有人" / "@所有AI"（uid='all' 仍表示不可点击）:
    //   - mention.humans=1  → "@所有人"
    //   - mention.ais=1     → "@所有AI"
    //   - mention.humans=1 + mention.ais=1 → 两者都高亮
    //   - mention.all=1 (legacy / server outbound 双写) → "@所有人"
    // 不动 message.parts，避免影响 markdown 子节点分段；MarkdownContent
    // 按 name 字符串匹配文本节点。复用同一份 highlight class 保持视觉一致。
    //
    // Edited messages render text from `message.remoteExtra.contentEdit`
    // (see `getMessageTextContent` below). The mention flags must be read
    // from the same content source — otherwise an edited message whose
    // edit text now contains `@所有人` / `@所有AI` (or removes them) would
    // disagree with the highlight overlay. Prefer the edited content's
    // mention flags when present, falling back to the original message
    // content for non-edited messages or edits that did not re-emit flags.
    const editContent: any = message.remoteExtra?.isEdit
      ? message.remoteExtra?.contentEdit
      : undefined;
    const flags =
      readMentionFlags(editContent) ?? readMentionFlags(message.content);

    return buildMentionRenderInfo(
      message.parts as any,
      flags,
      PartType.mention as unknown as number,
    ) as MentionInfo[];
  }

  getMessageEmojis(message: MessageWrap): EmojiInfo[] {
    return (
      message.parts
        ?.filter((part: Part) => part.type === PartType.emoji)
        .reduce((acc: EmojiInfo[], part: Part) => {
          const url = WKApp.emojiService.getImage(part.text);
          if (url && !acc.find((emoji) => emoji.key === part.text)) {
            acc.push({ key: part.text, url });
          }
          return acc;
        }, []) ?? []
    );
  }

  getMessageTextContent(message: MessageWrap) {
    if (message.streamOn) {
      return message.fullStreamContent;
    }
    const rawContent = message.remoteExtra?.isEdit
      ? (message.remoteExtra?.contentEdit as any)
      : (message.content as any);
    return (
      rawContent?.text ||
      message.parts?.map((part: Part) => part.text).join("") ||
      ""
    );
  }

  renderFoldSessionSummary(message: MessageWrap) {
    if (message.contentType === MessageContentTypeConst.typing) {
      return (
        <span className="wk-fold-session-summary-loading">
          <BeatLoader size={8} margin={4} color="var(--wk-color-theme)" />
        </span>
      );
    }
    if (message.contentType === MessageContentType.text || message.streamOn) {
      return (
        <div className="wk-msg-text-content">
          <MarkdownContent
            content={this.getMessageTextContent(message)}
            isSend={message.send}
            isStreaming={message.isStreaming}
            mentions={this.getMessageMentions(message)}
            onMentionClick={(uid) => this.showUser(uid)}
            emojis={this.getMessageEmojis(message)}
          />
        </div>
      );
    }
    const digest = message.remoteExtra?.isEdit
      ? message.remoteExtra?.contentEdit?.conversationDigest
      : message.content?.conversationDigest;
    return digest || "";
  }

  renderFoldSessionExpandedList(messages: MessageWrap[]) {
    const editMode = this.vm.editOn;
    return (
      <FoldSessionExpandedList
        messages={messages}
        editMode={editMode}
        renderAvatar={(message) => (
          <WKAvatar
            channel={new Channel(message.fromUID, ChannelTypePerson)}
            style={{ width: "100%", height: "100%" }}
          />
        )}
        renderMessageContent={(message) =>
          this.renderFoldMessageContent(message)
        }
        onToggleSelect={(message, checked) => {
          this.vm.checkedMessage(message, checked);
        }}
        onMessageContextMenu={(message, event) => {
          this.showContextMenus(message, event);
        }}
      />
    );
  }

  renderFoldMessageContent(message: MessageWrap) {
    // 文本消息（含 Markdown 表格、代码块、链接）
    if (message.contentType === MessageContentType.text || message.streamOn) {
      return (
        <div className="wk-fold-msg-text wk-msg-text-content">
          <MarkdownContent
            content={this.getMessageTextContent(message)}
            isSend={message.send}
            isStreaming={message.isStreaming}
            mentions={this.getMessageMentions(message)}
            onMentionClick={(uid) => this.showUser(uid)}
            emojis={this.getMessageEmojis(message)}
          />
        </div>
      );
    }

    // 文件消息
    if (message.contentType === MessageContentTypeConst.file) {
      const content = message.content as FileContent;
      const iconInfo = getFileIconInfo(content.extension, content.name);
      return (
        <div
          className="wk-fold-file"
          title={t("base.messageFile.preview")}
          onClick={() => {
            const fileUrl = resolveSafeFileUrl(content);
            if (!fileUrl) return;
            WKApp.mittBus.emit("wk:file-preview", {
              url: fileUrl,
              name: content.name || t("base.messageFile.unknownFile"),
              extension: getExtension(content.extension, content.name),
              size: content.size,
              sourceChannelId: message.channel.channelID,
              sourceChannelType: message.channel.channelType,
              messageId: message.messageID,
              messageSeq: message.messageSeq,
              fromUID: message.fromUID,
              conversationDigest: content.conversationDigest,
            });
          }}
        >
          <div
            className="wk-fold-file-icon"
            style={{ backgroundColor: iconInfo.color }}
          >
            <span>{iconInfo.label}</span>
          </div>
          <div className="wk-fold-file-info">
            <div className="wk-fold-file-name" title={content.name}>
              {content.name || t("base.conversation.file.unknown")}
            </div>
            <div className="wk-fold-file-size">
              {formatFileSize(content.size)}
            </div>
          </div>
          <div
            className="wk-fold-file-dl"
            title={t("base.conversation.file.download")}
            onClick={async (e) => {
              e.stopPropagation();
              const fileUrl = resolveSafeFileUrl(content);
              if (!fileUrl) return;
              await downloadFile(fileUrl, content.name || "file");
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
        </div>
      );
    }

    // 图片消息
    if (message.contentType === MessageContentType.image) {
      const content = message.content as ImageContent;
      const rawUrl = content.url || content.remoteUrl || "";
      const imgUrl = rawUrl
        ? WKApp.dataSource.commonDataSource.getImageURL(rawUrl)
        : content.imgData || "";
      return imgUrl ? <FoldImage src={imgUrl} /> : null;
    }

    // 其他类型：回退到文本摘要
    const digest = this.getMessageDigestText(message);
    return <div className="wk-fold-msg-text">{digest}</div>;
  }

  getMessageDigestText(message: MessageWrap): string {
    if (message.streamOn) {
      return message.fullStreamContent || "";
    }
    const rawContent = message.remoteExtra?.isEdit
      ? (message.remoteExtra?.contentEdit as any)
      : (message.content as any);
    return (
      rawContent?.text ||
      rawContent?.conversationDigest ||
      message.parts?.map((part: Part) => part.text).join("") ||
      ""
    );
  }

  foldSessionUI(session: FoldSessionViewModel, last: boolean) {
    const participants: FoldSessionCardParticipant[] = session.participants.map(
      (participant) => ({
        id: participant.uid,
        name: participant.name,
        avatar: (
          <WKAvatar
            channel={participant.channel}
            style={{ width: "100%", height: "100%" }}
          />
        ),
      }),
    );
    const { showSummary, summaryId, summaryMessage } =
      getFoldSessionSummaryState(session);
    const summarySelectable =
      showSummary && isMessageSelectable(summaryMessage);
    const typingSender =
      summaryMessage.contentType === MessageContentTypeConst.typing
        ? (summaryMessage.content as { fromName?: string })?.fromName
        : undefined;
    const summarySender =
      summaryMessage.from?.title || typingSender || summaryMessage.fromUID;

    // 判断是单个还是多个 AI
    const isMultiAI = participants.length > 1;
    const tagLabel = isMultiAI
      ? t("base.conversation.foldSession.aiCollaboration")
      : t("base.conversation.foldSession.aiAssistant");

    // 折叠逻辑: 超过 5 个 AI 时折叠显示
    const shouldCollapse = participants.length > 5;

    // 参与者名字显示
    let participantNameDisplay: React.ReactNode;
    if (shouldCollapse) {
      // 折叠模式: 显示第一个名字 + "等X人"
      const collapsedText = t("base.conversation.foldSession.collapsedParticipants", {
        values: { name: participants[0].name, count: participants.length },
      });
      participantNameDisplay = (
        <span className="wk-fold-session-participants-collapsed">
          <span className="wk-fold-session-participant-name wk-fold-session-participant-name-ai">
            {collapsedText}
          </span>
          <div className="wk-fold-session-tooltip">
            {participants.map((participant) => (
              <div
                key={participant.id}
                className="wk-fold-session-tooltip-item"
              >
                <div className="wk-fold-session-tooltip-avatar">
                  {participant.avatar}
                </div>
                <span className="wk-fold-session-tooltip-name">
                  {participant.name}
                </span>
              </div>
            ))}
          </div>
        </span>
      );
    } else {
      // 正常模式: 显示所有名字
      const participantLabel = participants
        .map((participant) => participant.name)
        .join(" × ");
      participantNameDisplay = (
        <span className="wk-fold-session-participant-name wk-fold-session-participant-name-ai">
          {participantLabel}
        </span>
      );
    }

    return (
      <div
        key={session.sessionId}
        id={session.anchorId}
        className={classNames(
          "wk-message-item",
          "wk-message-item-fold-session",
          last ? "wk-message-item-last" : undefined,
        )}
      >
        <div className="wk-message-item-fold-session-shell">
          <div
            className="wk-message-item-fold-session-avatar"
            aria-hidden="true"
          >
            <img
              className="wk-message-item-fold-session-avatar-icon"
              src={foldSessionAvatarIcon}
              alt=""
            />
          </div>
          <div className="wk-message-item-fold-session-content">
            {/* 标题行: 名字+Tag+时间 + 收起/展开 */}
            <div className="wk-fold-session-title-row">
              <div className="wk-fold-session-participants">
                {participantNameDisplay}
                <span className="wk-fold-session-tag">{tagLabel}</span>
              </div>
              <span className="wk-fold-session-time">
                {moment(session.lastMessage.timestamp * 1000).format("HH:mm")}
              </span>
              <button
                type="button"
                className="wk-fold-session-toggle-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  const wasExpanded = session.isExpanded;
                  this.vm.toggleFoldSession(session.sessionId);

                  // 展开时,确保内容可见(无动画,下一帧立即滚动)
                  if (!wasExpanded) {
                    requestAnimationFrame(() => {
                      const element = document.getElementById(session.anchorId);
                      if (element) {
                        const rect = element.getBoundingClientRect();
                        const viewportHeight = window.innerHeight;
                        // 如果元素下半部分不在视口内,滚动让它完整可见
                        if (rect.bottom > viewportHeight) {
                          element.scrollIntoView({
                            behavior: "smooth",
                            block: "nearest",
                          });
                        }
                      }
                    });
                  }
                }}
                aria-label={
                  session.isExpanded
                    ? t("base.conversation.foldSession.collapseDiscussions", {
                        values: { count: session.count },
                      })
                    : t("base.conversation.foldSession.expandDiscussions", {
                        values: { count: session.count },
                      })
                }
              >
                {session.isExpanded
                  ? t("base.conversation.foldSession.collapseDiscussions", {
                      values: { count: session.count },
                    })
                  : t("base.conversation.foldSession.expandDiscussions", {
                      values: { count: session.count },
                    })}
              </button>
            </div>
            <FoldSessionCard
              className="wk-message-item-fold-session-card"
              participants={participants}
              count={session.count}
              selectionMode={this.vm.editOn}
              isActive={session.isActive}
              isExpanded={session.isExpanded}
              appearing={session.shouldAppear}
              flash={session.shouldMergeFlash}
              showSummary={showSummary}
              highlightSummary={session.highlightSummary}
              summaryId={summaryId}
              summarySender={summarySender}
              summaryTime={moment(summaryMessage.timestamp * 1000).format(
                "HH:mm",
              )}
              summaryContent={this.renderFoldSessionSummary(summaryMessage)}
              expandedContent={this.renderFoldSessionExpandedList(
                session.expandedMessages,
              )}
              onToggle={() => {
                this.vm.toggleFoldSession(session.sessionId);
              }}
              summaryChecked={!!summaryMessage.checked}
              summarySelectable={summarySelectable}
              onSummaryToggleSelect={(checked) => {
                if (!summarySelectable) {
                  return;
                }
                this.vm.checkedMessage(summaryMessage.message, checked);
              }}
              onAnimationEnd={(event) => {
                if (event.target === event.currentTarget) {
                  if (
                    event.animationName === "wk-fold-session-appear" &&
                    session.shouldMergeFlash
                  ) {
                    return;
                  }
                  this.vm.clearFoldSessionAnimation(session.sessionId);
                }
              }}
              onSummaryContextMenu={
                summaryMessage.contentType !== MessageContentTypeConst.typing
                  ? (event) => {
                      this.showContextMenus(summaryMessage.message, event);
                    }
                  : undefined
              }
              onSummaryAnimationEnd={(event) => {
                if (event.target === event.currentTarget) {
                  this.vm.clearFoldSessionSummaryHighlight(session.sessionId);
                }
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  renderConversationItem(item: ConversationRenderItem, last: boolean) {
    if (item.type === "foldSession") {
      return this.foldSessionUI(item.session, last);
    }
    return this.messageUI(item.message, last);
  }

  messageUI(message: MessageWrap, last: boolean, extraClassName?: string) {
    let MessageCell: React.ElementType | undefined;
    if (message.revoke) {
      MessageCell = RevokeCell;
    } else if (message.flame) {
      MessageCell = FlameMessageCell;
    } else {
      MessageCell = WKApp.messageManager.getCell(message.contentType);
    }
    const isSystemMessage =
      message.revoke ||
      message.contentType === MessageContentTypeConst.screenshot ||
      (message.contentType >= 1000 &&
        message.contentType <= 2000 &&
        message.contentType !== MessageContentTypeConst.threadCreated);
    return (
      <div
        onAnimationEnd={() => {
          message.locateRemind = false;
          this.setState({});
        }}
        key={message.clientMsgNo}
        id={`${
          message.contentType === MessageContentTypeConst.time ? "time-" : ""
        }${message.clientMsgNo}`}
        className={classNames(
          "wk-message-item",
          extraClassName,
          last ? "wk-message-item-last" : undefined,
          message.locateRemind ? "wk-message-item-reminder" : undefined,
          isSystemMessage ? "wk-message-item-system" : undefined,
        )}
      >
        {MessageCell ? (
          <MessageCell
            key={message.clientMsgNo}
            message={message}
            context={this}
          />
        ) : null}
      </div>
    );
  }

  handleScroll(e: any) {
    if (this.scrollTimer) {
      clearTimeout(this.scrollTimer);
      this.scrollTimer = null;
    }
    this.scrollTimer = window.setTimeout(() => {
      this.handleScrollEnd();
    }, 500);
    this.contextMenusContext.hide();
    const targetScrollTop = e.target.scrollTop;
    const scrollOffsetTop =
      e.target.scrollHeight - (targetScrollTop + e.target.clientHeight);
    if (
      targetScrollTop <= TOP_HISTORY_TRIGGER_OFFSET &&
      !this.vm.loading &&
      !this.vm.pulldownFinished
    ) {
      // 下拉
      this.vm.pulldownMessages();
    } else if (
      scrollOffsetTop <= 500 &&
      !this.vm.loading &&
      this.vm.pullupHasMore
    ) {
      // 上拉
      this.vm.pullupMessages();
    }
    if (this.vm.lastMessage) {
      this.vm.lastLocalMessageElement = this.getMessageElement(
        this.vm.lastMessage,
      ); // 最新消息
      if (this.vm.lastLocalMessageElement) {
        // 如果有最新消息的dom则判断是否在可见范围内
        if (
          scrollOffsetTop >
          this.vm.lastLocalMessageElement.clientHeight + 20
        ) {
          // 如果滚动距离超过了第一个元素则显示“滚动到底部”
          this.vm.showScrollToBottomBtn = true;
        } else {
          this.vm.showScrollToBottomBtn = false;
        }
      } else {
        this.vm.showScrollToBottomBtn = true;
      }
    }

    this.updateBrowseToMessageSeqAndReminderDoneIfNeed();
  }

  // 内容不满屏时，wheel 向上滚动触发加载更多历史（折叠卡片压缩内容可能导致不满屏无法触发 onScroll）
  handleWheel(e: React.WheelEvent) {
    const viewport = e.currentTarget as HTMLElement;
    if (
      !this.vm.loading &&
      !this.vm.pulldownFinished &&
      shouldPulldownOnWheel(
        e.deltaY,
        viewport.scrollTop,
        this.isFullScreen(viewport),
      )
    ) {
      this.vm.pulldownMessages();
    }
  }

  // 判断内容是否满一屏幕
  isFullScreen(viewport: HTMLElement | null) {
    if (!viewport) {
      return false;
    }
    return viewport.scrollHeight > viewport.clientHeight;
  }

  handleScrollEnd() {
    this.uploadReadedIfNeed();
  }

  // 上传已读数据
  uploadReadedIfNeed() {
    const viewport = document.getElementById(this.vm.messageContainerId);
    const visiableMessages = this.allVisiableMessages(viewport);
    if (visiableMessages && visiableMessages.length > 0) {
      const unreadMessages = new Array<Message>();
      for (const visiableMessage of visiableMessages) {
        if (
          !visiableMessage.remoteExtra.readed &&
          visiableMessage.fromUID !== WKApp.loginInfo.uid &&
          visiableMessage.setting.receiptEnabled
        ) {
          unreadMessages.push(visiableMessage.message);
        }
      }
      WKSDK.shared().receiptManager.addReceiptMessages(
        this.channel(),
        unreadMessages,
      );
    }
  }

  // 更新已读位置和提醒项
  updateBrowseToMessageSeqAndReminderDoneIfNeed() {
    const viewport = document.getElementById(this.vm.messageContainerId);

    this.updateBrowseToMessageSeq(viewport); // 更新已读位置

    this.updateReminderDoneIfNeed(viewport); // 更新提醒项
  }

  // 更新已预览的位置
  updateBrowseToMessageSeq(viewport: HTMLElement | null) {
    const lastVisiableMessage = this.lastVisiableMessage(viewport); // 当前UI显示的最后一条可见的消息
    if (
      lastVisiableMessage &&
      lastVisiableMessage.messageSeq > this.vm.browseToMessageSeq
    ) {
      // 如果当前UI显示的最后一条消息大于已预览到的最新消息，则更新未读数
      this.vm.browseToMessageSeq = lastVisiableMessage.messageSeq;
      this.vm.refreshNewMsgCount(); // 刷新最新消息数量
    }
  }

  // 更新提醒项
  updateReminderDoneIfNeed(viewport: HTMLElement | null) {
    if (!this.vm.messages || this.vm.messages.length === 0) {
      return;
    }

    const reminders = this.vm.currentConversation?.reminders;
    if (!reminders || reminders.length === 0) {
      return;
    }
    const doneReminderIDs: number[] = [];
    for (const reminder of reminders) {
      if (reminder.done) {
        continue;
      }
      const message = this.vm.findMessageWithMessageSeq(reminder.messageSeq);
      if (message && this.isVisiableMessage(message.message, viewport)) {
        doneReminderIDs.push(reminder.reminderID);
        continue;
      }
    }
    if (doneReminderIDs.length > 0) {
      // Persist reminder done status to server via SDK (fixes #169)
      WKSDK.shared().reminderManager.done(doneReminderIDs);
    }
  }

  // 消息是否可见
  isVisiableMessage(message: Message, viewport: HTMLElement | null) {
    if (!viewport) {
      return;
    }
    const targetScrollTop = viewport.scrollTop;
    const scrollOffsetTop =
      viewport.scrollHeight - (targetScrollTop + viewport.clientHeight);

    const element = this.getMessageElement(message);
    if (element) {
      if (
        viewport.scrollHeight - element.offsetTop > scrollOffsetTop &&
        element.offsetTop + element.clientHeight > targetScrollTop
      ) {
        return true;
      }
    }
    return false;
  }
  // 获取最后一个可见的消息
  lastVisiableMessage(viewport: HTMLElement | null) {
    if (!this.vm.messages || this.vm.messages.length === 0) {
      return;
    }
    if (!viewport) {
      viewport = document.getElementById(this.vm.messageContainerId);
    }
    if (!viewport) {
      return;
    }
    const targetScrollTop = viewport.scrollTop;
    const scrollOffsetTop =
      viewport.scrollHeight - (targetScrollTop + viewport.clientHeight);

    for (let index = this.vm.messages.length - 1; index >= 0; index--) {
      const message = this.vm.messages[index];
      const element = this.getMessageElement(message);
      if (element) {
        if (viewport.scrollHeight - element.offsetTop > scrollOffsetTop) {
          return message;
        }
      }
    }
  }

  // 获取第一个可见的消息
  firstVisiableMessage(vp: HTMLElement | null) {
    if (!this.vm.messages || this.vm.messages.length === 0) {
      return;
    }
    let viewport = vp;
    if (!viewport) {
      viewport = document.getElementById(this.vm.messageContainerId);
    }
    if (!viewport) {
      return;
    }
    const targetScrollTop = viewport.scrollTop;
    // const scrollOffsetTop = viewport.scrollHeight - (targetScrollTop + viewport.clientHeight);
    for (let index = 0; index < this.vm.messages.length; index++) {
      const message = this.vm.messages[index];
      const element = this.getMessageElement(message);
      if (element) {
        if (element.offsetTop + element.clientHeight > targetScrollTop) {
          return message;
        }
      }
    }
  }
  // 所有可见的消息
  allVisiableMessages(vp: HTMLElement | null): Array<MessageWrap> {
    const visiableMessages = new Array<MessageWrap>();
    if (!this.vm.messages || this.vm.messages.length === 0) {
      return visiableMessages;
    }
    let viewport = vp;
    if (!viewport) {
      viewport = document.getElementById(this.vm.messageContainerId);
    }
    if (!viewport) {
      return visiableMessages;
    }

    const targetScrollTop = viewport.scrollTop;
    for (let index = 0; index < this.vm.messages.length; index++) {
      const message = this.vm.messages[index];
      const element = this.getMessageElement(message);
      if (element) {
        if (element.offsetTop + element.clientHeight / 2 > targetScrollTop) {
          // message 要漏出来一半才算可见
          visiableMessages.push(message);
        }
      }
    }
    return visiableMessages;
  }

  chatToolbarUI() {
    const toolbars = WKApp.endpoints.chatToolbarsWithKey(this);
    return (
      <ul className="wk-conversation-chattoolbars">
        {toolbars.map((t) => {
          return (
            <li key={t.sid} className="wk-conversation-chattoolbars-item">
              {t.node}
            </li>
          );
        })}
      </ul>
    );
  }

  dragEnd() {
    this.vm.fileDragEnter = false;
    this.vm.fileDragLeave = true;
    this.vm.notifyListener();
  }
  dragStart() {
    this.vm.fileDragEnter = true;
    this.vm.fileDragLeave = false;
    this.vm.notifyListener();
  }

  render() {
    const { chatBg, channel, initLocateMessageSeq } = this.props;

    const channelInfo = WKSDK.shared().channelManager.getChannelInfo(channel);

    let botCommands: BotCommand[] | undefined;
    if (
      channel.channelType === ChannelTypePerson &&
      channelInfo?.orgData?.robot === 1 &&
      channelInfo.orgData.bot_commands
    ) {
      try {
        const raw =
          typeof channelInfo.orgData.bot_commands === "string"
            ? JSON.parse(channelInfo.orgData.bot_commands)
            : channelInfo.orgData.bot_commands;
        if (Array.isArray(raw)) {
          botCommands = raw as BotCommand[];
        }
      } catch (e) {
        // ignore invalid bot_commands JSON
      }
    }

    return (
      <Provider
        create={() => {
          this.vm = new ConversationVM(channel, initLocateMessageSeq);
          return this.vm;
        }}
        render={(vm: ConversationVM) => {
          return (
            <>
              <ConversationSelectionStateBridge
                editOn={vm.editOn}
                onChange={this.props.onSelectionStateChange}
              />
              <div
                className={classNames(
                  "wk-conversation",
                  vm.fileDragEnter ? "wk-conversation-dragover" : undefined,
                  vm.currentReplyMessage
                    ? "wk-conversation-hasreply"
                    : undefined,
                )}
                style={{
                  background: chatBg
                    ? `url(${chatBg}) rgb(245, 247, 249)`
                    : undefined,
                }}
              >
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    this.dragStart();
                  }}
                  className={classNames("wk-conversation-content")}
                  style={
                    this.state.inputExpanded
                      ? { height: 0, overflow: "hidden", flex: "none" }
                      : undefined
                  }
                  {...(this.state.inputExpanded ? { inert: "" } : {})}
                >
                  <div
                    className="wk-conversation-messages"
                    id={vm.messageContainerId}
                    onScroll={this.handleScroll.bind(this)}
                    onWheel={this.handleWheel.bind(this)}
                  >
                    {vm.renderItems.map((item, i) => {
                      let last = false;
                      if (i === vm.renderItems.length - 1) {
                        last = true;
                      }
                      return this.renderConversationItem(item, last);
                    })}

                    {/* 位置view */}
                    <ConversationPositionView
                      onScrollToBottom={async () => {
                        return this.vm.onDownArrow();
                      }}
                      onReminder={(reminder) => {
                        return this.vm.syncMessages(reminder.messageSeq, () => {
                          this.locateMessage(reminder.messageSeq);
                        });
                      }}
                      showScrollToBottom={vm.showScrollToBottomBtn || false}
                      unreadCount={vm.unreadCount}
                      reminders={vm.currentConversation?.reminders?.filter(
                        (r) => !r.done,
                      )}
                    ></ConversationPositionView>

                    {vm.fileDragEnter ? (
                      <div
                        className="wk-conversation-content-fileupload-mask"
                        onDragOver={(event) => {
                          event.preventDefault();
                        }}
                        onDragLeave={(event) => {
                          event.preventDefault();
                          this.dragEnd();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          this.dragEnd();
                          const items = Array.from(event.dataTransfer.items);
                          const files = Array.from(event.dataTransfer.files);
                          if (files.length === 0) return;
                          const hasDirectory = items.length
                            ? items.some((it) => {
                                const entry = it.webkitGetAsEntry?.();
                                return entry ? entry.isDirectory : false;
                              })
                            : files.some((f) => f.type === "" && f.size === 0);
                          if (hasDirectory) {
                            Toast.error(t("base.conversation.upload.folderUnsupported"));
                            return;
                          }
                          const err = this.addPendingAttachments(files);
                          if (err) Toast.error(err);
                        }}
                      >
                        <div className="wk-conversation-content-fileupload-mask-content">
                          {t("base.conversation.upload.sendTo", {
                            values: { name: channelInfo?.title || "" },
                          })}
                        </div>
                      </div>
                    ) : undefined}
                  </div>
                </div>
                {/* ReplyView 已移到 MessageInput 内部的 topView prop */}
                <div className="wk-conversation-topview"></div>
                <div
                  className={classNames(
                    "wk-conversation-multiplepanel",
                    vm.editOn
                      ? "wk-conversation-multiplepanel-show"
                      : undefined,
                  )}
                >
                  <MultiplePanel
                    onClose={() => {
                      vm.editOn = false;
                      vm.unCheckAllMessages();
                    }}
                    onForward={() => {
                      const messages = vm.getCheckedMessages();
                      if (!messages || messages.length === 0) {
                        Toast.error(t("base.conversation.selection.selectMessageFirst"));
                        return;
                      }
                      WKApp.shared.baseContext.showConversationSelect(
                        (channels: Channel[]) => {
                          for (const message of messages) {
                            const cloneContent = getEffectiveContent(
                              message.message,
                            );
                            for (const channel of channels) {
                              this.sendMessage(cloneContent, channel);
                            }
                          }
                          vm.editOn = false;
                          vm.unCheckAllMessages();
                        },
                      );
                    }}
                    onMergeForward={() => {
                      const checkedMsgs = vm.getCheckedMessages();
                      if (!checkedMsgs || checkedMsgs.length === 0) {
                        Toast.error(t("base.conversation.selection.selectMessageFirst"));
                        return;
                      }
                      WKApp.shared.baseContext.showConversationSelect(
                        (channels: Channel[]) => {
                          vm.sendMergeforward(channels);
                          vm.editOn = false;
                          vm.unCheckAllMessages();
                        },
                      );
                    }}
                    onDelete={() => {
                      const checkedMsgs = vm.getCheckedMessages();
                      if (!checkedMsgs || checkedMsgs.length === 0) {
                        Toast.error(t("base.conversation.selection.selectMessageFirst"));
                        return;
                      }
                      wkConfirm({
                        title: t("base.conversation.deleteConfirm.title"),
                        content: t("base.conversation.deleteConfirm.content"),
                        okText: t("base.conversation.deleteConfirm.confirm"),
                        cancelText: t("base.common.cancel"),
                        okType: "danger",
                        onOk: async () => {
                          const checkedMessagewraps = vm.getCheckedMessages();
                          const messages = checkedMessagewraps
                            .map((m) => m.message)
                            .filter(Boolean);
                          if (messages.length === 0) return;
                          try {
                            await vm.deleteMessages(messages);
                            vm.editOn = false;
                            vm.unCheckAllMessages();
                          } catch (e) {
                            Toast.error(t("base.conversation.deleteConfirm.failed"));
                            throw e;
                          }
                        },
                      });
                    }}
                    onAddToMatter={(anchor) => {
                      const checkedMsgs = vm.getCheckedMessages();
                      if (!checkedMsgs || checkedMsgs.length === 0) {
                        Toast.error(t("base.conversation.selection.selectMessageFirst"));
                        return;
                      }
                      // 传 channel 信息给 MatterLinkMenu，用于按 channel 查询关联的 Matter
                      const ch = this.props.channel;
                      WKApp.mittBus.emit("wk:open-matter-link-menu", {
                        anchor,
                        channelId: ch.channelID,
                        channelType: ch.channelType,
                        messages: checkedMsgs.map((m: any) => ({
                          messageSeq: m.messageSeq,
                          messageID: m.messageID,
                          fromUID: m.fromUID,
                          fromUName: resolveFromUName(m),
                          content:
                            m.content?.conversationDigest ||
                            m.content?.text ||
                            "",
                          timestamp: m.message?.timestamp || m.timestamp,
                          attachments: extractMessageAttachments(m),
                        })),
                      });
                    }}
                    onCreateMatter={() => {
                      const checkedMsgs = vm.getCheckedMessages();
                      if (!checkedMsgs || checkedMsgs.length === 0) {
                        Toast.error(t("base.conversation.selection.selectMessageFirst"));
                        return;
                      }
                      const ch = this.props.channel;
                      WKApp.mittBus.emit("wk:open-smart-create-modal", {
                        channelId: ch.channelID,
                        channelType: ch.channelType,
                        messages: checkedMsgs.map((m: any) => ({
                          messageSeq: m.messageSeq,
                          messageID: m.messageID,
                          fromUID: m.fromUID,
                          fromUName: resolveFromUName(m),
                          content:
                            m.content?.conversationDigest ||
                            m.content?.text ||
                            "",
                          timestamp: m.message?.timestamp,
                          attachments: extractMessageAttachments(m),
                        })),
                      });
                    }}
                  ></MultiplePanel>

                </div>
                <div
                  className="wk-conversation-footer"
                  style={
                    vm.editOn
                      ? { display: "none" }
                      : this.state.inputExpanded
                        ? {
                            flex: 1,
                            minHeight: 0,
                            overflow: "hidden",
                            paddingTop: "var(--wk-sp-2)",
                          }
                        : undefined
                  }
                >
                  <div
                    className="wk-conversation-footer-content"
                    style={
                      this.state.inputExpanded
                        ? {
                            height: "100%",
                            overflow: "hidden",
                            display: "flex",
                            flexDirection: "column",
                          }
                        : undefined
                    }
                  >
                    {this.props.inputNotice && (
                      <div className="wk-conversation-input-notice-wrap">
                        <div className="wk-conversation-input-notice-bubble">
                          {this.props.inputNotice}
                        </div>
                      </div>
                    )}
                    <MessageInput
                      botCommands={botCommands}
                      onAddAttachment={(addFn: (files: File[]) => void) => {
                        // 存储 addAttachment 方法，供外部调用
                        this._addAttachmentFn = addFn;
                      }}
                      members={this.vm.subscribers.filter(
                        (s) => s.uid !== WKApp.loginInfo.uid,
                      )}
                      topView={
                        vm.currentReplyMessage ? (
                          <ReplyView
                            message={vm.currentReplyMessage}
                            vm={vm}
                            onClose={() => {
                              vm.currentReplyMessage = undefined;
                            }}
                          />
                        ) : undefined
                      }
                      onAltEnter={() => {
                        const { channel } = this.props;
                        // Alt+Enter creates task only in group and topic channels
                        if (
                          channel.channelType !== ChannelTypeGroup &&
                          channel.channelType !== ChannelTypeCommunityTopic
                        )
                          return;
                        const channelInfo =
                          WKSDK.shared().channelManager.getChannelInfo(channel);
                        // 传原始文本（含 @[uid:name] 占位符），由 GlobalMatterModal 先 parse 再截断
                        // 避免 slice 截断位置落在占位符中间导致 mention 残留乱码
                        const rawText = (
                          this._messageInputContext?.text() ?? ""
                        ).trim();
                        WKApp.mittBus.emit("wk:open-create-matter-modal", {
                          channelId: channel.channelID,
                          channelType: channel.channelType,
                          channelName: channelInfo?.title,
                          prefillTitle: rawText,
                          clearOnConfirm: true,
                        });
                      }}
                      onExpandChange={(expanded) => {
                        this.setState({ inputExpanded: expanded });
                      }}
                      onContext={(ctx) => {
                        this._messageInputContext = ctx;
                        // 先 flush 草稿恢复（setContent 替换整块），再 flush insertText（追加）
                        // 顺序相反会导致 setContent 覆盖掉前面追加的内容
                        if (this._pendingRestoreDraft) {
                          ctx.restoreDraft(this._pendingRestoreDraft);
                          this._pendingRestoreDraft = undefined;
                        }
                        if (this._pendingInsertText) {
                          ctx.insertText(this._pendingInsertText);
                          this._pendingInsertText = undefined;
                        }
                      }}
                      toolbar={this.chatToolbarUI()}
                      context={this}
                      getChatContext={async () => {
                        const { channel } = this.props;
                        await this.vm.ensureSubscribersLoaded();

                        const channelInfo = WKSDK.shared().channelManager.getChannelInfo(channel);
                        let groupName: string | undefined;
                        let threadName: string | undefined;

                        if (channel.channelType === ChannelTypeCommunityTopic) {
                          threadName = channelInfo?.title;
                          const parsed = parseThreadChannelId(channel.channelID);
                          if (parsed) {
                            const parentInfo = WKSDK.shared().channelManager.getChannelInfo(
                              new Channel(parsed.groupNo, ChannelTypeGroup)
                            );
                            groupName = parentInfo?.title;
                          }
                        } else if (channel.channelType === ChannelTypeGroup) {
                          groupName = channelInfo?.title;
                        }

                        return buildChatContext({
                          messages: this.vm.messagesOfOrigin || [],
                          subscribers: this.vm.subscribers,
                          channelType: channel.channelType,
                          loginUID: WKApp.loginInfo.uid,
                          channelInfo:
                            channel.channelType === ChannelTypePerson
                              ? (WKSDK.shared().channelManager.getChannelInfo(
                                  channel,
                                ) as ChatContextChannelInfo | null)
                              : undefined,
                          groupName,
                          threadName,
                        });
                      }}
                      onSend={async (
                        text: string,
                        mention?: MentionModel,
                        _attachments?: { id: string; file: File }[],
                        topFiles?: { id: string; file: File }[],
                        editorBlocks?: EditorContentBlock[],
                      ) => {
                        const sendDraftGeneration = this.draftSaveGeneration;
                        const remoteDraftAtSend =
                          this.vm.currentConversation?.remoteExtra?.draft || "";
                        VoiceFeedback.shared()?.submitAll(text);

                        // ── 回复/编辑处理 ──────────────
                        let reply: Reply | undefined;
                        if (vm.currentReplyMessage) {
                          if (vm.currentHandlerType === 2) {
                            // 编辑消息
                            const editContent = new MessageText(text);
                            let json = editContent.encodeJSON();
                            json["type"] = MessageContentType.text;
                            await vm.editMessage(
                              vm.currentReplyMessage.messageID,
                              vm.currentReplyMessage.messageSeq,
                              vm.currentReplyMessage.channel.channelID,
                              vm.currentReplyMessage.channel.channelType,
                              JSON.stringify(json),
                            );
                            vm.currentReplyMessage = undefined;
                            return;
                          }
                          reply = new Reply();
                          reply.messageID = vm.currentReplyMessage.messageID;
                          reply.messageSeq = vm.currentReplyMessage.messageSeq;
                          reply.fromUID = vm.currentReplyMessage.fromUID;
                          const channelInfo =
                            WKSDK.shared().channelManager.getChannelInfo(
                              new Channel(
                                vm.currentReplyMessage.fromUID,
                                ChannelTypePerson,
                              ),
                            );
                          if (channelInfo) {
                            reply.fromName = channelInfo.title;
                          }
                          reply.content = vm.currentReplyMessage.content;
                          vm.currentReplyMessage = undefined;
                        }

                        // ── 辅助：发送单张图片（读取预览+宽高） ──────────────
                        // 返回 true 表示消息已入队 / 发送; false 表示被预检拒绝、
                        // 调用方应据此决定是否继续后续流程 (例如不要再补一条
                        // 空回复消息: octo-web#119 review by Jerry-Xin)。
                        const sendImageFile = async (file: File): Promise<boolean> => {
                          // 上传前预检：后端会对文件大小/类型做校验,失败时直接 Toast,
                          // 不要让本地气泡先进聊天框再显示失败 (octo-web#119)。
                          try {
                            const dot = (file.name || "").lastIndexOf(".");
                            const ext = dot > 0 ? file.name.substring(dot + 1) : "";
                            await precheckUploadCredentials(file, this.channel(), ext);
                          } catch (err) {
                            const msg = (err as { msg?: string })?.msg || t("base.conversation.upload.failed");
                            Toast.error(t("base.conversation.upload.imageFailed", {
                              values: { name: file.name, message: msg },
                            }));
                            return false;
                          }
                          const reader = new FileReader();
                          const previewUrl = await new Promise<string>(
                            (resolve) => {
                              reader.onloadend = () =>
                                resolve(reader.result as string);
                              reader.onerror = () => resolve("");
                              reader.readAsDataURL(file);
                            },
                          );
                          if (!previewUrl) {
                            Toast.error(t("base.conversation.upload.imageReadFailed", {
                              values: { name: file.name },
                            }));
                            return false;
                          }
                          const { width, height } = await new Promise<{
                            width: number;
                            height: number;
                          }>((resolve) => {
                            const img = new Image();
                            img.onload = () =>
                              resolve({
                                width: img.naturalWidth,
                                height: img.naturalHeight,
                              });
                            img.onerror = () =>
                              resolve({ width: 0, height: 0 });
                            img.src = previewUrl;
                          });
                          return this.sendMediaAndWait(
                            new ImageContent(file, previewUrl, width, height),
                          );
                        };

                        // ── 辅助：发送单个非图片文件 ──────────────
                        const sendFileAttachment = async (file: File): Promise<boolean> => {
                          const name = file.name || "unknown";
                          const dotIndex = name.lastIndexOf(".");
                          const ext =
                            dotIndex > 0 ? name.substring(dotIndex + 1) : "";
                          // 上传前预检 (octo-web#119)。
                          try {
                            await precheckUploadCredentials(file, this.channel(), ext);
                          } catch (err) {
                            const msg = (err as { msg?: string })?.msg || t("base.conversation.upload.failed");
                            Toast.error(t("base.conversation.upload.fileFailed", {
                              values: { name, message: msg },
                            }));
                            return false;
                          }
                          return this.sendMediaAndWait(
                            new FileContent(file, name, ext, file.size),
                          );
                        };

                        // ── 辅助：构建带 mention 的文本 MessageContent ──────────────
                        const buildTextContent = (
                          blockText: string,
                          blockMention?: MentionModel,
                        ) => {
                          const msgContent = new MessageText(blockText);
                          if (blockMention) {
                            const mn = new Mention();
                            mn.all = blockMention.all;
                            mn.uids = blockMention.uids;
                            // 三态 mention：SDK Mention 类型未声明 humans/ais，
                            // 这里用 (mn as any) 把字段透传到 wire JSON。客户端
                            // render 只读 contentObj.mention（下方 override 注入），
                            // server 同时认 mn.humans/mn.ais（PR-A 已支持）。
                            if (blockMention.humans) {
                              (mn as any).humans = blockMention.humans;
                            }
                            if (blockMention.ais) {
                              (mn as any).ais = blockMention.ais;
                            }
                            msgContent.mention = mn;

                            const hasEntities =
                              blockMention.entities &&
                              blockMention.entities.length > 0;
                            const hasThreeState =
                              !!(blockMention.humans || blockMention.ais);

                            if (hasEntities || hasThreeState) {
                              const entities = blockMention.entities;
                              if (!msgContent.contentObj)
                                msgContent.contentObj = {};
                              if (!msgContent.contentObj.mention)
                                msgContent.contentObj.mention = {};
                              if (hasEntities) {
                                msgContent.contentObj.mention.entities =
                                  entities;
                              }
                              if (blockMention.humans) {
                                msgContent.contentObj.mention.humans =
                                  blockMention.humans;
                              }
                              if (blockMention.ais) {
                                msgContent.contentObj.mention.ais =
                                  blockMention.ais;
                              }
                              const originalEncode =
                                msgContent.encode.bind(msgContent);
                              msgContent.encode = () => {
                                try {
                                  const bytes = originalEncode();
                                  const str = new TextDecoder().decode(bytes);
                                  const obj = JSON.parse(str);
                                  if (!obj.mention) obj.mention = {};
                                  if (hasEntities) {
                                    obj.mention.entities = entities;
                                  }
                                  if (blockMention.humans) {
                                    obj.mention.humans = blockMention.humans;
                                  }
                                  if (blockMention.ais) {
                                    obj.mention.ais = blockMention.ais;
                                  }
                                  return new TextEncoder().encode(
                                    JSON.stringify(obj),
                                  );
                                } catch (e) {
                                  console.warn(
                                    "[Mention] encode override failed",
                                    e,
                                  );
                                  return originalEncode();
                                }
                              };
                            }
                          }
                          return msgContent;
                        };

                        // ── 第一阶段：发送顶部附件区的文件（优先级最高） ──────────────
                        // anyMessageSent: 标记本次 onSend 是否实际入队过任何消息。
                        // 若所有顶部附件 + 编辑器内容块都被预检拒绝,且没有文本块,
                        // 则不应再补发空回复消息 (octo-web#119 review by Jerry-Xin)。
                        let anyMessageSent = false;
                        const topFilesToSend = topFiles || [];
                        for (const { file } of topFilesToSend) {
                          try {
                            let sent = false;
                            if (file.type && file.type.startsWith("image/")) {
                              sent = await sendImageFile(file);
                            } else {
                              sent = await sendFileAttachment(file);
                            }
                            if (sent) anyMessageSent = true;
                          } catch (err) {
                            Toast.error(t("base.conversation.upload.fileSendFailed", {
                              values: { name: file.name },
                            }));
                          }
                        }

                        // ── 第二阶段：按编辑器文档顺序发送内容块（文本段和粘贴图片交替） ──
                        if (editorBlocks && editorBlocks.length > 0) {
                          let isFirstTextBlock = true;
                          for (const block of editorBlocks) {
                            try {
                              if (block.type === "text") {
                                const msgContent = buildTextContent(
                                  block.text,
                                  block.mention,
                                );
                                // 第一个文本块携带 reply 信息
                                if (reply && isFirstTextBlock) {
                                  msgContent.reply = reply;
                                  reply = undefined;
                                }
                                isFirstTextBlock = false;
                                if (await this.sendTextAndWaitAck(msgContent)) {
                                  anyMessageSent = true;
                                }
                              } else if (block.type === "image") {
                                if (await sendImageFile(block.file)) {
                                  anyMessageSent = true;
                                }
                              } else if (block.type === "file") {
                                if (await sendFileAttachment(block.file)) {
                                  anyMessageSent = true;
                                }
                              }
                            } catch (err) {
                              console.error(
                                "[Conversation] editorBlock send failed:",
                                err,
                              );
                              Toast.error(t("base.conversation.message.sendFailed"));
                            }
                          }
                          // 如果 reply 还没被消费（没有文本块），附加到一条空白消息;
                          // 但仅当本次确实发出了别的消息时,否则用户的所有附件都被
                          // 预检拒绝、却仍收到一条孤立的空回复气泡 (#119 Jerry-Xin)。
                          if (reply && anyMessageSent) {
                            const emptyContent = new MessageText("");
                            emptyContent.reply = reply;
                            await this.sendTextAndWaitAck(emptyContent);
                          }
                        } else {
                          // fallback：无 editorBlocks 时走旧逻辑（纯文本）
                          if (text && text.trim() !== "") {
                            const msgContent = buildTextContent(text, mention);
                            if (reply) {
                              msgContent.reply = reply;
                            }
                            if (await this.sendTextAndWaitAck(msgContent)) {
                              anyMessageSent = true;
                            }
                          } else if (reply && anyMessageSent) {
                            // 同上: 顶部附件全部被预检拒绝时不要补空回复
                            const emptyContent = new MessageText("");
                            emptyContent.reply = reply;
                            await this.sendTextAndWaitAck(emptyContent);
                          }
                        }
                        if (anyMessageSent) {
                          await this.clearDraftAfterSend(
                            sendDraftGeneration,
                            remoteDraftAtSend,
                          );
                        }
                        this.props.onMessageSent?.();
                      }}
                    ></MessageInput>
                  </div>
                </div>
              </div>
              <ContextMenus
                onContext={(ctx) => {
                  this.contextMenusContext = ctx;
                }}
                onHide={() => {
                  this.setState({ contextMenuMessageID: null });
                }}
                menus={
                  vm.selectMessage
                    ? WKApp.endpoints
                        .messageContextMenus(vm.selectMessage, this)
                        .map((menus) => {
                          return {
                            title: menus.title,
                            onClick: () => {
                              if (menus.onClick) {
                                menus.onClick();
                              }
                            },
                          };
                        })
                    : []
                }
              ></ContextMenus>
              <ContextMenus
                onContext={(ctx) => {
                  this.avatarMenusContext = ctx;
                }}
                menus={[
                  {
                    title: "@TA",
                    onClick: () => {
                      if (!this.vm.selectUID) {
                        return;
                      }
                      const channel = new Channel(
                        this.vm.selectUID,
                        ChannelTypePerson,
                      );
                      const channelInfo =
                        WKSDK.shared().channelManager.getChannelInfo(channel);

                      this.messageInputContext()?.addMention(
                        this.vm.selectUID,
                        channelInfo?.title || "",
                      );
                    },
                  },
                  {
                    title: t("base.conversation.avatarMenu.viewUserInfo"),
                    onClick: () => {
                      if (!this.vm.selectUID) {
                        return;
                      }
                      let fromChannel: Channel | undefined;
                      let vercode: string | undefined;
                      if (this.vm.channel.channelType === ChannelTypeGroup) {
                        fromChannel = this.vm.channel;
                        const subscriber = this.vm.subscriberWithUID(
                          this.vm.selectUID,
                        );
                        if (subscriber?.orgData?.vercode) {
                          vercode = subscriber?.orgData?.vercode;
                        }
                      }
                      WKApp.shared.baseContext.showUserInfo(
                        this.vm.selectUID,
                        fromChannel,
                        vercode,
                      );
                    },
                  },
                ]}
              />
            </>
          );
        }}
      ></Provider>
    );
  }
}

interface ConversationPositionViewProps extends HTMLProps<any> {
  showScrollToBottom: boolean; // 是否显示滚动到底部
  reminders: Reminder[] | undefined; //  提醒项
  unreadCount: number; // 未读数量
  onScrollToBottom: () => Promise<void>; // 滚动到底部
  onReminder: (reminder: Reminder) => Promise<void>;
}

interface ConversationPositionViewState {
  loading: Map<number, boolean>;
}

class ConversationPositionView extends Component<
  ConversationPositionViewProps,
  ConversationPositionViewState
> {
  constructor(props: ConversationPositionViewProps) {
    super(props);
    this.state = {
      loading: new Map(),
    };
  }
  getReminderIcon(reminderType: ReminderType) {
    switch (reminderType) {
      case ReminderType.ReminderTypeMentionMe:
        return new URL("./assets/reminder_mention.png", import.meta.url).href;
      case ReminderType.ReminderTypeApplyJoinGroup:
        return new URL("./assets/reminder_member_invite.png", import.meta.url)
          .href;
    }
  }

  getReminderTypes(reminders: Reminder[] | undefined) {
    if (!reminders || reminders.length === 0) {
      return [];
    }
    const types = new Set<number>();
    if (reminders && reminders.length > 0) {
      for (const reminder of reminders) {
        types.add(reminder.reminderType);
      }
    }
    return Array.from(types);
  }

  getRemindersWithType(type: ReminderType) {
    const { reminders } = this.props;
    const newReminders = new Array<Reminder>();
    if (reminders && reminders.length > 0) {
      for (const reminder of reminders) {
        if (reminder.reminderType === type) {
          newReminders.push(reminder);
        }
      }
    }
    return newReminders;
  }

  render(): React.ReactNode {
    const { loading } = this.state;
    const {
      showScrollToBottom,
      unreadCount,
      onScrollToBottom,
      reminders,
      onReminder,
    } = this.props;
    const types = this.getReminderTypes(reminders);
    return (
      <div className="wk-conversationpositionview">
        <ul>
          {types &&
            types.map((type) => {
              const typeReminders = this.getRemindersWithType(type);
              return (
                <li key={type}>
                  <div
                    className={classNames(
                      "wk-conversationpositionview-item",
                      "wk-reveale",
                    )}
                    onClick={async () => {
                      if (onReminder) {
                        if (typeReminders && typeReminders.length > 0) {
                          loading.set(type, true);
                          this.setState({
                            loading: loading,
                          });
                          await onReminder(typeReminders[0]);
                          loading.set(type, false);
                          this.setState({
                            loading: loading,
                          });
                        }
                      }
                    }}
                  >
                    {this.getReminderIcon(type) ? (
                      loading.get(type) ? (
                        <Spin spinning={true}></Spin>
                      ) : (
                        <img src={this.getReminderIcon(type)}></img>
                      )
                    ) : undefined}

                    {typeReminders.length > 0 ? (
                      <div className="wk-conversation-unread-count">
                        {typeReminders.length}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}

          <li>
            <div
              className={classNames(
                "wk-conversationpositionview-item",
                showScrollToBottom ? "wk-reveale" : undefined,
              )}
              onClick={async () => {
                if (onScrollToBottom) {
                  loading.set(-1, true);
                  this.setState({
                    loading: loading,
                  });
                  await onScrollToBottom();
                  loading.set(-1, false);
                  this.setState({
                    loading: loading,
                  });
                }
              }}
            >
              {loading.get(-1) ? (
                <Spin spinning={true}></Spin>
              ) : (
                <img src={require("./assets/message_down.png")}></img>
              )}
              {unreadCount > 0 ? (
                <div className="wk-conversation-unread-count">
                  {unreadCount}
                </div>
              ) : null}
            </div>
          </li>
        </ul>
      </div>
    );
  }
}

interface ReplyViewProps {
  message: Message;
  vm: ConversationVM;
  onClose?: () => void;
}
class ReplyView extends Component<ReplyViewProps> {
  render(): React.ReactNode {
    const { message, onClose, vm } = this.props;
    const fromChannelInfo = WKSDK.shared().channelManager.getChannelInfo(
      new Channel(message.fromUID, ChannelTypePerson),
    );
    const isEdit = vm.currentHandlerType === 2;
    const label = isEdit
      ? t("base.conversation.replyView.edit")
      : t("base.conversation.replyView.reply");
    const userName = fromChannelInfo?.title || "";
    const messageText = message.remoteExtra?.isEdit
      ? message.remoteExtra?.contentEdit?.conversationDigest
      : message.content.conversationDigest;

    return (
      <div className="wk-replyview-new">
        <button
          className="wk-replyview-new-close"
          onClick={() => {
            if (onClose) {
              onClose();
            }
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <div className="wk-replyview-new-divider"></div>
        <div className="wk-replyview-new-content">
          <span className="wk-replyview-new-label">{label}</span>
          <span className="wk-replyview-new-name">{userName}：</span>
          <span className="wk-replyview-new-text">{messageText}</span>
        </div>
      </div>
    );
  }
}

interface MultiplePanelProps {
  onClose?: () => void;
  onForward?: () => void; // 逐条转发
  onMergeForward?: () => void; // 合并转发
  onDelete?: () => void; // 删除
  onAddToMatter?: (anchor: HTMLElement) => void; // 添加到事项（传出按钮 DOM 给菜单定位）
  onCreateMatter?: () => void; // 创建新事项
}
class MultiplePanel extends Component<MultiplePanelProps> {
  private matterBtnRef = React.createRef<HTMLButtonElement>();

  render(): React.ReactNode {
    const {
      onClose,
      onForward,
      onMergeForward,
      onDelete,
      onAddToMatter,
      onCreateMatter,
    } = this.props;
    return (
      <div className="wk-multiplepanel">
        <button className="wk-multiplepanel-btn" onClick={onForward}>
          {t("base.conversation.multiplePanel.forwardOneByOne")}
        </button>
        <div className="wk-multiplepanel-sep" />
        <button className="wk-multiplepanel-btn" onClick={onMergeForward}>
          {t("base.conversation.multiplePanel.mergeForward")}
        </button>
        <div className="wk-multiplepanel-sep" />
        {/* 创建新事项 — 从多选消息智能创建（PRD §3） */}
        <button
          className="wk-multiplepanel-btn wk-multiplepanel-btn--matter"
          onClick={() => {
            if (onCreateMatter) onCreateMatter();
          }}
          title={t("base.conversation.multiplePanel.createMatter")}
        >
          {t("base.conversation.multiplePanel.createMatter")}
        </button>
        <div className="wk-multiplepanel-sep" />
        {/* 同步到事项 — 点击由调用方弹出菜单（dmworktodo 模块接管） */}
        <button
          ref={this.matterBtnRef}
          className="wk-multiplepanel-btn wk-multiplepanel-btn--matter"
          onClick={() => {
            if (onAddToMatter && this.matterBtnRef.current) {
              onAddToMatter(this.matterBtnRef.current);
            }
          }}
          title={t("base.conversation.multiplePanel.syncToMatter")}
        >
          {t("base.conversation.multiplePanel.syncToMatter")}
        </button>
        <div className="wk-multiplepanel-sep" />
        <button
          className="wk-multiplepanel-btn wk-multiplepanel-btn--danger"
          onClick={onDelete}
        >
          {t("base.conversation.multiplePanel.delete")}
        </button>
        <div className="wk-multiplepanel-sep" />
        <button
          className="wk-multiplepanel-close"
          onClick={onClose}
          aria-label={t("base.conversation.multiplePanel.cancelSelection")}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M1 1L13 13M13 1L1 13"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    );
  }
}
