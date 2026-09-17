// @vitest-environment jsdom
import React from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

// DAP-271 finding 4:loadData 失败返回 undefined(明确「无有效结果」),handleKeyword 只在 total!==undefined
// 时打点 —— 请求失败不再被伪装成 has_result=false 的零命中搜索,与「成功零命中」区分。
const h = vi.hoisted(() => ({
  fetchMcpDetail: vi.fn(),
  fetchMcpList: vi.fn(),
  fetchMcpMine: vi.fn(),
  fetchMcpTags: vi.fn(),
  track: vi.fn(),
}));

vi.mock("@octo/base", () => ({
  I18nContext: React.createContext(undefined),
  t: (key: string) => key,
  WKApp: { shared: { currentSpaceId: "space-a" }, mittBus: { on: vi.fn(), off: vi.fn() } },
  WKButton: () => null,
  Dap: { shared: { track: h.track } },
}));
vi.mock("@douyinfe/semi-ui", () => ({ Spin: () => null, Toast: { error: vi.fn() } }));
vi.mock("@douyinfe/semi-icons", () => ({ IconClose: () => null }));
vi.mock("lucide-react", () => ({
  Bot: () => null, Check: () => null, ChevronDown: () => null, Search: () => null,
  SlidersHorizontal: () => null, Upload: () => null,
}));
vi.mock("@dmwork/skillmarket", () => ({ MineTable: () => null }));
vi.mock("../../api/mcpService", () => ({
  fetchMcpDetail: (...a: unknown[]) => h.fetchMcpDetail(...a),
  fetchMcpList: (...a: unknown[]) => h.fetchMcpList(...a),
  fetchMcpMine: (...a: unknown[]) => h.fetchMcpMine(...a),
  fetchMcpTags: (...a: unknown[]) => h.fetchMcpTags(...a),
}));
vi.mock("../../api/pluginReview", () => ({ cancelPluginReview: vi.fn(), publishPluginListing: vi.fn() }));
vi.mock("../../hooks/useMyReviewState", () => ({ MyReviewStateProbe: () => null, resolveReviewRowState: vi.fn() }));
vi.mock("../../components/McpCard", () => ({ default: () => null }));
vi.mock("../../components/McpDetailModal", () => ({ default: () => null }));
vi.mock("../../components/McpCreateModal", () => ({ default: () => null }));
vi.mock("../../components/McpBotPublishModal", () => ({ default: () => null }));
vi.mock("../../components/McpConnectModal", () => ({ default: () => null }));
vi.mock("../../components/McpDeleteConfirmModal", () => ({ default: () => null }));
vi.mock("../../components/ReviewSubmitModal", () => ({ default: () => null }));

import McpMarketListPage from "../McpMarketListPage";

type PageInternals = {
  state: Record<string, unknown>;
  setState: (patch: unknown, cb?: () => void) => void;
  handleKeyword: (value: string) => void;
};

function createPage(): PageInternals {
  const page = new McpMarketListPage({}) as unknown as PageInternals;
  page.setState = (patch: any, callback?: () => void) => {
    const next = typeof patch === "function" ? patch(page.state) : patch;
    page.state = { ...page.state, ...next };
    callback?.();
  };
  return page;
}

const searchedCalls = () => h.track.mock.calls.filter((c) => c[0] === "market_searched");

describe("McpMarketListPage handleKeyword — 失败 vs 成功零命中 (DAP-271 finding 4)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it("成功但零命中:发 market_searched has_result=false", async () => {
    h.fetchMcpList.mockResolvedValue({ items: [], categories: [{ key: "all", label: "全部", count: 0 }], total: 0 });
    const page = createPage();

    page.handleKeyword("no-such-plugin");
    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();

    const hits = searchedCalls();
    expect(hits).toHaveLength(1);
    expect(hits[0][1]).toMatchObject({ market_type: "mcp", has_result: false });
  });

  it("请求失败:不发 market_searched(不伪装成零命中)", async () => {
    h.fetchMcpList.mockRejectedValue(new Error("HTTP 500"));
    const page = createPage();

    page.handleKeyword("boom");
    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();
    await Promise.resolve();

    expect(searchedCalls()).toHaveLength(0);
  });

  it("成功有命中:发 market_searched has_result=true", async () => {
    h.fetchMcpList.mockResolvedValue({ items: [{ id: "m1" }], categories: [{ key: "all", label: "全部", count: 1 }], total: 1 });
    const page = createPage();

    page.handleKeyword("hit");
    await vi.advanceTimersByTimeAsync(300);
    await Promise.resolve();

    const hits = searchedCalls();
    expect(hits).toHaveLength(1);
    expect(hits[0][1]).toMatchObject({ market_type: "mcp", has_result: true });
  });
});
