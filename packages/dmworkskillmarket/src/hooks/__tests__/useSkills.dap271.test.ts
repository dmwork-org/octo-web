import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { Dap } from "@octo/base";

// DAP-271 finding 3:market_searched(has_result) 按 query identity 管理待上报状态,正确处理失败/清空,
// 不把普通列表(清空关键词)误记成搜索成功。
vi.mock("../../api/skillApi", () => ({
  getCategories: vi.fn(),
  getSkills: vi.fn(),
  getMySkills: vi.fn(),
}));

import { getCategories, getSkills } from "../../api/skillApi";
import { useSkills } from "../useSkills";

const CATS = [{ id: "all", name: "全部", iconKey: "LayoutGrid", sortOrder: 0, skillCount: 0 }];
const page = (total: number) => ({ items: total > 0 ? [{ id: "s1" }] : [], total, nextCursor: null });

function searchedCalls(track: ReturnType<typeof vi.spyOn>) {
  return track.mock.calls.filter((c) => c[0] === "market_searched");
}

describe("useSkills — market_searched query identity (DAP-271 finding 3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(getCategories).mockResolvedValue(CATS as any);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("非空检索成功后发一次 market_searched,带 has_result", async () => {
    vi.mocked(getSkills).mockResolvedValue(page(5) as any);
    const track = vi.spyOn(Dap.shared, "track").mockImplementation(() => undefined);

    const { result } = renderHook(() => useSkills());
    await act(async () => { await Promise.resolve(); }); // 首屏 fetch(非搜索)

    act(() => result.current.setQuery("foo"));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); }); // debounce → 搜索 fetch

    const hits = searchedCalls(track);
    expect(hits).toHaveLength(1);
    expect(hits[0][1]).toMatchObject({ market_type: "skill", has_result: true });
  });

  it("非空检索失败 → 清空关键词后普通列表成功,不误发 market_searched(核心回归)", async () => {
    const track = vi.spyOn(Dap.shared, "track").mockImplementation(() => undefined);
    // 首屏成功
    vi.mocked(getSkills).mockResolvedValueOnce(page(3) as any);
    const { result } = renderHook(() => useSkills());
    await act(async () => { await Promise.resolve(); });

    // 检索 "foo" 失败
    vi.mocked(getSkills).mockRejectedValueOnce(new Error("network"));
    act(() => result.current.setQuery("foo"));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(searchedCalls(track)).toHaveLength(0);

    // 清空关键词 → 普通列表成功。绝不能把它当成 "foo" 的搜索成功。
    vi.mocked(getSkills).mockResolvedValueOnce(page(9) as any);
    act(() => result.current.setQuery(""));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });

    expect(searchedCalls(track)).toHaveLength(0);
  });

  it("清空关键词后的普通列表 fetch 自身不发 market_searched", async () => {
    vi.mocked(getSkills).mockResolvedValue(page(4) as any);
    const track = vi.spyOn(Dap.shared, "track").mockImplementation(() => undefined);

    const { result } = renderHook(() => useSkills());
    await act(async () => { await Promise.resolve(); });

    act(() => result.current.setQuery("bar"));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(searchedCalls(track)).toHaveLength(1); // "bar" 搜索成功计一次

    act(() => result.current.setQuery(""));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    // 清空后普通列表不再追加 market_searched。
    expect(searchedCalls(track)).toHaveLength(1);
  });
});
