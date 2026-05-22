import React, { useState, useCallback, useRef } from "react";
import {
  getFileIcon,
  formatFileSize,
} from "@octo/base/src/Components/MessageInput/AttachmentNode";
import type { MatterOutput } from "../../bridge/types";
import "./index.css";

/**
 * Format ISO datetime → "YYYY-MM-DD HH:mm:ss" (对齐 Figma 设计稿格式)
 */
function formatDateTime(isoStr: string): string {
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ─── File thumbnail ─────────────────────────────────────
//
// 复用 dmworkbase 里项目自带的彩色文件图标 (跟 Figma 设计稿 node 440:5731 一致),
// 直接用 getFileIcon() 按文件名 + mime 类型挑图。

function FileThumbnail({
  fileName,
  mimeType,
}: {
  fileName?: string;
  mimeType?: string;
}) {
  const iconUrl = getFileIcon(fileName || "", mimeType || "");
  return (
    <div className="wk-outputs__thumb">
      <img src={iconUrl} alt="" width={32} height={32} />
    </div>
  );
}

// ─── Action icons (16x16, stroke = currentColor) ────────

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.33 8s2.4-4.67 6.67-4.67S14.67 8 14.67 8 12.27 12.67 8 12.67 1.33 8 1.33 8z"
        stroke="currentColor"
        strokeWidth="1.33"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.33" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M14 10v3.33a1.33 1.33 0 01-1.33 1.34H3.33A1.33 1.33 0 012 13.33V10M4.67 6.67L8 10l3.33-3.33M8 10V2"
        stroke="currentColor"
        strokeWidth="1.33"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Props ──────────────────────────────────────────────

export interface OutputsPanelProps {
  outputs: MatterOutput[];
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onSearch?: (query: string) => void;
  /**
   * 渲染发送人头像。由调用方传入, 内部不直接调 WKAvatar/IM SDK,
   * 保持 ui/ 层与数据层分离 (跟 panel 现有模式一致)。
   */
  renderAvatar?: (uid: string, size: number) => React.ReactNode;
  /**
   * 文件预览回调。仅当事项详情嵌入在会话侧边栏时由调用方传入,
   * 此时操作列会显示 "眼睛" 按钮; 不传时不显示预览按钮 (独立事项页面场景)。
   */
  onPreview?: (item: MatterOutput) => void;
}

// ─── Component ──────────────────────────────────────────

const OutputsPanel: React.FC<OutputsPanelProps> = ({
  outputs,
  loading,
  hasMore,
  onLoadMore,
  onSearch,
  renderAvatar,
  onPreview,
}) => {
  const [searchValue, setSearchValue] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setSearchValue(val);
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(() => {
        onSearch?.(val.trim());
      }, 300);
    },
    [onSearch],
  );

  const handlePreview = useCallback(
    (e: React.MouseEvent, item: MatterOutput) => {
      e.preventDefault();
      e.stopPropagation();
      onPreview?.(item);
    },
    [onPreview],
  );

  const handleDownload = useCallback(
    (e: React.MouseEvent, item: MatterOutput) => {
      e.preventDefault();
      e.stopPropagation();
      // 用 <a download> 触发下载, 兼容跨域 (浏览器忽略 download 属性时退化为新窗口)
      const a = document.createElement("a");
      a.href = item.file_url;
      a.download = item.file_name || "";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    },
    [],
  );

  const isEmpty = outputs.length === 0 && !loading;

  return (
    <div className="wk-outputs">
      {/* 搜索栏 (Figma node 1411:8366) */}
      {onSearch && (
        <div className="wk-outputs__search">
          <svg
            className="wk-outputs__search-icon"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M7.333 12.667a5.333 5.333 0 100-10.667 5.333 5.333 0 000 10.667zM14 14l-2.9-2.9"
              stroke="currentColor"
              strokeWidth="1.33"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <input
            type="text"
            className="wk-outputs__search-input"
            placeholder="输入产出物的文件名/描述/产出者搜索"
            value={searchValue}
            onChange={handleSearchChange}
          />
        </div>
      )}

      {/* 表格 (Figma: 6列 - 标题/描述/发送人/来源群/发送时间/操作) */}
      <div className="wk-outputs__table" role="table">
        {/* 表头 */}
        <div className="wk-outputs__thead" role="row">
          <div className="wk-outputs__th wk-outputs__col-title" role="columnheader">
            标题
          </div>
          <div className="wk-outputs__th wk-outputs__col-desc" role="columnheader">
            描述
          </div>
          <div className="wk-outputs__th wk-outputs__col-sender" role="columnheader">
            发送人
          </div>
          <div className="wk-outputs__th wk-outputs__col-channel" role="columnheader">
            来源群
          </div>
          <div className="wk-outputs__th wk-outputs__col-time" role="columnheader">
            发送时间
          </div>
          <div className="wk-outputs__th wk-outputs__col-actions" role="columnheader">
            操作
          </div>
        </div>

        {/* 表体 */}
        {isEmpty ? (
          <div className="wk-outputs__empty">
            <svg
              width="40"
              height="40"
              viewBox="0 0 40 40"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.4"
              aria-hidden="true"
            >
              <path d="M10 5h12l10 10v20a2.5 2.5 0 01-2.5 2.5h-19A2.5 2.5 0 018 35V7.5A2.5 2.5 0 0110.5 5z" />
              <path d="M22 5v8a2 2 0 002 2h8" />
            </svg>
            <span>暂无产出文件</span>
          </div>
        ) : (
          outputs.map((item) => {
            return (
              <div key={item.id} className="wk-outputs__row" role="row">
                {/* 标题: 缩略图 + 文件名 + 大小 */}
                <div className="wk-outputs__td wk-outputs__col-title" role="cell">
                  <FileThumbnail
                    fileName={item.file_name}
                    mimeType={item.mime_type}
                  />
                  <div className="wk-outputs__title-meta">
                    <div
                      className="wk-outputs__file-name"
                      title={item.file_name || ""}
                    >
                      {item.file_name || "未命名文件"}
                    </div>
                    <div className="wk-outputs__file-size">
                      {item.file_size != null && item.file_size > 0
                        ? formatFileSize(item.file_size)
                        : "—"}
                    </div>
                  </div>
                </div>

                {/* 描述: 最多2行截断 */}
                <div
                  className="wk-outputs__td wk-outputs__col-desc"
                  role="cell"
                  title={item.description || ""}
                >
                  <span className="wk-outputs__desc-text">
                    {item.description || ""}
                  </span>
                </div>

                {/* 发送人: 头像 + 姓名 */}
                <div className="wk-outputs__td wk-outputs__col-sender" role="cell">
                  <div className="wk-outputs__user">
                    {renderAvatar ? (
                      renderAvatar(item.sender_uid, 20)
                    ) : (
                      <div className="wk-outputs__user-avatar-fallback">
                        {item.sender_uname?.slice(0, 1) || "?"}
                      </div>
                    )}
                    <span className="wk-outputs__user-name" title={item.sender_uname}>
                      {item.sender_uname}
                    </span>
                  </div>
                </div>

                {/* 来源群: #群名 */}
                <div className="wk-outputs__td wk-outputs__col-channel" role="cell">
                  <span
                    className="wk-outputs__channel-name"
                    title={item.source_channel_name || ""}
                  >
                    {item.source_channel_name
                      ? `#${item.source_channel_name}`
                      : "—"}
                  </span>
                </div>

                {/* 发送时间: YYYY-MM-DD HH:mm:ss */}
                <div className="wk-outputs__td wk-outputs__col-time" role="cell">
                  <span className="wk-outputs__time-text">
                    {formatDateTime(item.sent_at)}
                  </span>
                </div>

                {/* 操作: (可选)预览 + 下载 */}
                <div className="wk-outputs__td wk-outputs__col-actions" role="cell">
                  {onPreview && (
                    <button
                      type="button"
                      className="wk-outputs__action-btn"
                      aria-label="预览"
                      title="预览"
                      onClick={(e) => handlePreview(e, item)}
                    >
                      <EyeIcon />
                    </button>
                  )}
                  <button
                    type="button"
                    className="wk-outputs__action-btn"
                    aria-label="下载"
                    title="下载"
                    onClick={(e) => handleDownload(e, item)}
                  >
                    <DownloadIcon />
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* 加载中骨架 (初次加载) */}
        {loading && outputs.length === 0 && !isEmpty && (
          <div className="wk-outputs__loading">
            <div className="wk-outputs__skeleton-row" />
            <div className="wk-outputs__skeleton-row" />
            <div className="wk-outputs__skeleton-row" />
          </div>
        )}
      </div>

      {/* 加载更多 */}
      {hasMore && (
        <button
          type="button"
          className="wk-outputs__load-more"
          onClick={onLoadMore}
          disabled={loading}
        >
          {loading ? "加载中…" : "加载更多"}
        </button>
      )}
    </div>
  );
};

export default OutputsPanel;
export { OutputsPanel };
