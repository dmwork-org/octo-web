import { Thread } from "../../Service/Thread"
import { Message } from "wukongimjssdk"
import WKApp from "../../App"

export interface ThreadPanelState {
  loading: boolean
  thread: Thread | null
  parentMessage: Message | null
  replies: Message[]
  hasMore: boolean
  error: string | null
}

export class ThreadPanelVM {
  private groupNo: string
  private threadShortId: string
  private onStateChange: (state: ThreadPanelState) => void

  private state: ThreadPanelState = {
    loading: true,
    thread: null,
    parentMessage: null,
    replies: [],
    hasMore: false,
    error: null,
  }

  constructor(
    groupNo: string,
    threadShortId: string,
    onStateChange: (state: ThreadPanelState) => void
  ) {
    this.groupNo = groupNo
    this.threadShortId = threadShortId
    this.onStateChange = onStateChange
  }

  getState(): ThreadPanelState {
    return this.state
  }

  private setState(newState: Partial<ThreadPanelState>) {
    this.state = { ...this.state, ...newState }
    this.onStateChange(this.state)
  }

  async load() {
    this.setState({ loading: true, error: null })
    try {
      // 获取 thread 详情
      const threads = await WKApp.dataSource.channelDataSource.threadList(this.groupNo)
      const thread = threads.find(t => t.short_id === this.threadShortId) || null
      this.setState({ loading: false, thread })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "加载失败"
      this.setState({ loading: false, error: msg })
    }
  }
}
