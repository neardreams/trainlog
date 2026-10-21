// 指令面板（Ctrl K）的搜尋比對，規則與 v9 palItems 相同
import { dowOf, md, slash, type DateStr } from '../dates';
import type { Dataset } from '../domain/types';
import { dayGroups } from './days';
import { entriesOf, lastDate } from './exercises';

export type PaletteAction =
  | { type: 'view'; view: 'dashboard' | 'exercise' | 'day' }
  | { type: 'toggleTheme' }
  | { type: 'exportCsv' }
  | { type: 'toggleSidebar' }
  | { type: 'openDay'; date: DateStr }
  | { type: 'openExercise'; id: string };

export interface PaletteItem {
  sec: '頁面' | '指令' | '動作' | '訓練日';
  label: string;
  sub: string;
  action: PaletteAction;
  /** 動作為部位、訓練日為 null；畫面用來顯示圖示或色點 */
  group?: string;
  key?: string;
}

export function matchPalette(
  ds: Dataset,
  query: string,
  ctx: { mode: 'light' | 'dark'; sidebarCollapsed: boolean; today: DateStr },
): PaletteItem[] {
  const q = query.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  const latest = ds.trainingDates.filter((d) => d <= ctx.today).pop() ?? ctx.today;
  const pages: PaletteItem[] = (
    [
      ['總覽', 'dashboard'],
      ['動作庫', 'exercise'],
      ['訓練紀錄', 'day'],
    ] as const
  ).map(([label, view]) => ({ sec: '頁面', label, sub: '前往頁面', action: { type: 'view', view } }));
  const cmds: PaletteItem[] = [
    {
      sec: '指令',
      label: ctx.mode === 'dark' ? '切換為淺色模式' : '切換為深色模式',
      sub: '外觀',
      action: { type: 'toggleTheme' },
    },
    { sec: '指令', label: '匯出動作庫 CSV', sub: '依目前的篩選與排序', action: { type: 'exportCsv' } },
    {
      sec: '指令',
      label: ctx.sidebarCollapsed ? '展開側欄' : '收合側欄',
      sub: '版面',
      action: { type: 'toggleSidebar' },
    },
    { sec: '指令', label: '前往最近一次訓練', sub: md(latest), action: { type: 'openDay', date: latest } },
  ];
  const exs = ds.exercises.map((e) => ({
    item: {
      sec: '動作',
      label: e.name,
      sub: `${e.group} · ${entriesOf(ds, e.id).length} 次 · 上次 ${md(lastDate(ds, e.id))}`,
      action: { type: 'openExercise', id: e.id },
      group: e.group,
      key: `${e.name} ${e.group}`.toLowerCase(),
    } satisfies PaletteItem,
    last: lastDate(ds, e.id),
  }));
  const days: PaletteItem[] = [...ds.trainingDates].reverse().map((d) => ({
    sec: '訓練日',
    label: `${slash(d)}（${dowOf(d)}）`,
    sub: `${(ds.entriesByDate.get(d) ?? []).length} 個動作 · ${dayGroups(ds, d).join('、')}`,
    action: { type: 'openDay', date: d },
    key: [d, slash(d), md(d), d.replace(/-/g, ''), d.slice(5).replace('-', '')].join(' '),
  }));
  if (!q)
    return [
      ...pages,
      ...cmds.slice(0, 2),
      ...days.slice(0, 4),
      ...[...exs]
        .sort((a, b) => b.last.localeCompare(a.last))
        .slice(0, 5)
        .map((x) => x.item),
    ];
  const m = (x: PaletteItem) =>
    x.label.toLowerCase().includes(q) ||
    (!!x.key && x.key.includes(q)) ||
    (digits.length >= 3 &&
      !!x.key &&
      x.key
        .replace(/\D/g, ' ')
        .split(' ')
        .some((k) => k.endsWith(digits)));
  return [
    ...pages.filter(m),
    ...cmds.filter(m),
    ...exs
      .map((x) => x.item)
      .filter(m)
      .slice(0, 8),
    ...days.filter(m).slice(0, 8),
  ];
}
