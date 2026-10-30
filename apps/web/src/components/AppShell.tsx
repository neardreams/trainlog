// App 外框（v14）：全寬深色殼層列、左側淺色導覽、手機週條、底部狀態列；資料載入、指令面板、通知、全域快捷鍵
import { useEffect } from 'react';
import { Outlet } from '@tanstack/react-router';
import { md, slash, yearSets } from '@trainlog/core';
import { DataLoadError, useDataset } from '@trainlog/data-client';
import { CommandPalette } from './CommandPalette';
import { Sidebar } from './Sidebar';
import { Toast } from './Toast';
import { VideoPlayerHost } from './VideoPlayerDialog';
import { MobileWeek } from './Calendars';
import { useChrome } from '@/lib/chrome';
import { Icon } from '@/lib/icons';
import { usePrefs, usePrefsEffect } from '@/lib/prefs';
import { useDataTips } from '@/lib/tip';
import { TODAY } from '@/lib/today';

/** 窄螢幕（側欄是抽屜）時，選單鈕打開抽屜；寬螢幕時收合側欄 */
const isNarrow = () => matchMedia('(max-width: 1023px)').matches;

function Shell({ lastDate }: { lastDate: string | undefined }) {
  const { crumbs, sidebarOpen, setSidebarOpen, setPaletteOpen } = useChrome();
  const { mode, toggleMode, density, setDensity, toggleCollapsed } = usePrefs();
  const title = crumbs[crumbs.length - 1]?.label ?? 'TrainLog';
  return (
    <header className="shell">
      <button
        className="sh-menu"
        onClick={() => (isNarrow() ? setSidebarOpen(!sidebarOpen) : toggleCollapsed())}
        title="選單"
        aria-label="選單"
        aria-controls="sidebar"
      >
        <Icon name="menu" />
      </button>
      <div className="sh-brand">
        <span className="logo">
          <Icon name="logo" />
        </span>
        <b>TrainLog</b>
        <span>個人訓練管理</span>
      </div>
      <b className="sh-title">{title}</b>
      <button className="sh-search" onClick={() => setPaletteOpen(true)} title="搜尋（Ctrl K）">
        <Icon name="search" />
        <span>搜尋動作、日期、訓練紀錄…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <span className="sh-sp" />
      <span className="sh-sync" title="training_data.json 最新紀錄">
        <i className="sq ok live" />
        已同步 · {lastDate ? md(lastDate) : '—'}
      </span>
      <button className="sh-ib mob" onClick={() => setPaletteOpen(true)} title="搜尋" aria-label="搜尋">
        <Icon name="search" />
      </button>
      <button
        className="sh-ib dens"
        onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
        title={`切換密度（目前：${density === 'compact' ? '緊密' : '標準'}）`}
        aria-label="切換密度"
      >
        <Icon name="rows" />
      </button>
      <button className="sh-ib" onClick={toggleMode} title="切換深色／淺色" aria-label="切換深色／淺色">
        <Icon name={mode === 'dark' ? 'sun' : 'moon'} />
      </button>
      <div className="sh-user">
        <span className="av">TL</span>
        <span>個人工作區</span>
      </div>
    </header>
  );
}

function StatusBar({ lastDate }: { lastDate: string | undefined }) {
  const ds = useDataset().data;
  const density = usePrefs((s) => s.density);
  const year = Number(TODAY.slice(0, 4));
  if (!ds) return null;
  return (
    <footer className="stb">
      <span>
        <i className="sq ok" />
        <b>同步正常</b>
      </span>
      <span>資料至 {lastDate ? slash(lastDate) : '—'}</span>
      <span>
        訓練日 <b>{ds.trainingDates.length}</b>
      </span>
      <span>
        動作 <b>{ds.exercises.length}</b>
      </span>
      <span>
        {year} 年 <b>{yearSets(ds, year).toLocaleString('en-US')}</b> 組
      </span>
      <span className="sp" />
      <span>
        密度 <b>{density === 'compact' ? '緊密' : '標準'}</b>
      </span>
      <span>
        <b>Ctrl K</b> 指令面板
      </span>
      <span>TrainLog</span>
    </footer>
  );
}

export function AppShell() {
  usePrefsEffect();
  useDataTips();
  const { data, error, isPending } = useDataset();
  const { sidebarOpen, setSidebarOpen, paletteOpen, setPaletteOpen } = useChrome();

  useEffect(() => {
    document.documentElement.classList.toggle('sb-open', sidebarOpen);
  }, [sidebarOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.matches?.('input,select,textarea');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(!useChrome.getState().paletteOpen);
      } else if (e.key === '/' && !typing && !useChrome.getState().paletteOpen) {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === 'Escape') setSidebarOpen(false);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [setPaletteOpen, setSidebarOpen]);

  if (isPending) return <div className="loading-shell">資料載入中…</div>;
  if (error || !data)
    return (
      <div className="error-box panel">
        <div className="panel-head">
          <span className="panel-title">資料載入失敗</span>
        </div>
        <div style={{ padding: '14px 16px 18px', fontSize: 13 }}>
          {error?.message ?? '未知錯誤'}
          {error instanceof DataLoadError && error.issues.length > 0 && (
            <ul>
              {error.issues.slice(0, 20).map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );

  const last = data.trainingDates[data.trainingDates.length - 1];
  return (
    <>
      <Shell lastDate={last} />
      <div className="app">
        <Sidebar />
        <div className="scrim" onClick={() => setSidebarOpen(false)} />
        <main className="main">
          <MobileWeek />
          <Outlet />
        </main>
      </div>
      <StatusBar lastDate={last} />
      {paletteOpen && <CommandPalette />}
      <VideoPlayerHost />
      <Toast />
    </>
  );
}
