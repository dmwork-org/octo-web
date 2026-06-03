import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
  useMemo,
} from "react";
import { WKApp, useI18n } from "@octo/base";
import WKAvatar from "@octo/base/src/Components/WKAvatar";
import { Channel, ChannelTypePerson } from "wukongimjssdk";
import { Toast } from "@douyinfe/semi-ui";
import type { MatterListParams } from "../../bridge/types";
import { createMatter, listMatters } from "../../api/todoApi";
import { useMatterList } from "../../hooks/useTodoList";
import MatterDetailPanel from "../../panel/MatterDetailPanel";
import SmartCreateModal from "../SmartCreateModal";
import SidebarCard from "../SidebarCard";
import UserName from "../UserName";
import {
  clampThreadWidth,
  restoreThreadWidth,
  persistThreadWidth,
} from "@octo/base/src/Components/WKLayout/layoutWidth";
import "../../pages/MatterPage.css";

/**
 * MatterList — 统一的事项列表组件
 *
 * 合并了原 ChatMatterPanel（会话右侧面板）和 MatterPage（事项页面）的优点：
 *   - 来自 MatterPage: 归档折叠区、Tab 数量标签、新建按钮、加载更多
 *   - 来自 ChatMatterPanel: Splitter 拖拽、关闭按钮、inline 详情模式
 *
 * 通过 props 控制不同场景的行为差异。
 */

export type NavTab = "mine" | "created" | "all";

type TabCountSummary = {
  total: number;
  archived: number;
};

const EMPTY_TAB_COUNTS: Record<NavTab, TabCountSummary> = {
  mine: { total: 0, archived: 0 },
  created: { total: 0, archived: 0 },
  all: { total: 0, archived: 0 },
};

export interface MatterListProps {
  /**
   * 模式：
   * - "channel": 会话侧面板，按 channel_id 过滤，详情 inline 展示
   * - "page": 事项页面，按用户维度过滤，详情走 routeRight
   */
  mode: "channel" | "page";

  // ── channel 模式专用 ──
  /** 会话 ID（mode="channel" 时必填） */
  channelId?: string;
  /** 会话类型（mode="channel" 时必填） */
  channelType?: number;
  /** 会话名称 */
  channelName?: string;
  /** 关闭回调（mode="channel" 时必填） */
  onClose?: () => void;

  // ── 功能开关（可覆盖默认值）──
  /** 显示 Splitter 拖拽（默认 channel 模式开启） */
  showSplitter?: boolean;
  /** 显示关闭按钮（默认 channel 模式开启） */
  showCloseButton?: boolean;
  /** 显示新建按钮（默认开启） */
  showCreateButton?: boolean;
  /** 显示归档折叠区（默认开启） */
  showArchivedSection?: boolean;
  /** 显示 Tab 数量（默认开启） */
  showTabCounts?: boolean;
  /** 显示加载更多（默认开启） */
  showLoadMore?: boolean;
}

function buildParams(
  mode: "channel" | "page",
  tab: NavTab,
  myUid: string,
  channelId?: string,
): MatterListParams {
  if (mode === "channel" && channelId) {
    // channel 模式：固定按 channel_id 过滤，tab 只做前端筛选
    return { channel_id: channelId };
  }
  // page 模式：按用户维度过滤
  if (tab === "mine") return { assignee_id: myUid };
  if (tab === "created") return { creator_id: myUid };
  return {};
}

async function countMatters(
  params: MatterListParams,
  signal: AbortSignal,
): Promise<number> {
  const pageSize = 100;
  let cursor: string | undefined;
  let count = 0;

  do {
    const res = await listMatters({ ...params, limit: pageSize, cursor }, signal);
    count += res.data.length;
    cursor = res.pagination.next_cursor;
    if (!res.pagination.has_more) break;
  } while (cursor);

  return count;
}

export default function MatterList({
  mode,
  channelId,
  channelType,
  onClose,
  showSplitter = mode === "channel",
  showCloseButton = mode === "channel",
  // 新建按钮 / 加载更多原本只有 page 模式有；归档折叠两种模式共享。
  showCreateButton = mode === "page",
  showArchivedSection = true,
  showLoadMore = mode === "page",
  // Tab 数量：channel 模式用当前全量数据实时算；page 模式预拉各 tab 首屏计数。
  showTabCounts = true,
}: MatterListProps) {
  const { t } = useI18n();
  // 默认 tab 按 mode 区分（对齐原组件行为）：
  //   - channel 模式：默认 "all"（会话侧面板展示该群全部事项）
  //   - page 模式：默认 "mine"（事项页面默认看我负责的）
  const [activeTab, setActiveTab] = useState<NavTab>(
    mode === "channel" ? "all" : "mine",
  );
  const [selectedMatterId, setSelectedMatterId] = useState<string | null>(null);
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  // 未归档分组默认展开，可折叠（与已归档对称）。
  const [activeExpanded, setActiveExpanded] = useState(true);
  const [tabCounts, setTabCounts] =
    useState<Record<NavTab, TabCountSummary>>(EMPTY_TAB_COUNTS);
  const [tabCountVersion, setTabCountVersion] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const myUid = WKApp.loginInfo.uid ?? "";

  const tabs = useMemo<Array<{ id: NavTab; label: string }>>(
    () => [
      { id: "mine", label: t("todo.tabs.mine") },
      { id: "created", label: t("todo.tabs.created") },
      { id: "all", label: t("todo.tabs.all") },
    ],
    [t],
  );

  // ── UI/数据分离: 为 ui/ 组件提供 renderAvatar / renderUserName ──
  const renderAvatar = useCallback(
    (uid: string, size: number) => (
      <WKAvatar
        channel={new Channel(uid, ChannelTypePerson)}
        style={{ width: size, height: size }}
      />
    ),
    [],
  );
  const renderUserName = useCallback(
    (uid: string) => <UserName uid={uid} />,
    [],
  );

  // ── Splitter drag state ──
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);
  const lastPanelWidth = useRef(
    clampThreadWidth(restoreThreadWidth(), window.innerWidth, 300),
  );

  // ── 数据获取 ──
  const initialFilters = useMemo(
    () => buildParams(mode, activeTab, myUid, channelId),
    [mode, activeTab, myUid, channelId],
  );

  const { matters, loading, hasMore, loadMore, reload } = useMatterList({
    initialFilters,
    pageSize: mode === "channel" ? 100 : 50,
  });

  // channel 模式下 tab 只做前端筛选
  const displayMatters = useMemo(() => {
    if (mode === "page") return matters;
    // channel 模式：前端过滤
    switch (activeTab) {
      case "mine":
        return matters.filter((m) =>
          m.assignees?.some((a) => a.user_id === myUid),
        );
      case "created":
        return matters.filter((m) => m.creator_id === myUid);
      case "all":
      default:
        return matters;
    }
  }, [mode, activeTab, matters, myUid]);

  // 分离活跃 vs 归档
  const activeMatters = useMemo(
    () => displayMatters.filter((m) => m.status !== "archived"),
    [displayMatters],
  );
  const archivedMatters = useMemo(
    () => displayMatters.filter((m) => m.status === "archived"),
    [displayMatters],
  );

  // Tab 数量
  //   - channel 模式：数据一次全拉到（前端筛选），可同时算出三个 tab 的数字，
  //     全部展示（比 page 模式信息更全）。
  //   - page 模式：每个 tab 是独立后端请求，只能在切到某 tab 时更新它的数字，
  //     保持原 MatterPage 行为。
  const channelTabCounts = useMemo<Record<NavTab, TabCountSummary>>(() => {
    if (mode !== "channel") return EMPTY_TAB_COUNTS;
    const mine = matters.filter((m) =>
      m.assignees?.some((a) => a.user_id === myUid),
    );
    const created = matters.filter((m) => m.creator_id === myUid);
    return {
      mine: {
        total: mine.length,
        archived: mine.filter((m) => m.status === "archived").length,
      },
      created: {
        total: created.length,
        archived: created.filter((m) => m.status === "archived").length,
      },
      all: {
        total: matters.length,
        archived: matters.filter((m) => m.status === "archived").length,
      },
    };
  }, [mode, matters, myUid]);

  useEffect(() => {
    if (mode !== "page" || !showTabCounts) return;
    const ctrl = new AbortController();

    const loadCounts = async () => {
      const nextCounts = await Promise.all(
        (["mine", "created", "all"] as NavTab[]).map(async (tab) => {
          const params = buildParams(mode, tab, myUid);
          const [total, archived] = await Promise.all([
            countMatters(params, ctrl.signal),
            countMatters({ ...params, status: "archived" }, ctrl.signal),
          ]);
          return [tab, { total, archived }] as const;
        }),
      );
      if (ctrl.signal.aborted) return;
      setTabCounts((prev) => ({
        ...prev,
        ...Object.fromEntries(nextCounts),
      }));
    };

    void loadCounts().catch((err: unknown) => {
      if ((err as Error)?.name !== "AbortError") {
        Toast.error(t("todo.toast.loadFailed"));
      }
    });

    return () => ctrl.abort();
  }, [mode, showTabCounts, myUid, tabCountVersion, t]);

  // 最终用于渲染的数字：channel 用实时计算，page 用累积 state
  const effectiveTabCounts =
    mode === "channel" ? channelTabCounts : tabCounts;
  const shouldShowTabCount = useCallback(
    (tabId: NavTab) =>
      showTabCounts && effectiveTabCounts[tabId].total > 0,
    [showTabCounts, effectiveTabCounts],
  );
  const activeCount = Math.max(
    effectiveTabCounts[activeTab].total - effectiveTabCounts[activeTab].archived,
    0,
  );
  const archivedCount = effectiveTabCounts[activeTab].archived;

  // ── 滚动位置恢复 ──
  const listRef = useRef<HTMLDivElement>(null);
  const pendingScrollRestoreRef = useRef<number | null>(null);

  useEffect(() => {
    const reloader = () => {
      if (listRef.current) {
        pendingScrollRestoreRef.current = listRef.current.scrollTop;
      }
      setTabCountVersion((prev) => prev + 1);
      reload();
    };
    WKApp.mittBus.on("wk:matter-updated", reloader);
    WKApp.mittBus.on("wk:matter-deleted", reloader);
    return () => {
      WKApp.mittBus.off("wk:matter-updated", reloader);
      WKApp.mittBus.off("wk:matter-deleted", reloader);
    };
  }, [reload]);

  useLayoutEffect(() => {
    const saved = pendingScrollRestoreRef.current;
    if (saved !== null && listRef.current) {
      listRef.current.scrollTop = saved;
      pendingScrollRestoreRef.current = null;
    }
  }, [matters]);

  // ── page 模式专用监听 ──
  useEffect(() => {
    if (mode !== "page") return;
    // NavRail 激活时刷新
    const handler = (data: { menuId: string }) => {
      if (data?.menuId === "matter") reload();
      if (data?.menuId === "matter") setTabCountVersion((prev) => prev + 1);
    };
    WKApp.mittBus.on("wk:nav-menu-activated", handler);
    return () => {
      WKApp.mittBus.off("wk:nav-menu-activated", handler);
    };
  }, [mode, reload]);

  useEffect(() => {
    if (mode !== "page") return;
    // Space 切换重置
    const handler = () => {
      setActiveTab("mine");
      setSelectedMatterId(null);
      setTabCountVersion((prev) => prev + 1);
    };
    WKApp.mittBus.on("space-changed", handler);
    return () => {
      WKApp.mittBus.off("space-changed", handler);
    };
  }, [mode]);

  // Tab 切换时重置选中
  useEffect(() => {
    setSelectedMatterId(null);
  }, [activeTab]);

  // ── 点击卡片 ──
  const handleSelect = useCallback(
    (matterId: string) => {
      setSelectedMatterId(matterId);
      if (mode === "page") {
        // page 模式：推到 routeRight
        WKApp.routeRight.replaceToRoot(
          <MatterDetailPanel
            key={matterId}
            matterId={matterId}
            channelId=""
            channelType={0}
            onClose={() => setSelectedMatterId(null)}
          />,
        );
      }
      // channel 模式：inline 展示，由条件渲染处理
    },
    [mode],
  );

  // ── Splitter drag handlers ──
  const onDragMove = useCallback((e: MouseEvent) => {
    const delta = dragStartX.current - e.clientX;
    const newWidth = clampThreadWidth(
      dragStartWidth.current + delta,
      window.innerWidth,
      300,
    );
    lastPanelWidth.current = newWidth;
    const panel = panelRef.current;
    if (panel) {
      panel.style.width = newWidth + "px";
      const ancestor = panel.closest(
        ".wk-chat-content-right",
      ) as HTMLElement | null;
      if (ancestor) {
        ancestor.style.setProperty("--wk-width-thread-panel", newWidth + "px");
      }
      panel.parentElement?.style.setProperty(
        "--wk-width-thread-panel",
        newWidth + "px",
      );
    }
  }, []);

  const onDragEnd = useCallback(() => {
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup", onDragEnd);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    setIsDragging(false);
    persistThreadWidth(lastPanelWidth.current);
  }, [onDragMove]);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStartX.current = e.clientX;
      dragStartWidth.current = lastPanelWidth.current;
      setIsDragging(true);
      document.addEventListener("mousemove", onDragMove);
      document.addEventListener("mouseup", onDragEnd);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [onDragMove, onDragEnd],
  );

  useEffect(() => {
    if (!showSplitter) return;
    const panel = panelRef.current;
    if (panel) {
      panel.style.width = lastPanelWidth.current + "px";
      const ancestor = panel.closest(
        ".wk-chat-content-right",
      ) as HTMLElement | null;
      if (ancestor) {
        ancestor.style.setProperty(
          "--wk-width-thread-panel",
          lastPanelWidth.current + "px",
        );
      }
      panel.parentElement?.style.setProperty(
        "--wk-width-thread-panel",
        lastPanelWidth.current + "px",
      );
    }
  }, [showSplitter]);

  useEffect(() => {
    return () => {
      document.removeEventListener("mousemove", onDragMove);
      document.removeEventListener("mouseup", onDragEnd);
    };
  }, [onDragMove, onDragEnd]);

  // ── channel 模式 inline 详情 ──
  if (mode === "channel" && selectedMatterId) {
    return (
      <div className="wk-mp-page-sidebar" ref={panelRef}>
        {showSplitter && (
          <div
            className={`wk-thread-panel-splitter${isDragging ? " wk-thread-panel-splitter-active" : ""}`}
            onMouseDown={onDragStart}
          >
            <div className="wk-thread-panel-splitter-line" />
          </div>
        )}
        <MatterDetailPanel
          key={selectedMatterId}
          matterId={selectedMatterId}
          channelId={channelId ?? ""}
          channelType={channelType ?? 0}
          onClose={() => setSelectedMatterId(null)}
          showClose
        />
        {isDragging && <div className="wk-thread-panel-drag-overlay" />}
      </div>
    );
  }

  // ── 主渲染 ──
  return (
    <div className="wk-mp-page-sidebar" ref={panelRef}>
      {/* Splitter */}
      {showSplitter && (
        <div
          className={`wk-thread-panel-splitter${isDragging ? " wk-thread-panel-splitter-active" : ""}`}
          onMouseDown={onDragStart}
        >
          <div className="wk-thread-panel-splitter-line" />
        </div>
      )}

      {/* Header */}
      <div className="wk-mp-page-sidebar__header">
        <h2 className="wk-mp-page-sidebar__title">{t("todo.menu.title")}</h2>
        {showCreateButton && (
          <button
            type="button"
            className="wk-mp-page-sidebar__new-btn"
            onClick={() => setShowCreateModal(true)}
            title={t("todo.action.new")}
            aria-label={t("todo.action.new")}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 2.67v10.66M2.67 8h10.66"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
        {showCloseButton && onClose && (
          <button
            type="button"
            className="wk-mp-page-sidebar__close"
            onClick={onClose}
            aria-label={t("todo.common.close")}
          >
            ✕
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="wk-mp-page-sidebar__tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`wk-mp-page-sidebar__tab${activeTab === tab.id ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {shouldShowTabCount(tab.id) && (
              <span className="wk-mp-page-sidebar__tab-count">
                {effectiveTabCounts[tab.id].total}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 列表 */}
      <div className="wk-mp-page-sidebar__list" ref={listRef}>
        {loading && (
          <div className="wk-mp-page-sidebar__empty">
            {t("todo.state.loading")}
          </div>
        )}
        {!loading && activeMatters.length === 0 && (
          <div className="wk-mp-page-sidebar__empty">
            {t("todo.state.empty")}
          </div>
        )}

        {/* 未归档分组（可折叠） */}
        {!loading && activeMatters.length > 0 && (
          <button
            type="button"
            className="wk-mp-page-sidebar__archived-toggle"
            onClick={() => setActiveExpanded(!activeExpanded)}
          >
            <span className="wk-mp-page-sidebar__archived-bar" />
            <span className="wk-mp-page-sidebar__nav-label">
              {t("todo.status.unarchivedCount", {
                values: { count: activeCount },
              })}
            </span>
            <span
              className={`wk-mp-page-sidebar__archived-chev${activeExpanded ? " is-open" : ""}`}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6.29 4.27L9.71 8l-3.42 3.73"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
        )}

        {/* 活跃事项 */}
        {!loading &&
          activeExpanded &&
          activeMatters.map((matter) => (
            <SidebarCard
              key={matter.id}
              matter={matter}
              selected={matter.id === selectedMatterId}
              onClick={() => handleSelect(matter.id)}
              renderAvatar={renderAvatar}
              renderUserName={renderUserName}
              sourceChannelName={matter.source_name}
            />
          ))}

        {/* 已归档折叠区 */}
        {showArchivedSection && !loading && (
          <button
            type="button"
            className="wk-mp-page-sidebar__archived-toggle"
            onClick={() => setArchivedExpanded(!archivedExpanded)}
          >
            <span className="wk-mp-page-sidebar__archived-bar" />
            <span className="wk-mp-page-sidebar__nav-label">
              {t("todo.status.archivedCount", {
                values: { count: archivedCount },
              })}
            </span>
            <span
              className={`wk-mp-page-sidebar__archived-chev${archivedExpanded ? " is-open" : ""}`}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6.29 4.27L9.71 8l-3.42 3.73"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
        )}
        {showArchivedSection &&
          archivedExpanded &&
          archivedMatters.map((matter) => (
            <SidebarCard
              key={matter.id}
              matter={matter}
              selected={matter.id === selectedMatterId}
              onClick={() => handleSelect(matter.id)}
              renderAvatar={renderAvatar}
              renderUserName={renderUserName}
              sourceChannelName={matter.source_name}
            />
          ))}

        {/* 加载更多（未归档折叠时隐藏，避免列表收起还露出按钮） */}
        {showLoadMore && activeExpanded && !loading && hasMore && (
          <button
            type="button"
            className="wk-mp-page-sidebar__loadmore"
            onClick={loadMore}
          >
            {t("todo.action.loadMore")}
          </button>
        )}
      </div>

      {isDragging && <div className="wk-thread-panel-drag-overlay" />}

      {/* SmartCreateModal */}
      <SmartCreateModal
        visible={showCreateModal}
        blank
        onClose={() => setShowCreateModal(false)}
        onConfirm={async (req) => {
          await createMatter(req);
          Toast.success(t("todo.toast.created"));
          setTabCountVersion((prev) => prev + 1);
          reload();
        }}
      />
    </div>
  );
}

export { MatterList };
