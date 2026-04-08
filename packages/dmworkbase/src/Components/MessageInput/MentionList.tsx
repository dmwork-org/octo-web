import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import AiBadge from '../AiBadge'
import './MentionList.css'

interface MemberItem {
  uid: string
  name: string
  icon: string
  isBot?: boolean
  id?: string
  display?: string
}

interface MentionListProps {
  items: MemberItem[]
  command: (item: { id: string; label: string }) => void
}

export default forwardRef((props: MentionListProps, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)

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
    <div className="mention-list">
      {props.items.length ? (
        props.items.map((item, index) => (
          <div
            className={`mention-list-item ${index === selectedIndex ? 'is-selected' : ''}`}
            key={item.uid || item.id || index}
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
              {item.isBot && <AiBadge size="small" />}
            </div>
          </div>
        ))
      ) : (
        <div className="mention-list-item">没有找到成员</div>
      )}
    </div>
  )
})
