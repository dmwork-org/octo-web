import React from "react";
import { Download } from "lucide-react";
import MarkdownContent, {
  MarkdownImage,
} from "../../../Messages/Text/MarkdownContent";
import "./index.css";

export type MixedContentBlock =
  | {
      type: "text";
      id: string;
      content: string;
    }
  | {
      type: "image";
      id: string;
      src: string;
      alt?: string;
    }
  | {
      type: "file";
      id: string;
      name: string;
      size: string;
      extension: string;
      iconColor?: string;
      iconLabel: string;
      url?: string;
      caption?: string;
    };

export interface MixedContentProps {
  blocks: MixedContentBlock[];
  onFileDownload?: (
    block: Extract<MixedContentBlock, { type: "file" }>
  ) => void;
}

export default function MixedContent({
  blocks,
  onFileDownload,
}: MixedContentProps) {
  return (
    <div className="wk-msg-mixed-content">
      {blocks.map((block) => {
        if (block.type === "image") {
          return (
            <div key={block.id} className="wk-msg-mixed-image">
              <MarkdownImage src={block.src} alt={block.alt} />
            </div>
          );
        }

        if (block.type === "file") {
          const canDownload = !!block.url && !!onFileDownload;
          return (
            <div key={block.id} className="wk-msg-mixed-file">
              <div
                className="wk-msg-mixed-file-icon"
                style={
                  block.iconColor
                    ? { backgroundColor: block.iconColor }
                    : undefined
                }
                aria-hidden="true"
              >
                {block.iconLabel}
              </div>
              <div className="wk-msg-mixed-file-info">
                <div className="wk-msg-mixed-file-name" title={block.name}>
                  {block.name}
                </div>
                <div className="wk-msg-mixed-file-meta">
                  <span>{block.size}</span>
                  {block.extension && <span>{block.extension}</span>}
                </div>
                {block.caption && (
                  <div className="wk-msg-mixed-file-caption">
                    {block.caption}
                  </div>
                )}
              </div>
              {canDownload && (
                <button
                  type="button"
                  className="wk-msg-mixed-file-download"
                  aria-label={block.name}
                  onClick={(event) => {
                    event.stopPropagation();
                    onFileDownload?.(block);
                  }}
                >
                  <Download size={16} strokeWidth={2} />
                </button>
              )}
            </div>
          );
        }

        if (!block.content) {
          return null;
        }
        return (
          <div key={block.id} className="wk-msg-mixed-text">
            <MarkdownContent content={block.content} enableMarkdown={false} />
          </div>
        );
      })}
    </div>
  );
}
