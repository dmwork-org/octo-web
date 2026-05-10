import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { MatterDetail, MatterStatus, MatterChannel as MatterChannelType, TimelineEntry, TimelineReq } from '../../bridge/types';
import { getMatter, transitionMatter, deleteMatter, linkChannel, unlinkChannel, listTimeline, addTimelineEntry, deleteTimelineEntry } from '../../api/todoApi';
import { Toast } from '../../utils/toast';
import { useUserName } from '../../hooks/useUserName';
import UserName from '../../ui/UserName';
import LinkChannelsModal from '../../ui/LinkChannelsModal';
import WKAvatar from '@octo/base/src/Components/WKAvatar';
import { Channel, ChannelTypePerson } from 'wukongimjssdk';
import './index.css';

export interface MatterDetailPanelProps {
  channelId: string;
  channelType: number;
  matterId?: string;
  onClose: () => void;
}

export default function MatterDetailPanel({ channelId, channelType: _channelType, matterId, onClose }: MatterDetailPanelProps) {
  const [matter, setMatter] = useState<MatterDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'channels' | 'outputs' | 'changelog'>('channels');

  // Timeline
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  // Fetch matter
  useEffect(() => {
    if (!matterId) { setMatter(null); return; }
    setLoading(true);
    setError(null);
    getMatter(matterId, channelId || undefined)
      .then(setMatter)
      .catch((err) => { setError(err?.message || '加载失败'); setMatter(null); })
      .finally(() => setLoading(false));
  }, [matterId, channelId]);

  // Fetch timeline when matter loads
  useEffect(() => {
    if (!matterId) { setTimeline([]); return; }
    listTimeline(matterId, { limit: 50 })
      .then((res) => setTimeline(res.data || []))
      .catch(() => setTimeline([]));
  }, [matterId]);

  // ── Handlers ──

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

  const handleDeleteMatter = useCallback(async () => {
    if (!matter) return;
    if (!window.confirm(`确定删除事项「${matter.title}」？此操作不可恢复。`)) return;
    try {
      await deleteMatter(matter.id);
      Toast.success('事项已删除');
      onClose();
    } catch {
      Toast.error('删除失败');
    }
  }, [matter, onClose]);

  const handleLinkChannel = useCallback(() => {
    setLinkModalOpen(true);
  }, []);

  const handleLinked = useCallback(async () => {
    if (!matter) return;
    const updated = await getMatter(matter.id);
    setMatter(updated);
  }, [matter]);

  const handleUnlinkChannel = useCallback(async (chId: string) => {
    if (!matter) return;
    if (!window.confirm('确定取消关联此频道？')) return;
    try {
      await unlinkChannel(matter.id, chId);
      const updated = await getMatter(matter.id);
      setMatter(updated);
      Toast.success('已取消关联');
    } catch {
      Toast.error('取消关联失败');
    }
  }, [matter]);

  const handleDeleteTimeline = useCallback(async (entryId: string) => {
    if (!matter) return;
    try {
      await deleteTimelineEntry(matter.id, entryId);
      setTimeline((prev) => prev.filter((e) => e.id !== entryId));
      Toast.success('已删除');
    } catch {
      Toast.error('删除失败');
    }
  }, [matter]);

  const handleAddTimeline = useCallback(async (content: string) => {
    if (!matter || !content.trim()) return;
    try {
      const entry = await addTimelineEntry(matter.id, { content: content.trim() });
      setTimeline((prev) => [entry, ...prev]);
    } catch {
      Toast.error('添加失败');
    }
  }, [matter]);

  // ── Empty / Loading / Error ──

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

  const formatDeadline = (d: string) => {
    const date = new Date(d);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const tabs: { id: 'channels' | 'outputs' | 'changelog'; label: string; count: number }[] = [
    { id: 'channels', label: '关联群聊', count: channels.length },
    { id: 'outputs', label: '产出文件', count: 0 },
    { id: 'changelog', label: '变更记录', count: timeline.length },
  ];

  return (
    <main className="wk-mp-main">
      <div className="wk-mp-main__inner">
        {/* ── Header ── */}
        <header className="wk-mp-header">
          <div className="wk-mp-header__row1">
            <span className="wk-mp-header__id">{matter.seq_no ? `M-${matter.seq_no}` : matter.id.slice(0, 8)}</span>
            <StatusPicker status={matter.status} onChange={handleStatusChange} />
            {matter.deadline && (
              <span className="wk-mp-header__ddl">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                <span className="wk-mp-header__ddl-label">截止</span>
                <span className="wk-mp-header__ddl-value">{formatDeadline(matter.deadline)}</span>
              </span>
            )}
            <button type="button" className="wk-mp-header__action" title="转发">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
              转发
            </button>
            <MoreMenu onDelete={handleDeleteMatter} />
            <button type="button" className="wk-mp-header__close" onClick={onClose}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          </div>
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
            <WKAvatar channel={new Channel(matter.creator_id, ChannelTypePerson)} style={{ width: 16, height: 16 }} />
            <UserName uid={matter.creator_id} className="wk-mp-people__name" />
            <span className="wk-mp-people__role">创建人</span>
          </div>
          {assignees.length > 0 && (
            <div className="wk-mp-people__item">
              <span className="wk-mp-people__avatars">
                {assignees.map((a, i) => (
                  <span key={a.user_id} className="wk-mp-people__avatar-wrap" style={{ marginLeft: i > 0 ? -6 : 0, zIndex: assignees.length - i }}>
                    <WKAvatar channel={new Channel(a.user_id, ChannelTypePerson)} style={{ width: 16, height: 16 }} />
                  </span>
                ))}
              </span>
              <span className="wk-mp-people__name">
                {assignees.map((a, i) => (
                  <span key={a.user_id}>{i > 0 && '、'}<UserName uid={a.user_id} /></span>
                ))}
              </span>
              <span className="wk-mp-people__role">负责人</span>
            </div>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="wk-mp-tabs">
          {tabs.map((t) => (
            <button key={t.id} type="button"
              className={`wk-mp-tabs__btn${activeTab === t.id ? ' is-active' : ''}`}
              onClick={() => setActiveTab(t.id)}>
              <span className="wk-mp-tabs__label">{t.label}</span>
              <span className={`wk-mp-tabs__count${activeTab === t.id ? ' is-active' : ''}`}>{t.count}</span>
            </button>
          ))}
        </div>

        {/* ── Tab: 关联群聊 ── */}
        {activeTab === 'channels' && (
          <div className="wk-mp-channels">
            <div className="wk-mp-channels__toolbar">
              <button type="button" className="wk-mp-channels__add" onClick={handleLinkChannel}>
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
                    <ChannelMoreMenu onUnlink={() => handleUnlinkChannel(ch.channel_id)} />
                  </div>
                  <div className="wk-mp-channels__card-progress">
                    <div className="wk-mp-channels__card-progress-label">最新进展</div>
                    <div className="wk-mp-channels__card-progress-text">暂无进展摘要（等待一键总结）</div>
                  </div>
                  {/* 展开时间线 */}
                  {timeline.length > 0 && (
                    <div className="wk-mp-channels__card-actions">
                      <button type="button" className="wk-mp-channels__timeline-btn" onClick={() => setTimelineExpanded(!timelineExpanded)}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: timelineExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="6 9 12 15 18 9" /></svg>
                        {timelineExpanded ? '收起时间线' : '展开时间线'}
                      </button>
                    </div>
                  )}
                  {timelineExpanded && (
                    <TimelinePanel entries={timeline.filter(e => e.channel_id === ch.channel_id || !e.channel_id)} onDelete={handleDeleteTimeline} />
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Tab: 产出文件 ── */}
        {activeTab === 'outputs' && (
          <div className="wk-mp-empty-tab">产出文件功能即将上线</div>
        )}

        {/* ── Tab: 变更记录 (timeline) ── */}
        {activeTab === 'changelog' && (
          <div className="wk-mp-timeline-tab">
            <TimelineInput onSubmit={handleAddTimeline} />
            {timeline.length === 0 ? (
              <div className="wk-mp-empty-tab">暂无时间线记录</div>
            ) : (
              <TimelinePanel entries={timeline} onDelete={handleDeleteTimeline} />
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <div className="wk-mp-footer">
          ✦ Matter 是 IM 工作的 hierarchy 任务卡 · AI 从群聊持续蒸馏 · 用户只确认, 不维护
        </div>
      </div>

      {/* 关联群聊弹窗 */}
      <LinkChannelsModal
        visible={linkModalOpen}
        matterId={matter.id}
        matterTitle={matter.title}
        linkedChannels={channels}
        onClose={() => setLinkModalOpen(false)}
        onLinked={handleLinked}
      />
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
  useEffect(() => { if (!open) return; const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', c); return () => document.removeEventListener('mousedown', c); }, [open]);
  const current = STATUS_OPTIONS.find((o) => o.value === status) || STATUS_OPTIONS[0];
  return (
    <span className="wk-mp-status-wrap" ref={ref}>
      <button type="button" className={`wk-mp-pill ${current.cls}`} onClick={() => setOpen(!open)} title="点击修改状态">
        <span className="wk-mp-pill__dot" />{current.label}
      </button>
      {open && (
        <div className="wk-mp-status-dropdown">
          {STATUS_OPTIONS.map((opt) => (
            <button key={opt.value} type="button" className={`wk-mp-status-dropdown__item${opt.value === status ? ' is-active' : ''}`} onClick={() => { onChange(opt.value); setOpen(false); }}>
              <span className={`wk-mp-pill__dot ${opt.cls}`} />{opt.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// ─── MoreMenu (删除事项) ──────────────────────────────────

function MoreMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (!open) return; const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', c); return () => document.removeEventListener('mousedown', c); }, [open]);
  return (
    <span className="wk-mp-more-wrap" ref={ref}>
      <button type="button" className="wk-mp-header__action" onClick={() => setOpen(!open)} title="更多操作">
        <svg width="13" height="3" viewBox="0 0 16 4" fill="currentColor" stroke="none"><circle cx="2" cy="2" r="1.5" /><circle cx="8" cy="2" r="1.5" /><circle cx="14" cy="2" r="1.5" /></svg>
      </button>
      {open && (
        <div className="wk-mp-more-dropdown">
          <button type="button" className="wk-mp-more-dropdown__item wk-mp-more-dropdown__item--danger" onClick={() => { setOpen(false); onDelete(); }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
            删除事项
          </button>
        </div>
      )}
    </span>
  );
}

// ─── ChannelMoreMenu (查看群聊 / 取消关联) ────────────────

function ChannelMoreMenu({ onUnlink }: { onUnlink: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => { if (!open) return; const c = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', c); return () => document.removeEventListener('mousedown', c); }, [open]);
  return (
    <span className="wk-mp-ch-more" ref={ref} style={{ marginLeft: 'auto' }}>
      <button type="button" className="wk-mp-ch-more__btn" onClick={(e) => { e.stopPropagation(); setOpen(!open); }}>
        <svg width="13" height="3" viewBox="0 0 16 4" fill="currentColor" stroke="none"><circle cx="2" cy="2" r="1.5" /><circle cx="8" cy="2" r="1.5" /><circle cx="14" cy="2" r="1.5" /></svg>
      </button>
      {open && (
        <div className="wk-mp-ch-more__dropdown">
          <button type="button" className="wk-mp-ch-more__item" onClick={() => setOpen(false)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
            查看群聊
          </button>
          <button type="button" className="wk-mp-ch-more__item wk-mp-ch-more__item--danger" onClick={() => { setOpen(false); onUnlink(); }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            取消关联
          </button>
        </div>
      )}
    </span>
  );
}

// ─── TimelinePanel (时间线列表) ───────────────────────────

function TimelinePanel({ entries, onDelete }: { entries: TimelineEntry[]; onDelete: (id: string) => void }) {
  return (
    <div className="wk-mp-tl">
      {entries.map((e) => (
        <div key={e.id} className="wk-mp-tl__item">
          <div className="wk-mp-tl__item-head">
            <span className="wk-mp-tl__item-time">{new Date(e.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            <UserName uid={e.user_id} className="wk-mp-tl__item-actor" />
            <button type="button" className="wk-mp-tl__item-del" onClick={() => onDelete(e.id)} title="删除">×</button>
          </div>
          {e.content && <div className="wk-mp-tl__item-text">{e.content}</div>}
          {e.attachments && e.attachments.length > 0 && (
            <div className="wk-mp-tl__item-atts">
              {e.attachments.map((att) => (
                <a key={att.id} href={att.file_url} target="_blank" rel="noopener noreferrer" className="wk-mp-tl__item-att">
                  {att.file_name || '附件'}
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── TimelineInput (添加进展) ─────────────────────────────

function TimelineInput({ onSubmit }: { onSubmit: (content: string) => void }) {
  const [value, setValue] = useState('');
  const handleSubmit = () => {
    if (!value.trim()) return;
    onSubmit(value);
    setValue('');
  };
  return (
    <div className="wk-mp-tl-input">
      <input
        type="text"
        className="wk-mp-tl-input__field"
        placeholder="添加进展或评论..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
      />
      <button type="button" className="wk-mp-tl-input__btn" disabled={!value.trim()} onClick={handleSubmit}>发送</button>
    </div>
  );
}
