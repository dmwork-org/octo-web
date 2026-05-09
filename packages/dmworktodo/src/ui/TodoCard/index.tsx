import React from 'react';
import { Channel, ChannelTypePerson } from 'wukongimjssdk';
import type { Matter, MatterStatus } from '../../bridge/types';
import WKAvatar from '@octo/base/src/Components/WKAvatar';
import './index.css';

export interface MatterCardProps {
  matter: Matter;
  channelName?: string;            // 来源频道名（由父组件传入）
  assigneeUids?: string[];         // 负责人 uid 列表（列表接口暂无，先留空数组）
  selected?: boolean;              // 是否选中（高亮）
  onClick?: (matterId: string) => void;         // 点击任务名展开详情
  onStatusChange?: (matterId: string, newStatus: MatterStatus) => void;  // checkbox 回调
  className?: string;
}

interface DeadlineInfo {
  text: string;
  className: string;
}

function formatDeadline(deadline: string): DeadlineInfo | null {
  const deadlineDate = new Date(deadline);
  deadlineDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = deadlineDate.getTime() - today.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // 今天
  if (diffDays === 0) {
    return { text: '今天', className: 'wk-matter-card__deadline--today' };
  }

  // 逾期
  if (diffDays < 0) {
    return { text: `逾期${Math.abs(diffDays)}天`, className: 'wk-matter-card__deadline--overdue' };
  }

  // 其他：M/D 格式
  const month = deadlineDate.getMonth() + 1;
  const day = deadlineDate.getDate();
  return { text: `${month}/${day}`, className: '' };
}

export default function MatterCard({
  matter,
  channelName,
  assigneeUids = [],
  selected = false,
  onClick,
  onStatusChange,
  className,
}: MatterCardProps) {
  const handleClick = () => {
    if (onClick) onClick(matter.id);
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onStatusChange  && matter.status !== 'archived') {
      const newStatus: MatterStatus = matter.status === 'open' ? 'done' : 'open';
      onStatusChange(matter.id, newStatus);
    }
  };

  const handleCheckboxKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (onStatusChange  && matter.status !== 'archived') {
        const newStatus: MatterStatus = matter.status === 'open' ? 'done' : 'open';
        onStatusChange(matter.id, newStatus);
      }
    }
  };

  const deadlineInfo = matter.deadline ? formatDeadline(matter.deadline) : null;
  const isDone = matter.status === 'done';
  const isArchived = matter.status === 'archived';
  const isClosed = isDone || isArchived;

  // 构建 meta 行
  const metaParts: React.ReactNode[] = [];

  // 来源频道
  if (channelName) {
    metaParts.push(
      <span key="channel" className="wk-matter-card__channel">
        #{channelName}
      </span>
    );
  }

  // 负责人头像
  if (assigneeUids.length > 0) {
    const displayUids = assigneeUids.slice(0, 3);
    const remainingCount = assigneeUids.length - 3;

    metaParts.push(
      <div key="assignees" className="wk-matter-card__assignees">
        {displayUids.map((uid) => (
          <WKAvatar
            key={uid}
            channel={new Channel(uid, ChannelTypePerson)}
            style={{ width: 16, height: 16, borderRadius: '50%' }}
          />
        ))}
        {remainingCount > 0 && (
          <span className="wk-matter-card__assignees-more">+{remainingCount}</span>
        )}
      </div>
    );
  }

  const showMetaRow = metaParts.length > 0;

  return (
    <div
      className={`wk-matter-card${selected ? ' wk-matter-card--selected' : ''}${className ? ` ${className}` : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleClick();
      }}
    >
      <div className="wk-matter-card__row-1">
        <div
          className={`wk-matter-card__checkbox${!onStatusChange ? ' wk-matter-card__checkbox--disabled' : ''}`}
          onClick={onStatusChange ? handleCheckboxClick : undefined}
          onKeyDown={onStatusChange ? handleCheckboxKeyDown : undefined}
          role="checkbox"
          aria-label={isClosed ? '标记为待处理' : '标记为已完成'}
          aria-checked={isClosed}
          aria-disabled={!onStatusChange}
          tabIndex={onStatusChange ? 0 : -1}
        >
          {isClosed && <span className="wk-matter-card__checkbox-check">✓</span>}
        </div>
        <div className={`wk-matter-card__title${isDone ? ' wk-matter-card__title--done' : isArchived ? ' wk-matter-card__title--archived' : ''}`}>
          {matter.title.replace(/@\[([^:]+):([^\]]+)\]/g, (_m, _uid, name) => `@${name}`)}
        </div>
        {deadlineInfo && (
          <div className={`wk-matter-card__deadline ${deadlineInfo.className}`.trim()}>
            {deadlineInfo.text}
          </div>
        )}
      </div>

      {showMetaRow && (
        <div className="wk-matter-card__row-2">
          {metaParts.map((part, index) => (
            <React.Fragment key={index}>
              {index > 0 && <span className="wk-matter-card__separator">·</span>}
              {part}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

export { MatterCard };
