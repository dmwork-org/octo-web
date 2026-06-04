import { useMemo } from "react";
import WKApp from "../../App";
import type { MessageWrap } from "../../Service/Model";
import { RichTextBlockType } from "../../Messages/RichText/RichTextContent";
import type {
  RichTextBlock,
  RichTextContent,
} from "../../Messages/RichText/RichTextContent";
import {
  formatFileSize,
  getExtension,
  getFileIconInfo,
} from "../../Messages/File";
import { t } from "../../i18n";
import { isSafeUrl } from "../../Utils/security";
import type { MixedContentBlock } from "../../ui/message/MixedContent";
import { getMessageRow } from "./useMessageRow";
import type { MessageRowSelectionState } from "./useMessageRow";

function resolveFileUrl(rawUrl?: string): string {
  if (!rawUrl) return "";
  let fileUrl = WKApp.dataSource.commonDataSource.getFileURL(rawUrl);
  if (!fileUrl) return "";
  if (!fileUrl.startsWith("http")) {
    if (typeof window === "undefined") return "";
    fileUrl = `${window.location.origin}/${fileUrl.replace(/^\//, "")}`;
  }
  return isSafeUrl(fileUrl) ? fileUrl : "";
}

export function getRichTextBlocksUI(
  blocks: RichTextBlock[]
): MixedContentBlock[] {
  return blocks.reduce<MixedContentBlock[]>((acc, block, index) => {
    const id = `richtext-${index}`;
    if (block.type === RichTextBlockType.image) {
      if (!block.url) return acc;
      acc.push({
        id,
        type: "image",
        src: block.url,
        alt: block.name,
      });
      return acc;
    }

    if (block.type === RichTextBlockType.file) {
      const extension = getExtension(block.extension || "", block.name);
      const iconInfo = getFileIconInfo(extension, block.name);
      acc.push({
        id,
        type: "file",
        name: block.name || t("base.messageFile.unknownFile"),
        size: formatFileSize(block.size || 0),
        extension: extension.toUpperCase(),
        iconColor: iconInfo.color,
        iconLabel: iconInfo.label,
        url: resolveFileUrl(block.url),
        caption: block.caption,
      });
      return acc;
    }

    const text = block.text || "";
    if (block.type === RichTextBlockType.text || text) {
      acc.push({
        id,
        type: "text",
        content: text,
      });
    }
    return acc;
  }, []);
}

export function getRichTextMessageUI(
  message: MessageWrap,
  selection?: MessageRowSelectionState
) {
  const content = message.content as RichTextContent;
  return {
    row: getMessageRow(message, selection),
    content: {
      blocks: getRichTextBlocksUI(content.content || []),
    },
  };
}

export function useRichTextMessageUI(message: MessageWrap) {
  return useMemo(() => getRichTextMessageUI(message), [message]);
}
