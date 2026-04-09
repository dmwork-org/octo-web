import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import FoldSessionCard from "./index";

const avatarNode = (
  label: string,
  background: string,
  color: string = "var(--wk-bg-surface)"
) => (
  <div
    style={{
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background,
      color,
      fontSize: "var(--wk-text-size-tiny)",
      fontWeight: "var(--wk-font-bold)",
    }}
  >
    {label}
  </div>
);

const participants = [
  {
    id: "claude",
    name: "Claude",
    avatar: avatarNode("C", "var(--wk-brand-gradient)"),
  },
  {
    id: "jojo",
    name: "JOJO",
    avatar: avatarNode("J", "var(--wk-ai-surface)", "var(--wk-text-accent)"),
  },
];

const meta: Meta<typeof FoldSessionCard> = {
  title: "Layout/FoldSessionCard",
  component: FoldSessionCard,
  parameters: {
    docs: {
      description: {
        component: `
群聊里连续 Bot 协作消息的折叠卡片。

**设计语义：**
- 头部展示这段 session 的参与 Bot 集合，而不是最后一条消息发送者
- 中间过程消息可展开查看
- 已完成态保留最后一条完整消息作为结论区
- 进行中态始终占住底部摘要位，typing 时由业务层渲染 loading
                `,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof FoldSessionCard>;

const expandedContent = (
  <div
    style={{ display: "flex", flexDirection: "column", gap: "var(--wk-sp-3)" }}
  >
    <div
      style={{
        fontSize: "var(--wk-text-size-base)",
        color: "var(--wk-text-secondary)",
        lineHeight: "var(--wk-leading-loose)",
      }}
    >
      Claude：数据库选型要考虑读写比、数据量和查询复杂度。
    </div>
    <div
      style={{
        fontSize: "var(--wk-text-size-base)",
        color: "var(--wk-text-secondary)",
        lineHeight: "var(--wk-leading-loose)",
      }}
    >
      JOJO：建议 PostgreSQL + Redis，热数据走缓存，复杂检索走搜索引擎。
    </div>
    <div
      style={{
        fontSize: "var(--wk-text-size-base)",
        color: "var(--wk-text-secondary)",
        lineHeight: "var(--wk-leading-loose)",
      }}
    >
      Claude：全文搜索建议走 Elasticsearch，不在主库里做。
    </div>
  </div>
);

export const ActiveCollapsed: Story = {
  name: "进行中 / 收起展示最新消息",
  render: () => (
    <div style={{ padding: "var(--wk-sp-6)", background: "var(--wk-bg-base)" }}>
      <FoldSessionCard
        participants={participants}
        count={3}
        isActive
        showSummary
        summarySender="Claude"
        summaryContent="正在继续补充数据库选型建议，下一条输出会直接接在这里。"
      />
    </div>
  ),
};

export const CompletedCollapsed: Story = {
  name: "已完成 / 默认显示结论",
  render: () => (
    <div style={{ padding: "var(--wk-sp-6)", background: "var(--wk-bg-base)" }}>
      <FoldSessionCard
        participants={participants}
        count={6}
        summarySender="JOJO"
        showSummary
        summaryContent="结论：主库 PostgreSQL + 缓存 Redis + 搜索 Elasticsearch，三层架构。"
      />
    </div>
  ),
};

export const ActiveExpanded: Story = {
  name: "进行中 / 展开仍保留底部最新消息",
  render: () => (
    <div style={{ padding: "var(--wk-sp-6)", background: "var(--wk-bg-base)" }}>
      <FoldSessionCard
        participants={participants}
        count={4}
        isActive
        isExpanded
        expandedContent={expandedContent}
        summarySender="Claude"
        showSummary
        summaryContent="最新一条 AI 输出继续固定在底部摘要区，不和上面的过程列表重复。"
      />
    </div>
  ),
};

export const CompletedExpanded: Story = {
  name: "已完成 / 展开过程",
  render: () => (
    <div style={{ padding: "var(--wk-sp-6)", background: "var(--wk-bg-base)" }}>
      <FoldSessionCard
        participants={participants}
        count={6}
        isExpanded
        expandedContent={expandedContent}
        summarySender="JOJO"
        showSummary
        summaryContent="结论：主库 PostgreSQL + 缓存 Redis + 搜索 Elasticsearch，三层架构。"
      />
    </div>
  ),
};

export const SingleBotSession: Story = {
  name: "单 Bot 连续会话",
  render: () => (
    <div style={{ padding: "var(--wk-sp-6)", background: "var(--wk-bg-base)" }}>
      <FoldSessionCard
        participants={[participants[0]]}
        count={4}
        isExpanded
        expandedContent={
          <div
            style={{
              fontSize: "var(--wk-text-size-base)",
              color: "var(--wk-text-secondary)",
              lineHeight: "var(--wk-leading-loose)",
            }}
          >
            Claude 连续输出 4 条建议，头部只显示单个 Bot 名称。
          </div>
        }
        summarySender="Claude"
        showSummary
        summaryContent="建议混合方案：用户侧 JWT + Refresh Token，Bot/M2M 侧 API Key + IP 白名单。"
      />
    </div>
  ),
};

export const LongSummary: Story = {
  name: "长结论文本",
  render: () => (
    <div style={{ padding: "var(--wk-sp-6)", background: "var(--wk-bg-base)" }}>
      <FoldSessionCard
        participants={participants}
        count={8}
        summarySender="Claude"
        showSummary
        highlightSummary
        summaryContent="还需要考虑 Token 刷新时的并发问题。建议用 Sliding Window + Lock 机制防止重复刷新。另外 Refresh Token 要做 Rotation：每次刷新同时下发新的 Refresh Token 并废弃旧的，防止 Token 被盗用后持续刷新。"
      />
    </div>
  ),
};

export const MultiSelectExpanded: Story = {
  name: "展开区 / 多选模式",
  render: () => (
    <div style={{ padding: "var(--wk-sp-6)", background: "var(--wk-bg-base)" }}>
      <FoldSessionCard
        participants={participants}
        count={6}
        isExpanded
        selectionMode
        showSummary
        summarySender="JOJO"
        summaryContent="底部 summary 在多选模式下仍然可见，并且也应该作为会话中的一条消息参与勾选。"
        summarySelectable
        expandedContent={
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--wk-sp-2)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "var(--wk-sp-2)",
                margin: "0 calc(var(--wk-sp-2) * -1)",
                padding: "var(--wk-sp-2)",
                borderRadius: "var(--wk-r-sm)",
                background:
                  "color-mix(in srgb, var(--wk-brand-primary) 4%, transparent)",
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  background: "var(--wk-brand-primary)",
                  color: "white",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                }}
              >
                ✓
              </span>
              <div
                style={{
                  fontSize: "var(--wk-text-size-base)",
                  color: "var(--wk-text-secondary)",
                  lineHeight: "var(--wk-leading-loose)",
                }}
              >
                Claude：这里是已选中的折叠消息，后续可以参与合并转发或删除。
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "var(--wk-sp-2)",
                margin: "0 calc(var(--wk-sp-2) * -1)",
                padding: "var(--wk-sp-2)",
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  border:
                    "2px solid color-mix(in srgb, var(--wk-text-primary) 15%, transparent)",
                }}
              />
              <div
                style={{
                  fontSize: "var(--wk-text-size-base)",
                  color: "var(--wk-text-secondary)",
                  lineHeight: "var(--wk-leading-loose)",
                }}
              >
                JOJO：这里是未选中的折叠消息项。
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "var(--wk-sp-2)",
                margin: "0 calc(var(--wk-sp-2) * -1)",
                padding: "var(--wk-sp-2)",
                borderRadius: "var(--wk-r-sm)",
                background:
                  "color-mix(in srgb, var(--wk-brand-primary) 4%, transparent)",
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  background: "var(--wk-brand-primary)",
                  color: "white",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                }}
              >
                ✓
              </span>
              <div
                style={{
                  fontSize: "var(--wk-text-size-base)",
                  color: "var(--wk-text-secondary)",
                  lineHeight: "var(--wk-leading-loose)",
                }}
              >
                Claude：第二条已选消息，用来体现多选模式下的勾选与高亮状态。
              </div>
            </div>
          </div>
        }
      />
    </div>
  ),
};
