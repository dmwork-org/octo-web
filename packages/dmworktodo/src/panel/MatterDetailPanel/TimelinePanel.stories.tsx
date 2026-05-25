import React from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { TimelinePanel } from './index'
import type { TimelineEntry } from '../../bridge/types'

const longText = [
  '这是一条很长很长的时间线内容，用来验证改成多行换行之后，整行的时间、用户、冒号以及右侧原消息按钮是否仍然和第一行正确对齐。',
  '同时也要覆盖超长英文串：SuperLongUnbrokenToken_ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ。',
  '最后再补一段中文，确保 pre-wrap + break-word + overflow-wrap:anywhere 的组合表现稳定。',
].join(' ')

const baseEntry: TimelineEntry = {
  id: 'tl-1',
  matter_id: 'matter-1',
  source_channel_id: 'channel-1',
  source_channel_name: '产品讨论群',
  user_id: 'user-1',
  content: longText,
  source_msgs: ['msg-1'],
  attachments: [],
  created_at: '2026-05-25T08:30:00.000Z',
}

const meta: Meta<typeof TimelinePanel> = {
  title: 'Matter/TimelinePanel',
  component: TimelinePanel,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof TimelinePanel>

export const LongWrappedWithAnchor: Story = {
  args: {
    entries: [baseEntry],
    onShowAnchor: () => {},
  },
}

export const LongWrappedWithoutAnchor: Story = {
  args: {
    entries: [
      {
        ...baseEntry,
        id: 'tl-2',
        source_msgs: [],
      },
    ],
    onShowAnchor: () => {},
  },
}
