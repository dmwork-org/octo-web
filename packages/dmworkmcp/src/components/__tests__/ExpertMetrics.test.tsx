// @vitest-environment jsdom
import React from "react";
import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExpertDetailModal from "../ExpertDetailModal";
import ExpertCard from "../ExpertCard";
import MineTable from "../../../../dmworkskillmarket/src/components/MineTable";
import type { ExpertAgent, ExpertSquad } from "../../mock/expertMock";

const trackExpertView = vi.fn();

vi.mock("../../api/expertService", () => ({
  getExpertSkillContent: vi.fn(),
  getSquadSkillContent: vi.fn(),
  getExpertSkillDownloadUrl: vi.fn(),
  getSquadSkillDownloadUrl: vi.fn(),
  trackExpertView: (...args: unknown[]) => {
    trackExpertView(...args);
    return Promise.resolve();
  },
}));
vi.mock("../ExpertSpecView", () => ({ default: () => null }));
vi.mock("@octo/base", () => ({
  t: (key: string, opts?: { values?: { count?: number } }) =>
    opts?.values?.count !== undefined ? `${key}:${opts.values.count}` : key,
  useI18n: () => undefined,
  WKModal: ({
    children,
    header,
  }: {
    children: React.ReactNode;
    header?: React.ReactNode;
  }) => React.createElement("div", null, header, children),
}));

let container: HTMLDivElement | null = null;

afterEach(() => {
  if (container) {
    ReactDOM.unmountComponentAtNode(container);
    container.remove();
    container = null;
  }
  vi.clearAllMocks();
});

function render(element: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    ReactDOM.render(element, container);
  });
  return container;
}

const agent: ExpertAgent = {
  id: "expert-1",
  kind: "agent",
  shortName: "架构",
  name: "后端架构师",
  summary: "评审服务边界。",
  category: "研发工具",
  tags: [],
  publisher: "Octo Community",
  createdByType: "human",
  creatorName: "王决",
  viewCount: 1280,
  installCount: 6,
};

const squad: ExpertSquad = {
  id: "squad-1",
  kind: "squad",
  shortName: "研发",
  name: "软件研发交付团",
  summary: "…",
  category: "研发工具",
  tags: [],
  publisher: "Octo Community",
  createdByType: "human",
  creatorName: "林澈",
  viewCount: 42,
  installCount: 3,
  leader: "",
  members: [],
  memberCount: 5,
  dependencies: { blocking: [], recommended: [] },
  permission: "",
  checkResult: "supported",
};

describe("expert metric counts", () => {
  it("tracks one view per opened detail, keyed by resource kind", () => {
    render(<ExpertDetailModal item={agent} onClose={vi.fn()} />);
    expect(trackExpertView).toHaveBeenCalledTimes(1);
    expect(trackExpertView).toHaveBeenCalledWith("agent", "expert-1");

    // Re-render with the SAME item (e.g. list item -> hydrated detail swap):
    // no second view event.
    act(() => {
      ReactDOM.render(
        <ExpertDetailModal item={{ ...agent }} onClose={vi.fn()} />,
        container
      );
    });
    expect(trackExpertView).toHaveBeenCalledTimes(1);

    act(() => {
      ReactDOM.render(
        <ExpertDetailModal item={squad} onClose={vi.fn()} />,
        container
      );
    });
    expect(trackExpertView).toHaveBeenCalledTimes(2);
    expect(trackExpertView).toHaveBeenLastCalledWith("squad", "squad-1");
  });

  it.each([agent, { ...agent, viewCount: 0, installCount: 0 }])(
    "hides unsupported usage counts without leaving an empty card footer",
    (item) => {
      const root = render(<ExpertCard item={item} onOpen={vi.fn()} />);
      expect(root.querySelector(".wk-mcp-card__stats")).toBeNull();
      expect(root.querySelector(".wk-mcp-card__footer")).toBeNull();
    }
  );

  it("keeps the squad member count and card actions", () => {
    const onAddToLoop = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const root = render(
      <ExpertCard item={squad} onOpen={vi.fn()} onAddToLoop={onAddToLoop} onEdit={onEdit} onDelete={onDelete} />
    );
    const stats = root.querySelectorAll(".wk-mcp-card__stat");
    expect(stats).toHaveLength(1);
    expect(stats[0].textContent).toBe("5");
    act(() => {
      root.querySelector<HTMLButtonElement>(".wk-mcp-card__primary-action")!.click();
      root.querySelector<HTMLButtonElement>('[title="mcp.expert.edit"]')!.click();
      root.querySelector<HTMLButtonElement>('[title="mcp.expert.delete"]')!.click();
    });
    expect(onAddToLoop).toHaveBeenCalledWith(squad);
    expect(onEdit).toHaveBeenCalledWith(squad);
    expect(onDelete).toHaveBeenCalledWith(squad);
  });

  it.each([
    ["expert"],
    ["squad"],
    ["expert", "squad", "skill", "connector"],
  ] as const)("removes usage headers and cells from lists containing %j", (...types) => {
    const root = render(
      <MineTable rows={types.map((type) => ({
        id: type, type, name: type, icon: null, views: 42, downloads: 6,
      }))} />
    );
    expect(root.querySelectorAll(".wk-mine-table__col--num")).toHaveLength(0);
    expect(root.querySelectorAll('[role="columnheader"]')).toHaveLength(7);
    expect(root.textContent).not.toContain("skillMarket.plugin.columnViews");
    expect(root.textContent).not.toContain("skillMarket.plugin.columnDownloads");
    for (const row of root.querySelectorAll('.wk-mine-table__row')) {
      expect(row.querySelectorAll('[role="cell"]')).toHaveLength(7);
    }
  });

  it("preserves usage columns for skill and connector lists", () => {
    const root = render(
      <MineTable rows={(["skill", "connector"] as const).map((type) => ({
        id: type, type, name: type, icon: null, views: 42, downloads: 6,
      }))} />
    );
    expect(root.querySelectorAll('[role="columnheader"]')).toHaveLength(9);
    const counts = Array.from(root.querySelectorAll('.wk-mine-table__row')).map((row) =>
      Array.from(row.querySelectorAll('.wk-mine-table__col--num')).map((cell) => cell.textContent)
    );
    expect(counts).toEqual([["42", "6"], ["42", "6"]]);
  });
});
