import React, { useState, useRef, useEffect, useCallback } from "react";
import { DatePicker } from "@douyinfe/semi-ui";
import type {
  MatterDetail,
  MatterStatus,
  MatterChannel as MatterChannelType,
  TimelineEntry,
  TimelineReq,
  MatterActivity,
} from "../../bridge/types";
import {
  getMatter,
  updateMatter,
  transitionMatter,
  deleteMatter,
  linkChannel,
  unlinkChannel,
  listTimeline,
  addTimelineEntry,
  deleteTimelineEntry,
  addAssignee,
  removeAssignee,
  listActivities,
} from "../../api/todoApi";
import { Toast } from "../../utils/toast";
import UserName from "../../ui/UserName";
import LinkChannelsModal from "../../ui/LinkChannelsModal";
import OwnerEditor from "../../ui/OwnerEditor";
import AnchorPopover from "../../ui/AnchorPopover";
import WKAvatar from "@octo/base/src/Components/WKAvatar";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { WKApp } from "@octo/base";
import { useChannelName } from "../../hooks/useChannelName";
import { useMyGroups } from "../../hooks/useMyGroups";
import "./index.css";

export interface MatterDetailPanelProps {
  channelId: string;
  channelType: number;
  matterId?: string;
  onClose: () => void;
}

export default function MatterDetailPanel({
  channelId,
  channelType: _channelType,
  matterId,
  onClose,
}: MatterDetailPanelProps) {
  const [matter, setMatter] = useState<MatterDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "channels" | "outputs" | "changelog"
  >("channels");

  // Timeline
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [expandedTimelines, setExpandedTimelines] = useState<Set<string>>(
    new Set(),
  );
  // "查看原消息上下文" 弹框状态: 记录要查的消息 id 列表 + 所在 channel +
  // 触发按钮的屏幕坐标 (x/y), 用于 popover 锚定到按钮下方而不是居中。
  const [anchor, setAnchor] = useState<{
    channelId: string;
    channelType: number;
    channelName: string;
    messageIds: string[];
    x: number;
    y: number;
  } | null>(null);
  // 拉取 timeline (matter 加载时 + 每次展开时都调, 保证数据新鲜)。
  //
  // 后端 GET /matters/:id/timeline 支持 source_channel_id 查询参数
  // (todos/internal/service/timeline_svc.go:25 "filters by
  // matter_timelines.source_channel_id when non-empty"):
  //   - 传: 只返回该群的 timeline 条目 (服务端 WHERE 过滤, 省带宽)
  //   - 不传: 返回整个 Matter 下全量 timeline
  //
  // 调用方:
  //   - 展开某群卡片时传 sourceChannelId, 只拉本群的条目 (省带宽)
  //   - matter 加载 + 变更记录 tab 不传, 拿全量用于计数和分群
  //
  // 合并策略: 传 sourceChannelId 时拿到的是子集, 不能覆盖已有的其他群
  // 数据。按 entry.id 做去重合并: 本次结果 + 历史里不属于本群的条目
  // (本群的历史条目让新数据替代, 保证新鲜)。不传时是全量, 直接覆盖。
  const loadTimeline = useCallback(
    async (sourceChannelId?: string) => {
      if (!matterId) {
        setTimeline([]);
        return;
      }
      setTimelineLoading(true);
      try {
        const params: { limit: number; source_channel_id?: string } = {
          limit: 50,
        };
        if (sourceChannelId) params.source_channel_id = sourceChannelId;
        const res = await listTimeline(matterId, params);
        const fresh = res.data || [];
        if (sourceChannelId) {
          // 子集响应: 保留 state 里其他群的条目, 用 fresh 替换本群的
          setTimeline((prev) => {
            const keep = prev.filter(
              (e) => e.source_channel_id !== sourceChannelId,
            );
            return [...keep, ...fresh];
          });
        } else {
          // 全量响应: 直接覆盖
          setTimeline(fresh);
        }
      } catch {
        if (!sourceChannelId) setTimeline([]);
        // 子集请求失败时不清空别人的数据
      } finally {
        setTimelineLoading(false);
      }
    },
    [matterId],
  );
  const toggleTimeline = useCallback(
    (chId: string) => {
      setExpandedTimelines((prev) => {
        const next = new Set(prev);
        if (next.has(chId)) {
          next.delete(chId);
        } else {
          next.add(chId);
          // 展开时按本群过滤拉 (source_channel_id), 减少带宽。
          // chId 这里是 matter_channels.channel_id, 也就是真实 IM 群号,
          // 跟后端 timeline_entries.source_channel_id 同一份数据。
          loadTimeline(chId);
        }
        return next;
      });
    },
    [loadTimeline],
  );
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  // 每个 channel 的最新一条 timeline 条目 (用于 "最新进展" 展示)。
  // matter 加载后并发对每个关联 channel 调 listTimeline(limit=1),
  // 有数据 → 渲染 content; 无数据 → 隐藏 "最新进展" 块。
  const [latestByChannel, setLatestByChannel] = useState<
    Map<string, TimelineEntry>
  >(new Map());

  // matter 加载完成后, 并发拉每个 channel 的最新 1 条 timeline
  useEffect(() => {
    if (!matter) {
      setLatestByChannel(new Map());
      return;
    }
    const chs = matter.channels || [];
    if (chs.length === 0) {
      setLatestByChannel(new Map());
      return;
    }
    let aborted = false;
    Promise.all(
      chs.map(async (ch) => {
        try {
          const res = await listTimeline(matter.id, {
            source_channel_id: ch.channel_id,
            limit: 1,
          });
          const first = res.data?.[0];
          return { channelId: ch.channel_id, entry: first || null };
        } catch {
          return { channelId: ch.channel_id, entry: null };
        }
      }),
    ).then((results) => {
      if (aborted) return;
      const map = new Map<string, TimelineEntry>();
      for (const r of results) {
        if (r.entry) map.set(r.channelId, r.entry);
      }
      setLatestByChannel(map);
    });
    return () => {
      aborted = true;
    };
    // matter.id + channels 变化时重拉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matter?.id, matter?.channels?.length]);

  // 成功变更 matter 后统一调用: 本地 state 刷新 + 广播事件让左侧列表 reload。
  // MatterDetailPanel 挂在 routeRight, 左侧 sidebar 列表挂在 routeLeft,
  // 两个 React 子树不共享 state, 必须靠 mittBus 事件解耦通知。
  const applyMatterUpdate = useCallback((updated: MatterDetail) => {
    setMatter(updated);
    WKApp.mittBus.emit("wk:matter-updated", { matterId: updated.id });
  }, []);

  // Fetch matter
  useEffect(() => {
    if (!matterId) {
      setMatter(null);
      return;
    }
    setLoading(true);
    setError(null);
    getMatter(matterId, channelId || undefined)
      .then(setMatter)
      .catch((err) => {
        setError(err?.message || "加载失败");
        setMatter(null);
      })
      .finally(() => setLoading(false));
  }, [matterId, channelId]);

  // Fetch timeline when matter loads. 展开时还会再拉一次 (loadTimeline)。
  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);

  // ── Handlers ──

  const handleStatusChange = useCallback(
    async (newStatus: MatterStatus) => {
      if (!matter) return;
      const oldStatus = matter.status;
      setMatter((prev) => (prev ? { ...prev, status: newStatus } : prev));
      try {
        const updated = await transitionMatter(matter.id, newStatus);
        applyMatterUpdate(updated);
      } catch (err: any) {
        setMatter((prev) => (prev ? { ...prev, status: oldStatus } : prev));
        const msg =
          err?.response?.data?.error?.message || err?.message || "状态修改失败";
        if (msg.includes("only creator")) {
          Toast.error("仅创建人可以归档/取消归档");
        } else {
          Toast.error(msg);
        }
      }
    },
    [matter, applyMatterUpdate],
  );

  const handleDeleteMatter = useCallback(async () => {
    if (!matter) return;
    if (!window.confirm(`确定删除事项「${matter.title}」？此操作不可恢复。`))
      return;
    try {
      await deleteMatter(matter.id);
      WKApp.mittBus.emit("wk:matter-deleted", { matterId: matter.id });
      Toast.success("事项已删除");
      onClose();
    } catch {
      Toast.error("删除失败");
    }
  }, [matter, onClose]);

  const handleLinkChannel = useCallback(() => {
    setLinkModalOpen(true);
  }, []);

  const handleLinked = useCallback(async () => {
    if (!matter) return;
    const updated = await getMatter(matter.id);
    applyMatterUpdate(updated);
  }, [matter, applyMatterUpdate]);

  const handleUnlinkChannel = useCallback(
    async (chId: string) => {
      if (!matter) return;
      if (!window.confirm("确定取消关联此频道？")) return;
      try {
        await unlinkChannel(matter.id, chId);
        const updated = await getMatter(matter.id);
        applyMatterUpdate(updated);
        Toast.success("已取消关联");
      } catch {
        Toast.error("取消关联失败");
      }
    },
    [matter, applyMatterUpdate],
  );

  const handleDeleteTimeline = useCallback(
    async (entryId: string) => {
      if (!matter) return;
      try {
        await deleteTimelineEntry(matter.id, entryId);
        setTimeline((prev) => prev.filter((e) => e.id !== entryId));
        Toast.success("已删除");
      } catch {
        Toast.error("删除失败");
      }
    },
    [matter],
  );

  const handleAddTimeline = useCallback(
    async (content: string) => {
      if (!matter || !content.trim()) return;
      try {
        const entry = await addTimelineEntry(matter.id, {
          content: content.trim(),
        });
        setTimeline((prev) => [entry, ...prev]);
      } catch (e: any) {
        const code = e?.response?.data?.error?.code;
        if (code === "LLM_UPSTREAM_ERROR") {
          Toast.error("AI 服务暂时不可用，请稍后重试");
        } else {
          Toast.error("添加失败");
        }
      }
    },
    [matter],
  );

  // ── 负责人 toggle：添加或移除 assignee，成功后拉取最新 matter ──
  // 权限判断在 UI 层已拦掉无权用户（OwnerEditor canEdit=false 不弹下拉），
  // 这里兜底任何异常都 Toast，不回滚 optimistic（直接 refetch 是事实之源）
  const handleToggleAssignee = useCallback(
    async (uid: string, isCurrentlyAssigned: boolean) => {
      if (!matter) return;
      try {
        if (isCurrentlyAssigned) {
          await removeAssignee(matter.id, uid);
        } else {
          await addAssignee(matter.id, uid);
        }
        const updated = await getMatter(matter.id);
        applyMatterUpdate(updated);
      } catch (err: any) {
        const msg =
          err?.response?.data?.error?.message ||
          err?.message ||
          (isCurrentlyAssigned ? "移除负责人失败" : "添加负责人失败");
        Toast.error(msg);
      }
    },
    [matter, applyMatterUpdate],
  );

  // ── Hooks: 必须在任何 early return 之前调用, 保证每次渲染 hook 顺序一致 ──
  // source_name 是创建时拍的快照, 可能是 NULL 或跟当前群名不一致 (群改名)。
  // 按需拿 channel id+type 反查最新 channel 名字, 保证展示永远是当前群名。
  // 未命中时返回空串, 下面兜底到 source_name, 再兜底到 "未知群聊"。
  // 注意: matter 可能还没加载, 用 optional chaining 让 hook 总是被调用。
  const liveSourceName = useChannelName(
    matter?.source_channel_id,
    matter?.source_channel_type,
  );

  // 拉取当前用户加入的所有群, 用于判断 Matter 关联群聊里哪些是我没加入的:
  //   - 没加入的群: 群名模糊展示, 时间线条目不展示 "↗ 原消息" (权限不允许)
  //   - 拉取失败时 failed=true, 保守处理成 "全部未加入" (宁可多遮)
  const { groupNos: myGroupNos, failed: myGroupsFailed } = useMyGroups();

  // ── Empty / Loading / Error ──

  if (!matterId || loading || error || !matter) {
    return (
      <main className="wk-mp-main">
        <div className="wk-mp-main__empty">
          {loading ? "加载中..." : error || "选择一个事项查看详情"}
        </div>
      </main>
    );
  }

  const channels = matter.channels || [];
  const assignees = matter.assignees || [];
  // 权限规则 (17-Matters-数据流修正-v0.7.md §5.2 的推导):
  //   - 创建人 (creator) 或 当前负责人 (assignees 之一) 才能改负责人
  //   - 关联群聊成员无权修改
  const currentUid = WKApp.loginInfo.uid;
  const canEditOwner =
    !!currentUid &&
    (matter.creator_id === currentUid ||
      assignees.some((a) => a.user_id === currentUid));
  // 候选成员来源: Matter 所有关联 channel 成员的并集 (PRD §5.1)。
  //   - matter.channels 是通过 POST /matters/:id/channels 关联的所有群
  //   - matter.source_channel 是创建时的发起群, 通常也在 matter.channels 里,
  //     但为了兼容极端数据 (例如关联后又解绑了发起群) 再做一次 union
  //   - 按 (channel_id, channel_type) 去重后传给 OwnerEditor
  const ownerCandidateChannels = (() => {
    const seen = new Set<string>();
    const list: { channelId: string; channelType: number }[] = [];
    const push = (id: string | undefined | null, type: number | undefined | null) => {
      if (!id || type === undefined || type === null) return;
      const key = `${id}:${type}`;
      if (seen.has(key)) return;
      seen.add(key);
      list.push({ channelId: id, channelType: type });
    };
    for (const ch of matter.channels || []) {
      push(ch.channel_id, ch.channel_type);
    }
    push(matter.source_channel_id, matter.source_channel_type);
    return list;
  })();

  // 转发权限 (PRD §5.2 要点 [1]): 只给发起人 + 负责人, 关联成员按钮直接隐藏。
  // 条件跟 canEditOwner 一致, 但语义上是两个独立规则, 分开命名避免耦合。
  const canForward = canEditOwner;

  const formatDeadline = (d: string) => {
    const date = new Date(d);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // 格式化来源时间: 5/1 16:00 (跟原型对齐)
  const formatSourceTime = (iso: string) => {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
  };

  const displaySourceName =
    liveSourceName || matter.source_name || "未知群聊";

  const tabs: {
    id: "channels" | "outputs" | "changelog";
    label: string;
    count: number;
  }[] = [
    { id: "channels", label: "关联群聊", count: channels.length },
    { id: "outputs", label: "产出文件", count: 0 },
    { id: "changelog", label: "变更记录", count: 0 },
  ];

  return (
    <main className="wk-mp-main">
      <div className="wk-mp-main__inner">
        {/* ── Header ── */}
        <header className="wk-mp-header">
          <div className="wk-mp-header__row1">
            <span className="wk-mp-header__id">
              {matter.seq_no ? `M-${matter.seq_no}` : matter.id.slice(0, 8)}
            </span>
            <StatusPicker
              status={matter.status}
              onChange={handleStatusChange}
              isCreator={matter.creator_id === WKApp.loginInfo.uid}
            />
            <EditableDeadline
              value={matter.deadline || null}
              onSave={async (newVal) => {
                const updated = await updateMatter(matter.id, {
                  deadline: newVal || "",
                });
                applyMatterUpdate(updated);
              }}
            />
            {canForward && (
              <button
                type="button"
                className="wk-mp-header__action"
                title="转发"
                onClick={handleLinkChannel}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
                转发
              </button>
            )}
            <button
              type="button"
              className="wk-mp-header__close"
              onClick={onClose}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <EditableTitle
            value={matter.title}
            onSave={async (newTitle) => {
              const updated = await updateMatter(matter.id, { title: newTitle });
              applyMatterUpdate(updated);
            }}
          />
        </header>

        {/* ── 主要目标 ── */}
        <div className="wk-mp-goal">
          <div className="wk-mp-goal__label">主要目标</div>
          <EditableDescription
            value={matter.description || ""}
            onSave={async (newDesc) => {
              const updated = await updateMatter(matter.id, {
                description: newDesc || null,
              });
              applyMatterUpdate(updated);
            }}
          />
          {matter.source_channel_id && (
            <div className="wk-mp-goal__source">
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>来自 #{displaySourceName}</span>
              <span className="wk-mp-goal__source-sep">·</span>
              <UserName uid={matter.creator_id} />
              <span className="wk-mp-goal__source-sep">·</span>
              <span>{formatSourceTime(matter.created_at)}</span>
            </div>
          )}
        </div>

        {/* ── 创建人 / 负责人 ── */}
        <div className="wk-mp-people">
          {/* 创建人：纯展示, 按 PRD v0.7 不可变 */}
          <div className="wk-mp-people__item">
            <WKAvatar
              channel={new Channel(matter.creator_id, ChannelTypePerson)}
              style={{ width: 16, height: 16 }}
            />
            <UserName uid={matter.creator_id} className="wk-mp-people__name" />
            <span className="wk-mp-people__role">创建人</span>
          </div>
          {/* 负责人：可改 (仅发起人 OR 当前负责人), 至少保留 1 位 */}
          {assignees.length > 0 && (
            <div className="wk-mp-people__item">
              <OwnerEditor
                assignees={assignees}
                canEdit={canEditOwner}
                candidateChannels={ownerCandidateChannels}
                onToggle={handleToggleAssignee}
              />
              <span className="wk-mp-people__role">负责人</span>
            </div>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="wk-mp-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`wk-mp-tabs__btn${activeTab === t.id ? " is-active" : ""}`}
              onClick={() => setActiveTab(t.id)}
            >
              <span className="wk-mp-tabs__label">{t.label}</span>
              <span
                className={`wk-mp-tabs__count${activeTab === t.id ? " is-active" : ""}`}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* ── Tab: 关联群聊 ── */}
        {activeTab === "channels" && (
          <div className="wk-mp-channels">
            <div className="wk-mp-channels__toolbar">
              <button
                type="button"
                className="wk-mp-channels__add"
                onClick={handleLinkChannel}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                关联新群
              </button>
            </div>
            {channels.length === 0 ? (
              <div className="wk-mp-channels__empty">暂无关联群聊</div>
            ) : (
              channels.map((ch) => {
                // 用户是否加入本群: 从 /group/my 拉的 group_no 集合判断。
                // 拉取失败 (myGroupsFailed) 时保守当成未加入, 宁可多遮。
                const isMember =
                  !myGroupsFailed && myGroupNos.has(ch.channel_id);
                return (
                <div key={ch.id} className="wk-mp-channels__card">
                  <div className="wk-mp-channels__card-head">
                    <span className="wk-mp-channels__card-name">
                      #
                      <ChannelNameLabel
                        channelId={ch.channel_id}
                        channelType={ch.channel_type}
                        fallback={ch.channel_name}
                        blur={!isMember}
                      />
                    </span>
                    {!isMember && <NotMemberBadge />}
                    <span className="wk-mp-channels__card-time">
                      {new Date(ch.created_at).toLocaleDateString("zh-CN", {
                        month: "numeric",
                        day: "numeric",
                      })}{" "}
                      关联
                    </span>
                    {/* 未加入群时隐藏 '取消关联' 菜单 (对齐原型: 非成员
                        不能 CRUD 跟本群相关的绑定关系) */}
                    {isMember && (
                      <ChannelMoreMenu
                        onUnlink={() => handleUnlinkChannel(ch.channel_id)}
                      />
                    )}
                  </div>
                  {/* 最新进展: 有 timeline 条目时显示最新一条 content,
                      没有时整块隐藏 (不再显示 "暂无进展摘要") */}
                  {latestByChannel.has(ch.channel_id) && (
                    <div className="wk-mp-channels__card-progress">
                      <div className="wk-mp-channels__card-progress-label">
                        最新进展
                      </div>
                      <div className="wk-mp-channels__card-progress-text">
                        {latestByChannel.get(ch.channel_id)!.content ||
                          "（无文本内容）"}
                      </div>
                    </div>
                  )}
                  {/* 展开时间线: 按钮常显, 点击时 toggle 并 refetch。
                      不再用 timeline.length > 0 做 gate, 否则空数据时
                      用户连触发刷新的入口都没有 */}
                  <div className="wk-mp-channels__card-actions">
                    <button
                      type="button"
                      className="wk-mp-channels__timeline-btn"
                      onClick={() => toggleTimeline(ch.channel_id)}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        style={{
                          transform: expandedTimelines.has(ch.channel_id)
                            ? "rotate(180deg)"
                            : "none",
                          transition: "transform 0.15s",
                        }}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      {expandedTimelines.has(ch.channel_id)
                        ? "收起时间线"
                        : "展开时间线"}
                    </button>
                  </div>
                  {expandedTimelines.has(ch.channel_id) &&
                    (() => {
                      // 按 source_channel_id 匹配 (这是真实 IM group_no,
                      // 跟 matter_channel.channel_id 同一份数据)。
                      // timeline.channel_id 是 matter_channels 表的 UUID,
                      // 跟外层 ch.channel_id (真实群号) 类型完全不同,
                      // 曾经有同名字段误以为可以直接比对 (PR #xxx 修复)。
                      const chEntries = timeline.filter(
                        (e) =>
                          e.source_channel_id === ch.channel_id ||
                          (!e.source_channel_id && !e.channel_id),
                      );
                      if (timelineLoading && chEntries.length === 0) {
                        return (
                          <div className="wk-mp-empty-tab">
                            正在加载时间线...
                          </div>
                        );
                      }
                      if (chEntries.length === 0) {
                        return (
                          <div className="wk-mp-empty-tab">
                            本群暂无时间线记录
                          </div>
                        );
                      }
                      return (
                        <TimelinePanel
                          entries={chEntries}
                          // 未加入该群时整个群的 entries 都不允许看原消息,
                          // 用 canShowAnchor 彻底隐藏按钮 (不是置灰),
                          // 对齐原型 v19 V5_TimelinePanel 里 isMember &&
                          // SourceTag 的 short-circuit 行为。
                          canShowAnchor={() => isMember}
                          onShowAnchor={
                            isMember
                              ? (entry, ev) => {
                                  const rect =
                                    ev.currentTarget.getBoundingClientRect();
                                  setAnchor({
                                    channelId: ch.channel_id,
                                    channelType: ch.channel_type,
                                    channelName:
                                      ch.channel_name ||
                                      ch.channel_id.slice(0, 8),
                                    messageIds: entry.source_msgs || [],
                                    ...computeAnchorPosition(rect),
                                  });
                                }
                              : undefined
                          }
                        />
                      );
                    })()}
                </div>
                );
              })
            )}
          </div>
        )}

        {/* ── Tab: 产出文件 ── */}
        {activeTab === "outputs" && (
          <div className="wk-mp-empty-tab">产出文件功能即将上线</div>
        )}

        {/* ── Tab: 变更记录 (activities) ── */}
        {activeTab === "changelog" && (
          <ActivityPanel matterId={matter.id} />
        )}

        {/* ── Footer ── */}
        <div className="wk-mp-footer">
          ✦ Matter 是 IM 工作的 hierarchy 任务卡 · AI 从群聊持续蒸馏 ·
          用户只确认, 不维护
        </div>
      </div>

      {/* 关联群聊弹窗 */}
      <LinkChannelsModal
        visible={linkModalOpen}
        matterId={matter.id}
        matterTitle={matter.title}
        linkedChannels={channels}
        onClose={() => setLinkModalOpen(false)}
        onLinked={handleLinked}
      />

      {/* 原消息上下文弹框 */}
      {anchor && (
        <AnchorPopover
          channelId={anchor.channelId}
          channelType={anchor.channelType}
          channelName={anchor.channelName}
          messageIds={anchor.messageIds}
          x={anchor.x}
          y={anchor.y}
          onClose={() => setAnchor(null)}
        />
      )}
    </main>
  );
}

export { MatterDetailPanel };

// ─── StatusPicker ─────────────────────────────────────────

const STATUS_OPTIONS: { value: MatterStatus; label: string; cls: string }[] = [
  { value: "open", label: "进行中", cls: "wk-mp-pill--active" },
  { value: "done", label: "已完成", cls: "wk-mp-pill--done" },
  { value: "archived", label: "已归档", cls: "wk-mp-pill--archived" },
];

function StatusPicker({
  status,
  onChange,
  isCreator,
}: {
  status: MatterStatus;
  onChange: (s: MatterStatus) => void;
  isCreator: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const c = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", c);
    return () => document.removeEventListener("mousedown", c);
  }, [open]);
  const visibleOptions = isCreator
    ? STATUS_OPTIONS
    : STATUS_OPTIONS.filter((o) => o.value !== "archived");
  const current =
    STATUS_OPTIONS.find((o) => o.value === status) || STATUS_OPTIONS[0];
  const isArchived = status === "archived";

  return (
    <span className="wk-mp-status-wrap" ref={ref}>
      <button
        type="button"
        className={`wk-mp-pill ${current.cls}`}
        onClick={() => {
          if (!isArchived) setOpen(!open);
        }}
        title={isArchived ? "已归档事项不可修改状态" : "点击修改状态"}
        style={isArchived ? { cursor: "not-allowed", opacity: 0.8 } : undefined}
        disabled={isArchived}
      >
        <span className="wk-mp-pill__dot" />
        {current.label}
      </button>
      {open && !isArchived && (
        <div className="wk-mp-status-dropdown">
          {visibleOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`wk-mp-status-dropdown__item${opt.value === status ? " is-active" : ""}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <span className={`wk-mp-pill__dot ${opt.cls}`} />
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

// ─── MoreMenu (删除事项) ──────────────────────────────────

function MoreMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const c = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", c);
    return () => document.removeEventListener("mousedown", c);
  }, [open]);
  return (
    <span className="wk-mp-more-wrap" ref={ref}>
      <button
        type="button"
        className="wk-mp-header__action"
        onClick={() => setOpen(!open)}
        title="更多操作"
      >
        <svg
          width="13"
          height="3"
          viewBox="0 0 16 4"
          fill="currentColor"
          stroke="none"
        >
          <circle cx="2" cy="2" r="1.5" />
          <circle cx="8" cy="2" r="1.5" />
          <circle cx="14" cy="2" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="wk-mp-more-dropdown">
          <button
            type="button"
            className="wk-mp-more-dropdown__item wk-mp-more-dropdown__item--danger"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
            删除事项
          </button>
        </div>
      )}
    </span>
  );
}

// ─── ChannelMoreMenu (查看群聊 / 取消关联) ────────────────

function ChannelMoreMenu({ onUnlink }: { onUnlink: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const c = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", c);
    return () => document.removeEventListener("mousedown", c);
  }, [open]);
  return (
    <span className="wk-mp-ch-more" ref={ref} style={{ marginLeft: "auto" }}>
      <button
        type="button"
        className="wk-mp-ch-more__btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        <svg
          width="13"
          height="3"
          viewBox="0 0 16 4"
          fill="currentColor"
          stroke="none"
        >
          <circle cx="2" cy="2" r="1.5" />
          <circle cx="8" cy="2" r="1.5" />
          <circle cx="14" cy="2" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="wk-mp-ch-more__dropdown">
          <button
            type="button"
            className="wk-mp-ch-more__item"
            onClick={() => setOpen(false)}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            查看群聊
          </button>
          <button
            type="button"
            className="wk-mp-ch-more__item wk-mp-ch-more__item--danger"
            onClick={() => {
              setOpen(false);
              onUnlink();
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            取消关联
          </button>
        </div>
      )}
    </span>
  );
}

// ─── TimelinePanel (群内事件时间线 — 对齐原型 v19 真实 UI) ──

/**
 * 根据触发按钮的 rect 算 AnchorPopover 锚定位置 (对齐原型 v19 onShowAnchor):
 *   - 水平: 左对齐按钮, 防止弹框太靠右
 *   - 垂直: 按钮下方 8px, 优先向下展开，空间不足时向上展开
 *
 * 返回 viewport 坐标 (fixed 定位用)。调用方把 x/y 传进 AnchorPopover。
 */
function computeAnchorPosition(rect: DOMRect): { x: number; y: number } {
  const POP_WIDTH = 420;
  const POP_HEIGHT = 360;
  const SAFE = 16;
  const GAP = 8; // 按钮与弹框的间距

  // 优先左对齐按钮，如果右侧空间不足则向左移动
  const x = Math.max(
    SAFE,
    Math.min(rect.left, window.innerWidth - POP_WIDTH - SAFE),
  );

  // 计算垂直位置：优先向下展开，空间不足时向上展开
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;

  let y: number;
  if (spaceBelow >= POP_HEIGHT + GAP) {
    // 下方空间充足，向下展开
    y = rect.bottom + GAP;
  } else if (spaceAbove >= POP_HEIGHT + GAP) {
    // 上方空间充足，向上展开
    y = rect.top - POP_HEIGHT - GAP;
  } else {
    // 两侧空间都不足，居中显示并限制在安全范围内
    y = Math.max(SAFE, Math.min(
      rect.top - POP_HEIGHT / 2 + rect.height / 2,
      window.innerHeight - POP_HEIGHT - SAFE
    ));
  }

  return { x, y };
}

/** 按日期分组 timeline entries */
function groupByDate(entries: TimelineEntry[]): Map<string, TimelineEntry[]> {
  const map = new Map<string, TimelineEntry[]>();
  for (const e of entries) {
    const d = new Date(e.created_at);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const arr = map.get(key) || [];
    arr.push(e);
    map.set(key, arr);
  }
  return map;
}

function dayLabel(key: string): { label: string; raw: string } {
  const [y, m, d] = key.split("-").map(Number);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(y, m - 1, d);
  const diff = Math.round((today.getTime() - target.getTime()) / 86400000);
  const raw = `${m}/${d}`;
  if (diff === 0) return { label: "今天", raw };
  if (diff === 1) return { label: "昨天", raw };
  return { label: raw, raw };
}

/** 格式化时间为 HH:MM */
function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function TimelinePanel({
  entries,
  onShowAnchor,
  canShowAnchor,
}: {
  entries: TimelineEntry[];
  /**
   * 点击 "查看原消息上下文" 时调用, 由父组件负责弹 AnchorPopover。
   * 不传: 按钮 disabled (无法查看, 通常是条目没有 source_msgs 字段)。
   * event 用来拿按钮 boundingClientRect, 把 popover 锚定到按钮附近。
   */
  onShowAnchor?: (entry: TimelineEntry, event: React.MouseEvent) => void;
  /**
   * 可选: 逐条判断某 entry 是否允许 "查看原消息" (典型场景: 当前用户
   * 不在该条 entry 所属 channel, 没权限拉原消息)。
   * 返回 false 时该条不显示原消息按钮, 即使 source_msgs 非空。
   * 不传 = 默认所有条都允许 (由 onShowAnchor + source_msgs 决定)。
   */
  canShowAnchor?: (entry: TimelineEntry) => boolean;
}) {
  const [sortNewest, setSortNewest] = useState(true);

  // 排序
  const sorted = [...entries].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    return sortNewest ? tb - ta : ta - tb;
  });
  const grouped = groupByDate(sorted);

  return (
    <div className="wk-mp-tl">
      {/* Header: 标题 + 排序切换 */}
      <div className="wk-mp-tl__header">
        <span className="wk-mp-tl__title">群内事件时间线</span>
        <div className="wk-mp-tl__sort-group">
          <button
            type="button"
            className={`wk-mp-tl__sort-btn${sortNewest ? " is-active" : ""}`}
            onClick={() => setSortNewest(true)}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="15" y2="12" />
              <line x1="3" y1="18" x2="9" y2="18" />
            </svg>
            最新在上
          </button>
          <button
            type="button"
            className={`wk-mp-tl__sort-btn${!sortNewest ? " is-active" : ""}`}
            onClick={() => setSortNewest(false)}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="3" y1="6" x2="9" y2="6" />
              <line x1="3" y1="12" x2="15" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            最旧在上
          </button>
        </div>
      </div>

      {/* 按日期分组 */}
      {Array.from(grouped.entries()).map(([dateKey, items]) => {
        const dl = dayLabel(dateKey);
        return (
          <div key={dateKey} className="wk-mp-tl__group">
            <div className="wk-mp-tl__date-sep">
              <span className="wk-mp-tl__date-label">{dl.label}</span>
              {dl.label !== dl.raw && (
                <span className="wk-mp-tl__date-raw">{dl.raw}</span>
              )}
              <span className="wk-mp-tl__date-line" />
            </div>

            {/* 当日条目 */}
            <div className="wk-mp-tl__entries">
              {items.map((e) => (
                <div key={e.id} className="wk-mp-tl__entry">
                  {/* 时间 */}
                  <span className="wk-mp-tl__time">
                    {formatTime(e.created_at)}
                  </span>
                  {/* 头像 + 人名 */}
                  <span className="wk-mp-tl__user">
                    <WKAvatar
                      channel={new Channel(e.user_id, ChannelTypePerson)}
                      style={{ width: 16, height: 16 }}
                    />
                    <UserName uid={e.user_id} className="wk-mp-tl__user-name" />
                  </span>
                  {/* 内容 */}
                  <span className="wk-mp-tl__content">{e.content || ""}</span>
                  {/* 附件 */}
                  {e.attachments && e.attachments.length > 0 && (
                    <span className="wk-mp-tl__att-count">
                      {e.attachments.length} 附件
                    </span>
                  )}
                  {/* ↗ 原消息: 
                      - entry 没有 source_msgs → 置灰 (保持原按钮占位, 避免
                        其它条目对不齐) 
                      - 调用方用 canShowAnchor 否决 (典型: 用户不在该条
                        entry 所属 channel, 没权限查原消息) → 整个按钮不渲染 */}
                  {(() => {
                    const anchorAllowed =
                      !canShowAnchor || canShowAnchor(e);
                    if (!anchorAllowed) return null;
                    const hasSource =
                      !!onShowAnchor &&
                      Array.isArray(e.source_msgs) &&
                      e.source_msgs.length > 0;
                    return (
                      <button
                        type="button"
                        className="wk-mp-tl__anchor-btn"
                        title={
                          hasSource
                            ? "查看原消息上下文"
                            : "无原消息关联"
                        }
                        disabled={!hasSource}
                        style={
                          !hasSource
                            ? { opacity: 0.4, cursor: "not-allowed" }
                            : undefined
                        }
                        onClick={(ev) => {
                          if (hasSource && onShowAnchor) onShowAnchor(e, ev);
                        }}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        ↗ 原消息
                      </button>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {entries.length === 0 && (
        <div className="wk-mp-tl__empty">暂无时间线记录</div>
      )}
    </div>
  );
}

// ─── ChannelNameLabel (实时反查群名, 避免显示空或 ID 前缀) ──
//
// 跟顶层 liveSourceName 同构, 但这里要在 channels.map 里每项独立 hook,
// 必须拆成子组件 (Rules of Hooks: hook 不能放循环里)。
//
// 优先级: WKSDK 反查最新群名 > 后端保存的 channel_name 快照 > id 前缀兜底
// 群改名后 WKSDK cache 会推新值, 组件自动重渲染。

function ChannelNameLabel({
  channelId,
  channelType,
  fallback,
  blur,
}: {
  channelId: string;
  channelType: number;
  fallback?: string;
  /**
   * 未加入群时传 true: 用固定 4 字符占位 + CSS 模糊展示, 防止
   * 名字长度本身泄漏信息。占位选 U+2588 FULL BLOCK, 视觉上明确是
   * 被遮罩的内容。
   */
  blur?: boolean;
}) {
  const live = useChannelName(channelId, channelType);
  if (blur) {
    return (
      <span
        className="wk-mp-channels__card-name--blur"
        title="你不在该群, 群名已隐藏"
        aria-label="群名已隐藏"
      >
        ████
      </span>
    );
  }
  const display = live || fallback || channelId.slice(0, 8);
  return <>{display}</>;
}

// ─── NotMemberBadge (对齐原型 v19: '不在群' 小徽章) ──
//
// 原型里用户不在该群时, 群名照常显示 (让用户知道是哪个群), 但旁边
// 跟一个灰底带小锁的 '不在群' 徽章标明权限状态。避免 blur 群名那种
// "看不清是啥群" 的困惑。
function NotMemberBadge() {
  return (
    <span className="wk-mp-channels__not-member-badge">
      <svg
        width="9"
        height="9"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        aria-hidden="true"
      >
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      不在群
    </span>
  );
}

// ─── ActivityPanel (变更记录 — 对接 GET /matters/:id/activities) ──

const ACTION_LABELS: Record<string, string> = {
  created: "创建",
  title_changed: "标题变更",
  description_changed: "目标变更",
  deadline_changed: "截止日期变更",
  status_changed: "状态变更",
  assignee_added: "添加负责人",
  assignee_removed: "移除负责人",
  channel_linked: "关联群聊",
  channel_unlinked: "取消关联",
};

function formatActivityTime(iso: string): string {
  const d = new Date(iso);
  const mm = `${d.getMonth() + 1}/${d.getDate()}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm} ${hh}:${mi}`;
}

function ActivityContent({ activity }: { activity: MatterActivity }) {
  const detail = activity.detail || {};
  switch (activity.action) {
    case "created":
      return <span>创建了事项</span>;
    case "title_changed":
      return (
        <span>
          <span className="wk-mp-activity__old">
            {(detail.from as string) || ""}
          </span>
          {" → "}
          <span className="wk-mp-activity__new">
            {(detail.to as string) || ""}
          </span>
        </span>
      );
    case "description_changed":
      return (
        <span>{(detail.summary as string) || "更新了描述"}</span>
      );
    case "deadline_changed": {
      const from = detail.from
        ? new Date((detail.from as number) * 1000).toLocaleDateString("zh-CN")
        : "无";
      const to = detail.to
        ? new Date((detail.to as number) * 1000).toLocaleDateString("zh-CN")
        : "无";
      return (
        <span>
          <span className="wk-mp-activity__old">{from}</span>
          {" → "}
          <span className="wk-mp-activity__new">{to}</span>
        </span>
      );
    }
    case "status_changed":
      return (
        <span>
          <span className="wk-mp-activity__old">
            {(detail.from as string) || ""}
          </span>
          {" → "}
          <span className="wk-mp-activity__new">
            {(detail.to as string) || ""}
          </span>
        </span>
      );
    case "assignee_added":
      return (
        <span>
          添加 <UserName uid={(detail.user_id as string) || ""} />
        </span>
      );
    case "assignee_removed":
      return (
        <span>
          移除 <UserName uid={(detail.user_id as string) || ""} />
        </span>
      );
    case "channel_linked":
      return (
        <span>
          关联 #{(detail.channel_name as string) || (detail.channel_id as string) || ""}
        </span>
      );
    case "channel_unlinked":
      return (
        <span>
          取消关联 #{(detail.channel_id as string) || ""}
        </span>
      );
    default:
      return <span>{activity.action}</span>;
  }
}

function ActivityPanel({ matterId }: { matterId: string }) {
  const [activities, setActivities] = useState<MatterActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortNewest, setSortNewest] = useState(true);
  const [filter, setFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    const close = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node))
        setFilterOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [filterOpen]);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    listActivities(matterId, { limit: 100 })
      .then((res) => {
        if (aborted) return;
        setActivities(res.data || []);
      })
      .catch(() => {
        if (aborted) return;
        setActivities([]);
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [matterId]);

  const filtered =
    filter === "all"
      ? activities
      : activities.filter((a) => a.action === filter);
  const sorted = [...filtered].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    return sortNewest ? tb - ta : ta - tb;
  });

  const FILTER_OPTIONS = [
    { id: "all", label: "全部类型" },
    { id: "created", label: "创建" },
    { id: "title_changed", label: "标题变更" },
    { id: "description_changed", label: "目标变更" },
    { id: "deadline_changed", label: "DDL 变更" },
    { id: "status_changed", label: "状态变更" },
    { id: "channel_linked", label: "关联群变更" },
    { id: "channel_unlinked", label: "关联群变更" },
  ];
  const currentFilter =
    FILTER_OPTIONS.find((o) => o.id === filter) || FILTER_OPTIONS[0];

  return (
    <div className="wk-mp-tl">
      {/* Header: 排序 + 筛选 */}
      <div className="wk-mp-activity__toolbar">
        <div className="wk-mp-tl__sort-group">
          <button
            type="button"
            className={`wk-mp-tl__sort-btn${sortNewest ? " is-active" : ""}`}
            onClick={() => setSortNewest(true)}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="15" y2="12" />
              <line x1="3" y1="18" x2="9" y2="18" />
            </svg>
            最新在上
          </button>
          <button
            type="button"
            className={`wk-mp-tl__sort-btn${!sortNewest ? " is-active" : ""}`}
            onClick={() => setSortNewest(false)}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="3" y1="6" x2="9" y2="6" />
              <line x1="3" y1="12" x2="15" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            最旧在上
          </button>
        </div>
        {/* 类型筛选 */}
        <span className="wk-mp-activity__filter-wrap" ref={filterRef}>
          <button
            type="button"
            className="wk-mp-activity__filter-btn"
            onClick={() => setFilterOpen((o) => !o)}
          >
            <span>{currentFilter.label}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {filterOpen && (
            <div className="wk-mp-activity__filter-dropdown">
              {FILTER_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`wk-mp-activity__filter-item${o.id === filter ? " is-active" : ""}`}
                  onClick={() => {
                    setFilter(o.id);
                    setFilterOpen(false);
                  }}
                >
                  {o.label}
                  {o.id === filter && <span>✓</span>}
                </button>
              ))}
            </div>
          )}
        </span>
      </div>

      {loading && <div className="wk-mp-empty-tab">加载中...</div>}
      {!loading && sorted.length === 0 && (
        <div className="wk-mp-empty-tab">暂无变更记录</div>
      )}
      {!loading &&
        sorted.map((a) => {
          const isGoal = a.action === "description_changed";
          return (
            <div
              key={a.id}
              className={`wk-mp-activity__row${isGoal ? " wk-mp-activity__row--goal" : ""}`}
            >
              <span className="wk-mp-activity__time">
                {formatActivityTime(a.created_at)}
              </span>
              <span
                className={`wk-mp-activity__label${isGoal ? " wk-mp-activity__label--goal" : ""}`}
              >
                {ACTION_LABELS[a.action] || a.action}
              </span>
              <span className="wk-mp-activity__content">
                <ActivityContent activity={a} />
              </span>
              <span className="wk-mp-activity__actor">
                <WKAvatar
                  channel={new Channel(a.actor_id, ChannelTypePerson)}
                  style={{ width: 14, height: 14 }}
                />
                <UserName uid={a.actor_id} />
              </span>
            </div>
          );
        })}
    </div>
  );
}

// ─── TimelineInput (添加进展) ─────────────────────────────

function TimelineInput({ onSubmit }: { onSubmit: (content: string) => void }) {
  const [value, setValue] = useState("");
  const handleSubmit = () => {
    if (!value.trim()) return;
    onSubmit(value);
    setValue("");
  };
  return (
    <div className="wk-mp-tl-input">
      <input
        type="text"
        className="wk-mp-tl-input__field"
        placeholder="添加进展或评论..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
        }}
      />
      <button
        type="button"
        className="wk-mp-tl-input__btn"
        disabled={!value.trim()}
        onClick={handleSubmit}
      >
        发送
      </button>
    </div>
  );
}

// ─── EditableTitle (点击编辑标题) ─────────────────────────

function EditableTitle({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setDraft(value);
      setEditing(false);
      return;
    }
    try {
      await onSave(trimmed);
    } catch {
      Toast.error("标题修改失败");
      setDraft(value);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="wk-mp-header__title wk-mp-header__title--editing"
        value={draft}
        maxLength={500}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <h1
      className="wk-mp-header__title wk-mp-header__title--clickable"
      onClick={() => setEditing(true)}
      title="点击编辑标题"
    >
      {value}
    </h1>
  );
}

// ─── EditableDescription (点击编辑描述) ───────────────────

function EditableDescription({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      // 自动调整高度
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [editing]);

  const commit = async () => {
    const trimmed = draft.trim();
    if (trimmed === (value || "").trim()) {
      setDraft(value);
      setEditing(false);
      return;
    }
    try {
      await onSave(trimmed);
    } catch {
      Toast.error("描述修改失败");
      setDraft(value);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        className="wk-mp-goal__text wk-mp-goal__text--editing"
        value={draft}
        maxLength={10000}
        onChange={(e) => {
          setDraft(e.target.value);
          // 动态调整高度
          e.target.style.height = "auto";
          e.target.style.height = e.target.scrollHeight + "px";
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div
      className="wk-mp-goal__text wk-mp-goal__text--clickable"
      onClick={() => setEditing(true)}
      title="点击编辑描述"
    >
      {value || <span className="wk-mp-goal__placeholder">点击添加描述...</span>}
    </div>
  );
}

// ─── EditableDeadline (截止日期，使用 Semi DatePicker) ───────────

function getLocalTZOffset(): string {
  const off = new Date().getTimezoneOffset();
  const sign = off <= 0 ? "+" : "-";
  const h = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const m = String(Math.abs(off) % 60).padStart(2, "0");
  return `${sign}${h}:${m}`;
}

function fromLocalDateString(s: string): Date {
  const [yyyy, mm, dd] = s.split("-").map(Number);
  return new Date(yyyy, mm - 1, dd);
}

function EditableDeadline({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (v: string) => Promise<void>;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [localDate, setLocalDate] = useState<string>(() => {
    if (!value) return "";
    const d = new Date(value);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });

  // 外部 value 变化时同步
  useEffect(() => {
    if (!value) { setLocalDate(""); return; }
    const d = new Date(value);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    setLocalDate(`${yyyy}-${mm}-${dd}`);
  }, [value]);

  const formatDisplay = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const handleChange = async (date: Date | Date[] | string | string[] | undefined) => {
    if (!date) {
      setLocalDate("");
      try { await onSave(""); } catch { Toast.error("截止日期修改失败"); }
      return;
    }
    const d = date instanceof Date ? date : new Date(String(date));
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;
    setLocalDate(dateStr);
    try {
      await onSave(`${dateStr}T23:59:59${getLocalTZOffset()}`);
    } catch {
      Toast.error("截止日期修改失败");
    }
  };

  const display = formatDisplay(value);

  return (
    <span className="wk-mp-header__ddl wk-mp-header__ddl--editable" ref={ref}>
      <DatePicker
        value={localDate ? fromLocalDateString(localDate) : undefined}
        onChange={handleChange as any}
        disabledDate={(date) => !!date && date < new Date(new Date().setHours(0, 0, 0, 0))}
        density="compact"
        position="bottomLeft"
        triggerRender={() => (
          <span className="wk-mp-header__ddl-trigger">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span className="wk-mp-header__ddl-label">截止</span>
            <span className="wk-mp-header__ddl-value">
              {display || "未设置"}
            </span>
          </span>
        )}
      />
    </span>
  );
}
