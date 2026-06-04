// @vitest-environment jsdom

import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../Messages/Text/MarkdownContent", () => ({
  default: ({ content }: { content: string }) => <span>{content}</span>,
  MarkdownImage: ({ src, alt }: { src: string; alt?: string }) => (
    <img src={src} alt={alt || ""} />
  ),
}));

import MixedContent from "../index";

let container: HTMLDivElement | null = null;

afterEach(() => {
  if (!container) return;
  ReactDOM.unmountComponentAtNode(container);
  container.remove();
  container = null;
});

function renderMixed(element: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(element, container);
  });
  return container;
}

describe("MixedContent", () => {
  it("按块渲染文本、图片和文件卡片", () => {
    const root = renderMixed(
      <MixedContent
        blocks={[
          { id: "t1", type: "text", content: "看这个" },
          { id: "i1", type: "image", src: "https://x/a.png", alt: "截图" },
          {
            id: "f1",
            type: "file",
            name: "需求说明.pdf",
            size: "2.0 KB",
            extension: "PDF",
            iconLabel: "PDF",
            url: "https://x/a.pdf",
          },
        ]}
      />
    );

    expect(root.textContent).toContain("看这个");
    expect(root.querySelector('img[alt="截图"]')?.getAttribute("src")).toBe(
      "https://x/a.png"
    );
    expect(root.textContent).toContain("需求说明.pdf");
    expect(root.textContent).toContain("2.0 KB");
  });

  it("点击文件下载按钮时回调 file block", () => {
    const onFileDownload = vi.fn();
    const root = renderMixed(
      <MixedContent
        blocks={[
          {
            id: "f1",
            type: "file",
            name: "需求说明.pdf",
            size: "2.0 KB",
            extension: "PDF",
            iconLabel: "PDF",
            url: "https://x/a.pdf",
          },
        ]}
        onFileDownload={onFileDownload}
      />
    );

    const button = root.querySelector("button");
    expect(button).not.toBeNull();
    act(() => {
      button?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });
    expect(onFileDownload).toHaveBeenCalledWith(
      expect.objectContaining({ id: "f1", type: "file" })
    );
  });
});
