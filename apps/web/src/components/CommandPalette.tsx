// 指令面板（Ctrl K 或 /）：搜尋規則由 @trainlog/core 的 matchPalette 提供，cmdk 只負責鍵盤操作
import { useMemo, useState } from 'react';
import { Command } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useNavigate } from '@tanstack/react-router';
import { matchPalette, type PaletteItem } from '@trainlog/core';
import { GDot } from './ui';
import { useChrome } from '@/lib/chrome';
import { Icon, type IconName } from '@/lib/icons';
import { usePrefs } from '@/lib/prefs';
import { TODAY } from '@/lib/today';
import { useDs } from '@/lib/useDs';
import { runExportCsv } from '@/routes/exercises-actions';

const ICON_OF: Record<string, IconName> = { dashboard: 'grid', exercise: 'list', day: 'calendar' };

export function CommandPalette() {
  const ds = useDs();
  const navigate = useNavigate();
  const { setPaletteOpen, showToast } = useChrome();
  const { mode, collapsed, toggleMode, toggleCollapsed } = usePrefs();
  const [q, setQ] = useState('');
  const items = useMemo(
    () => matchPalette(ds, q, { mode, sidebarCollapsed: collapsed, today: TODAY }),
    [ds, q, mode, collapsed],
  );
  const sections = [...new Set(items.map((i) => i.sec))];

  const run = (it: PaletteItem) => {
    setPaletteOpen(false);
    const a = it.action;
    if (a.type === 'view')
      void navigate({ to: a.view === 'dashboard' ? '/' : a.view === 'exercise' ? '/exercises' : '/days' });
    else if (a.type === 'openDay') void navigate({ to: '/days/$date', params: { date: a.date } });
    else if (a.type === 'openExercise') void navigate({ to: '/exercises', search: { ex: a.id } });
    else if (a.type === 'toggleTheme') toggleMode();
    else if (a.type === 'toggleSidebar') toggleCollapsed();
    else if (a.type === 'exportCsv') showToast(runExportCsv(ds, TODAY));
  };
  const iconFor = (it: PaletteItem) => {
    const a = it.action;
    if (it.group) return <GDot group={it.group} />;
    if (a.type === 'view') return <Icon name={ICON_OF[a.view] ?? 'grid'} />;
    if (a.type === 'toggleTheme') return <Icon name={mode === 'dark' ? 'sun' : 'moon'} />;
    if (a.type === 'exportCsv') return <Icon name="download" />;
    if (a.type === 'toggleSidebar') return <Icon name="panel" />;
    return <Icon name="calendar" />;
  };

  return (
    <Dialog.Root open onOpenChange={(o) => !o && setPaletteOpen(false)}>
      <Dialog.Portal>
        <Dialog.Overlay className="palette">
          <Dialog.Content
            className="pal-box"
            aria-describedby={undefined}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <VisuallyHidden>
              <Dialog.Title>搜尋</Dialog.Title>
            </VisuallyHidden>
            <Command shouldFilter={false} loop label="搜尋">
              <div className="pal-in">
                <Icon name="search" />
                <Command.Input autoFocus value={q} onValueChange={setQ} placeholder="搜尋動作、日期或指令…" />
                <kbd>Esc</kbd>
              </div>
              <Command.List className="pal-list">
                <Command.Empty>
                  <div className="empty">
                    <b>找不到結果</b>試試動作名稱、部位或日期（例如 10/19）。
                  </div>
                </Command.Empty>
                {sections.map((sec) => (
                  <Command.Group key={sec} heading={sec}>
                    <div className="pal-sec">{sec}</div>
                    {items
                      .filter((i) => i.sec === sec)
                      .map((it) => (
                        <Command.Item
                          key={`${sec}:${it.label}`}
                          value={`${sec}:${it.label}`}
                          className="pal-item"
                          onSelect={() => run(it)}
                        >
                          <span className="ic">{iconFor(it)}</span>
                          <span className="pm">
                            <b>{it.label}</b>
                            <span>{it.sub}</span>
                          </span>
                          <kbd>Enter</kbd>
                        </Command.Item>
                      ))}
                  </Command.Group>
                ))}
              </Command.List>
              <div className="pal-foot">
                <span>
                  <kbd>↑</kbd>
                  <kbd>↓</kbd>選擇
                </span>
                <span>
                  <kbd>Enter</kbd>開啟
                </span>
                <span>
                  <kbd>Esc</kbd>關閉
                </span>
              </div>
            </Command>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
