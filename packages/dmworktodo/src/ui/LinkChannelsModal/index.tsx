import React, { useState, useEffect, useCallback } from "react";
import { Modal } from "@douyinfe/semi-ui";
import { Channel } from "wukongimjssdk";
import WKAvatar from "@octo/base/src/Components/WKAvatar";
import type { MatterChannel } from "../../bridge/types";
import { Toast } from "../../utils/toast";
import "./LinkChannelsModal.css";

export interface ChannelOption {
  channelId: string;
  channelType: number;
  name: string;
  desc?: string;
  memberCount?: number;
}

export interface LinkChannelsModalProps {
  visible: boolean;
  matterId: string;
  matterTitle?: string;
  linkedChannels: MatterChannel[];
  onClose: () => void;
  onLinked: () => void;
  loadChannels: () => Promise<ChannelOption[]>;
  onLinkChannel: (matterId: string, channelId: string, channelType: number, channelName: string) => Promise<void>;
}

export default function LinkChannelsModal({
  visible,
  matterId,
  matterTitle,
  linkedChannels,
  onClose,
  onLinked,
  loadChannels,
  onLinkChannel,
}: LinkChannelsModalProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setSearch("");
      setSelected([]);
      return;
    }
    setLoading(true);
    loadChannels()
      .then((opts) => setChannels(opts))
      .catch(() => setChannels([]))
      .finally(() => setLoading(false));
  }, [visible, loadChannels]);

  const linkedIds = new Set(linkedChannels.map((c) => c.channel_id));

  const filtered = channels.filter((c) => {
    if (!search.trim()) return true;
    const kw = search.trim().toLowerCase();
    return c.name.toLowerCase().includes(kw) || (c.desc && c.desc.toLowerCase().includes(kw));
  });

  const toggle = (channelId: string) => {
    if (linkedIds.has(channelId)) return;
    setSelected((prev) =>
      prev.includes(channelId) ? prev.filter((id) => id !== channelId) : [...prev, channelId],
    );
  };

  const removeSelected = (channelId: string) => {
    setSelected((prev) => prev.filter((id) => id !== channelId));
  };

  const handleConfirm = useCallback(async () => {
    if (selected.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      for (const chId of selected) {
        const ch = channels.find((c) => c.channelId === chId);
        if (!ch) continue;
        await onLinkChannel(matterId, ch.channelId, ch.channelType, ch.name);
      }
      Toast.success(`已关联 ${selected.length} 个群聊`);
      onLinked();
      onClose();
    } catch (err: unknown) {
      Toast.error((err as Error)?.message || "关联失败");
    } finally {
      setSubmitting(false);
    }
  }, [selected, submitting, channels, matterId, onLinked, onClose, onLinkChannel]);

  const selectedChannels = channels.filter((c) => selected.includes(c.channelId));

  return (
    <Modal
      visible={visible}
      onCancel={onClose}
      footer={null}
      width={625}
      closable={false}
      maskClosable
      centered
      className="wk-link-channels-modal"
    >
      <div className="wk-lcm">
        {/* Header */}
        <div className="wk-lcm__header">
          <span className="wk-lcm__title">关联群聊</span>
          <button type="button" className="wk-lcm__close" onClick={onClose} aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content: 左右双栏 */}
        <div className="wk-lcm__content">
          {/* 左栏：候选列表 */}
          <div className="wk-lcm__left">
            {/* 搜索框 */}
            <div className="wk-lcm__search-wrap">
              <div className="wk-lcm__search">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="wk-lcm__search-icon">
                  <circle cx="7.33" cy="7.33" r="5" stroke="currentColor" strokeWidth="1.33" />
                  <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.33" strokeLinecap="round" />
                </svg>
                <input
                  className="wk-lcm__search-input"
                  placeholder="输入群聊名称/描述搜索"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* 列表 */}
            <div className="wk-lcm__list">
              {loading ? (
                <div className="wk-lcm__empty">加载中...</div>
              ) : filtered.length === 0 ? (
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
                      className={`wk-lcm__item${isLinked ? " is-linked" : isSelected ? " is-selected" : ""}`}
                    >
                      <span className={`wk-lcm__check${isLinked ? " is-linked" : isSelected ? " is-checked" : ""}`}>
                        {(isLinked || isSelected) && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </span>
                      <WKAvatar
                        channel={new Channel(c.channelId, c.channelType)}
                        style={{ width: 32, height: 32, borderRadius: '50%' }}
                      />
                      <span className="wk-lcm__item-info">
                        <span className="wk-lcm__item-name">{c.name}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* 右栏：已选列表 */}
          <div className="wk-lcm__right">
            <div className="wk-lcm__right-title">
              已选{selected.length}个对话
            </div>
            {selectedChannels.map((c) => (
              <div key={c.channelId} className="wk-lcm__selected-item">
                <WKAvatar
                  channel={new Channel(c.channelId, c.channelType)}
                  style={{ width: 32, height: 32, borderRadius: '50%' }}
                />
                <span className="wk-lcm__item-info">
                  <span className="wk-lcm__item-name">{c.name}</span>
                </span>
                <button
                  type="button"
                  className="wk-lcm__selected-remove"
                  onClick={() => removeSelected(c.channelId)}
                  aria-label="移除"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="wk-lcm__footer">
          <div className="wk-lcm__footer-actions">
            <button type="button" className="wk-lcm__btn-cancel" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="wk-lcm__btn-confirm"
              disabled={selected.length === 0 || submitting}
              onClick={handleConfirm}
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export { LinkChannelsModal };
