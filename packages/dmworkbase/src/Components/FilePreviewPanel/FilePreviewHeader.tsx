import React, { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  FileText,
  Download,
  ExternalLink,
  Maximize2,
  Reply,
  X,
  ArrowLeft,
  File,
  FileImage,
  FileCode,
  FileSpreadsheet,
  Presentation,
  FileArchive,
  FileAudio,
  FileVideo,
} from "lucide-react";
import { FilePreviewInfo } from "./types";
import "./FilePreviewHeader.css";

/** 对话内文件项 */
export interface ConversationFile {
  /** 文件唯一标识 */
  id: string;
  /** 文件名 */
  name: string;
  /** 扩展名 */
  extension: string;
  /** 文件 URL */
  url: string;
  /** 文件大小 */
  size?: number;
  /** 是否 AI 生成 */
  isAiGenerated?: boolean;
  /** 发送者 UID */
  senderUid?: string;
}

export interface FilePreviewHeaderProps {
  /** 当前预览的文件 */
  file: FilePreviewInfo;
  /** 对话内所有文件列表 */
  conversationFiles?: ConversationFile[];
  /** 切换文件回调 */
  onFileSelect?: (file: ConversationFile) => void;
  /** 是否显示返回按钮 */
  showBackButton?: boolean;
  /** 返回按钮点击回调 */
  onBack?: () => void;
  /** 关闭面板回调 */
  onClose: () => void;
  /** 下载文件回调 */
  onDownload?: () => void;
  /** 新标签打开回调 */
  onOpenExternal?: () => void;
  /** 全屏预览回调 */
  onFullscreen?: () => void;
  /** 回复消息回调 */
  onReply?: () => void;
  /** 当前视图模式 */
  viewMode?: "preview" | "source";
  /** 切换视图模式回调 */
  onViewModeChange?: (mode: "preview" | "source") => void;
  /** 是否显示视图切换（仅代码/HTML等类型显示） */
  showViewToggle?: boolean;
  /** 自定义中间区域内容（类型相关工具） */
  typeTools?: React.ReactNode;
}

/** 根据扩展名获取文件图标 */
function getFileIcon(extension: string): React.ReactNode {
  const ext = extension.toLowerCase();

  // 图片
  if (["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg"].includes(ext)) {
    return <FileImage size={14} />;
  }
  // 代码
  if (
    [
      "js",
      "jsx",
      "ts",
      "tsx",
      "py",
      "java",
      "c",
      "cpp",
      "go",
      "rs",
      "rb",
      "php",
      "vue",
      "html",
      "css",
      "scss",
      "less",
    ].includes(ext)
  ) {
    return <FileCode size={14} />;
  }
  // PDF/文档
  if (["pdf", "doc", "docx", "txt", "md"].includes(ext)) {
    return <FileText size={14} />;
  }
  // 表格
  if (["xls", "xlsx", "csv"].includes(ext)) {
    return <FileSpreadsheet size={14} />;
  }
  // PPT
  if (["ppt", "pptx"].includes(ext)) {
    return <Presentation size={14} />;
  }
  // 压缩包
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return <FileArchive size={14} />;
  }
  // 音频
  if (["mp3", "wav", "aac", "flac", "ogg"].includes(ext)) {
    return <FileAudio size={14} />;
  }
  // 视频
  if (["mp4", "avi", "mov", "mkv", "webm"].includes(ext)) {
    return <FileVideo size={14} />;
  }
  // JSON
  if (["json", "jsonl"].includes(ext)) {
    return <FileCode size={14} />;
  }

  return <File size={14} />;
}

/**
 * 文件预览面板统一 Header 组件
 */
const FilePreviewHeader: React.FC<FilePreviewHeaderProps> = ({
  file,
  conversationFiles = [],
  onFileSelect,
  showBackButton = false,
  onBack,
  onClose,
  onDownload,
  onOpenExternal,
  onFullscreen,
  onReply,
  viewMode = "preview",
  onViewModeChange,
  showViewToggle = false,
  typeTools,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

  const handleFileClick = (fileItem: ConversationFile) => {
    setDropdownOpen(false);
    onFileSelect?.(fileItem);
  };

  const handleDownload = () => {
    if (onDownload) {
      onDownload();
    } else {
      // 默认下载行为
      const a = document.createElement("a");
      a.href = file.url;
      a.download = file.name || "file";
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleOpenExternal = () => {
    if (onOpenExternal) {
      onOpenExternal();
    } else {
      window.open(file.url, "_blank");
    }
  };

  const hasFiles = conversationFiles.length > 0;

  return (
    <div className="wk-file-preview-header">
      {/* 左侧：返回按钮 + 文件选择器 */}
      <div className="wk-file-preview-header__left">
        {/* 返回按钮 */}
        {showBackButton && onBack && (
          <button
            className="wk-file-preview-header__btn"
            onClick={onBack}
            title="返回"
          >
            <ArrowLeft size={16} />
          </button>
        )}

        {/* 文件下拉选择器 */}
        <div
          className="wk-file-preview-header__dropdown"
          ref={dropdownRef}
        >
          <button
            className={`wk-file-preview-header__dropdown-btn ${
              dropdownOpen ? "wk-file-preview-header__dropdown-btn--open" : ""
            }`}
            onClick={() => hasFiles && setDropdownOpen(!dropdownOpen)}
            title={hasFiles ? "对话内文件" : file.name}
          >
            {getFileIcon(file.extension)}
            <span className="wk-file-preview-header__dropdown-text">
              {hasFiles ? "对话内文件" : file.name}
            </span>
            {hasFiles && (
              <ChevronDown
                size={12}
                className={`wk-file-preview-header__dropdown-caret ${
                  dropdownOpen
                    ? "wk-file-preview-header__dropdown-caret--open"
                    : ""
                }`}
              />
            )}
          </button>

          {/* 下拉面板 */}
          {dropdownOpen && hasFiles && (
            <div className="wk-file-preview-header__dropdown-panel">
              <div className="wk-file-preview-header__dropdown-title">
                对话内文件 · 悬停速选
              </div>
              <div className="wk-file-preview-header__dropdown-list">
                {conversationFiles.map((fileItem) => (
                  <div
                    key={fileItem.id}
                    className={`wk-file-preview-header__dropdown-item ${
                      fileItem.url === file.url
                        ? "wk-file-preview-header__dropdown-item--active"
                        : ""
                    }`}
                    onClick={() => handleFileClick(fileItem)}
                  >
                    <span
                      className="wk-file-preview-header__dropdown-item-badge"
                      title={fileItem.isAiGenerated ? "AI 生成" : "用户上传"}
                    >
                      {fileItem.isAiGenerated ? "✨" : "📎"}
                    </span>
                    <span className="wk-file-preview-header__dropdown-item-icon">
                      {getFileIcon(fileItem.extension)}
                    </span>
                    <span
                      className="wk-file-preview-header__dropdown-item-name"
                      title={fileItem.name}
                    >
                      {fileItem.name}
                    </span>
                  </div>
                ))}
              </div>
              <div className="wk-file-preview-header__dropdown-footer">
                点击按钮打开完整侧边栏
              </div>
            </div>
          )}
        </div>

        {/* 分隔符 */}
        {showViewToggle && (
          <span className="wk-file-preview-header__sep" />
        )}

        {/* 视图切换（预览/源码） */}
        {showViewToggle && onViewModeChange && (
          <div className="wk-file-preview-header__view-toggle">
            <button
              className={`wk-file-preview-header__view-toggle-btn ${
                viewMode === "preview"
                  ? "wk-file-preview-header__view-toggle-btn--active"
                  : ""
              }`}
              onClick={() => onViewModeChange("preview")}
            >
              预览
            </button>
            <button
              className={`wk-file-preview-header__view-toggle-btn ${
                viewMode === "source"
                  ? "wk-file-preview-header__view-toggle-btn--active"
                  : ""
              }`}
              onClick={() => onViewModeChange("source")}
            >
              源码
            </button>
          </div>
        )}
      </div>

      {/* 中间：类型相关工具 */}
      <div className="wk-file-preview-header__mid">
        {typeTools}
      </div>

      {/* 右侧：通用操作按钮 */}
      <div className="wk-file-preview-header__actions">
        {/* 全屏 */}
        {onFullscreen && (
          <button
            className="wk-file-preview-header__btn"
            onClick={onFullscreen}
            title="全屏"
          >
            <Maximize2 size={16} />
          </button>
        )}

        {/* 新标签打开 */}
        <button
          className="wk-file-preview-header__btn"
          onClick={handleOpenExternal}
          title="新标签打开"
        >
          <ExternalLink size={16} />
        </button>

        {/* 回复 */}
        {onReply && (
          <button
            className="wk-file-preview-header__btn"
            onClick={onReply}
            title="回复"
          >
            <Reply size={16} />
          </button>
        )}

        {/* 下载 */}
        <button
          className="wk-file-preview-header__btn"
          onClick={handleDownload}
          title="下载"
        >
          <Download size={16} />
        </button>

        {/* 关闭 */}
        <button
          className="wk-file-preview-header__btn wk-file-preview-header__btn--close"
          onClick={onClose}
          title="关闭"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
};

export default FilePreviewHeader;
export { FilePreviewHeader };
