// QQ 文档全局 pad 对象类型声明
interface QQDocSelection {
  selectAll?: () => void
  setRange?: (range: unknown) => void
  subStoryInfo?: {
    contentRange: unknown
  }
}

interface QQDocClipboard {
  html?: string
  plain?: string
}

interface QQDocClipboardManager {
  copy: (range?: unknown) => void
  customClipboard?: QQDocClipboard
}

interface QQDocEditor {
  _docEnv: {
    copyable: boolean
  }
  selection: QQDocSelection
  getDocumentRange?: () => unknown
  range?: unknown
  clipboardManager: QQDocClipboardManager
}

interface QQDocClientVars {
  padTitle: string
  padId: string
}

interface QQDocPad {
  editor: QQDocEditor
  clientVars: QQDocClientVars
}

declare var pad: QQDocPad | undefined

interface Window {
  pad?: QQDocPad
}
