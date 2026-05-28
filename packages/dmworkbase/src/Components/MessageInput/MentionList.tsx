import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import AiBadge from '../AiBadge'
import { useI18n } from '../../i18n'
import './MentionList.css'

interface MemberItem {
  uid: string
  name: string
  icon: string
  isBot?: boolean
  id?: string
  display?: string
  /**
   * 外部群成员相对当前查看 Space 的来源 Space 名称，用于「@SpaceName」
   * 企微风格后缀。由 MessageInput 透传；同 Space / 自己 / 非外部时为空字符串。
   */
  sourceSpaceName?: string
}

interface MentionListProps {
  items: MemberItem[]
  command: (item: { id: string; label: string }) => void
}

export default forwardRef((props: MentionListProps, ref) => {
  const { t } = useI18n()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  const selectItem = (index: number) => {
    const item = props.items[index]
    if (item) {
      props.command({
        id: item.uid || item.id,
        label: item.name || item.display,
      })
    }
  }

  const upHandler = () => {
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length)
  }

  const downHandler = () => {
    setSelectedIndex((selectedIndex + 1) % props.items.length)
  }

  const enterHandler = () => {
    selectItem(selectedIndex)
  }

  useEffect(() => setSelectedIndex(0), [props.items])

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [selectedIndex])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: any) => {
      if (event.key === 'ArrowUp') {
        upHandler()
        return true
      }

      if (event.key === 'ArrowDown') {
        downHandler()
        return true
      }

      if (event.key === 'Enter') {
        enterHandler()
        return true
      }

      return false
    },
  }))

  return (
    <div className="mention-list" role="listbox">
      {props.items.length ? (
        props.items.map((item, index) => (
          <div
            ref={(el) => {
              itemRefs.current[index] = el
            }}
            className={`mention-list-item ${index === selectedIndex ? 'is-selected' : ''}`}
            key={item.uid || item.id || index}
            role="option"
            aria-selected={index === selectedIndex}
            onClick={() => selectItem(index)}
          >
            <div className="wk-messageinput-iconbox">
              <img
                className="wk-messageinput-icon"
                src={item.icon}
                alt=""
                style={{ width: '24px', height: '24px', borderRadius: '24px' }}
              />
            </div>
            <div>
              <strong>{item.name || item.display}</strong>
              {/* @ 提醒选人弹窗的「@SpaceName」后缀（企微风格） */}
              {item.sourceSpaceName && (
                <span
                  className="mention-list-item-space"
                  title={`@${item.sourceSpaceName}`}
                >
                  @{item.sourceSpaceName}
                </span>
              )}
              {item.isBot && <AiBadge size="small" />}
            </div>
          </div>
        ))
      ) : (
        <div className="mention-list-item">{t("base.mentionList.noMembers")}</div>
      )}
    </div>
  )
})
