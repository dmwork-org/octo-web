import { describe, it, expect, vi } from "vitest";
import type { Thread } from "@octo/base";
import { ThreadStatus } from "@octo/base";
import {
    buildLinkableChannels,
    type GroupSaveListRow,
    type LinkableChannelDataSource,
} from "../buildLinkableChannels";

const CT_GROUP = 2;
const CT_THREAD = 5;

function makeGroup(id: string, name: string): GroupSaveListRow {
    return {
        channel: { channelID: id, channelType: CT_GROUP },
        title: name,
    };
}

function makeThread(opts: {
    groupNo: string;
    shortId: string;
    name: string;
    status?: ThreadStatus;
    isMember?: boolean | undefined;
}): Thread {
    return {
        short_id: opts.shortId,
        group_no: opts.groupNo,
        channel_id: `${opts.groupNo}____${opts.shortId}`,
        channel_type: CT_THREAD,
        name: opts.name,
        creator_uid: "u-creator",
        status: opts.status ?? ThreadStatus.Active,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        is_member: opts.isMember,
    };
}

function makeDS(
    groups: GroupSaveListRow[],
    threadMap: Record<string, Thread[] | "fail">,
): LinkableChannelDataSource {
    return {
        groupSaveList: vi.fn(async () => groups),
        threadList: vi.fn(async (no: string) => {
            const v = threadMap[no];
            if (v === "fail") throw new Error("network");
            return v ?? [];
        }),
    };
}

describe("buildLinkableChannels", () => {
    it("returns groups only when no threads exist", async () => {
        const ds = makeDS(
            [makeGroup("g1", "群1"), makeGroup("g2", "群2")],
            { g1: [], g2: [] },
        );
        const res = await buildLinkableChannels(ds, { channelTypeGroup: CT_GROUP });
        expect(res.channels.map((c) => c.channelId)).toEqual(["g1", "g2"]);
        expect(res.channels.every((c) => c.channelType === CT_GROUP)).toBe(true);
        expect(res.threadLoadErrors).toBeUndefined();
    });

    it("flattens threads after their parent group with parent metadata", async () => {
        const ds = makeDS(
            [makeGroup("g1", "群1"), makeGroup("g2", "群2")],
            {
                g1: [
                    makeThread({ groupNo: "g1", shortId: "t1", name: "T-1-A" }),
                    makeThread({ groupNo: "g1", shortId: "t2", name: "T-1-B" }),
                ],
                g2: [makeThread({ groupNo: "g2", shortId: "t9", name: "T-2-A" })],
            },
        );
        const res = await buildLinkableChannels(ds, { channelTypeGroup: CT_GROUP });
        expect(res.channels.map((c) => c.channelId)).toEqual([
            "g1",
            "g1____t1",
            "g1____t2",
            "g2",
            "g2____t9",
        ]);
        const t1 = res.channels.find((c) => c.channelId === "g1____t1");
        expect(t1).toMatchObject({
            channelType: CT_THREAD,
            name: "T-1-A",
            parentGroupName: "群1",
            parentGroupNo: "g1",
        });
    });

    it("filters non-Active threads (archived/deleted)", async () => {
        const ds = makeDS([makeGroup("g1", "群1")], {
            g1: [
                makeThread({ groupNo: "g1", shortId: "t1", name: "活" }),
                makeThread({
                    groupNo: "g1",
                    shortId: "t2",
                    name: "归档",
                    status: ThreadStatus.Archived,
                }),
                makeThread({
                    groupNo: "g1",
                    shortId: "t3",
                    name: "删了",
                    status: ThreadStatus.Deleted,
                }),
            ],
        });
        const res = await buildLinkableChannels(ds, { channelTypeGroup: CT_GROUP });
        const threadNames = res.channels
            .filter((c) => c.channelType === CT_THREAD)
            .map((c) => c.name);
        expect(threadNames).toEqual(["活"]);
    });

    it("treats is_member permissively (only explicit false is filtered out)", async () => {
        const ds = makeDS([makeGroup("g1", "群1")], {
            g1: [
                makeThread({ groupNo: "g1", shortId: "t-undef", name: "undef" }),
                makeThread({
                    groupNo: "g1",
                    shortId: "t-true",
                    name: "true",
                    isMember: true,
                }),
                makeThread({
                    groupNo: "g1",
                    shortId: "t-false",
                    name: "false",
                    isMember: false,
                }),
            ],
        });
        const res = await buildLinkableChannels(ds, { channelTypeGroup: CT_GROUP });
        const threadNames = res.channels
            .filter((c) => c.channelType === CT_THREAD)
            .map((c) => c.name);
        // undefined / true 都列出, 只过滤 false
        expect(threadNames.sort()).toEqual(["true", "undef"]);
    });

    it("collects failed group names without aborting other groups", async () => {
        const onErr = vi.fn();
        const ds = makeDS(
            [
                makeGroup("g1", "群1"),
                makeGroup("g2", "群2"),
                makeGroup("g3", "群3"),
            ],
            {
                g1: [makeThread({ groupNo: "g1", shortId: "ta", name: "T1" })],
                g2: "fail",
                g3: [makeThread({ groupNo: "g3", shortId: "tb", name: "T3" })],
            },
        );
        const res = await buildLinkableChannels(ds, {
            channelTypeGroup: CT_GROUP,
            onThreadListError: onErr,
        });
        // 群本身全列, 子区只有 g1/g3 的
        expect(res.channels.map((c) => c.channelId)).toEqual([
            "g1",
            "g1____ta",
            "g2",
            "g3",
            "g3____tb",
        ]);
        // 失败的群名按 title 显示
        expect(res.threadLoadErrors).toEqual(["群2"]);
        expect(onErr).toHaveBeenCalledWith("g2", expect.any(Error));
    });

    it("falls back to groupNo when title is missing for failed group", async () => {
        const onErr = vi.fn();
        const ds = makeDS(
            [
                // 没 title 也没 name 的 row
                { channel: { channelID: "g-x", channelType: CT_GROUP } },
            ],
            { "g-x": "fail" },
        );
        const res = await buildLinkableChannels(ds, {
            channelTypeGroup: CT_GROUP,
            onThreadListError: onErr,
        });
        expect(res.threadLoadErrors).toEqual(["g-x"]);
    });

    it("does not fetch threads for non-group channels", async () => {
        const ds = makeDS(
            [
                makeGroup("g1", "群1"),
                // 假造一个 person 类型的 row (channelType=1), 不应该被拉子区
                { channel: { channelID: "p1", channelType: 1 }, title: "私聊" },
            ],
            { g1: [] },
        );
        const res = await buildLinkableChannels(ds, { channelTypeGroup: CT_GROUP });
        // person row 也保留, 但不应该触发它的 threadList 调用
        expect(ds.threadList).toHaveBeenCalledTimes(1);
        expect(ds.threadList).toHaveBeenCalledWith("g1", expect.any(Object));
        expect(res.channels.map((c) => c.channelId)).toEqual(["g1", "p1"]);
    });

    it("passes page_size through to threadList", async () => {
        const ds = makeDS([makeGroup("g1", "群1")], { g1: [] });
        await buildLinkableChannels(ds, {
            channelTypeGroup: CT_GROUP,
            threadPageSize: 50,
        });
        expect(ds.threadList).toHaveBeenCalledWith("g1", {
            page_index: 1,
            page_size: 50,
        });
    });

    it("handles empty group list", async () => {
        const ds = makeDS([], {});
        const res = await buildLinkableChannels(ds, { channelTypeGroup: CT_GROUP });
        expect(res.channels).toEqual([]);
        expect(res.threadLoadErrors).toBeUndefined();
        expect(ds.threadList).not.toHaveBeenCalled();
    });

    it("respects bounded concurrency", async () => {
        // 8 个群, concurrency=2, 应该最多有 2 个 threadList 同时 inflight
        const groups = Array.from({ length: 8 }, (_, i) =>
            makeGroup(`g${i}`, `群${i}`),
        );
        let inflight = 0;
        let maxInflight = 0;
        const ds: LinkableChannelDataSource = {
            groupSaveList: async () => groups,
            threadList: async () => {
                inflight++;
                maxInflight = Math.max(maxInflight, inflight);
                // 模拟 IO
                await new Promise((r) => setTimeout(r, 5));
                inflight--;
                return [];
            },
        };
        await buildLinkableChannels(ds, {
            channelTypeGroup: CT_GROUP,
            concurrency: 2,
        });
        expect(maxInflight).toBeLessThanOrEqual(2);
    });
});
