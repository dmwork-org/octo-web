import type { Meta, StoryObj } from "@storybook/react-vite";
import React from "react";
import SpaceAvatar from "./index";
import "../../theme/index.css";

const meta: Meta<typeof SpaceAvatar> = {
    title: "Base/SpaceAvatar",
    component: SpaceAvatar,
    parameters: { layout: "centered" },
    argTypes: {
        size: { control: "select", options: ["sm", "md", "lg"] },
    },
};
export default meta;
type Story = StoryObj<typeof SpaceAvatar>;

export const Letter: Story = {
    args: { name: "Demo Space", size: "md" },
};

export const WithLogo: Story = {
    args: {
        name: "OctoSpace",
        logo: "https://avatars.githubusercontent.com/u/9919?s=48",
        size: "md",
    },
};

export const Sizes: Story = {
    render: () => (
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <SpaceAvatar name="小" size="sm" />
            <SpaceAvatar name="中" size="md" />
            <SpaceAvatar name="大" size="lg" />
        </div>
    ),
};

export const ColorVariants: Story = {
    render: () => (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {["Demo Space", "OctoSpace", "Octo", "test0311", "test", "Dev"].map((n) => (
                <SpaceAvatar key={n} name={n} size="md" />
            ))}
        </div>
    ),
};
