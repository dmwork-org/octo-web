import React, { Component } from "react"
import { Channel, ChannelTypePerson, WKSDK } from "wukongimjssdk"
import { Modal, Toast, Spin } from "@douyinfe/semi-ui"
import { Thread, ThreadStatus } from "../../Service/Thread"
import { ThreadPanelVM, ThreadPanelState } from "./vm"
import { X, MessageSquare, Hash, List, Bell, Plus, ChevronDown } from "lucide-react"
import classNames from "classnames"
import { Conversation } from "../Conversation"
import { ChannelTypeCommunityTopic } from "../../Service/Const"
import { ErrorBoundary } from "../ErrorBoundary"
import WKApp from "../../App"
import { formatRelativeTime } from "../../Utils/time"
import "./index.css"

export interface ThreadPanelProps {
  groupNo: string
  thread: Thread | null
  onClose: () => void
  onThreadSelect?: (thread: Thread) => void
  onCreateThread?: () => void
}

interface ThreadPanelComponentState {
  view: "detail" | "list"
  activeExpanded: boolean
  archivedExpanded: boolean
  vmState: ThreadPanelState
  threads: Thread[]
  threadsLoading: boolean
}

export default class ThreadPanel extends Component<ThreadPanelProps, ThreadPanelComponentState> {
  private vm: ThreadPanelVM | null = null

  constructor(props: ThreadPanelProps) {
    super(props)
    this.state = {
      view: props.thread ? "detail" : "list",
      activeExpanded: true,
      archivedExpanded: false,
      vmState: {
        loading: false,
        thread: props.thread,
        parentMessage: null,
        replies: [],
        hasMore: false,
        error: null,
      },
      threads: [],
      threadsLoading: true,
    }
  }

  componentDidMount() {
    this.loadThreads()
    if (this.props.thread) {
      this.initVM(this.props.thread.short_id)
    }
  }

  componentDidUpdate(prevProps: ThreadPanelProps) {
    if (this.props.thread !== prevProps.thread) {
      if (this.props.thread) {
        this.setState({ view: "detail" })
        this.initVM(this.props.thread.short_id)
      } else {
        this.setState({ view: "list" })
      }
    }
    if (this.props.groupNo !== prevProps.groupNo) {
      this.loadThreads()
    }
  }

  private initVM(threadShortId: string) {
    this.vm = new ThreadPanelVM(this.props.groupNo, threadShortId, (state) => {
      this.setState({ vmState: state })
    })
    this.vm.load()
  }

  private async loadThreads() {
    const { groupNo } = this.props
    if (!groupNo) return

    this.setState({ threadsLoading: true })
    try {
      const threads = await WKApp.dataSource.channelDataSource.threadList(groupNo)
      this.setState({ threads, threadsLoading: false })
    } catch {
      this.setState({ threadsLoading: false })
    }
  }

  private handleThreadClick = (thread: Thread) => {
    this.setState({
      view: "detail",
      vmState: { ...this.state.vmState, thread },
    })
    this.props.onThreadSelect?.(thread)
    this.initVM(thread.short_id)
  }

  private handleBackToList = () => {
    this.setState({ view: "list" })
  }

  private handleCreateThread = () => {
    const { groupNo, onCreateThread } = this.props
    if (onCreateThread) {
      onCreateThread()
      return
    }

    let threadName = ""
    Modal.confirm({
      title: "创建子区",
      icon: null,
      okText: "创建",
      cancelText: "取消",
      content: (
        <div>
          <div style={{ marginBottom: "8px", fontSize: "14px", color: "var(--wk-text-secondary)" }}>
            话题名称
          </div>
          <input
            type="text"
            placeholder="输入讨论话题..."
            style={{
              width: "100%",
              padding: "10px 12px",
              background: "var(--wk-bg-base)",
              border: "1px solid var(--wk-border-default)",
              borderRadius: "6px",
              fontSize: "14px",
              color: "var(--wk-text-primary)",
              outline: "none",
              boxSizing: "border-box",
            }}
            onChange={(e) => {
              threadName = e.target.value
            }}
            autoFocus
          />
        </div>
      ),
      onOk: async () => {
        if (!threadName || threadName.trim() === "") {
          Toast.error("话题名称不能为空")
          return
        }
        try {
          await WKApp.dataSource.channelDataSource.threadCreate(groupNo, threadName.trim())
          Toast.success("子区创建成功")
          this.loadThreads()
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "创建失败"
          Toast.error(msg)
        }
      },
    })
  }

  private renderHeader() {
    const { onClose } = this.props
    const { view, vmState } = this.state
    const thread = vmState.thread

    return (
      <div className="wk-thread-panel-header">
        <div className="wk-thread-panel-header-title">
          {view === "list" ? (
            <>
              <MessageSquare className="wk-thread-panel-header-icon" size={18} />
              <span>子区</span>
            </>
          ) : (
            <>
              <Hash className="wk-thread-panel-header-icon" size={18} />
              <span>{thread?.name || "子区"}</span>
            </>
          )}
        </div>
        <div className="wk-thread-panel-header-actions">
          {view === "detail" && (
            <div
              className="wk-thread-panel-header-btn"
              onClick={this.handleBackToList}
              title="返回列表"
            >
              <List size={16} />
            </div>
          )}
          {view === "list" && (
            <div className="wk-thread-panel-header-btn" title="通知设置">
              <Bell size={16} />
            </div>
          )}
          <div className="wk-thread-panel-header-btn" onClick={onClose}>
            <X size={18} />
          </div>
        </div>
      </div>
    )
  }

  private renderListView() {
    const { threads, threadsLoading, activeExpanded, archivedExpanded } = this.state

    const activeThreads = threads.filter(t => t.status === ThreadStatus.Active)
    const archivedThreads = threads.filter(t => t.status === ThreadStatus.Archived)

    return (
      <div className="wk-thread-panel-list-view">
        {/* 新建子区按钮 */}
        <div className="wk-thread-panel-create-btn" onClick={this.handleCreateThread}>
          <Plus size={16} />
          <span>新建子区</span>
        </div>

        {threadsLoading ? (
          <div className="wk-thread-panel-loading">
            <Spin />
          </div>
        ) : (
          <>
            {/* 活跃中分组 */}
            <div className="wk-thread-panel-group">
              <div
                className="wk-thread-panel-group-header"
                onClick={() => this.setState({ activeExpanded: !activeExpanded })}
              >
                <ChevronDown
                  size={14}
                  className={classNames(
                    "wk-thread-panel-group-arrow",
                    !activeExpanded && "wk-thread-panel-group-arrow-collapsed"
                  )}
                />
                <span>活跃中</span>
              </div>
              {activeExpanded && (
                <div className="wk-thread-panel-group-list">
                  {activeThreads.length === 0 ? (
                    <div className="wk-thread-panel-empty">暂无活跃子区</div>
                  ) : (
                    activeThreads.map(thread => this.renderThreadItem(thread))
                  )}
                </div>
              )}
            </div>

            {/* 已归档分组 */}
            {archivedThreads.length > 0 && (
              <div className="wk-thread-panel-group">
                <div
                  className="wk-thread-panel-group-header"
                  onClick={() => this.setState({ archivedExpanded: !archivedExpanded })}
                >
                  <ChevronDown
                    size={14}
                    className={classNames(
                      "wk-thread-panel-group-arrow",
                      !archivedExpanded && "wk-thread-panel-group-arrow-collapsed"
                    )}
                  />
                  <span>已归档</span>
                </div>
                {archivedExpanded && (
                  <div className="wk-thread-panel-group-list">
                    {archivedThreads.map(thread => this.renderThreadItem(thread))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  private getCreatorName(thread: Thread): string {
    if (thread.creator_name) {
      return thread.creator_name
    }
    if (thread.creator_uid) {
      const channelInfo = WKSDK.shared().channelManager.getChannelInfo(
        new Channel(thread.creator_uid, ChannelTypePerson)
      )
      return channelInfo?.title || thread.creator_uid
    }
    return "未知"
  }

  private renderThreadItem(thread: Thread) {
    const hasUnread = (thread.unread_count ?? 0) > 0
    const creatorName = this.getCreatorName(thread)

    return (
      <div
        key={thread.short_id}
        className="wk-thread-panel-item"
        onClick={() => this.handleThreadClick(thread)}
      >
        <div className="wk-thread-panel-item-header">
          <div className="wk-thread-panel-item-title">
            {hasUnread && <span className="wk-thread-panel-item-unread" />}
            <span className="wk-thread-panel-item-name">{thread.name}</span>
          </div>
          <span className="wk-thread-panel-item-time">{formatRelativeTime(thread.updated_at)}</span>
        </div>
        <div className="wk-thread-panel-item-meta">
          {thread.message_count || 0} 条回复 · 参与 {thread.member_count || 0} 人 · {creatorName} 发起
        </div>
        {thread.last_message_content && (
          <div className="wk-thread-panel-item-preview">
            {thread.last_message_sender_name}: {thread.last_message_content}
          </div>
        )}
        {!thread.last_message_content && (
          <div className="wk-thread-panel-item-preview wk-thread-panel-item-preview-empty">
            暂无消息
          </div>
        )}
      </div>
    )
  }

  private renderDetailView() {
    const { vmState } = this.state
    const { loading, thread } = vmState

    if (loading) {
      return (
        <div className="wk-thread-panel-loading">
          <Spin />
        </div>
      )
    }

    if (!thread) {
      return (
        <div className="wk-thread-panel-empty">
          未找到子区
        </div>
      )
    }

    // 使用 Thread 的 channel_id 创建 Channel 对象
    const threadChannel = new Channel(thread.channel_id, ChannelTypeCommunityTopic)

    return (
      <div className="wk-thread-panel-conversation">
        <ErrorBoundary moduleName="子区消息">
          <Conversation
            key={thread.channel_id}
            channel={threadChannel}
            shouldShowHistorySplit={false}
          />
        </ErrorBoundary>
      </div>
    )
  }

  render() {
    const { view } = this.state

    return (
      <div className="wk-thread-panel">
        {this.renderHeader()}
        {view === "list" ? this.renderListView() : this.renderDetailView()}
      </div>
    )
  }
}
