import type { Meta, StoryObj } from "@storybook/react-vite";
import React, { useState } from "react";
import { Toast } from "@douyinfe/semi-ui";
import { vi } from "vitest";
import SpaceList, { SpaceListProps } from "./index";
import { SpaceService } from "../../Service/SpaceService";
import "../../theme/index.css";

const MOCK_SPACES = [
    { space_id: "1", name: "Demo Space", logo: "", member_count: 12, max_users: 0 },
    { space_id: "2", name: "OctoSpace", logo: "", member_count: 8, max_users: 0 },
    { space_id: "3", name: "Octo", logo: "", member_count: 6, max_users: 0 },
    { space_id: "4", name: "test0311", logo: "", member_count: 3, max_users: 10 },
    { space_id: "5", name: "test", logo: "", member_count: 2, max_users: 5 },
];



function SpaceListWrapper({
    initialSelectedId = "1",
    ...rest
}: Omit<SpaceListProps, "onSelect" | "onCreateClick"> & { initialSelectedId?: string }) {
    const [selectedId, setSelectedId] = useState(initialSelectedId);

    return (
        <div style={{
            width: 280,
            background: "#fff",
            borderRadius: 14,
            boxShadow: "0 8px 32px rgba(26,28,36,0.12)",
            overflow: "hidden",
            border: "1px solid rgba(26,28,36,0.06)",
        }}>
            <SpaceList
                {...rest}
                selectedSpaceId={selectedId}
                onSelect={(space) => {
                    setSelectedId(space?.space_id ?? "");
                    Toast.info(`切换到：${space?.name ?? "—"}`);
                }}
                onCreateClick={() => Toast.info("点击「创建 Space」")}
            />
        </div>
    );
}

const meta: Meta<typeof SpaceListWrapper> = {
    title: "Space/SpaceList",
    component: SpaceListWrapper,
    parameters: {
        layout: "centered",
        backgrounds: {
            default: "light-gray",
            values: [{ name: "light-gray", value: "#F0F1F5" }],
        },
    },
    loaders: [
        async () => {
            // mock SpaceService.shared.getMySpaces，避免 Storybook 环境里 WKApp 未初始化
            vi.spyOn(SpaceService.shared, "getMySpaces").mockResolvedValue(MOCK_SPACES as any);
            return {};
        },
    ],
};
export default meta;
type Story = StoryObj<typeof SpaceListWrapper>;

/** 默认状态：多个 Space，底部显示加入/创建入口 */
export const Default: Story = {
    args: { initialSelectedId: "1" },
};

/** 点击「加入 Space」触发内部两步弹窗 */
export const JoinEntryModal: Story = {
    name: "加入 Space 弹窗（内部）",
    args: { initialSelectedId: "1" },
    parameters: {
        docs: {
            description: {
                story: "点击底部「加入 Space」按钮，触发内部 JoinSpaceModal（两步：输入邀请码 → 确认加入）。",
            },
        },
    },
};

/** 外部控制弹窗：onJoinClick 由父层处理 */
export const JoinEntryExternal: Story = {
    name: "加入 Space 入口（外部控制）",
    render: () => {
        const [selectedId, setSelectedId] = useState("1");
        return (
            <div style={{
                width: 280, background: "#fff", borderRadius: 14,
                boxShadow: "0 8px 32px rgba(26,28,36,0.12)",
                overflow: "hidden", border: "1px solid rgba(26,28,36,0.06)",
            }}>
                <SpaceList
                    selectedSpaceId={selectedId}
                    onSelect={(s) => setSelectedId(s?.space_id ?? "")}
                    onCreateClick={() => Toast.info("创建 Space")}
                    onJoinClick={() => Toast.info("外部弹窗由父层控制")}
                />
            </div>
        );
    },
};
