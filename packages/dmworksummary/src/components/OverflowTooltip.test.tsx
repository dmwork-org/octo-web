import React from "react";
import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";
import OverflowTooltip from "./OverflowTooltip";

vi.mock("@douyinfe/semi-ui", () => ({
    Tooltip: ({ children, content, visible, onVisibleChange, trigger }: any) => (
        <div data-testid="tooltip-wrapper" data-visible={visible} data-trigger={trigger}>
            {visible && <div data-testid="tooltip-content">{content}</div>}
            <div
                data-testid="tooltip-trigger"
                onMouseEnter={() => onVisibleChange?.(true)}
                onMouseLeave={() => onVisibleChange?.(false)}
            >
                {children}
            </div>
        </div>
    ),
}));

function render(ui: React.ReactElement, options?: any) {
    return rtlRender(ui, { legacyRoot: true, ...options });
}

function mockOverflow(el: HTMLElement, overflowing: boolean) {
    Object.defineProperty(el, "scrollWidth", { value: overflowing ? 200 : 100, configurable: true });
    Object.defineProperty(el, "clientWidth", { value: 100, configurable: true });
}

describe("OverflowTooltip", () => {
    it("does not show tooltip when text is not overflowing", () => {
        render(<OverflowTooltip>Short text</OverflowTooltip>);

        const container = screen.getByText("Short text");
        mockOverflow(container, false);

        fireEvent.mouseEnter(screen.getByTestId("tooltip-trigger"));

        expect(screen.queryByTestId("tooltip-content")).not.toBeInTheDocument();
    });

    it("shows tooltip when text is overflowing", () => {
        render(<OverflowTooltip>This is a very long text that overflows</OverflowTooltip>);

        const container = screen.getByText("This is a very long text that overflows");
        mockOverflow(container, true);

        fireEvent.mouseEnter(screen.getByTestId("tooltip-trigger"));

        expect(screen.getByTestId("tooltip-content")).toBeInTheDocument();
    });

    it("hides tooltip on mouse leave", () => {
        render(<OverflowTooltip>Overflowing text</OverflowTooltip>);

        const container = screen.getByText("Overflowing text");
        mockOverflow(container, true);

        fireEvent.mouseEnter(screen.getByTestId("tooltip-trigger"));
        expect(screen.getByTestId("tooltip-content")).toBeInTheDocument();

        fireEvent.mouseLeave(screen.getByTestId("tooltip-trigger"));
        expect(screen.queryByTestId("tooltip-content")).not.toBeInTheDocument();
    });

    it("renders correct element type when as prop is provided", () => {
        render(<OverflowTooltip as="span">Content</OverflowTooltip>);

        const el = screen.getByText("Content");
        expect(el.tagName).toBe("SPAN");
    });

    it("passes className and style correctly", () => {
        render(
            <OverflowTooltip className="custom-class" style={{ color: "red" }}>
                Styled content
            </OverflowTooltip>
        );

        const el = screen.getByText("Styled content");
        expect(el).toHaveClass("custom-class");
        expect(el).toHaveStyle("color: rgb(255, 0, 0); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;");
    });

    it("uses hover trigger for selectable tooltip text", () => {
        render(<OverflowTooltip>Text</OverflowTooltip>);

        const wrapper = screen.getByTestId("tooltip-wrapper");
        expect(wrapper).toHaveAttribute("data-trigger", "hover");
    });
});
