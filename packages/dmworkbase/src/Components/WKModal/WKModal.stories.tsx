import type { Meta, StoryObj } from '@storybook/react-vite'
import React from 'react'
import WKModal from './index'
import '../../theme/index.css'

const meta: Meta<typeof WKModal> = {
  title: 'Layout/WKModal',
  component: WKModal,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
**Layer 2 复合组件**，封装 Semi Modal，统一尺寸预设与 footer 交互。

**尺寸说明：**
- \`md\`（默认）= 400px — 标准表单、信息展示
- \`lg\` = 720px — 大型内容、复杂表单
- \`full\` = 80% — 全局搜索、全屏面板

**Footer 用法：**
1. 不传 footer / footerConfig → 无 footer（最常见，按钮写在 children 里）
2. 传 \`footerConfig.onOk\` → 渲染标准 ok/cancel 按钮行
3. 传 \`footer\` JSX → 完全自定义（优先级最高）

⚠️ **禁止**直接用 \`@douyinfe/semi-ui\` 的 Modal，业务组件统一用 WKModal。
        `,
      },
    },
  },
  args: {
    visible: true,
    onCancel: () => {},
  },
}
export default meta
type Story = StoryObj<typeof WKModal>

/** 默认状态：无 footer，按钮写在 children 里（项目主流用法） */
export const Default: Story = {
  name: 'Default — 无 footer',
  args: {
    title: '创建群组',
    children: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--wk-sp-4)' }}>
        <p style={{ margin: 0, color: 'var(--wk-text-secondary)', fontSize: 'var(--wk-text-size-md)' }}>
          这是一段描述内容，按钮写在 children 里，footer 不渲染。
        </p>
      </div>
    ),
  },
}

/** 三种 size 对比 */
export const AllVariants: Story = {
  name: 'AllVariants — 三种尺寸',
  render: () => {
    const [openSize, setOpenSize] = React.useState<'md' | 'lg' | 'full' | null>(null)
    const sizes: Array<{ size: 'md' | 'lg' | 'full'; label: string; width: string }> = [
      { size: 'md', label: 'md (400px)', width: '标准表单' },
      { size: 'lg', label: 'lg (720px)', width: '内容展示' },
      { size: 'full', label: 'full (80%)', width: '全局搜索' },
    ]
    return (
      <div style={{ display: 'flex', gap: 'var(--wk-sp-3)' }}>
        {sizes.map(({ size, label, width }) => (
          <button
            key={size}
            onClick={() => setOpenSize(size)}
            style={{
              padding: 'var(--wk-sp-2) var(--wk-sp-4)',
              borderRadius: 'var(--wk-r-sm)',
              border: '1px solid var(--wk-border-default)',
              background: 'var(--wk-bg-base)',
              cursor: 'pointer',
              color: 'var(--wk-text-primary)',
              fontSize: 'var(--wk-text-size-md)',
            }}
          >
            {label}（{width}）
          </button>
        ))}
        {sizes.map(({ size, label, width }) => (
          <WKModal
            key={size}
            visible={openSize === size}
            onCancel={() => setOpenSize(null)}
            title={`${label} — ${width}`}
            size={size}
          >
            <p style={{ margin: 0, color: 'var(--wk-text-secondary)', fontSize: 'var(--wk-text-size-md)' }}>
              当前尺寸：<strong>{size}</strong>（{width}）
            </p>
          </WKModal>
        ))}
      </div>
    )
  },
}

/** States：footerConfig 的 isOkLoading 和 isDanger */
export const States: Story = {
  name: 'States — footerConfig 状态',
  render: () => {
    const [open, setOpen] = React.useState<'loading' | 'danger' | null>(null)
    return (
      <div style={{ display: 'flex', gap: 'var(--wk-sp-3)' }}>
        <button
          onClick={() => setOpen('loading')}
          style={{
            padding: 'var(--wk-sp-2) var(--wk-sp-4)',
            borderRadius: 'var(--wk-r-sm)',
            border: '1px solid var(--wk-border-default)',
            background: 'var(--wk-bg-base)',
            cursor: 'pointer',
            color: 'var(--wk-text-primary)',
            fontSize: 'var(--wk-text-size-md)',
          }}
        >
          isOkLoading
        </button>
        <button
          onClick={() => setOpen('danger')}
          style={{
            padding: 'var(--wk-sp-2) var(--wk-sp-4)',
            borderRadius: 'var(--wk-r-sm)',
            border: '1px solid var(--wk-border-default)',
            background: 'var(--wk-bg-base)',
            cursor: 'pointer',
            color: 'var(--wk-text-primary)',
            fontSize: 'var(--wk-text-size-md)',
          }}
        >
          isDanger
        </button>

        <WKModal
          visible={open === 'loading'}
          onCancel={() => setOpen(null)}
          title="提交中..."
          footerConfig={{
            onOk: () => new Promise(resolve => setTimeout(resolve, 2000)),
            isOkLoading: true,
          }}
        >
          <p style={{ margin: 0, color: 'var(--wk-text-secondary)', fontSize: 'var(--wk-text-size-md)' }}>
            确认按钮处于 loading 状态（isOkLoading=true）。
          </p>
        </WKModal>

        <WKModal
          visible={open === 'danger'}
          onCancel={() => setOpen(null)}
          title="删除群组"
          footerConfig={{
            okText: '删除',
            isDanger: true,
            onOk: () => setOpen(null),
          }}
        >
          <p style={{ margin: 0, color: 'var(--wk-text-secondary)', fontSize: 'var(--wk-text-size-md)' }}>
            此操作不可撤销，确认删除「设计团队」群组？
          </p>
        </WKModal>
      </div>
    )
  },
}

/** EdgeCases：title=null 自定义 header、footer 完全自定义 JSX */
export const EdgeCases: Story = {
  name: 'EdgeCases — 自定义 header / footer',
  render: () => {
    const [open, setOpen] = React.useState<'noHeader' | 'customFooter' | null>(null)
    return (
      <div style={{ display: 'flex', gap: 'var(--wk-sp-3)' }}>
        <button
          onClick={() => setOpen('noHeader')}
          style={{
            padding: 'var(--wk-sp-2) var(--wk-sp-4)',
            borderRadius: 'var(--wk-r-sm)',
            border: '1px solid var(--wk-border-default)',
            background: 'var(--wk-bg-base)',
            cursor: 'pointer',
            color: 'var(--wk-text-primary)',
            fontSize: 'var(--wk-text-size-md)',
          }}
        >
          title=null 自定义 header
        </button>
        <button
          onClick={() => setOpen('customFooter')}
          style={{
            padding: 'var(--wk-sp-2) var(--wk-sp-4)',
            borderRadius: 'var(--wk-r-sm)',
            border: '1px solid var(--wk-border-default)',
            background: 'var(--wk-bg-base)',
            cursor: 'pointer',
            color: 'var(--wk-text-primary)',
            fontSize: 'var(--wk-text-size-md)',
          }}
        >
          footer=JSX 完全自定义
        </button>

        {/* title=null，body 自绘 header（参考 BotDetailModal 模式） */}
        <WKModal
          visible={open === 'noHeader'}
          onCancel={() => setOpen(null)}
          title={null}
        >
          <div style={{ textAlign: 'center', padding: 'var(--wk-sp-6) var(--wk-sp-4)' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 'var(--wk-r-circle)',
                background: 'var(--wk-brand-primary)',
                margin: '0 auto var(--wk-sp-3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 24,
              }}
            >
              A
            </div>
            <div style={{ fontWeight: 600, fontSize: 'var(--wk-text-size-xl)', color: 'var(--wk-text-primary)' }}>
              Alice
            </div>
            <div style={{ color: 'var(--wk-text-tertiary)', fontSize: 'var(--wk-text-size-sm)', marginTop: 'var(--wk-sp-1)' }}>
              @alice_123
            </div>
          </div>
        </WKModal>

        {/* footer 完全自定义 JSX */}
        <WKModal
          visible={open === 'customFooter'}
          onCancel={() => setOpen(null)}
          title="有未发送的附件"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--wk-sp-2)', padding: 'var(--wk-sp-4) var(--wk-sp-6) var(--wk-sp-6)' }}>
              <button
                onClick={() => setOpen(null)}
                style={{
                  padding: 'var(--wk-sp-1-5) var(--wk-sp-4)',
                  borderRadius: 'var(--wk-r-sm)',
                  border: '1px solid var(--wk-border-default)',
                  background: 'var(--wk-bg-base)',
                  cursor: 'pointer',
                  color: 'var(--wk-text-primary)',
                  fontSize: 'var(--wk-text-size-md)',
                }}
              >
                取消
              </button>
              <button
                onClick={() => setOpen(null)}
                style={{
                  padding: 'var(--wk-sp-1-5) var(--wk-sp-4)',
                  borderRadius: 'var(--wk-r-sm)',
                  border: 'none',
                  background: 'var(--wk-brand-primary)',
                  cursor: 'pointer',
                  color: '#fff',
                  fontSize: 'var(--wk-text-size-md)',
                }}
              >
                继续切换
              </button>
            </div>
          }
        >
          <p style={{ margin: 0, color: 'var(--wk-text-secondary)', fontSize: 'var(--wk-text-size-md)' }}>
            切换会话后，未发送的附件将被丢弃，是否继续？
          </p>
        </WKModal>
      </div>
    )
  },
}
