// App 外框：資料載入、側欄、頂部列、窄螢幕時間軸、指令面板、通知、全域快捷鍵
import { Fragment, useEffect } from 'react';
import { Link, Outlet } from '@tanstack/react-router';
import { slash } from '@trainlog/core';
import { DataLoadError, useDataset } from '@trainlog/data-client';
import { CommandPalette } from './CommandPalette';
import { Sidebar } from './Sidebar';
import { Toast } from './Toast';
import { WeekStrip } from './Calendars';
import { useChrome } from '@/lib/chrome';
import { Icon } from '@/lib/icons';
import { usePrefs, usePrefsEffect } from '@/lib/prefs';

function Topbar({ lastDate }: { lastDate: string | undefined }) {
  const { crumbs, setSidebarOpen, setPaletteOpen } = useChrome();
  const { mode, toggleMode } = usePrefs();
  return (
    <header className="topbar">
      <button className="icon-btn only-mobile" onClick={() => setSidebarOpen(true)} aria-label="開啟選單">
        <Icon name="menu" />
      </button>
      <nav className="crumbs" aria-label="麵包屑">
        {crumbs.map((c, i) =>
          i === crumbs.length - 1 || !c.to ? (
            <Fragment key={i}>
              <b>{c.label}</b>
              {i < crumbs.length - 1 && <Icon name="right" />}
            </Fragment>
          ) : (
            <Fragment key={i}>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- 麵包屑目標由各頁宣告 */}
              <Link to={c.to as any} params={c.params as any} search={(c.search ?? {}) as any}>
                {c.label}
              </Link>
              <Icon name="right" />
            </Fragment>
          ),
        )}
      </nav>
      <div className="tb-right">
        <button
          className="icon-btn"
          onClick={() => setPaletteOpen(true)}
          title="搜尋（Ctrl K）"
          aria-label="搜尋"
        >
          <Icon name="search" />
        </button>
        <span className="sync-pill" title="training_data.json 最新紀錄">
          <i />
          資料更新至 {lastDate ? slash(lastDate) : '—'}
        </span>
        <span className="tb-sep" />
        <button className="icon-btn" onClick={toggleMode} title="切換深色／淺色" aria-label="切換深色／淺色">
          <Icon name={mode === 'dark' ? 'sun' : 'moon'} />
        </button>
      </div>
    </header>
  );
}

export function AppShell() {
  usePrefsEffect();
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

  return (
    <>
      <Sidebar />
      <div className="scrim" onClick={() => setSidebarOpen(false)} />
      <div className="main">
        <Topbar lastDate={data.trainingDates[data.trainingDates.length - 1]} />
        <main className="page">
          <WeekStrip />
          <Outlet />
        </main>
      </div>
      {paletteOpen && <CommandPalette />}
      <Toast />
    </>
  );
}
