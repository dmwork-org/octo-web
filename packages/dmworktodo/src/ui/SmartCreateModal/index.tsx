import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Modal, DatePicker } from '@douyinfe/semi-ui';
import type { CreateMatterReq } from '../../bridge/types';
import MemberPicker from '../MemberPicker';
import './index.css';

export interface SmartCreateModalProps {
  visible: boolean;
  /** 是否为空白新建（true = 手动填写，false = 从消息智能预填） */
  blank?: boolean;
  /** 智能创建时选中的消息数量 */
  count?: number;
  /** 关闭弹窗 */
  onClose: () => void;
  /** 创建事项 */
  onConfirm: (req: CreateMatterReq) => Promise<void>;
  /** 当前频道（用于 MemberPicker 获取成员列表） */
  channel?: { channelId: string; channelType: number; name?: string };
}

// 本地日期格式化
function toLocalDateString(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function fromLocalDateString(s: string): Date {
  const [yyyy, mm, dd] = s.split('-').map(Number);
  return new Date(yyyy, mm - 1, dd);
}

/**
 * SmartCreateModal — 新建事项 / 智能创建事项弹窗
 *
 * 对齐原型 v19 + 复用项目已有组件（Semi Modal / DatePicker / MemberPicker）。
 * 4 字段：标题 / 主要目标(description) / 负责人 / Deadline，全部必填。
 */
export default function SmartCreateModal({
  visible,
  blank = true,
  count,
  onClose,
  onConfirm,
  channel,
}: SmartCreateModalProps) {
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [assigneeUids, setAssigneeUids] = useState<string[]>([]);
  const [deadline, setDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);

  // 打开时聚焦标题输入框
  useEffect(() => {
    if (visible) {
      setTimeout(() => titleInputRef.current?.focus(), 100);
    } else {
      // 关闭时重置
      setTitle('');
      setBrief('');
      setAssigneeUids([]);
      setDeadline('');
      setSubmitting(false);
    }
  }, [visible]);

  const canCreate = title.trim() && brief.trim() && assigneeUids.length > 0 && deadline;

  const handleConfirm = useCallback(async () => {
    if (!canCreate || submitting) return;
    setSubmitting(true);
    try {
      await onConfirm({
        title: title.trim(),
        description: brief.trim(),
        assignee_uids: assigneeUids,
        deadline: `${deadline}T23:59:59+08:00`,
        source_channel_id: channel?.channelId,
        source_channel_type: channel?.channelType,
      });
      onClose();
    } catch {
      // 创建失败不关闭，让用户重试
    } finally {
      setSubmitting(false);
    }
  }, [canCreate, submitting, title, brief, assigneeUids, deadline, channel, onConfirm, onClose]);

  // Enter 键确认
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && canCreate) {
        e.preventDefault();
        handleConfirm();
      }
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [handleConfirm, onClose, canCreate]
  );

  return (
    <Modal
      visible={visible}
      onCancel={onClose}
      footer={null}
      width={520}
      closable={false}
      maskClosable
      centered
      className="wk-smart-create-modal"
    >
      <div className="wk-smart-create-modal__content" onKeyDown={handleKeyDown}>
        {/* Header */}
        <div className="wk-smart-create-modal__head">
          <h3 className="wk-smart-create-modal__title">
            {!blank && (
              <svg className="wk-smart-create-modal__spark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v4m0 14v-4m9-5h-4M3 12h4m12.3-5.3-2.8 2.8M7.5 16.5l-2.8 2.8m14.6 0-2.8-2.8M7.5 7.5 4.7 4.7" />
              </svg>
            )}
            {blank ? '新建事项' : '智能创建事项'}
          </h3>
          <p className="wk-smart-create-modal__sub">
            {blank ? '手动填写 4 个必填字段' : `从 ${count} 条选中消息蒸馏 · 4 字段 AI 已预填, 全部必填`}
          </p>
        </div>

        {/* 标题 */}
        <div className="wk-smart-create-modal__field">
          <label className="wk-smart-create-modal__label">
            标题 <span className="wk-smart-create-modal__req">*</span>
          </label>
          <input
            ref={titleInputRef}
            type="text"
            className="wk-smart-create-modal__input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="事件标题"
          />
        </div>

        {/* 主要目标 */}
        <div className="wk-smart-create-modal__field">
          <label className="wk-smart-create-modal__label">
            主要目标 <span className="wk-smart-create-modal__req">*</span>
          </label>
          <textarea
            className="wk-smart-create-modal__textarea"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="一句话说清这件事"
            rows={3}
          />
        </div>

        {/* 负责人 */}
        <div className="wk-smart-create-modal__field">
          <label className="wk-smart-create-modal__label">
            负责人 <span className="wk-smart-create-modal__req">*</span>
          </label>
          <MemberPicker
            mode="controlled"
            value={assigneeUids}
            onChange={setAssigneeUids}
            channel={channel}
            placeholder="选择负责人（可多选）..."
          />
        </div>

        {/* Deadline */}
        <div className="wk-smart-create-modal__field">
          <label className="wk-smart-create-modal__label">
            截止日期 <span className="wk-smart-create-modal__req">*</span>
          </label>
          <DatePicker
            className="wk-smart-create-modal__datepicker"
            style={{ width: '100%' }}
            value={deadline ? fromLocalDateString(deadline) : undefined}
            onChange={(date) => {
              if (!date) { setDeadline(''); return; }
              const d = date instanceof Date ? date : fromLocalDateString(String(date));
              setDeadline(toLocalDateString(d));
            }}
            disabledDate={(date) => !!date && date < new Date(new Date().setHours(0, 0, 0, 0))}
            placeholder="选择截止日期"
            density="compact"
          />
        </div>

        {/* 按钮组 */}
        <div className="wk-smart-create-modal__actions">
          <button type="button" className="wk-smart-create-modal__btn wk-smart-create-modal__btn--cancel" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="wk-smart-create-modal__btn wk-smart-create-modal__btn--confirm"
            onClick={handleConfirm}
            disabled={!canCreate || submitting}
          >
            {submitting ? '创建中...' : '创建事项'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export { SmartCreateModal };
