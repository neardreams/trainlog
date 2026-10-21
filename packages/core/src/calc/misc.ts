// CSV 匯出與舊網址轉換
import { DATE_RE, type DateStr } from '../dates';
import type { Dataset, Exercise } from '../domain/types';
import { daysAgo, entriesOf, lastDate } from './exercises';
import { calcVolume, getMaxWeight } from './sets';

export const CSV_HEADER = [
  '動作',
  '部位',
  '上次訓練',
  '距今天數',
  '最新重量(kg)',
  '最新容量(kg)',
  '最高重量(kg)',
  '累計容量(kg)',
  '訓練次數',
] as const;

/** CSV 內容（含 UTF-8 BOM，Excel 開啟中文不會亂碼） */
export function exercisesCsv(ds: Dataset, rows: Exercise[], today: DateStr): string {
  const lines = rows.map((ex) => {
    const h = entriesOf(ds, ex.id);
    const q = h.filter((x) => calcVolume(x.sets) != null);
    const lq = q[q.length - 1];
    const ld = lastDate(ds, ex.id);
    const mx = Math.max(0, ...h.map((x) => getMaxWeight(x.sets) ?? 0));
    const tv = h.reduce((s, x) => s + (calcVolume(x.sets) ?? 0), 0);
    return [
      ex.name,
      ex.group,
      ld,
      daysAgo(ld, today),
      lq ? (getMaxWeight(lq.sets) ?? '') : '',
      lq ? (calcVolume(lq.sets) ?? '') : '',
      mx || '',
      tv || '',
      h.length,
    ];
  });
  const cell = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [CSV_HEADER, ...lines].map((r) => r.map(cell).join(',')).join('\r\n');
}

/** 舊網址（?date=、?exercise=、?view=）轉成新的 hash 路由；不需轉換時回傳 null */
export function legacyUrlToHash(search: string): string | null {
  const p = new URLSearchParams(search);
  const date = p.get('date');
  const ex = p.get('exercise');
  const view = p.get('view');
  if (date && DATE_RE.test(date)) return `#/days/${date}`;
  if (ex) return `#/exercises?ex=${encodeURIComponent(ex)}`;
  if (view === 'exercise') return '#/exercises';
  if (view === 'day') return '#/days';
  if (view === 'spec') return '#/spec';
  return null;
}
