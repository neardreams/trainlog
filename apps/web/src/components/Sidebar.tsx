// 側欄：工作區導覽、整月月曆、部位導覽、同步狀態；可收合，<1024 為抽屜
import clsx from 'clsx';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { slash } from '@trainlog/core';
import { MonthCalendar } from './Calendars';
import { GDot } from './ui';
import { useChrome } from '@/lib/chrome';
import type { ExercisesSearch } from '@/router';
import { Icon } from '@/lib/icons';
import { usePrefs } from '@/lib/prefs';
import { useDs } from '@/lib/useDs';

export function Sidebar() {
  const ds = useDs();
  const navigate = useNavigate();
  const toggleCollapsed = usePrefs((s) => s.toggleCollapsed);
  const { setPaletteOpen, setSidebarOpen, activeGroup, setPendingGroup } = useChrome();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const view = path.startsWith('/exercises')
    ? 'exercise'
    : path.startsWith('/days')
      ? 'day'
      : path.startsWith('/spec')
        ? 'spec'
        : 'dashboard';
  const last = ds.trainingDates[ds.trainingDates.length - 1];
  const goGroup = (g: string) => {
    setSidebarOpen(false);
    setPendingGroup(g);
    // 同 v9：改回依部位分組；保留搜尋字與狀態篩選；部位篩選不含該部位時才清除
    void navigate({
      to: '/exercises',
      search: (prev) => {
        const p = prev as ExercisesSearch;
        return {
          ...(p.q ? { q: p.q } : {}),
          ...(p.status ? { status: p.status } : {}),
          ...(p.groups?.includes(g) ? { groups: p.groups } : {}),
        };
      },
    });
  };
  const counts = (g: string) => ds.exercises.filter((e) => e.group === g).length;
  return (
    <aside className="sidebar" id="sidebar" aria-label="主選單">
      <div className="sb-head">
        <span className="sb-logo">
          <Icon name="logo" />
        </span>
        <div className="sb-ws">
          <b>TrainLog</b>
          <span>個人訓練空間</span>
        </div>
        <button
          className="icon-btn sb-collapse-btn"
          onClick={toggleCollapsed}
          title="收合側欄"
          aria-label="收合側欄"
        >
          <Icon name="panel" />
        </button>
      </div>
      <div className="sb-scroll">
        <button className="sb-search" onClick={() => setPaletteOpen(true)} title="搜尋（Ctrl K）">
          <Icon name="search" />
          <span>搜尋動作、日期…</span>
          <kbd>Ctrl K</kbd>
        </button>
        <nav aria-label="工作區">
          <div className="sb-label">工作區</div>
          <Link
            to="/"
            className={clsx('nav-item', view === 'dashboard' && 'active')}
            title="總覽"
            onClick={() => setSidebarOpen(false)}
          >
            <Icon name="grid" />
            <span>總覽</span>
          </Link>
          <Link
            to="/exercises"
            className={clsx('nav-item', view === 'exercise' && 'active')}
            title="動作庫"
            onClick={() => setSidebarOpen(false)}
          >
            <Icon name="list" />
            <span>動作庫</span>
            <em>{ds.exercises.length}</em>
          </Link>
          <Link
            to="/days"
            className={clsx('nav-item', view === 'day' && 'active')}
            title="訓練紀錄"
            onClick={() => setSidebarOpen(false)}
          >
            <Icon name="calendar" />
            <span>訓練紀錄</span>
            <em>{ds.trainingDates.length}</em>
          </Link>
          <button className="nav-item sb-expand" onClick={toggleCollapsed} title="展開側欄">
            <Icon name="panel" />
          </button>
        </nav>
        <MonthCalendar />
        <nav aria-label="部位">
          <div className="sb-label">部位</div>
          {ds.groupOrder.map((g) => (
            <button
              key={g}
              className={clsx('gn-item', view === 'exercise' && activeGroup === g && 'active')}
              onClick={() => goGroup(g)}
              title={g}
            >
              <GDot group={g} />
              <span>{g}</span>
              <em>{counts(g)}</em>
            </button>
          ))}
        </nav>
        <nav aria-label="系統">
          <div className="sb-label">系統</div>
          <Link
            to="/spec"
            className={clsx('nav-item', view === 'spec' && 'active')}
            title="設計規格"
            onClick={() => setSidebarOpen(false)}
          >
            <Icon name="grid" />
            <span>設計規格</span>
          </Link>
        </nav>
      </div>
      <div className="sb-foot">
        <span className="who">TL</span>
        <div className="meta">
          <b>個人工作區</b>
          <span>
            <i />
            已同步至 {last ? slash(last) : '—'}
          </span>
        </div>
      </div>
    </aside>
  );
}
