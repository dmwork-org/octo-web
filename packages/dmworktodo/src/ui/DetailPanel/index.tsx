import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DatePicker } from '@douyinfe/semi-ui';
import { WKApp, isSafeUrl } from '@octo/base';
import { Channel } from 'wukongimjssdk';
import * as api from '../../api/todoApi';
import type { MatterDetail, MatterComment, CommentAttachmentReq } from '../../bridge/types';
import MatterStatusBadge from '../TodoStatusBadge';
import MemberPicker from '../MemberPicker';
import UserName from '../UserName';
import { Toast } from '../../utils/toast';
import './index.css';

// ─── Props 接口 ───────────────────────────────────────────

export interface DetailPanelProps {
  matterId: string;
  onClose?: () => void;
  /** 关闭按钮显示为返回箭头（在 ChatMatterPanel 侧边详情页中使用） */
  showBack?: boolean;
  onStatusChanged?: () => void;
  channel?: { channelId: string; channelType: number };
}

// ─── DetailPanel 主组件 ────────────────────────────────────

export default function DetailPanel({ matterId, onClose, onStatusChanged, channel, showBack }: DetailPanelProps) {
  const [matter, setMatter] = useState<MatterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<MatterComment[]>([]);
  const [commentsHasMore, setCommentsHasMore] = useState(false);
  const commentsCursorRef = useRef<string | undefined>();
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [assigneesLoading, setAssigneesLoading] = useState(false);

  // Attachment input for comments
  const [showAttachForm, setShowAttachForm] = useState(false);
  const [attachUrl, setAttachUrl] = useState('');
  const [attachName, setAttachName] = useState('');

  // ─── 编辑任务名状态 ─────────────────────────────────────
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const [updatingTitle, setUpdatingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const loadComments = useCallback(async (append = false) => {
    try {
      const res = await api.listComments(matterId, {
        source_channel_id: channel?.channelId,
        limit: 50,
        cursor: append ? commentsCursorRef.current : undefined,
      });
      const items = res?.data ?? [];
      setComments(append ? (prev) => [...prev, ...items] : items);
      setCommentsHasMore(res?.pagination?.has_more ?? false);
      commentsCursorRef.current = res?.pagination?.next_cursor;
    } catch {
      if (!append) { setComments([]); Toast.error('加载评论失败'); }
      else Toast.error('加载评论失败');
    }
  }, [matterId, channel?.channelId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await api.getMatter(matterId, channel?.channelId);
      setMatter(t);
    } catch {
      Toast.error('加载事项失败');
    } finally {
      setLoading(false);
    }
  }, [matterId, channel?.channelId]);

  useEffect(() => {
    load();
    loadComments(false);
  }, [load, loadComments]);

  // ─── 编辑任务名：进入编辑模式时自动聚焦 ───────────────
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // ─── 切换任务状态 ──────────────────────────────────────
  const handleToggleStatus = useCallback(async () => {
    if (!matter) return;
    if (matter.status === 'archived') return;
    const oldStatus = matter.status;
    const newStatus = oldStatus === 'open' ? 'done' : 'open';
    // 乐观更新
    setMatter((prev) => prev ? { ...prev, status: newStatus } : prev);
    try {
      await api.transitionMatter(matter.id, newStatus);
      onStatusChanged?.();
    } catch {
      // 回滚到旧状态
      setMatter((prev) => prev ? { ...prev, status: oldStatus } : prev);
      Toast.error('更新状态失败');
    }
  }, [matter, onStatusChanged]);

  // ─── 开始编辑任务名 ────────────────────────────────────
  const handleStartEditTitle = useCallback(() => {
    if (!matter) return;
    if (matter.status === 'archived') return;
    setEditTitleValue(matter.title);
    setIsEditingTitle(true);
  }, [matter]);

  // ─── 保存任务名 ────────────────────────────────────────
  const handleSaveTitle = useCallback(async () => {
    if (!matter || updatingTitle) return;
    const newTitle = editTitleValue.trim();
    if (!newTitle || newTitle  === matter.title) {
      setIsEditingTitle(false);
      return;
    }
    setUpdatingTitle(true);
    try {
      const updated = await api.updateMatter(matterId, { title: newTitle });
      setMatter(updated);
      setIsEditingTitle(false);
      onStatusChanged?.();
    } catch {
      Toast.error('更新标题失败');
    } finally {
      setUpdatingTitle(false);
    }
  }, [matter, editTitleValue, matterId, updatingTitle, onStatusChanged]);

  // ─── 添加评论（支持附件）──────────────────────────────
  const handleAddComment = useCallback(async () => {
    if ((!newComment.trim() && !attachUrl.trim()) || submitting) return;
    setSubmitting(true);
    try {
      let attachments: CommentAttachmentReq[] | undefined;
      if (attachUrl.trim()) {
        if (!isSafeUrl(attachUrl.trim())) {
          Toast.error('链接格式不正确，仅支持 http/https');
          setSubmitting(false);
          return;
        }
        attachments = [{ file_url: attachUrl.trim(), file_name: attachName.trim() || undefined }];
      }
      await api.addComment(matterId, newComment.trim(), attachments);
      setNewComment('');
      setAttachUrl('');
      setAttachName('');
      setShowAttachForm(false);
      await loadComments(false);
    } catch {
      Toast.error('添加评论失败');
    } finally {
      setSubmitting(false);
    }
  }, [matterId, newComment, attachUrl, attachName, submitting, loadComments]);

  // ─── 删除评论 ──────────────────────────────────────────
  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      if (!window.confirm('Delete this comment?')) return;
      try {
        await api.deleteComment(matterId, commentId);
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      } catch {
        Toast.error('删除评论失败');
      }
    },
    [matterId]
  );

  // ─── 更新截止日期 ──────────────────────────────────────
  const handleDeadlineChange = useCallback(
    async (deadline: string) => {
      if (!matter) return;
      if (matter.status === 'archived') return;
      try {
        const updated = await api.updateMatter(matterId, {
          deadline: deadline || null,
        });
        setMatter(updated);
        onStatusChanged?.();
      } catch {
        Toast.error('更新截止日期失败');
      }
    },
    [matter, matterId, onStatusChanged]
  );

  // ─── 更新提醒时间 ──────────────────────────────────────
  const [remindMode, setRemindMode] = useState<'none' | '1h' | '1d' | 'custom'>('none');
  const [customRemindTime, setCustomRemindTime] = useState('');

  // 初始化 remindMode
  useEffect(() => {
    if (!matter) return;
    if (matter.status === 'archived') return;
    if (!matter.remind_at) {
      setRemindMode('none');
      return;
    }
    if (matter.deadline) {
      const remindTime = new Date(matter.remind_at).getTime();
      const deadlineTime = new Date(matter.deadline).getTime();
      const diff = deadlineTime - remindTime;
      if (Math.abs(diff - 3600000) < 60000) {
        setRemindMode('1h');
      } else if (Math.abs(diff - 86400000) < 60000) {
        setRemindMode('1d');
      } else {
        setRemindMode('custom');
        setCustomRemindTime(new Date(matter.remind_at).toISOString().slice(0, 16));
      }
    } else {
      setRemindMode('custom');
      setCustomRemindTime(new Date(matter.remind_at).toISOString().slice(0, 16));
    }
  }, [matter?.remind_at, matter?.deadline]);

  const handleRemindModeChange = useCallback(
    async (mode: 'none' | '1h' | '1d' | 'custom') => {
      if (!matter) return;
      if (matter.status === 'archived') return;
      setRemindMode(mode);

      let remindAt: string | null = null;
      if (mode === 'none') {
        remindAt = null;
      } else if (mode === '1h'  && matter.deadline) {
        const deadlineTime = new Date(matter.deadline).getTime();
        remindAt = new Date(deadlineTime - 3600000).toISOString();
      } else if (mode === '1d'  && matter.deadline) {
        const deadlineTime = new Date(matter.deadline).getTime();
        remindAt = new Date(deadlineTime - 86400000).toISOString();
      } else if (mode === 'custom') {
        remindAt = null;
      }

      try {
        const updated = await api.updateMatter(matterId, { remind_at: remindAt });
        setMatter(updated);
        onStatusChanged?.();
      } catch {
        Toast.error('更新提醒时间失败');
      }
    },
    [matter, matterId, onStatusChanged]
  );

  const handleCustomRemindTimeChange = useCallback(
    async (datetime: string) => {
      if (!datetime) return;
      try {
        const remindAt = new Date(datetime).toISOString();
        const updated = await api.updateMatter(matterId, { remind_at: remindAt });
        setMatter(updated);
        setCustomRemindTime(datetime);
        onStatusChanged?.();
      } catch {
        Toast.error('更新提醒时间失败');
      }
    },
    [matterId, onStatusChanged]
  );

  // ─── 跳转到来源频道 ────────────────────────────────────
  const handleJumpToChannel = useCallback(() => {
    if (!matter?.source_channel_id || !matter?.source_channel_type) return;
    WKApp.endpoints.showConversation(new Channel(matter.source_channel_id,matter.source_channel_type));
  }, [matter]);

  return (
    <div className="wk-matter-side-panel">
      <div className="wk-matter-side-panel__header">
        {showBack ? (
          <button
            type="button"
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: '#666', fontSize: '13px', padding: '2px 4px',
              appearance: 'none' as const,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#7C5CFC')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#666')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            返回
          </button>
        ) : (
          <span className="wk-matter-side-panel__header-title">事项详情</span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {matter && matter.status !== 'archived' && (
            <button
              type="button"
              onClick={handleToggleStatus}
              style={{
                border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: '12px', color:matter.status === 'open' ? '#16a34a' : '#666',
                padding: '2px 6px', borderRadius: '4px',
                transition: 'background 150ms',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              title={matter.status === 'open' ? '标记完成' : '重新打开'}
            >
              {matter.status === 'open' ? '✓ 完成' : '↺ 重开'}
            </button>
          )}
          {!showBack && (
            <button
              type="button"
              onClick={onClose}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '16px', color: '#999' }}
            >✕</button>
          )}
        </div>
      </div>

      <div className="wk-matter-side-panel__body">
        {loading && <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>加载中...</div>}
        {!loading && !matter && <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>加载事项失败，请重试</div>}
        {!loading && matter && (
          <>
            {/* Title */}
            <div style={{ padding: '16px 16px 0' }}>
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={editTitleValue}
                  onChange={(e) => setEditTitleValue(e.target.value)}
                  onBlur={handleSaveTitle}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') setIsEditingTitle(false); }}
                  style={{ width: '100%', fontSize: '16px', fontWeight: 600, border: '1px solid var(--wk-brand-primary, #7C5CFC)', borderRadius: '4px', padding: '4px 8px', outline: 'none' }}
                />
              ) : (
                <h3
                  onClick={handleStartEditTitle}
                  style={{ margin: 0, fontSize: '16px', fontWeight: 600, cursor: 'pointer', lineHeight: 1.4, color: 'var(--wk-text-primary, #1a1a1a)' }}
                  title="点击编辑标题"
                >
                  {matter.title.replace(/@\[([^:]+):([^\]]+)\]/g, (_m, _uid, name) => `@${name}`)}
                </h3>
              )}
              <div style={{ marginTop: '8px' }}>
                <MatterStatusBadge status={matter.status} />
              </div>
            </div>

            {/* Meta section */}
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Assignees */}
              <div>
                <strong style={{ fontSize: '12px', color: 'var(--wk-text-secondary, #666)' }}>负责人{assigneesLoading && ' ...'}</strong>
                <div style={{ marginTop: '4px' }}>
                  <MemberPicker
                    mode="controlled"
                    value={matter.assignees.map((a) => a.user_id)}
                    onChange={async (uids) => {
                      setAssigneesLoading(true);
                      try {
                        const current = new Set(matter.assignees.map((a) => a.user_id));
                        const next = new Set(uids);
                        let failures = 0;
                        const ops: Promise<void>[] = [];
                        for (const uid of uids) {
                          if (!current.has(uid)) {
                            ops.push(api.addAssignee(matterId, uid).catch(() => { failures++; }));
                          }
                        }
                        for (const a of matter.assignees) {
                          if (!next.has(a.user_id)) {
                            ops.push(api.removeAssignee(matterId, a.user_id).catch(() => { failures++; }));
                          }
                        }
                        await Promise.all(ops);
                        if (failures > 0) Toast.error(`${failures} 项操作失败`);
                        await load();
                        onStatusChanged?.();
                      } catch {
                        Toast.error('更新负责人失败');
                      } finally {
                        setAssigneesLoading(false);
                      }
                    }}
                    channel={channel}
                    placeholder="选择负责人..."
                  />
                </div>
              </div>

              {/* Deadline */}
              <div>
                <strong style={{ fontSize: '12px', color: 'var(--wk-text-secondary, #666)' }}>截止日期</strong>
                <div style={{ marginTop: '4px' }}>
                  <DatePicker
                    style={{ width: '100%' }}
                    value={matter.deadline ? new Date(matter.deadline) : undefined}
                    onChange={(date) => {
                      if (!date) { handleDeadlineChange(''); return; }
                      const d = date instanceof Date ? date : new Date(String(date));
                      // Set end-of-day in local timezone to avoid premature overdue
                      d.setHours(23, 59, 59, 999);
                      handleDeadlineChange(d.toISOString());
                    }}
                    placeholder="设置截止日期"
                    disabledDate={(date) => !!date && date < new Date(new Date().setHours(0,0,0,0))}
                    density="compact"
                  />
                </div>
              </div>

              {/* Remind */}
              <div>
                <strong style={{ fontSize: '12px', color: 'var(--wk-text-secondary, #666)' }}>提醒</strong>
                <div style={{ marginTop: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {(['none', '1h', '1d', 'custom'] as const).map((mode) => {
                    const labels = { none: '不提醒', '1h': '提前1h', '1d': '提前1天', custom: '自定义' };
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleRemindModeChange(mode)}
                        style={{
                          padding: '2px 8px', borderRadius: '4px', fontSize: '12px', cursor: 'pointer',
                          border: remindMode === mode ? '1px solid var(--wk-brand-primary, #7C5CFC)' : '1px solid var(--wk-border-default, #e5e5e5)',
                          background: remindMode === mode ? 'rgba(124, 92, 252, 0.08)' : 'transparent',
                          color: remindMode === mode ? 'var(--wk-brand-primary, #7C5CFC)' : 'var(--wk-text-secondary, #666)',
                        }}
                      >
                        {labels[mode]}
                      </button>
                    );
                  })}
                </div>
                {remindMode === 'custom' && (
                  <input
                    type="datetime-local"
                    value={customRemindTime}
                    onChange={(e) => setCustomRemindTime(e.target.value)}
                    onBlur={(e) => handleCustomRemindTimeChange(e.target.value)}
                    style={{ marginTop: '6px', fontSize: '12px', padding: '4px 8px', border: '1px solid var(--wk-border-default, #e5e5e5)', borderRadius: '4px', width: '100%' }}
                  />
                )}
              </div>

              {/* Source channel */}
              {matter.source_channel_id && (
                <div>
                  <strong style={{ fontSize: '12px', color: 'var(--wk-text-secondary, #666)' }}>来源</strong>
                  <div style={{ marginTop: '4px' }}>
                    <button
                      type="button"
                      onClick={handleJumpToChannel}
                      style={{ fontSize: '12px', color: 'var(--wk-brand-primary, #7C5CFC)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      #{matter.source_name  || matter.source_channel_id} →
                    </button>
                  </div>
                </div>
              )}

              {/* Linked Channels */}
              {matter.channels  && matter.channels.length > 0 && (
                <div>
                  <strong style={{ fontSize: '12px', color: 'var(--wk-text-secondary, #666)' }}>关联频道</strong>
                  <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {matter.channels.map((ch) => (
                      <span key={ch.id} style={{ fontSize: '12px', padding: '2px 8px', background: 'var(--wk-bg-base, #f7f8fa)', borderRadius: '4px', color: 'var(--wk-text-secondary, #555)' }}>
                        #{ch.channel_name || ch.channel_id}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Participants */}
              {matter.participants  && matter.participants.length > 0 && (
                <div>
                  <strong style={{ fontSize: '12px', color: 'var(--wk-text-secondary, #666)' }}>参与者</strong>
                  <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {matter.participants.map((uid) => (
                      <span key={uid} style={{ fontSize: '12px', padding: '2px 8px', background: 'var(--wk-bg-base, #f7f8fa)', borderRadius: '4px', color: 'var(--wk-text-secondary, #555)' }}>
                        <UserName uid={uid} />
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Comments section */}
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--wk-border-default, #eee)' }}>
              <strong style={{ fontSize: '13px', color: 'var(--wk-text-primary, #1a1a1a)' }}>评论 ({comments.length})</strong>
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {comments.map((c) => (
                  <div key={c.id} style={{ padding: '10px 12px', background: 'var(--wk-bg-base, #f7f8fa)', borderRadius: '8px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'var(--wk-text-primary, #1a1a1a)', fontSize: '12px' }}>
                        <UserName uid={c.user_id} />
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--wk-text-tertiary, #999)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {new Date(c.created_at).toLocaleString('zh-CN')}
                        {c.user_id === WKApp.loginInfo.uid && (
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(c.id)}
                            style={{ border: 'none', background: 'none', color: 'var(--wk-text-disabled, #ccc)', cursor: 'pointer', fontSize: '11px', padding: '0 2px', transition: 'color 150ms' }}
                          >✕</button>
                        )}
                      </span>
                    </div>
                    {c.content && (
                      <div style={{ color: 'var(--wk-text-secondary, #555)', lineHeight: '1.5' }}>{c.content}</div>
                    )}
                    {/* Comment attachments */}
                    {c.attachments && c.attachments.length > 0 && (
                      <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {c.attachments.map((att) => (
                          <a
                            key={att.id}
                            href={isSafeUrl(att.file_url) ? att.file_url : "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: '12px', color: 'var(--wk-brand-primary, #7C5CFC)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            📎 {att.file_name || '附件'}
                            {att.file_size ? ` (${(att.file_size / 1024).toFixed(1)}KB)` : ''}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {comments.length === 0 && <div style={{ color: 'var(--wk-text-disabled, #bbb)', fontSize: '13px', padding: '8px 0' }}>暂无评论</div>}
              </div>

              {/* Load more comments */}
              {commentsHasMore && (
                <button
                  type="button"
                  onClick={() => loadComments(true)}
                  style={{ marginTop: '8px', fontSize: '12px', color: 'var(--wk-brand-primary, #7C5CFC)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  加载更多评论...
                </button>
              )}

              {/* Add comment */}
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="添加评论..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAddComment();
                      }
                    }}
                    style={{
                      flex: 1, minWidth: 0, padding: '8px 12px',
                      border: '1px solid var(--wk-border-default, #e5e5e5)', borderRadius: '6px',
                      fontSize: '13px', outline: 'none', transition: 'border-color 150ms', boxSizing: 'border-box' as const,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAttachForm((v) => !v)}
                    style={{ padding: '8px', border: '1px solid var(--wk-border-default, #e5e5e5)', borderRadius: '6px', background: 'transparent', cursor: 'pointer', fontSize: '14px' }}
                    title="添加附件"
                  >📎</button>
                  <button
                    type="button"
                    onClick={handleAddComment}
                    disabled={(!newComment.trim() && !attachUrl.trim()) || submitting}
                    style={{
                      padding: '8px 14px', border: 'none', borderRadius: '6px',
                      background: 'var(--wk-brand-primary, #7C5CFC)', color: '#fff',
                      cursor: 'pointer', fontSize: '13px', fontWeight: 500,
                      opacity: (!newComment.trim() && !attachUrl.trim()) || submitting ? 0.5 : 1,
                      transition: 'opacity 150ms',
                    }}
                  >发送</button>
                </div>
                {showAttachForm && (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="附件 URL (http/https)"
                      value={attachUrl}
                      onChange={(e) => setAttachUrl(e.target.value)}
                      style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--wk-border-default, #e5e5e5)', borderRadius: '4px', fontSize: '12px', outline: 'none' }}
                    />
                    <input
                      type="text"
                      placeholder="文件名（可选）"
                      value={attachName}
                      onChange={(e) => setAttachName(e.target.value)}
                      style={{ width: '120px', padding: '6px 10px', border: '1px solid var(--wk-border-default, #e5e5e5)', borderRadius: '4px', fontSize: '12px', outline: 'none' }}
                    />
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
