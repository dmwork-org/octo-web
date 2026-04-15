import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within, userEvent } from '@storybook/test'
import React, { useState } from 'react'
import SidebarTabBar from './index'
import type { SidebarTab } from './index'

const meta: Meta<typeof SidebarTabBar> = {
  title: 'Business/SidebarTabBar',
  component: SidebarTabBar,
  parameters: {
    docs: {
      description: {
        component: `
群聊/私聊 Tab 切换栏。

**Props：**
- \`activeTab\`：当前激活的 Tab（'group' | 'dm'）
- \`groupUnread\`：群聊未读总数
- \`dmUnread\`：私聊未读总数
- \`onTabChange\`：切换回调

**States：**
- 群聊激活
- 私聊激活
- 有未读角标（数字 / 99+）
- 无未读
        `,
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 280, background: 'var(--wk-bg-base, #F7F8FA)', borderRadius: 8 }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof SidebarTabBar>

// ─── 静态 Stories ───────────────────────────────────────────

export const GroupsActive: Story = {
  name: '群聊 Tab 激活',
  args: {
    activeTab: 'group',
    groupUnread: 5,
    dmUnread: 3,
    onTabChange: () => {},
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const btns = canvas.getAllByRole('button')
    // 群聊按钮有 active 样式
    expect(btns[0].className).toContain('active')
    // 角标数字正确
    expect(canvas.getByText('5')).toBeInTheDocument()
    expect(canvas.getByText('3')).toBeInTheDocument()
  },
}

export const DmsActive: Story = {
  name: '私聊 Tab 激活',
  args: {
    activeTab: 'dm',
    groupUnread: 5,
    dmUnread: 3,
    onTabChange: () => {},
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const btns = canvas.getAllByRole('button')
    expect(btns[1].className).toContain('active')
  },
}

export const NoBadge: Story = {
  name: '无未读角标',
  args: {
    activeTab: 'group',
    groupUnread: 0,
    dmUnread: 0,
    onTabChange: () => {},
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // 无角标元素
    expect(canvasElement.querySelectorAll('.wk-sidebar-tabbar__badge').length).toBe(0)
  },
}

export const LargeUnread: Story = {
  name: '99+ 角标',
  args: {
    activeTab: 'group',
    groupUnread: 999,
    dmUnread: 100,
    onTabChange: () => {},
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const badges = canvas.getAllByText('99+')
    expect(badges.length).toBe(2)
  },
}

// ─── 交互 Story ─────────────────────────────────────────────

export const TabSwitch: Story = {
  name: 'Tab 切换交互（play function）',
  render: () => {
    const [tab, setTab] = useState<SidebarTab>('group')
    return (
      <SidebarTabBar
        activeTab={tab}
        groupUnread={5}
        dmUnread={3}
        onTabChange={setTab}
      />
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const btns = canvas.getAllByRole('button')

    // 初始：群聊 active
    expect(btns[0].className).toContain('active')
    expect(btns[1].className).not.toContain('active')

    // 点击私聊 Tab
    await userEvent.click(btns[1])
    expect(btns[1].className).toContain('active')
    expect(btns[0].className).not.toContain('active')

    // 再点回群聊
    await userEvent.click(btns[0])
    expect(btns[0].className).toContain('active')
  },
}
