import type { Meta, StoryObj } from "@storybook/react";
import GroupCard from "./index";

const meta: Meta<typeof GroupCard> = {
    title: "Components/GroupCard",
    component: GroupCard,
    parameters: { layout: "centered" },
    tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof GroupCard>;

export const Default: Story = {
    args: {
        groupNo: "group_001",
        name: "产品讨论群",
        memberCount: 32,
        visible: true,
        onClose: () => {},
        onEnterChat: () => {},
    },
};

export const Loading: Story = {
    args: {
        groupNo: "group_002",
        visible: true,
        onClose: () => {},
        onEnterChat: () => {},
    },
};

export const LargeMemberCount: Story = {
    args: {
        groupNo: "group_003",
        name: "全员公告群",
        memberCount: 1280,
        visible: true,
        onClose: () => {},
        onEnterChat: () => {},
    },
};
