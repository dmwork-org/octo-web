import WKSDK from "wukongimjssdk";
import { ChannelInfoListener } from "wukongimjssdk";
import {
  Channel,
  ChannelInfo,
  ChannelTypePerson,
  ChannelTypeGroup,
  MessageStatus,
} from "wukongimjssdk";
import { Component, CSSProperties, HTMLProps } from "react";
import "./index.css";
import { BubblePosition, MessageWrap } from "../../Service/Model";
import ConversationContext from "../../Components/Conversation/context";
import React from "react";
import {
  MessageContentTypeConst,
  MessageReasonCode,
} from "../../Service/Const";
import { IConversationProvider } from "../../Service/DataSource/DataProvider";
import WKApp from "../../App";
import { resolveExternalForViewer } from "../../Utils/externalViewer";
import { css } from "@emotion/react";
// import ClockLoader from "react-spinners/ClockLoader";
import Checkbox from "../../Components/Checkbox";
import classNames from "classnames";
import { Popconfirm } from "@douyinfe/semi-ui";
import WKAvatar from "../../Components/WKAvatar";
import AiBadge from "../../Components/AiBadge";
import { getTitleColor } from "./head";
import moment from "moment";
import ThreadIndicator, {
  ThreadIndicatorData,
} from "../../Components/ThreadIndicator";

interface MessageBaseProps extends HTMLProps<any> {
  message: MessageWrap;
  context: ConversationContext;
  hiddenStatus?: boolean;
  threadInfo?: ThreadIndicatorData;
  onThreadClick?: () => void;
  bubbleStyle?: CSSProperties;
  hiddeBubble?: boolean;
  onBubble?: () => void;
}

export default class MessageBase extends Component<MessageBaseProps, any> {
  channelInfoListener!: ChannelInfoListener;
  conversationProvider: IConversationProvider;

  constructor(props: any) {
    super(props);
    this.conversationProvider = WKApp.conversationProvider;
  }
  componentDidMount() {
    const self = this;
    this.channelInfoListener = (channelInfo: ChannelInfo) => {
      if (!channelInfo) {
        return;
      }
      const { message } = self.props;
      if (message.fromUID === channelInfo.channel.channelID) {
        self.setState({});
      }
    };
    WKSDK.shared().channelManager.addListener(this.channelInfoListener);
  }

  componentWillUnmount() {
    WKSDK.shared().channelManager.removeListener(this.channelInfoListener);
  }

  forceStandalone() {
    const { context, message } = this.props;
    return context.forceStandaloneMessage?.(message.message) || false;
  }

  getDisplayBubblePosition(): BubblePosition {
    if (this.forceStandalone()) {
      return BubblePosition.single;
    }
    return this.props.message.bubblePosition;
  }

  // 消息是否连续的
  isContinue(): boolean {
    if (this.forceStandalone()) {
      return false;
    }
    const { message } = this.props;
    if (message.preMessage) {
      if (message.fromUID === message.preMessage.fromUID) {
        return true;
      }
    }
    return false;
  }

  getMessageStyle(hasContinue: boolean, message: MessageWrap) {
    const messageStyle: any = {};
    messageStyle.marginBottom = "15px";
    if (this.forceStandalone()) {
      return messageStyle;
    }
    if (hasContinue && message.send) {
      messageStyle.marginTop = "4px";
      messageStyle.marginBottom = "0px";
      messageStyle.marginLeft = "0px";
      messageStyle.marginRight = "5px";
    }
    if (hasContinue && !message.send) {
      messageStyle.marginTop = "4px";
      messageStyle.marginBottom = "0px";
      messageStyle.marginRight = "0px";
    }
    if (message.preMessage && message.preMessage.fromUID !== message.fromUID) {
      if (
        message.nextMessage &&
        message.nextMessage.fromUID === message.fromUID
      ) {
        messageStyle.marginBottom = "0px";
      }
    }
    if (
      message.nextMessage &&
      message.nextMessage.fromUID !== message.fromUID
    ) {
      messageStyle.marginBottom = "15px";
    }
    return messageStyle;
  }

  getBubbleRadius(hasContinue: boolean, message: MessageWrap): string {
    if (message.send) {
      return "20px 4px 8px 20px";
    }
    if (
      hasContinue &&
      message.nextMessage &&
      message.nextMessage.fromUID === message.fromUID
    ) {
      return "8px 20px 20px 8px";
    }
    if (
      hasContinue &&
      message.nextMessage &&
      message.nextMessage.fromUID !== message.fromUID
    ) {
      return "8px 20px 20px 8px";
    }
    return "8px 20px 20px";
  }

  getBubbleStyle() {
    const { bubbleStyle, message } = this.props;
    let newBubbleStyle = bubbleStyle;
    const hasContinue = this.isContinue();
    if (!newBubbleStyle) {
      newBubbleStyle = {};
    }
    newBubbleStyle.borderRadius = this.getBubbleRadius(hasContinue, message);
    return newBubbleStyle;
  }

  onMessageRevoke() {
    const { message } = this.props;
    this.conversationProvider.revokeMessage(message.message);
  }
  onMultiple() {
    const { context } = this.props;
    context.setEditOn(true);
  }

  onMessageDelete() {
    const { context, message } = this.props;
    context.deleteMessages([message.message]);
  }

  getBubbleBoxClassName() {
    const { message, hiddeBubble } = this.props;
    const bubblePosition = this.getDisplayBubblePosition();
    let messageBubble = "wk-message-base-bubble-box";

    if (hiddeBubble) {
      messageBubble += " hide";
    }
    if (message.contentType === MessageContentTypeConst.file) {
      messageBubble += " fileBox";
    }
    if (message.send) {
      messageBubble += " send";
    } else {
      messageBubble += " recv";
      if (this.isAiMessage()) {
        messageBubble += " ai-panel";
      }
    }
    if (bubblePosition === BubblePosition.first) {
      messageBubble += " first";
    } else if (bubblePosition === BubblePosition.middle) {
      messageBubble += " middle";
    } else if (bubblePosition === BubblePosition.last) {
      messageBubble += " last";
    } else if (bubblePosition === BubblePosition.single) {
      messageBubble += " single";
    }
    return messageBubble;
  }

  isAiMessage() {
    const { message } = this.props;
    if (message.send) return false;
    const channelInfo = WKSDK.shared().channelManager.getChannelInfo(
      new Channel(message.fromUID, ChannelTypePerson)
    );
    return channelInfo?.orgData?.robot === 1;
  }

  needAvatar() {
    const { message } = this.props;
    const bubblePosition = this.getDisplayBubblePosition();
    return (
      (bubblePosition === BubblePosition.first ||
        bubblePosition === BubblePosition.single) &&
      !!message.fromUID
    );
  }

  needHead() {
    const bubblePosition = this.getDisplayBubblePosition();
    return (
      bubblePosition === BubblePosition.first ||
      bubblePosition === BubblePosition.single
    );
  }

  getMessageErrorReason() {
    const { message } = this.props;
    switch (message.reasonCode) {
      case MessageReasonCode.reasonSubscriberNotExist:
        return "您已被踢出群聊。";
      case MessageReasonCode.reasonNotAllowSend:
      case MessageReasonCode.reasonNotInWhitelist:
      case MessageReasonCode.reasonInBlacklist: {
        const { context } = this.props;
        if (context) {
          const ch = context.channel();
          if (ch && ch.channelType === ChannelTypePerson) {
            const chInfo = WKSDK.shared().channelManager.getChannelInfo(ch);
            if (chInfo?.orgData?.robot === 1) {
              return "请先添加好友后再与该机器人对话";
            }
          }
        }
        return "你已被禁言或全员禁言";
      }
      case MessageReasonCode.reasonSystemError:
        return "系统错误";
    }
  }

  render() {
    const { message, context, hiddeBubble, bubbleStyle } = this.props;
    const hasContinue = this.isContinue();
    const channelInfo = WKSDK.shared().channelManager.getChannelInfo(
      new Channel(message.fromUID, ChannelTypePerson)
    );
    const avatarChannel =
      channelInfo?.channel || new Channel(message.fromUID, ChannelTypePerson);
    const displayName =
      channelInfo?.orgData?.displayName ||
      channelInfo?.title ||
      message.fromUID;
    if (!channelInfo && message.fromUID && message.fromUID !== "") {
      WKSDK.shared().channelManager.fetchChannelInfo(
        new Channel(message.fromUID, ChannelTypePerson)
      );
    }
    const messageStyle = this.getMessageStyle(hasContinue, message);
    const isAi = this.isAiMessage();
    const showHead = this.needHead();
    const showAvatar = this.needAvatar();
    const timeStr = moment(message.timestamp * 1000).format("HH:mm");

    // 外部群成员来源标记（YUJ-53 / YUJ-64）：按当前查看 Space 相对渲染。
    // 优先读 msg-level 新字段 from_home_space_id / from_home_space_name；
    // 缺失时回落到旧 msg-level (from_is_external/from_source_space_name)，
    // 再回落到 channelInfo.orgData。系统消息 / 机器人 / AI 不展示。
    const isGroupMsg = message.channel.channelType === ChannelTypeGroup;
    const viewerSpaceId = WKApp.shared.currentSpaceId;
    const msgRes = resolveExternalForViewer({
      homeSpaceId: message.fromHomeSpaceId,
      homeSpaceName: message.fromHomeSpaceName,
      isExternalLegacy: message.fromIsExternal ? 1 : 0,
      sourceSpaceNameLegacy: message.fromSourceSpaceName,
      viewerSpaceId,
    });
    const hasMsgLevelExt =
      !!message.fromHomeSpaceId ||
      (message.fromIsExternal && !!message.fromSourceSpaceName);
    const orgRes = isGroupMsg
      ? resolveExternalForViewer({
          homeSpaceId: channelInfo?.orgData?.home_space_id as
            | string
            | undefined,
          homeSpaceName: channelInfo?.orgData?.home_space_name as
            | string
            | undefined,
          isExternalLegacy: channelInfo?.orgData?.is_external,
          sourceSpaceNameLegacy: channelInfo?.orgData?.source_space_name as
            | string
            | undefined,
          viewerSpaceId,
        })
      : { isExternal: false, sourceSpaceName: "" };
    const extResolved = hasMsgLevelExt ? msgRes : orgRes;
    const showExtOrigin = !isAi && extResolved.isExternal;
    const extSourceSpaceName = extResolved.sourceSpaceName;

    return (
      <div
        className={classNames(
          "wk-message-base",
          context.editOn() ? "wk-message-base-check-open" : undefined
        )}
        onClick={
          context.editOn()
            ? (event) => {
                context.checkeMessage(message.message, !message.checked);
              }
            : undefined
        }
      >
        {context.editOn() ? (
          <div
            className="wk-message-base-checkBox"
            style={{ marginBottom: messageStyle.marginBottom }}
          >
            <Checkbox checked={message.checked} />
          </div>
        ) : null}
        <div
          className={
            message.send ? "wk-message-base-send" : "wk-message-base-recv"
          }
          style={messageStyle}
        >
          <div
            className={"wk-message-base-box"}
            style={{ pointerEvents: context.editOn() ? "none" : undefined }}
          >
            {message.send && message.status === MessageStatus.Fail ? (
              <Popconfirm
                title="是否重新发送"
                okText="是"
                cancelText="否"
                onConfirm={() => {
                  context.resendMessage(message.message);
                }}
              >
                <div className="messageFail">
                  <img src={require("./msg_status_fail.png")} alt=""></img>
                </div>
              </Popconfirm>
            ) : undefined}

            {/* 头像：flex item，仅 first/single 显示，否则占位 */}
            <div
              className={classNames(
                "senderAvatar",
                showAvatar ? undefined : "senderAvatar-placeholder"
              )}
              onClick={
                showAvatar
                  ? (el) => {
                      context.onTapAvatar(message.fromUID, el);
                    }
                  : undefined
              }
            >
              {showAvatar && (
                <WKAvatar
                  channel={avatarChannel}
                  style={{ width: "32px", height: "32px" }}
                />
              )}
            </div>

            {/* 消息体列 */}
            <div className="wk-msg-body">
              {/* Head 行：name + time (发送和接收都显示,布局一致) */}
              {showHead && !isAi && (
                <div className="wk-msg-head">
                  <span
                    className="wk-msg-head-name"
                    style={{ color: getTitleColor(displayName) }}
                  >
                    {displayName}
                  </span>
                  {channelInfo?.orgData?.robot === 1 && (
                    <AiBadge size="small" />
                  )}
                  <span className="wk-msg-head-time">{timeStr}</span>
                </div>
              )}
              {/* 外部群成员来源标识（YUJ-53）：优先 msg-level，回落 orgData */}
              {showHead && showExtOrigin && extSourceSpaceName && (
                <div className="wk-msg-head-origin ext-origin">
                  来源: {extSourceSpaceName}
                </div>
              )}

              <div className={this.getBubbleBoxClassName()}>
                <div
                  className="wk-message-base-bubble"
                  style={bubbleStyle}
                  onContextMenu={(event) => {
                    context.showContextMenus(message.message, event);
                  }}
                  data-message-seq={message.messageSeq}
                >
                  {/* AI 面板头部 */}
                  {isAi && showHead && (
                    <div className="wk-ai-panel-head">
                      <span className="wk-ai-panel-agent-name">
                        {displayName}
                      </span>
                      <AiBadge size="small" />
                    </div>
                  )}
                  <div className="wk-message-base-content">
                    {this.props.children}
                  </div>
                  {/* AI 面板底栏 */}
                  {isAi && (
                    <div className="wk-ai-panel-foot">
                      <span className="messageTime">{timeStr}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Thread 指示条 */}
              {this.props.threadInfo && (
                <ThreadIndicator
                  data={this.props.threadInfo}
                  isSend={message.send}
                  onClick={this.props.onThreadClick}
                />
              )}
            </div>
          </div>

          {message.status === MessageStatus.Fail ? (
            <div className="wk-message-error-reason">
              {this.getMessageErrorReason()}
            </div>
          ) : undefined}
        </div>
      </div>
    );
  }
}
