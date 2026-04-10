import React, { Component } from "react"
import { Toast } from "@douyinfe/semi-ui"
import { MessageSquare, X } from "lucide-react"
import WKApp from "../../App"
import "./index.css"

export interface ThreadCreateProps {
  groupNo: string
  sourceMessageId?: number
  onSuccess?: () => void
  onCancel?: () => void
}

interface ThreadCreateState {
  name: string
  loading: boolean
}

export class ThreadCreate extends Component<ThreadCreateProps, ThreadCreateState> {
  constructor(props: ThreadCreateProps) {
    super(props)
    this.state = {
      name: "",
      loading: false,
    }
  }

  handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ name: e.target.value })
  }

  handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !this.state.loading && this.state.name.trim()) {
      this.handleSubmit()
    }
  }

  handleSubmit = async () => {
    const { groupNo, sourceMessageId, onSuccess } = this.props
    const { name } = this.state

    if (!name.trim()) {
      Toast.warning("请输入子区名称")
      return
    }

    if (name.length > 50) {
      Toast.warning("子区名称不能超过50个字符")
      return
    }

    this.setState({ loading: true })

    try {
      await WKApp.dataSource.channelDataSource.threadCreate(
        groupNo,
        name.trim(),
        sourceMessageId
      )
      Toast.success("创建成功")
      onSuccess?.()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "创建失败"
      Toast.error(msg)
      this.setState({ loading: false })
    }
  }

  render() {
    const { onCancel } = this.props
    const { name, loading } = this.state

    return (
      <div className="wk-thread-create">
        <div className="wk-thread-create-header">
          <MessageSquare className="wk-thread-create-icon" size={24} />
          <span className="wk-thread-create-title">创建子区</span>
          {onCancel && (
            <div className="wk-thread-create-close" onClick={onCancel}>
              <X size={18} />
            </div>
          )}
        </div>
        <div className="wk-thread-create-body">
          <input
            className="wk-thread-create-input"
            type="text"
            placeholder="输入子区名称"
            value={name}
            onChange={this.handleNameChange}
            onKeyDown={this.handleKeyDown}
            maxLength={50}
            autoFocus
          />
        </div>
        <div className="wk-thread-create-footer">
          {onCancel && (
            <button
              className="wk-thread-create-btn wk-thread-create-btn-cancel"
              onClick={onCancel}
              disabled={loading}
            >
              取消
            </button>
          )}
          <button
            className="wk-thread-create-btn wk-thread-create-btn-submit"
            onClick={this.handleSubmit}
            disabled={loading || !name.trim()}
          >
            {loading ? "创建中..." : "创建"}
          </button>
        </div>
      </div>
    )
  }
}

export default ThreadCreate
