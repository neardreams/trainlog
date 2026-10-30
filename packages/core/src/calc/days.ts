// 訓練日層級的計算
import { datesInRange, type DateStr } from '../dates';
import type { Dataset, Entry, Exercise } from '../domain/types';
import { exhaustionBucket } from './labels';
import { calcVolume, getMaxWeight } from './sets';

export const dayEntries = (ds: Dataset, date: DateStr): Entry[] => ds.entriesByDate.get(date) ?? [];
export const daySets = (ds: Dataset, date: DateStr) =>
  dayEntries(ds, date).reduce((s, e) => s + e.sets.length, 0);
export const dayVol = (ds: Dataset, date: DateStr) =>
  dayEntries(ds, date).reduce((s, e) => s + (calcVolume(e.sets) ?? 0), 0);
export function dayGroups(ds: Dataset, date: DateStr): string[] {
  const ents = dayEntries(ds, date);
  return ds.groupOrder.filter((g) => ents.some((e) => ds.exerciseById.get(e.exerciseId)?.group === g));
}
export const exerciseOf = (ds: Dataset, e: Entry) => ds.exerciseById.get(e.exerciseId) as Exercise;
/** 某一年的總組數（狀態列用） */
export const yearSets = (ds: Dataset, year: number) =>
  ds.trainingDates.filter((d) => d.startsWith(`${year}-`)).reduce((s, d) => s + daySets(ds, d), 0);

/** 今天以前（含）最近一個訓練日 */
export function latestTrainingDate(ds: Dataset, today: DateStr): DateStr | null {
  const past = ds.trainingDates.filter((d) => d <= today);
  return past[past.length - 1] ?? ds.trainingDates[ds.trainingDates.length - 1] ?? null;
}
export const prevTrainingDate = (ds: Dataset, d: DateStr) =>
  ds.trainingDates.filter((x) => x < d).pop() ?? null;
export const nextTrainingDate = (ds: Dataset, d: DateStr) => ds.trainingDates.find((x) => x > d) ?? null;

/** 第幾個訓練日（1 起算）；不是訓練日回傳 null */
export function trainingDayNo(ds: Dataset, d: DateStr): number | null {
  const i = ds.trainingDates.indexOf(d);
  return i < 0 ? null : i + 1;
}
/** 這筆紀錄是這個動作的第幾次（1 起算） */
export const entryNo = (ds: Dataset, e: Entry) =>
  (ds.entriesByExercise.get(e.exerciseId) ?? []).findIndex((x) => x.id === e.id) + 1;

/** 日期比較（多天並排）的欄：沒有範圍時取前 3 個訓練日＋這天＋後 1 個訓練日；有範圍時取範圍內的訓練日 */
export function compareColumns(ds: Dataset, centre: DateStr, days: number): DateStr[] {
  if (days > 0) return rangeDates(centre, days).filter((d) => ds.entriesByDate.has(d));
  const before = ds.trainingDates.filter((d) => d < centre).slice(-3);
  const after = ds.trainingDates.filter((d) => d > centre).slice(0, 1);
  return [...before, centre, ...after];
}
/** 這些日子出現過的動作（依第一次出現的順序，不重複） */
export function exercisesOnDates(ds: Dataset, dates: readonly DateStr[]): string[] {
  const seen = new Set<string>();
  for (const d of dates) for (const e of dayEntries(ds, d)) seen.add(e.exerciseId);
  return [...seen];
}

// ── 訓練紀錄頁：範圍、排序、分組 ──
export type RangeSortKey = 'date-desc' | 'date-asc' | 'vol-desc' | 'wt-desc' | 'name';
export type RangeGroupBy = 'exercise' | 'date' | 'group';
export const RANGE_DAYS = [0, 3, 7, 14, 30] as const;

export const rangeDates = (centre: DateStr, days: number) =>
  days === 0 ? [centre] : datesInRange(centre, days);

export function rangeEntries(ds: Dataset, centre: DateStr, days: number, sort: RangeSortKey): Entry[] {
  const entries = rangeDates(centre, days).flatMap((d) => dayEntries(ds, d));
  const name = (e: Entry) => exerciseOf(ds, e).name;
  const fn: Record<RangeSortKey, (a: Entry, b: Entry) => number> = {
    'date-desc': (a, b) => b.date.localeCompare(a.date),
    'date-asc': (a, b) => a.date.localeCompare(b.date),
    'vol-desc': (a, b) => (calcVolume(b.sets) ?? 0) - (calcVolume(a.sets) ?? 0),
    'wt-desc': (a, b) => (getMaxWeight(b.sets) ?? 0) - (getMaxWeight(a.sets) ?? 0),
    name: (a, b) => name(a).localeCompare(name(b), 'zh-TW'),
  };
  return [...entries].sort(fn[sort]);
}

export interface RangeGroup {
  key: string;
  kind: RangeGroupBy;
  /** exercise：動作 id；date：日期；group：部位名稱 */
  id: string;
  entries: Entry[];
  maxWeight: number;
  volume: number;
}
export function groupRangeEntries(
  ds: Dataset,
  entries: Entry[],
  by: RangeGroupBy,
  sort: RangeSortKey,
): RangeGroup[] {
  const make = (kind: RangeGroupBy, id: string, list: Entry[]): RangeGroup => ({
    key: `${kind}:${id}`,
    kind,
    id,
    entries: list,
    maxWeight: Math.max(0, ...list.map((e) => getMaxWeight(e.sets) ?? 0)),
    volume: list.reduce((s, e) => s + (calcVolume(e.sets) ?? 0), 0),
  });
  const bucket = (keyOf: (e: Entry) => string) => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) {
      const k = keyOf(e);
      const l = m.get(k);
      if (l) l.push(e);
      else m.set(k, [e]);
    }
    return m;
  };
  if (by === 'exercise') return [...bucket((e) => e.exerciseId)].map(([id, l]) => make('exercise', id, l));
  if (by === 'date') {
    const m = bucket((e) => e.date);
    const order = [...m.keys()].sort((a, b) =>
      sort === 'date-asc' ? a.localeCompare(b) : b.localeCompare(a),
    );
    return order.map((d) => make('date', d, m.get(d) as Entry[]));
  }
  const m = bucket((e) => exerciseOf(ds, e).group);
  return ds.groupOrder.filter((g) => m.has(g)).map((g) => make('group', g, m.get(g) as Entry[]));
}

/** 右側詳細資料欄的統計 */
export interface RangeStats {
  trainingDays: number;
  entries: number;
  sets: number;
  volume: number;
  groups: string[];
  /** 部位 → 組數（每筆至少算 1） */
  setsByGroup: Record<string, number>;
  exhaustion: Record<string, number>;
  conditions: string[];
}
export function rangeStats(ds: Dataset, centre: DateStr, days: number): RangeStats {
  const dates = rangeDates(centre, days);
  const entries = dates.flatMap((d) => dayEntries(ds, d));
  const setsByGroup: Record<string, number> = {};
  const exhaustion: Record<string, number> = {};
  for (const e of entries) {
    const g = exerciseOf(ds, e).group;
    setsByGroup[g] = (setsByGroup[g] ?? 0) + Math.max(1, e.sets.length);
    const k = exhaustionBucket(e.exhaustion);
    exhaustion[k] = (exhaustion[k] ?? 0) + 1;
  }
  return {
    trainingDays: dates.filter((d) => ds.entriesByDate.has(d)).length,
    entries: entries.length,
    sets: entries.reduce((s, e) => s + e.sets.length, 0),
    volume: entries.reduce((s, e) => s + (calcVolume(e.sets) ?? 0), 0),
    groups: ds.groupOrder.filter((g) => setsByGroup[g]),
    setsByGroup,
    exhaustion,
    conditions: [...new Set(entries.map((e) => e.condition).filter((c): c is string => !!c && c !== '正常'))],
  };
}

/** 日期比較：兩天的紀錄與共同動作 */
export interface CompareRow {
  entry: Entry;
  volume: number | null;
  maxWeight: number | null;
  /** 另一天的同一個動作 */
  other: { volume: number | null; maxWeight: number | null } | null;
}
export function compareDays(ds: Dataset, a: DateStr, b: DateStr) {
  const rows = (d: DateStr, o: DateStr): CompareRow[] => {
    const om = new Map(dayEntries(ds, o).map((e) => [e.exerciseId, e]));
    return dayEntries(ds, d).map((e) => {
      const oe = om.get(e.exerciseId);
      return {
        entry: e,
        volume: calcVolume(e.sets),
        maxWeight: getMaxWeight(e.sets),
        other: oe ? { volume: calcVolume(oe.sets), maxWeight: getMaxWeight(oe.sets) } : null,
      };
    });
  };
  const A = rows(a, b);
  const B = rows(b, a);
  const total = (r: CompareRow[]) => r.reduce((s, x) => s + (x.volume ?? 0), 0);
  return { a: A, b: B, totalA: total(A), totalB: total(B), common: A.filter((x) => x.other).length };
}
