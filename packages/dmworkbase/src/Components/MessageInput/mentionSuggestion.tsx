import { ReactRenderer } from '@tiptap/react'
import { escapeForRegEx } from '@tiptap/core'
import tippy, { Instance as TippyInstance } from 'tippy.js'
import MentionList from './MentionList'

// 自定义 findSuggestionMatch：去掉默认的前缀空格限制，允许 @ 在任意位置触发。
// 其余逻辑（range 计算、query 提取）与 Tiptap 官方实现完全一致，不影响
// mention node 插入、entities 计算、高亮渲染链路。
function findSuggestionMatchAnyPrefix(config: any) {
  const { char, allowSpaces, startOfLine, $position } = config
  const escapedChar = escapeForRegEx(char)
  const prefix = startOfLine ? '^' : ''
  const regexp = allowSpaces
    ? new RegExp(`${prefix}${escapedChar}.*?(?=\\s${escapedChar}|$)`, 'gm')
    : new RegExp(`${prefix}(?:^)?${escapedChar}[^\\s${escapedChar}]*`, 'gm')

  const nodeBefore = $position.nodeBefore
  const text = nodeBefore?.isText && nodeBefore.text

  if (!text) return null

  const textFrom = $position.pos - text.length
  const match = Array.from(text.matchAll(regexp)).pop() as RegExpExecArray | undefined

  if (!match || match.input === undefined || match.index === undefined) return null

  const from = textFrom + match.index
  const to = from + match[0].length

  if (from < $position.pos && to >= $position.pos) {
    return { range: { from, to }, query: match[0].slice(char.length), text: match[0] }
  }

  return null
}

export function createMentionSuggestion(
  itemsFn: ({ query }: { query: string }) => any[],
  onActiveChange?: (active: boolean) => void,
) {
  return {
    items: itemsFn,
    findSuggestionMatch: findSuggestionMatchAnyPrefix,

    render: () => {
      let component: ReactRenderer
      let popup: TippyInstance[]

      return {
        onStart: (props: any) => {
          if (!props.items?.length) return

          onActiveChange?.(true)
          component = new ReactRenderer(MentionList, {
            props,
            editor: props.editor,
          })

          if (!props.clientRect) {
            return
          }

          popup = tippy('body', {
            getReferenceClientRect: props.clientRect,
            appendTo: () => document.body,
            content: component.element,
            showOnCreate: true,
            interactive: true,
            trigger: 'manual',
            placement: 'bottom-start',
          })
        },

        onUpdate(props: any) {
          if (!component) return

          component.updateProps(props)

          if (!props.items?.length) {
            popup?.[0]?.hide()
            return
          }

          popup?.[0]?.show()

          if (!props.clientRect) {
            return
          }

          popup[0].setProps({
            getReferenceClientRect: props.clientRect,
          })
        },

        onKeyDown(props: any) {
          if (!component) return false

          if (props.event.key === 'Escape') {
            popup?.[0]?.hide()
            return true
          }

          return component.ref?.onKeyDown(props)
        },

        onExit() {
          onActiveChange?.(false)
          popup?.[0]?.destroy()
          component?.destroy()
        },
      }
    },
  }
}
