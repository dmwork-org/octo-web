import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { WKApp } from '@octo/base';
import * as api from '../api/todoApi';
import type { Matter, MatterListParams } from '../bridge/types';
import { useMatterList } from '../hooks/useTodoList';
import MatterCard from '../ui/TodoCard';
import MatterFilterBar from '../ui/TodoFilterBar';
import DetailPanel from '../ui/DetailPanel';
import CreateTaskModal from '../ui/CreateTaskModal';
import { Toast } from '../utils/toast';
import './MatterPage.css';

// ─── 时间分组 ────────────────────────────────────────────

interface GroupedTodos {
  overdue: Matter[];
  today: Matter[];
  week: Matter[];
  later: Matter[];
  noDeadline: Matter[];
  done: Matter[];
}

function groupByTime(matters: Matter[]): GroupedTodos {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const weekEnd = new Date(todayStart); weekEnd.setDate(weekEnd.getDate() + 7);

  const result: GroupedTodos = { overdue: [], today: [], week: [], later: [], noDeadline: [], done: [] };

  for (const matter of matters) {
    if (matter.status === 'done'  || matter.status === 'archived') {
      result.done.push(matter);
      continue;
    }
    if (!matter.deadline) {
      result.noDeadline.push(matter);
      continue;
    }
    const dl = new Date(matter.deadline);
    dl.setHours(0, 0, 0, 0);
    if (dl < todayStart) {
      result.overdue.push(matter);
    } else if (dl <= todayEnd) {
      result.today.push(matter);
    } else if (dl <= weekEnd) {
      result.week.push(matter);
    } else {
      result.later.push(matter);
    }
  }
  return result;
}

// ─── 导航视图类型 ────────────────────────────────────────

type NavView = 'mine' | 'created' | 'all';

// 供 sidebar 的「新建事项」按钮调用当前 TodoListView 的 modal
let _openCreateModal: (() => void) | null = null;

// ─── Matter List View ─────────────────────────────────────

interface TodoListViewProps {
  navView: NavView;
}

const GROUP_CONFIG: Array<{ key: keyof GroupedTodos; label: string; icon: string }> = [
  { key: 'overdue',    label: '已逾期',    icon: '⚠️' },
  { key: 'today',      label: '今天到期',  icon: '📅' },
  { key: 'week',       label: '本周',      icon: '📆' },
  { key: 'later',      label: '之后',      icon: '🗓' },
  { key: 'noDeadline', label: '无截止日期', icon: '•' },
];

function buildParams(navView: NavView, myUid: string): MatterListParams {
  if (navView === 'mine') return { assignee_id: myUid };
  if (navView === 'created') return { creator_id: myUid };
  return {};
}

function TodoListView({ navView }: TodoListViewProps) {
  const myUid = WKApp.loginInfo.uid ?? '';
  const initialFilters = useMemo(() => buildParams(navView, myUid), [navView, myUid]);

  const { matters, loading, hasMore, filters, setFilters, reload, loadMore, toggleStatus } = useMatterList({ initialFilters });
  const [selectedMatterId, setSelectedMatterId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [doneExpanded, setDoneExpanded] = useState(false);

  useEffect(() => {
    _openCreateModal = () => { setShowCreateModal(true); };
    return () => { _openCreateModal = null; };
  }, []);

  // navView 切换时重置选中
  useEffect(() => {
    setSelectedMatterId(null);
  }, [navView]);

  const grouped = useMemo(() => groupByTime(matters), [matters]);

  const title = navView === 'mine' ? '我负责的'
    : navView === 'created' ? '我发起的'
    : '全部事项';

  const handleConfirmCreate = useCallback(async (req: Parameters<typeof api.createMatter>[0]) => {
    await api.createMatter(req);
    Toast.success('事项已创建');
    setShowCreateModal(false);
    reload();
  }, [reload]);

  const renderGroup = (key: keyof GroupedTodos, label: string, icon: string) => {
    const items = grouped[key];
    if (items.length === 0) return null;
    return (
      <div key={key} className="wk-matter-group">
        <div className="wk-matter-group__header">
          <span className="wk-matter-group__icon">{icon}</span>
          <span className="wk-matter-group__label">{label}</span>
          <span className="wk-matter-group__count">{items.length}</span>
        </div>
        {items.map((matter) => (
          <MatterCard
            key={matter.id}
            matter={matter}
            selected={selectedMatterId  === matter.id}
            assigneeUids={[]}
            channelName={matter.source_name}
            onClick={(id) => setSelectedMatterId(id)}
            onStatusChange={(id) => toggleStatus(id,matter.status)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="wk-matter-list-view" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="wk-matter-list-view__header">
        <span className="wk-matter-list-view__title">{title}</span>
        <MatterFilterBar filters={filters} onFilterChange={setFilters} searchOnly />
      </div>

      {/* Content: list + detail panel */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {loading && (
            <div className="wk-matter-list__loading">加载中...</div>
          )}
          {!loading && matters.length === 0 && (
            <div className="wk-matter-list__empty">暂无事项</div>
          )}

          {/* 时间分组 */}
          {!loading && GROUP_CONFIG.map(({ key, label, icon }) => renderGroup(key, label, icon))}

          {/* 已完成（折叠） */}
          {!loading && grouped.done.length > 0 && (
            <div className="wk-matter-group">
              <div
                className="wk-matter-group__section-header"
                onClick={() => setDoneExpanded((v) => !v)}
              >
                <svg
                  width="10" height="10" viewBox="0 0 10 10"
                  style={{ transform: doneExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 150ms', flexShrink: 0 }}
                >
                  <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>已完成</span>
                <span style={{ marginLeft: '4px', opacity: 0.5 }}>({grouped.done.length})</span>
              </div>
              {doneExpanded && grouped.done.map((matter) => (
                <MatterCard
                  key={matter.id}
                  matter={matter}
                  selected={selectedMatterId  === matter.id}
                  assigneeUids={[]}
                  channelName={matter.source_name}
                  onClick={(id) => setSelectedMatterId(id)}
                  onStatusChange={(id) => toggleStatus(id,matter.status)}
                />
              ))}
            </div>
          )}

          {!loading && hasMore && (
            <button type="button" onClick={loadMore} className="wk-matter-load-more">
              加载更多
            </button>
          )}
        </div>

        {/* Detail panel */}
        {selectedMatterId && (
          <DetailPanel
            matterId={selectedMatterId}
            onClose={() => setSelectedMatterId(null)}
            onStatusChanged={() => { reload(); }}
          />
        )}
      </div>

      <CreateTaskModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onDirtyClose={() => setShowCreateModal(false)}
        onConfirm={handleConfirmCreate}
      />
    </div>
  );
}

// ─── Sidebar Icons ──────────────────────────────────────

function NavIcon({ type }: { type: 'mine' | 'created' | 'all' }) {
  if (type === 'mine') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  );
  if (type === 'created') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  );
}

// ─── MatterPage (Main Export) ─────────────────────────────

const TOP_NAV: Array<{ id: NavView; label: string; icon: 'mine' | 'created' | 'all' }> = [
  { id: 'mine',    label: '我负责的', icon: 'mine' },
  { id: 'created', label: '我发起的', icon: 'created' },
  { id: 'all',     label: '全部事项', icon: 'all' },
];

export default function MatterPage() {
  const [selectedView, setSelectedView] = useState<NavView>('mine');

  const navigate = useCallback((view: NavView) => {
    setSelectedView(view);
    WKApp.routeRight.replaceToRoot(
      <TodoListView key={view} navView={view} />
    );
  }, []);

  // 初始化
  useEffect(() => {
    navigate('mine');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // space 切换重置
  useEffect(() => {
    const handler = () => {
      navigate('mine');
    };
    WKApp.mittBus.on('space-changed', handler);
    return () => { WKApp.mittBus.off('space-changed', handler); };
  }, [navigate]);

  return (
    <div className="wk-matter-sidebar">
      {/* 新建事项 */}
      <div className="wk-matter-sidebar__create">
        <button
          type="button"
          className="wk-matter-sidebar__create-btn"
          onClick={() => _openCreateModal?.()}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          新建事项
        </button>
      </div>

      {/* 导航 */}
      {TOP_NAV.map(({ id, label, icon }) => (
        <div
          key={id}
          className={`wk-matter-sidebar__item${selectedView === id ? ' wk-matter-sidebar__item--selected' : ''}`}
          onClick={() => navigate(id)}
        >
          <div className="wk-matter-sidebar__item-icon"><NavIcon type={icon} /></div>
          <span className="wk-matter-sidebar__item-label">{label}</span>
        </div>
      ))}
    </div>
  );
}
