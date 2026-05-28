import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import OutputsPanel from "./index";
import type { MatterOutput } from "../../bridge/types";

const meta: Meta<typeof OutputsPanel> = {
  title: "Matter/OutputsPanel",
  component: OutputsPanel,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "事项详情页 “产出文件” tab 的列表组件。基于 Figma node 1411:8186 的 6 列表格 (标题/描述/发送人/来源群/发送时间/操作) 实现。\n\n" +
          "使用注意:\n" +
          "- 头像由调用方通过 `renderAvatar` 注入 (UI/数据分离, 避免直接依赖 IM SDK)。\n" +
          "- `onPreview` 仅在事项详情嵌入会话侧边栏 (`showClose=true`) 时传入, 此时操作列出现 “眼睛” 按钮; 不传则不显示, 避免独立事项页面误触发文件预览。\n" +
          "- 文件大小为空时显示 “—” 占位, 不隐藏第二行, 保持视觉一致。",
      },
    },
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 1080, padding: 16 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof OutputsPanel>;

// 模拟头像渲染 (生产环境由 panel 用 WKAvatar 注入)。
// 这里是 storybook mock, 用 token 驱动颜色, 跟主题切换联动。
const mockRenderAvatar = (uid: string, size: number) => {
  const isAi = uid === "u-bot";
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: isAi ? "var(--wk-color-accent)" : "var(--wk-bg-elevated)",
        color: isAi ? "#fff" : "var(--wk-text-secondary)",
        fontSize: size * 0.45,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 500,
      }}
    >
      {uid.slice(2, 3).toUpperCase()}
    </div>
  );
};

const mockOutputs: MatterOutput[] = [
  {
    id: "out-1",
    entry_id: "entry-1",
    matter_id: "matter-1",
    file_url: "https://cdn.example.com/competitor-analysis.pdf",
    file_name: "competitor-analysis.pdf",
    file_size: 2_410_000,
    mime_type: "application/pdf",
    description: "玛蒂卡 vs Linear vs Octo 对标, IM-first vs 卡片式差异",
    sender_uid: "u-mleil",
    sender_uname: "李明磊",
    source_channel_id: "ch-1",
    source_channel_name: "Octo设计群",
    sent_at: "2020-07-12T13:33:56.000Z",
  },
  {
    id: "out-2",
    entry_id: "entry-2",
    matter_id: "matter-1",
    file_url: "https://cdn.example.com/outline.md",
    file_name: "outline.md",
    file_size: 1_150_000,
    mime_type: "text/markdown",
    description:
      '大纲 4 章, 围绕 "Agents do, Humans decide" 展开玛蒂卡 vs Linear vs Octo 对标, IM-first vs 卡片式差异',
    sender_uid: "u-bot",
    sender_uname: "我是保洁",
    source_channel_id: "ch-2",
    source_channel_name: "octo 产品设计人虾干活群",
    sent_at: "2020-07-12T13:33:56.000Z",
  },
  {
    id: "out-3",
    entry_id: "entry-3",
    matter_id: "matter-1",
    file_url: "https://cdn.example.com/Matters-prototype.html",
    file_name: "Matters-prototype.html",
    file_size: 1_150_000,
    mime_type: "text/html",
    description: "修改完的原型",
    sender_uid: "u-shdh",
    sender_uname: "沙东惠",
    source_channel_id: "ch-3",
    source_channel_name: "FT-A2 Team",
    sent_at: "2020-07-12T13:33:56.000Z",
  },
];

// 模拟下载回调 (生产环境由 panel 注入 resolveAndGuardUrl + downloadFile)。
const mockOnDownload = (item: MatterOutput) =>
  console.log("download:", item.file_name);

export const Default: Story = {
  args: {
    outputs: mockOutputs,
    loading: false,
    hasMore: false,
    onSearch: (q: string) => console.log("search:", q),
    renderAvatar: mockRenderAvatar,
    onDownload: mockOnDownload,
  },
};

/**
 * 嵌入会话侧边栏场景: 多一个"眼睛"预览按钮, 点击触发文件预览面板。
 */
export const WithPreview: Story = {
  args: {
    outputs: mockOutputs,
    loading: false,
    hasMore: false,
    onSearch: (q: string) => console.log("search:", q),
    renderAvatar: mockRenderAvatar,
    onPreview: (item) => console.log("preview:", item.file_name),
    onDownload: mockOnDownload,
  },
};

export const WithPagination: Story = {
  args: {
    outputs: mockOutputs.slice(0, 2),
    loading: false,
    hasMore: true,
    onSearch: (q: string) => console.log("search:", q),
    onLoadMore: () => console.log("load more"),
    renderAvatar: mockRenderAvatar,
    onDownload: mockOnDownload,
  },
};

export const Empty: Story = {
  args: {
    outputs: [],
    loading: false,
    hasMore: false,
    onSearch: (q: string) => console.log("search:", q),
    renderAvatar: mockRenderAvatar,
    onDownload: mockOnDownload,
  },
};

export const Loading: Story = {
  args: {
    outputs: [],
    loading: true,
    hasMore: false,
    renderAvatar: mockRenderAvatar,
    onDownload: mockOnDownload,
  },
};

export const NoSearch: Story = {
  name: "Without Search",
  args: {
    outputs: mockOutputs.slice(0, 2),
    loading: false,
    hasMore: false,
    renderAvatar: mockRenderAvatar,
    onDownload: mockOnDownload,
  },
};

/**
 * 用户不在某个源群时, "来源群" 列遮罩 + "不在群" 徽章。
 * 模拟 ch-2 (Octo设计群) 用户不在群; ch-1 / ch-3 用户在群。
 */
export const WithNotMemberChannels: Story = {
  name: "Not in Some Source Channels",
  args: {
    outputs: mockOutputs,
    loading: false,
    hasMore: false,
    onSearch: (q: string) => console.log("search:", q),
    renderAvatar: mockRenderAvatar,
    onDownload: mockOnDownload,
    getChannelMembership: (sourceChannelId) => {
      const isMember = sourceChannelId !== "ch-2";
      return { isMember, loading: false };
    },
  },
};

/**
 * 成员关系拉取中 (myGroupsLoading=true): "来源群" 列显示 shimmer 骨架,
 * 避免在权限未知时先模糊再清晰造成闪烁。
 */
export const WithLoadingMembership: Story = {
  name: "Loading Membership",
  args: {
    outputs: mockOutputs,
    loading: false,
    hasMore: false,
    onSearch: (q: string) => console.log("search:", q),
    renderAvatar: mockRenderAvatar,
    onDownload: mockOnDownload,
    getChannelMembership: () => ({ isMember: false, loading: true }),
  },
};

/**
 * 加载失败: 显示错误条 + 重试按钮; load-more 按钮被清空。
 */
export const WithError: Story = {
  args: {
    outputs: [],
    loading: false,
    hasMore: false,
    error: "加载失败,请稍后重试",
    onSearch: (q: string) => console.log("search:", q),
    onRetry: () => console.log("retry"),
    renderAvatar: mockRenderAvatar,
    onDownload: mockOnDownload,
  },
};
