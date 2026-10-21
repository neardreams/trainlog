// 動作層級的統計、排序、篩選
import { daysBetween, type DateStr } from '../dates';
import type { Dataset, Entry, Exercise } from '../domain/types';
import { calcVolume, cardioTotals, getMaxWeight, isCardio } from './sets';

export const entriesOf = (ds: Dataset, exId: string): Entry[] => ds.entriesByExercise.get(exId) ?? [];

export function lastDate(ds: Dataset, exId: string): DateStr {
  const h = entriesOf(ds, exId);
  return h.length ? (h[h.length - 1] as Entry).date : '0000-00-00';
}

export const daysAgo = (date: DateStr, today: DateStr) => daysBetween(date, today);

export type ExerciseStatus = '7' | '30' | 'old';
/** 狀態篩選：近 7 天（≤7）、8–30 天、30 天以上 */
export function statusOf(ds: Dataset, exId: string, today: DateStr): ExerciseStatus {
  const d = daysAgo(lastDate(ds, exId), today);
  return d <= 7 ? '7' : d <= 30 ? '30' : 'old';
}

/** 動作庫一列需要的所有數值 */
export interface ExerciseSummary {
  sessions: number;
  lastDate: DateStr | null;
  daysAgo: number | null;
  /** 最近一次「有容量」的紀錄 */
  latestQualified: Entry | null;
  latestWeight: number | null;
  latestVolume: number | null;
  maxWeight: number;
  totalVolume: number;
  cardio: { mins: number; km: number };
  lastEntry: Entry | null;
}
export function summarize(ds: Dataset, ex: Exercise, today: DateStr): ExerciseSummary {
  const h = entriesOf(ds, ex.id);
  const last = h.length ? (h[h.length - 1] as Entry) : null;
  const q = h.filter((x) => calcVolume(x.sets) != null);
  const lq = q.length ? (q[q.length - 1] as Entry) : null;
  return {
    sessions: h.length,
    lastDate: last?.date ?? null,
    daysAgo: last ? daysAgo(last.date, today) : null,
    latestQualified: lq,
    latestWeight: lq ? getMaxWeight(lq.sets) : null,
    latestVolume: lq ? calcVolume(lq.sets) : null,
    maxWeight: Math.max(0, ...h.map((x) => getMaxWeight(x.sets) ?? 0)),
    totalVolume: h.reduce((s, x) => s + (calcVolume(x.sets) ?? 0), 0),
    cardio: cardioTotals(h),
    lastEntry: last,
  };
}

export const SORT_KEYS = [
  'group',
  'recent',
  'overdue',
  'maxwt',
  'volume',
  'sessions',
  'progress',
  'name',
] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export const SORT_LABELS: Record<SortKey, string> = {
  group: '依部位分組',
  recent: '最近訓練優先',
  overdue: '最久未練優先',
  maxwt: '最高重量',
  volume: '累計容量',
  sessions: '訓練次數',
  progress: '重量進步幅度',
  name: '名稱',
};

/** 8 種排序（與 v6／v9 相同；JS 的 sort 是穩定排序，同值時維持原始順序） */
export function sortExercises(ds: Dataset, key: SortKey): Exercise[] {
  const exs = [...ds.exercises];
  const last = (e: Exercise) => lastDate(ds, e.id);
  switch (key) {
    case 'group': {
      const gi = new Map(ds.groupOrder.map((g, i) => [g, i]));
      return exs.sort((a, b) => (gi.get(a.group) ?? 99) - (gi.get(b.group) ?? 99));
    }
    case 'recent':
      return exs.sort((a, b) => last(b).localeCompare(last(a)));
    case 'overdue':
      return exs.sort((a, b) => last(a).localeCompare(last(b)));
    case 'maxwt': {
      const mw = (e: Exercise) => Math.max(0, ...entriesOf(ds, e.id).map((h) => getMaxWeight(h.sets) ?? 0));
      return exs.sort((a, b) => mw(b) - mw(a));
    }
    case 'volume': {
      const tv = (e: Exercise) => entriesOf(ds, e.id).reduce((s, h) => s + (calcVolume(h.sets) ?? 0), 0);
      return exs.sort((a, b) => tv(b) - tv(a));
    }
    case 'sessions':
      return exs.sort((a, b) => entriesOf(ds, b.id).length - entriesOf(ds, a.id).length);
    case 'progress': {
      const pg = (e: Exercise) => {
        const qs = entriesOf(ds, e.id).filter((h) => getMaxWeight(h.sets));
        if (qs.length < 2) return 0;
        return (
          (getMaxWeight((qs[qs.length - 1] as Entry).sets) ?? 0) - (getMaxWeight((qs[0] as Entry).sets) ?? 0)
        );
      };
      return exs.sort((a, b) => pg(b) - pg(a));
    }
    case 'name':
      return exs.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
  }
}

export interface ExerciseFilter {
  q: string;
  groups: ReadonlySet<string>;
  status: 'all' | ExerciseStatus;
}
export function filterExercises(ds: Dataset, key: SortKey, f: ExerciseFilter, today: DateStr): Exercise[] {
  const q = f.q.trim().toLowerCase();
  return sortExercises(ds, key).filter(
    (e) =>
      (!q || e.name.toLowerCase().includes(q) || e.group.includes(q)) &&
      (!f.groups.size || f.groups.has(e.group)) &&
      (f.status === 'all' || statusOf(ds, e.id, today) === f.status),
  );
}

/** 久未練：練過 ≥3 次、距上次 >21 天；依次數多到少 */
export function neglectedExercises(ds: Dataset, today: DateStr, limit = 6): Exercise[] {
  return ds.exercises
    .filter((e) => entriesOf(ds, e.id).length >= 3 && daysAgo(lastDate(ds, e.id), today) > 21)
    .sort((a, b) => entriesOf(ds, b.id).length - entriesOf(ds, a.id).length)
    .slice(0, limit);
}

/** 破紀錄：最高重量大於先前所有紀錄（需有先前紀錄）；有氧不計；依日期新到舊 */
export interface PrEvent {
  exerciseId: string;
  date: DateStr;
  from: number;
  to: number;
}
export function prEvents(ds: Dataset): PrEvent[] {
  const out: PrEvent[] = [];
  for (const ex of ds.exercises) {
    if (isCardio(ex)) continue;
    let best: number | null = null;
    for (const h of entriesOf(ds, ex.id)) {
      const w = getMaxWeight(h.sets);
      if (w == null) continue;
      if (best != null && w > best) out.push({ exerciseId: ex.id, date: h.date, from: best, to: w });
      if (best == null || w > best) best = w;
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** 列表上的迷你趨勢：最近 16 次的最高重量（有氧用分鐘） */
export function miniTrendValues(ds: Dataset, ex: Exercise, n = 16): number[] {
  const h = entriesOf(ds, ex.id);
  const v = (isCardio(ex) ? h.map((x) => x.minutes ?? null) : h.map((x) => getMaxWeight(x.sets))).filter(
    (x): x is number => x != null,
  );
  return v.slice(-n);
}

/** 趨勢卡的資料：[日期, 值]；有氧為分鐘／公里，其他為容量／最高重量 */
export function trendSeries(
  ds: Dataset,
  ex: Exercise,
): { primary: [DateStr, number][]; secondary: [DateStr, number][] } {
  const h = entriesOf(ds, ex.id);
  if (isCardio(ex))
    return {
      primary: h.filter((x) => x.minutes != null).map((x) => [x.date, x.minutes as number]),
      secondary: h.filter((x) => x.distanceKm != null).map((x) => [x.date, x.distanceKm as number]),
    };
  return {
    primary: h.flatMap((x) => {
      const v = calcVolume(x.sets);
      return v == null ? [] : [[x.date, v] as [DateStr, number]];
    }),
    secondary: h.flatMap((x) => {
      const v = getMaxWeight(x.sets);
      return v == null ? [] : [[x.date, v] as [DateStr, number]];
    }),
  };
}
