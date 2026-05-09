import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { MatterDetail, MatterStatus } from '../../bridge/types';
import { getMatter, transitionMatter } from '../../api/todoApi';
import { Toast } from '../../utils/toast';
import UserName from '../../ui/UserName';
import './index.css';

export interface MatterDetailPanelProps {
  channelId: string;
  channelType: number;
  matterId?: string;
  onClose: () => void;
}

export default function MatterDetailPanel({ channelId, channelType, matterId, onClose }: MatterDetailPanelProps) {
  const [matter, setMatter] = useState<MatterDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'channels' | 'outputs' | 'changelog'>('channels');
  const [timelineOpen, setTimelineOpen] = useState(false);

  useEffect(() => {
    if (!matterId) { setMatter(null); return; }
    setLoading(true);
    setError(null);
    getMatter(matterId, channelId || undefined)
      .then(setMatter)
      .catch((err) => { setError(err?.message || '加载失败'); setMatter(null); })
      .finally(() => setLoading(false));
  }, [matterId, channelId]);

  const handleStatusChange = useCallback(async (newStatus: MatterStatus) => {
    if (!matter) return;
    const oldStatus = matter.status;
    setMatter((prev) => prev ? { ...prev, status: newStatus } : prev);
    try {
      const updated = await transitionMatter(matter.id, newStatus);
      setMatter(updated);
    } catch {
      setMatter((prev) => prev ? { ...prev, status: oldStatus } : prev);
      Toast.error('状态修改失败');
    }
  }, [matter]);

  if (!matterId || loading || error || !matter) {
    return (
      <main className="wk-mp-main">
        <div className="wk-mp-main__empty">
          {loading ? '加载中...' : error || '选择一个事项查看详情'}
        </div>
      </main>
    );
  }

  const channels = matter.channels || [];
  const assignees = matter.assignees || [];
  const statusMap: Record<string, { label: string; cls: string }> = {
    open: { label: '进行中', cls: 'wk-mp-pill--active' },
    done: { label: '已完成', cls: 'wk-mp-pill--done' },
    archived: { label: '已归档', cls: 'wk-mp-pill--archived' },
  };
  const st = statusMap[matter.status] || statusMap.open;

  const formatDeadline = (d: string) => {
    const date = new Date(d);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <main className="wk-mp-main">
      <div className="wk-mp-main__inner">
        {/* ── Header ── */}
        <header className="wk-mp-header">
          {/* Row1: ID + Status + DDL + actions */}
          <div className="wk-mp-header__row1">
            <span className="wk-mp-header__id">{matter.id.slice(0, 8)}</span>
            <StatusPicker status={matter.status} onChange={handleStatusChange} />
            {matter.deadline && (
              <span className="wk-mp-header__ddl">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span className="wk-mp-header__ddl-label">截止</span>
                <span className="wk-mp-header__ddl-value">{formatDeadline(matter.deadline)}</span>
              </span>
            )}
            <button type="button" className="wk-mp-header__action" title="转发">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
              转发
            </button>
            <button type="button" className="wk-mp-header__close" onClick={onClose}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          </div>

          {/* Title */}
          <h1 className="wk-mp-header__title">{matter.title}</h1>
        </header>

        {/* ── 主要目标 ── */}
        {matter.description && (
          <div className="wk-mp-goal">
            <div className="wk-mp-goal__label">主要目标</div>
            <div className="wk-mp-goal__text">{matter.description}</div>
            {matter.source_name && (
              <div className="wk-mp-goal__source">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                来自 #{matter.source_name}
              </div>
            )}
          </div>
        )}

        {/* ── 创建人 / 负责人 ── */}
        <div className="wk-mp-people">
          <div className="wk-mp-people__item">
            <span className="wk-mp-people__avatar">
              <UserName uid={matter.creator_id} className="wk-mp-people__name" />
            </span>
            <span className="wk-mp-people__role">创建人</span>
          </div>
          {assignees.length > 0 && (
            <div className="wk-mp-people__item">
              <span className="wk-mp-people__avatar">
                {assignees.map((a, i) => (
                  <span key={a.user_id}>
                    {i > 0 && '、'}
                    <UserName uid={a.user_id} className="wk-mp-people__name" />
                  </span>
                ))}
              </span>
              <span className="wk-mp-people__role">负责人</span>
            </div>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="wk-mp-tabs">
          {([
            { id: 'channels' as const, label: '关联群聊', count: channels.length },
            { id: 'outputs' as const, label: '产出文件', count: 0 },
            { id: 'changelog' as const, label: '变更记录', count: 0 },
          ]).map((t) => (
            <button
              key={t.id}
              type="button"
              className={`wk-mp-tabs__btn${activeTab === t.id ? ' is-active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              <span className="wk-mp-tabs__label">{t.label}</span>
              <span className={`wk-mp-tabs__count${activeTab === t.id ? ' is-active' : ''}`}>{t.count}</span>
            </button>
          ))}
        </div>

        {/* ── Tab: 关联群聊 ── */}
        {activeTab === 'channels' && (
          <div className="wk-mp-channels">
            <div className="wk-mp-channels__toolbar">
              <button type="button" className="wk-mp-channels__add">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                关联新群
              </button>
            </div>
            {channels.length === 0 ? (
              <div className="wk-mp-channels__empty">暂无关联群聊 — 多选关联或一键总结</div>
            ) : (
              channels.map((ch) => (
                <div key={ch.id} className="wk-mp-channels__card">
                  <div className="wk-mp-channels__card-head">
                    <span className="wk-mp-channels__card-name">#{ch.channel_name || ch.channel_id.slice(0, 8)}</span>
                    <span className="wk-mp-channels__card-time">
                      {new Date(ch.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} 关联
                    </span>
                  </div>
                  {/* 最新进展占位（后端暂无 segment summary） */}
                  <div className="wk-mp-channels__card-progress">
                    <div className="wk-mp-channels__card-progress-label">最新进展</div>
                    <div className="wk-mp-channels__card-progress-text">暂无进展摘要（等待一键总结）</div>
                  </div>
                  <div className="wk-mp-channels__card-actions">
                    <button type="button" className="wk-mp-channels__timeline-btn" onClick={() => setTimelineOpen(!timelineOpen)}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
                      展开时间线
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Tab: 产出文件 ── */}
        {activeTab === 'outputs' && (
          <div className="wk-mp-empty-tab">产出文件功能即将上线</div>
        )}

        {/* ── Tab: 变更记录 ── */}
        {activeTab === 'changelog' && (
          <div className="wk-mp-empty-tab">变更记录功能即将上线</div>
        )}

        {/* ── Footer ── */}
        <div className="wk-mp-footer">
          ✦ Matter 是 IM 工作的 hierarchy 任务卡 · AI 从群聊持续蒸馏 · 用户只确认, 不维护
        </div>
      </div>
    </main>
  );
}

export { MatterDetailPanel };

// ─── StatusPicker ─────────────────────────────────────────

const STATUS_OPTIONS: { value: MatterStatus; label: string; cls: string }[] = [
  { value: 'open', label: '进行中', cls: 'wk-mp-pill--active' },
  { value: 'done', label: '已完成', cls: 'wk-mp-pill--done' },
  { value: 'archived', label: '已归档', cls: 'wk-mp-pill--archived' },
];

function StatusPicker({ status, onChange }: { status: MatterStatus; onChange: (s: MatterStatus) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const current = STATUS_OPTIONS.find((o) => o.value === status) || STATUS_OPTIONS[0];

  return (
    <span className="wk-mp-status-wrap" ref={ref}>
      <button type="button" className={`wk-mp-pill ${current.cls}`} onClick={() => setOpen(!open)} title="点击修改状态">
        <span className="wk-mp-pill__dot" />
        {current.label}
      </button>
      {open && (
        <div className="wk-mp-status-dropdown">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`wk-mp-status-dropdown__item${opt.value === status ? ' is-active' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              <span className={`wk-mp-pill__dot ${opt.cls}`} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
