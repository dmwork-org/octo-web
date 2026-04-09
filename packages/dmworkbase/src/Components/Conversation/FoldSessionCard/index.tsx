import classNames from "classnames";
import React, { HTMLProps, ReactNode } from "react";
import Checkbox from "../../Checkbox";
import "./index.css";

export interface FoldSessionCardParticipant {
  id: string;
  name: string;
  avatar: ReactNode;
}

export interface FoldSessionCardProps extends HTMLProps<HTMLDivElement> {
  participants: FoldSessionCardParticipant[];
  count: number;
  selectionMode?: boolean;
  isActive?: boolean;
  isExpanded?: boolean;
  appearing?: boolean;
  flash?: boolean;
  tagLabel?: string;
  statusLabel?: string;
  showSummary?: boolean;
  highlightSummary?: boolean;
  summaryId?: string;
  summarySender?: string;
  summaryContent?: ReactNode;
  expandedContent?: ReactNode;
  onToggle?: () => void;
  summaryChecked?: boolean;
  summarySelectable?: boolean;
  onSummaryToggleSelect?: (checked: boolean) => void;
  onSummaryAnimationEnd?: React.AnimationEventHandler<HTMLDivElement>;
  onSummaryContextMenu?: React.MouseEventHandler<HTMLDivElement>;
}

const FoldSessionCard: React.FC<FoldSessionCardProps> = ({
  className,
  participants,
  count,
  selectionMode = false,
  isActive,
  isExpanded,
  appearing,
  flash,
  tagLabel = "AI 协作",
  statusLabel = "进行中",
  showSummary,
  highlightSummary,
  summaryId,
  summarySender,
  summaryContent,
  expandedContent,
  onToggle,
  summaryChecked = false,
  summarySelectable = false,
  onSummaryToggleSelect,
  onSummaryAnimationEnd,
  onSummaryContextMenu,
  ...rest
}) => {
  const participantLabel = participants
    .map((participant) => participant.name)
    .join(" × ");

  return (
    <div
      className={classNames(
        "wk-fold-session-card",
        isActive && "wk-fold-session-card-active",
        appearing && "wk-fold-session-card-appearing",
        flash && "wk-fold-session-card-flash",
        className
      )}
      {...rest}
    >
      <div className="wk-fold-session-card-head" onClick={onToggle}>
        <div className="wk-fold-session-card-head-left">
          <div className="wk-fold-session-card-avatars" aria-hidden="true">
            {participants.map((participant) => (
              <span
                key={participant.id}
                className="wk-fold-session-card-avatar"
              >
                {participant.avatar}
              </span>
            ))}
          </div>
          <div className="wk-fold-session-card-title-wrap">
            <span className="wk-fold-session-card-title">
              {participantLabel}
            </span>
            <span className="wk-fold-session-card-tag">{tagLabel}</span>
          </div>
        </div>
        <div className="wk-fold-session-card-meta">
          {isActive ? (
            <span
              className="wk-fold-session-card-live-dot"
              aria-hidden="true"
            />
          ) : null}
          {isActive ? (
            <span className="wk-fold-session-card-status">{statusLabel}</span>
          ) : null}
          <span className="wk-fold-session-card-count">{count} 条</span>
          <button
            type="button"
            data-testid="fold-session-toggle"
            className={classNames(
              "wk-fold-session-card-toggle",
              isExpanded && "wk-fold-session-card-toggle-open"
            )}
            onClick={(event) => {
              event.stopPropagation();
              if (onToggle) {
                onToggle();
              }
            }}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "收起 AI 协作会话" : "展开 AI 协作会话"}
          >
            <svg viewBox="0 0 24 24">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>

      <div
        className={classNames(
          "wk-fold-session-card-expanded",
          isExpanded && "wk-fold-session-card-expanded-show"
        )}
      >
        <div className="wk-fold-session-card-expanded-inner">
          {expandedContent}
        </div>
      </div>

      {showSummary ? (
        <div
          id={summaryId}
          className={classNames(
            "wk-fold-session-card-summary",
            showSummary && "wk-fold-session-card-summary-show",
            highlightSummary && "wk-fold-session-card-summary-highlight"
          )}
          onAnimationEnd={onSummaryAnimationEnd}
          onContextMenu={selectionMode ? undefined : onSummaryContextMenu}
        >
          <div
            className={classNames(
              "wk-fold-session-card-summary-inner",
              selectionMode && "wk-fold-session-card-summary-inner-selection",
              selectionMode &&
                summarySelectable &&
                "wk-fold-session-card-summary-inner-selectable",
              selectionMode &&
                summaryChecked &&
                "wk-fold-session-card-summary-inner-selected"
            )}
            onClick={
              selectionMode && summarySelectable
                ? () => {
                    if (onSummaryToggleSelect) {
                      onSummaryToggleSelect(!summaryChecked);
                    }
                  }
                : undefined
            }
            data-testid={
              summarySelectable ? "fold-session-summary-message" : undefined
            }
          >
            {selectionMode && summarySelectable ? (
              <div
                className="wk-fold-session-card-summary-check"
                onClick={(event) => {
                  event.stopPropagation();
                }}
              >
                <Checkbox
                  className="wk-fold-session-card-summary-checkbox"
                  checked={summaryChecked}
                  onChange={(checked) => {
                    if (onSummaryToggleSelect) {
                      onSummaryToggleSelect(checked);
                    }
                  }}
                />
              </div>
            ) : null}
            <div
              className="wk-fold-session-card-summary-main"
              style={{
                pointerEvents:
                  selectionMode && summarySelectable ? "none" : undefined,
              }}
            >
              {summarySender ? (
                <div className="wk-fold-session-card-summary-sender">
                  {summarySender}
                </div>
              ) : null}
              {summaryContent ? (
                <div className="wk-fold-session-card-summary-content">
                  {summaryContent}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default FoldSessionCard;
export { FoldSessionCard };
