import React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import AnchorPopover from './index'
import type { IMMessageResp } from '../../api/imMessageApi'

const mockRenderAvatar = (uid: string, size: number) => (
  <span
    style={{
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: '50%',
      background: '#ccc',
      fontSize: size * 0.5,
      lineHeight: `${size}px`,
      textAlign: 'center',
      color: '#666',
    }}
  >
    {uid.slice(0, 2)}
  </span>
)

const mockRenderUserName = (uid: string) => (
  <span>{uid.slice(0, 8)}</span>
)

const mockFetchMessage = async (params: {
  channelId: string;
  channelType: number;
  messageId: string;
}): Promise<IMMessageResp> => {
  // Simulate network delay
  await new Promise((r) => setTimeout(r, 500))
  return {
    message_id: params.messageId,
    from_uid: 'user-abc123',
    timestamp: Math.floor(Date.now() / 1000) - 3600,
    payload: { type: 1, content: '这是一条模拟的消息内容，用于 Storybook 展示。' },
  } as IMMessageResp
}

const meta: Meta<typeof AnchorPopover> = {
  title: 'Matter/AnchorPopover',
  component: AnchorPopover,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ padding: 40, minHeight: 400 }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof AnchorPopover>

/**
 * 默认态 — 展示原消息上下文弹窗
 */
export const Default: Story = {
  args: {
    channelId: '111bcaea9ad145ca9b8fafdad50b2196',
    channelType: 2,
    messageIds: ['2049456264156450816', '2049456375074820096'],
    channelName: '产品负责人群',
    x: 200,
    top: 100,
    onClose: () => {},
    fetchMessage: mockFetchMessage,
    renderAvatar: mockRenderAvatar,
    renderUserName: mockRenderUserName,
  },
}

/**
 * 子区消息 — channelType=5
 */
export const ThreadChannel: Story = {
  args: {
    channelId: '111bcaea9ad145ca9b8fafdad50b2196____abc123',
    channelType: 5,
    messageIds: ['2049456264156450816'],
    channelName: '产品讨论子区',
    x: 200,
    top: 100,
    onClose: () => {},
    fetchMessage: mockFetchMessage,
    renderAvatar: mockRenderAvatar,
    renderUserName: mockRenderUserName,
  },
}

/**
 * 多条消息
 */
export const MultipleMessages: Story = {
  args: {
    channelId: '111bcaea9ad145ca9b8fafdad50b2196',
    channelType: 2,
    messageIds: [
      '2049456264156450816',
      '2049456375074820096',
      '2049469868163371008',
      '2049470882379632640',
    ],
    channelName: '产品负责人群',
    x: 300,
    top: 150,
    onClose: () => {},
    fetchMessage: mockFetchMessage,
    renderAvatar: mockRenderAvatar,
    renderUserName: mockRenderUserName,
  },
}

/**
 * 无锚定坐标 — 居中显示
 */
export const Centered: Story = {
  args: {
    channelId: '111bcaea9ad145ca9b8fafdad50b2196',
    channelType: 2,
    messageIds: ['2049456264156450816'],
    channelName: '产品负责人群',
    onClose: () => {},
    fetchMessage: mockFetchMessage,
    renderAvatar: mockRenderAvatar,
    renderUserName: mockRenderUserName,
  },
}
