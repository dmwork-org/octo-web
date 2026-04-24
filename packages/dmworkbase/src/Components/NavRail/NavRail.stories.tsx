import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import NavRail from "./index";
import type { NavRailProps } from "./index";
import NavSpaceSwitcher from "./NavSpaceSwitcher";
import SpaceItem from "../SpaceItem";
import ActionListItem from "../ActionListItem";
import { IconJoinSpace } from "./icons";
import "../../theme/index.css";

const mockSpaces = [
    { space_id: "s1", name: "Demo Space", logo: "", member_count: 8, max_users: 50 },
    { space_id: "s2", name: "产品团队", logo: "", member_count: 3, max_users: 10 },
    { space_id: "s3", name: "研发中心", logo: "", member_count: 20, max_users: 0 },
] as any[];

const defaultArgs: NavRailProps = {
    spaces: mockSpaces,
    currentSpaceId: "s1",
    activeItem: "messages",
    userName: "张三",
    unreadCount: 0,
    onSpaceSelect: (id) => console.log("space selected:", id),
    onItemClick: (key) => console.log("nav item clicked:", key),
    onJoinSpace: () => console.log("join space"),
    onSettingsClick: () => console.log("settings"),
    onAvatarClick: () => console.log("avatar"),
};

const meta: Meta<typeof NavRail> = {
    title: "Navigation/NavRail",
    component: NavRail,
    parameters: {
        layout: "fullscreen",
        backgrounds: {
            default: "dark",
            values: [
                { name: "dark", value: "#111318" },
                { name: "light", value: "#f5f5f5" },
            ],
        },
    },
    decorators: [
        (Story) => (
            <div style={{ display: "flex", height: "100vh" }}>
                <Story />
                <div style={{ flex: 1, background: "var(--wk-bg-base, #171921)" }} />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<typeof NavRail>;

export const Default: Story = {
    args: defaultArgs,
};

export const WithBadge: Story = {
    args: { ...defaultArgs, unreadCount: 5 },
};

export const WithLargeBadge: Story = {
    args: { ...defaultArgs, unreadCount: 120 },
};

export const MultipleSpaces: Story = {
    args: { ...defaultArgs, currentSpaceId: "s2" },
};

export const NoSpaces: Story = {
    args: { ...defaultArgs, spaces: [], currentSpaceId: undefined },
};

// ── Space 弹窗独立 Story — 静态展开状态，无需 WKApp context ──
export const SpaceDropdownOpen = {
    name: "Space 弹窗（展开状态）",
    render: () => (
        <div style={{
            width: "100vw", height: "100vh",
            background: "var(--wk-bg-deep, #F0F1F5)",
            display: "flex", alignItems: "flex-end",
            paddingBottom: 52, paddingLeft: 12,
        }}>
            {/* 静态展开弹窗，不依赖 WKApp，直接复现设计稿样式 */}
            <div className="wk-navrail__dropdown" style={{ position: "static", boxSizing: "border-box" }}>
                <div className="wk-navrail__dropdown-title">切换 Space</div>
                <div className="wk-navrail__dropdown-spaces">
                    {mockSpaces.map((s, i) => (
                        <SpaceItem
                            key={s.space_id}
                            name={s.name}
                            avatarSize="xs"
                            meta={s.max_users > 0
                                ? `${s.member_count}/${s.max_users} 人`
                                : `${s.member_count} 人`}
                            selected={i === 0}
                        />
                    ))}
                </div>
                <div className="wk-navrail__dropdown-divider" />
                <div className="wk-navrail__dropdown-actions">
                    <ActionListItem icon={<IconJoinSpace />} label="加入 Space" variant="join" compact />
                </div>
            </div>
        </div>
    ),
};
