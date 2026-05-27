import React, { useCallback } from "react"
import { Channel, ChannelTypeGroup } from "wukongimjssdk"
import { X } from "lucide-react"
import { IconSearchStroked } from "@douyinfe/semi-icons"
import { Tag } from "@douyinfe/semi-ui"
import Checkbox from "../Checkbox"
import AiBadge from "../AiBadge"
import WKAvatar from "../WKAvatar"
import VisibilityTrigger from "../VisibilityTrigger"
import { useI18n } from "../../i18n"
import "./ForwardModal.css"

export interface ForwardItem {
  channelID: string
  channelType: number
  displayName: string
  avatarURL?: string
  isAI?: boolean
  hasThreads?: boolean
  isThread?: boolean
  parentChannelID?: string
  /** 外部群（is_external_group === 1）；仅 ChannelTypeGroup 有意义 */
  isExternal?: boolean
}

export interface ForwardModalProps {
  title?: string
  items: ForwardItem[]
  allItems?: ForwardItem[]
  selectedIDs: string[]
  inputValue: string
  loading?: boolean
  onInputChange: (val: string) => void
  onToggleSelect: (item: ForwardItem) => void
  onConfirm: () => void
  onCancel?: () => void
  /** 懒加载：列表项进入视口时调用。未传则不触发懒加载（用于不需要拉 channelInfo 的场景） */
  onItemVisible?: (item: ForwardItem) => void
}

// ─── 左列：可选列表项 ───────────────────────────────────────────

interface ItemRowProps {
  item: ForwardItem
  selected: boolean
  onToggle: (item: ForwardItem) => void
}

function ItemRow({ item, selected, onToggle }: ItemRowProps) {
  const { t } = useI18n()
  const channel = new Channel(item.channelID, item.channelType)
  return (
    <div
      className={`wk-fm-item${item.parentChannelID ? " wk-fm-item--child" : ""}${selected ? " wk-fm-item--selected" : ""}`}
      onClick={() => onToggle(item)}
    >
      <Checkbox
        checked={selected}
        onCheck={() => {}}
      />
      <div className="wk-fm-avatar-wrap">
        <WKAvatar channel={channel} lazy />
      </div>
      <span className="wk-fm-item-name">{item.displayName}</span>
      {item.channelType === ChannelTypeGroup && item.isExternal && (
        <Tag
          size="small"
          color="purple"
          className="wk-conversationlist-item-external-tag"
        >
          {t("base.forwardModal.external")}
        </Tag>
      )}
      {item.isAI && <AiBadge />}
    </div>
  )
}

// ─── 右列：已选列表项 ───────────────────────────────────────────

interface SelectedRowProps {
  item: ForwardItem
  onRemove: (item: ForwardItem) => void
}

function SelectedRow({ item, onRemove }: SelectedRowProps) {
  const { t } = useI18n()
  const channel = new Channel(item.channelID, item.channelType)
  return (
    <div className="wk-fm-selected-item">
      <div className="wk-fm-avatar-wrap">
        {/* 右列已选列表项数量少且都在视口内，不启用 lazy 避免占位 SVG → 真实
            图的视觉闪烁 */}
        <WKAvatar channel={channel} />
      </div>
      <span className="wk-fm-item-name">{item.displayName}</span>
      <button
        className="wk-fm-remove-btn"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(item)
        }}
        aria-label={t("base.forwardModal.remove")}
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  )
}

// ─── 主组件 ──────────────────────────────────────────────────────

export function ForwardModal({
  title,
  items,
  allItems,
  selectedIDs,
  inputValue,
  loading = false,
  onInputChange,
  onToggleSelect,
  onConfirm,
  onCancel,
  onItemVisible,
}: ForwardModalProps) {
  const { t } = useI18n()
  const selectedSet = new Set(selectedIDs)
  const sourceForSelected = allItems ?? items
  const selectedItems = sourceForSelected.filter((i) => selectedSet.has(i.channelID))
  const modalTitle = title ?? t("base.forwardModal.title")

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onInputChange(e.target.value)
    },
    [onInputChange]
  )

  return (
    <div className="wk-fm">
      {/* Header */}
      <div className="wk-fm-header">
        <span className="wk-fm-title">{modalTitle}</span>
      </div>

      {/* 内容区：左右两列 */}
      <div className="wk-fm-content">

        {/* 左列：搜索 + 可选列表 */}
        <div className="wk-fm-left">
          {/* 搜索框 */}
          <div className="wk-fm-search">
            <IconSearchStroked className="wk-fm-search-icon" />
            <input
              className="wk-fm-search-input"
              placeholder={t("base.forwardModal.searchPlaceholder")}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
            />
          </div>

          {/* 可选列表 */}
          <div className="wk-fm-list">
            {loading ? (
              <div className="wk-fm-empty">{t("base.forwardModal.loading")}</div>
            ) : items.length === 0 ? (
              <div className="wk-fm-empty">{t("base.forwardModal.noContacts")}</div>
            ) : (
              items.map((item) => {
                const row = (
                  <ItemRow
                    item={item}
                    selected={selectedSet.has(item.channelID)}
                    onToggle={onToggleSelect}
                  />
                )
                if (onItemVisible) {
                  return (
                    <VisibilityTrigger
                      key={item.channelID}
                      onVisible={() => onItemVisible(item)}
                    >
                      {row}
                    </VisibilityTrigger>
                  )
                }
                return <React.Fragment key={item.channelID}>{row}</React.Fragment>
              })
            )}
          </div>
        </div>

        {/* 分割线 */}
        <div className="wk-fm-divider" />

        {/* 右列：已选列表 */}
        <div className="wk-fm-right">
          {selectedItems.length === 0 ? (
            <div className="wk-fm-empty wk-fm-empty--right">{t("base.forwardModal.noneSelected")}</div>
          ) : (
            <>
              <div className="wk-fm-selected-title">
                {t("base.forwardModal.selectedCount", { values: { count: selectedItems.length } })}
              </div>
              <div className="wk-fm-selected-list">
                {selectedItems.map((item) => (
                  <SelectedRow
                    key={item.channelID}
                    item={item}
                    onRemove={onToggleSelect}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="wk-fm-footer">
        {onCancel && (
          <button className="wk-fm-btn wk-fm-btn--cancel" onClick={onCancel}>
            {t("base.common.cancel")}
          </button>
        )}
        <button
          className="wk-fm-btn wk-fm-btn--confirm"
          onClick={onConfirm}
          disabled={selectedIDs.length === 0}
        >
          {selectedIDs.length > 0
            ? t("base.forwardModal.confirmWithCount", { values: { count: selectedIDs.length } })
            : t("base.forwardModal.confirm")}
        </button>
      </div>
    </div>
  )
}

export default ForwardModal
