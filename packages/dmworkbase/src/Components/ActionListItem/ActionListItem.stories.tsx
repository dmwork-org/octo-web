import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import { IconPlus, IconSearch, IconChevronRight, IconSetting } from "@douyinfe/semi-icons";

import { IconJoinSpace } from "../NavRail/icons";
import ActionListItem from "./index";
import "../../theme/index.css";

// compact variant story helper
const CompactContainer = ({ children }: { children: React.ReactNode }) => (
    <div style={{ width: 220, background: "var(--wk-bg-surface)", borderRadius: 14, padding: "8px" }}>
        {children}
    </div>
);

const meta: Meta<typeof ActionListItem> = {
    title: "Base/ActionListItem",
    component: ActionListItem,
    parameters: { layout: "centered" },
    argTypes: {
        variant: { control: "select", options: ["join", "create", "default"] },
    },
    decorators: [
        (Story) => (
            <div style={{ width: 280, background: "var(--wk-bg-surface)", borderRadius: 12, padding: "8px 8px" }}>
                <Story />
            </div>
        ),
    ],
};
export default meta;
type Story = StoryObj<typeof ActionListItem>;

export const Join: Story = {
    args: {
        icon: <IconSearch />,
        label: "加入 Space",
        desc: "通过邀请码或链接加入",
        variant: "join",
        trailing: <IconChevronRight />,
    },
};

export const Create: Story = {
    args: {
        icon: <IconPlus />,
        label: "创建 Space",
        desc: "新建你自己的工作空间",
        variant: "create",
        trailing: <IconChevronRight />,
    },
};

export const Default: Story = {
    args: {
        icon: <IconSetting />,
        label: "设置",
        variant: "default",
    },
};

export const AllVariants: Story = {
    render: () => (
        <div style={{ width: 280, background: "var(--wk-bg-surface)", borderRadius: 12, padding: "4px 8px" }}>
            <ActionListItem
                icon={<IconSearch />}
                label="加入 Space"
                desc="通过邀请码或链接加入"
                variant="join"
                trailing={<IconChevronRight />}
            />
            <ActionListItem
                icon={<IconPlus />}
                label="创建 Space"
                desc="新建你自己的工作空间"
                variant="create"
                trailing={<IconChevronRight />}
            />
            <ActionListItem
                icon={<IconSetting />}
                label="设置"
                variant="default"
            />
        </div>
    ),
};

export const CompactVariants: Story = {
    name: "Compact（NavRail Space 弹窗）",
    render: () => (
        <CompactContainer>
            <ActionListItem
                icon={<IconJoinSpace />}
                label="加入 Space"
                variant="join"
                compact
            />
        </CompactContainer>
    ),
};
