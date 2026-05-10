import React, { useState, useEffect, useCallback } from 'react';
import { Modal } from '@douyinfe/semi-ui';
import type { MatterChannel, LinkChannelReq } from '../../bridge/types';
import { linkChannel } from '../../api/todoApi';
import { Toast } from '../../utils/toast';
import WKSDK, { Channel, ChannelTypeGroup } from 'wukongimjssdk';
import { WKApp } from '@octo/base';
import './LinkChannelsModal.css';

export interface LinkChannelsModalProps {
  visible: boolean;
  matterId: string;
  matterTitle?: string;
  /** 已关联的频道（用于标记"已关联"不可重复选） */
  linkedChannels: MatterChannel[];
  onClose: () => void;
  onLinked: () => void;
}

interface ChannelOption {
  channelId: string;
  channelType: number;
  name: string;
  memberCount?: number;
}

export default function LinkChannelsModal({ visible, matterId, matterTitle, linkedChannels, onClose, onLinked }: LinkChannelsModalProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // 加载用户的会话列表作为可选频道
  useEffect(() => {
    if (!visible) { setSearch(''); setSelected([]); return; }
    try {
      const conversations = WKSDK.shared().conversationManager.allConversations() || [];
      const opts: ChannelOption[] = conversations
        .filter((c: any) => c.channel && (c.channel.channelType === 2 || c.channel.channelType === 5))
        .map((c: any) => {
          const info = WKSDK.shared().channelManager.getChannelInfo(c.channel);
          return {
            channelId: c.channel.channelID,
            channelType: c.channel.channelType,
            name: info?.title || c.channel.channelID.slice(0, 8),
          };
        });
      setChannels(opts);
    } catch {
      setChannels([]);
    }
  }, [visible]);

  const linkedIds = new Set(linkedChannels.map((c) => c.channel_id));

  const filtered = channels.filter((c) => {
    if (!search.trim()) return true;
    return c.name.toLowerCase().includes(search.trim().toLowerCase());
  });

  const toggle = (channelId: string) => {
    if (linkedIds.has(channelId)) return;
    setSelected((prev) => prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId]);
  };

  const handleConfirm = useCallback(async () => {
    if (selected.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      for (const chId of selected) {
        const ch = channels.find((c) => c.channelId === chId);
        if (!ch) continue;
        await linkChannel(matterId, {
          channel_id: ch.channelId,
          channel_type: ch.channelType,
          channel_name: ch.name,
        });
      }
      Toast.success(`已关联 ${selected.length} 个群聊`);
      onLinked();
      onClose();
    } catch (err: any) {
      Toast.error(err?.message || '关联失败');
    } finally {
      setSubmitting(false);
    }
  }, [selected, submitting, channels, matterId, onLinked, onClose]);

  return (
    <Modal visible={visible} onCancel={onClose} footer={null} width={520} closable={false} maskClosable centered className="wk-link-channels-modal">
      <div className="wk-lcm">
        {/* Header */}
        <div className="wk-lcm__header">
          <div>
            <div className="wk-lcm__title">关联群聊到 <span className="wk-lcm__title-id">{matterTitle || matterId.slice(0, 8)}</span></div>
            <div className="wk-lcm__sub">选择要监测的群, AI 将持续从这些群里蒸馏跟本事项相关的内容</div>
          </div>
          <button type="button" className="wk-lcm__close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {/* Search */}
        <div className="wk-lcm__search">
          <svg className="wk-lcm__search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="wk-lcm__search-input"
            placeholder="搜索群聊名..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {/* List */}
        <div className="wk-lcm__list">
          {filtered.length === 0 ? (
            <div className="wk-lcm__empty">没有匹配的群聊</div>
          ) : (
            filtered.map((c) => {
              const isLinked = linkedIds.has(c.channelId);
              const isSelected = selected.includes(c.channelId);
              return (
                <button
                  key={c.channelId}
                  type="button"
                  disabled={isLinked}
                  onClick={() => toggle(c.channelId)}
                  className={`wk-lcm__item ${isLinked ? 'is-linked' : isSelected ? 'is-selected' : ''}`}
                >
                  <span className={`wk-lcm__check ${isLinked ? 'is-linked' : isSelected ? 'is-checked' : ''}`}>
                    {(isLinked || isSelected) && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                    )}
                  </span>
                  <div className="wk-lcm__item-info">
                    <span className="wk-lcm__item-name">{c.name}</span>
                  </div>
                  <div className="wk-lcm__item-meta">
                    {isLinked && <span className="wk-lcm__item-badge">已关联</span>}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="wk-lcm__footer">
          <div className="wk-lcm__footer-info">
            已选 <span className="wk-lcm__footer-count">{selected.length}</span> 个群
            {selected.length > 0 && <span className="wk-lcm__footer-hint"> · 确认后 AI 开始监测</span>}
          </div>
          <div className="wk-lcm__footer-actions">
            <button type="button" className="wk-lcm__btn-cancel" onClick={onClose}>取消</button>
            <button type="button" className="wk-lcm__btn-confirm" disabled={selected.length === 0 || submitting} onClick={handleConfirm}>
              关联{selected.length > 0 ? ` (${selected.length})` : ''}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export { LinkChannelsModal };
