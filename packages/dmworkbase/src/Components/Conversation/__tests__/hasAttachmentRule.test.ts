import { describe, expect, it, vi } from "vitest"
vi.mock("react-virtuoso", () => ({ TableVirtuoso: () => null, Virtuoso: () => null, VirtuosoGrid: () => null }))
import { isAttachmentContentType } from "../vm"
import { MessageContentTypeConst } from "../../../Service/Const"

// DAP-271 finding 6：message_sent.has_attachment 的内容类型判定规则(贴纸/名片/卡片边界)。
describe("isAttachmentContentType — has_attachment 派生规则 (DAP-271 finding 6)", () => {
  it("图片/gif/语音/小视频/文件/富文本 = 附件 (true)", () => {
    for (const t of [
      MessageContentTypeConst.image,
      MessageContentTypeConst.gif,
      MessageContentTypeConst.voice,
      MessageContentTypeConst.smallVideo,
      MessageContentTypeConst.file,
      MessageContentTypeConst.richText,
    ]) {
      expect(isAttachmentContentType(t)).toBe(true)
    }
  })

  it("纯文本/贴纸/名片/互动卡/文档转发卡 = 非附件 (false)", () => {
    for (const t of [
      1, // 文本
      MessageContentTypeConst.lottieSticker,
      MessageContentTypeConst.lottieEmojiSticker,
      MessageContentTypeConst.card, // 名片
      MessageContentTypeConst.interactiveCard,
      MessageContentTypeConst.docShareCard,
    ]) {
      expect(isAttachmentContentType(t)).toBe(false)
    }
  })

  it("undefined 内容类型安全归 false", () => {
    expect(isAttachmentContentType(undefined)).toBe(false)
  })
})
