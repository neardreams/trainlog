// 側邊導覽（v14）：工作區、月曆、部位（部位字塊）、系統；寬螢幕可收合成圖示列，<1024 是抽屜
import clsx from 'clsx';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { MonthCalendar } from './Calendars';
import { PartTile } from './ui';
import { gColor, useChrome } from '@/lib/chrome';
import type { ExercisesSearch } from '@/router';
import { Icon } from '@/lib/icons';
import { useDs } from '@/lib/useDs';

export function Sidebar() {
  const ds = useDs();
  const navigate = useNavigate();
  const { setSidebarOpen, activeGroup, setPendingGroup } = useChrome();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const view = path.startsWith('/exercises')
    ? 'exercise'
    : path.startsWith('/days')
      ? 'day'
      : path.startsWith('/spec')
        ? 'spec'
        : 'dashboard';
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
  const close = () => setSidebarOpen(false);
  return (
    <aside className="nav" id="sidebar" aria-label="主選單">
      <nav aria-label="工作區">
        <div className="ns-h">工作區</div>
        <Link to="/" className={clsx('ni', view === 'dashboard' && 'on')} title="總覽" onClick={close}>
          <Icon name="grid" />
          <span>總覽</span>
        </Link>
        <Link to="/days" className={clsx('ni', view === 'day' && 'on')} title="訓練紀錄" onClick={close}>
          <Icon name="calendar" />
          <span>訓練紀錄</span>
          <em>{ds.trainingDates.length}</em>
        </Link>
        <Link
          to="/exercises"
          className={clsx('ni', view === 'exercise' && 'on')}
          title="動作庫"
          onClick={close}
        >
          <Icon name="weight" />
          <span>動作庫</span>
          <em>{ds.exercises.length}</em>
        </Link>
      </nav>
      <div className="ns-h cal-l">日曆</div>
      <MonthCalendar />
      <nav aria-label="部位">
        <div className="ns-h">部位</div>
        {ds.groupOrder.map((g) => (
          <button
            key={g}
            className={clsx('ni sub', view === 'exercise' && activeGroup === g && 'on')}
            style={{ ['--g' as string]: gColor(g) }}
            onClick={() => goGroup(g)}
            title={g}
          >
            <PartTile group={g} small />
            <span>{g}</span>
            <em>{counts(g)}</em>
          </button>
        ))}
      </nav>
      <nav aria-label="系統">
        <div className="ns-h">系統</div>
        <Link to="/spec" className={clsx('ni', view === 'spec' && 'on')} title="設計規格" onClick={close}>
          <Icon name="spec" />
          <span>設計規格</span>
        </Link>
      </nav>
    </aside>
  );
}
