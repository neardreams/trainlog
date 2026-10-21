// 總覽的所有數值（公式與 v9 renderDashboard 相同，由 golden 測試保證一致）
import { addDays, daysBetween, inRange, mondayOf, type DateStr } from '../dates';
import type { Dataset } from '../domain/types';
import { dayEntries, daySets, dayVol } from './days';
import { daysAgo, neglectedExercises, prEvents, type PrEvent } from './exercises';
import { exhaustionBucket } from './labels';

export type Period = 7 | 30 | 90;
export const PERIODS: Period[] = [7, 30, 90];

export interface GroupBalance {
  g: string;
  n: number;
  since: number | null;
}
export interface WeekStat {
  w: DateStr;
  days: number;
  sets: number;
  vol: number;
}
export interface DashboardStats {
  /** 本週（週一到今天）訓練日數 */
  wk: number;
  /** 上週同期 */
  lwk: number;
  cur: DateStr[];
  prev: DateStr[];
  vC: number;
  vP: number;
  prC: PrEvent[];
  prP: number;
  streak: number;
  bal: GroupBalance[];
  ex: Record<string, number>;
  exTot: number;
  neg: string[];
  recent: DateStr[];
  ysLen: number;
  /** 今年最長連續訓練天數 */
  best: number;
  /** 今年經過的週數 */
  wks: number;
  /** 指標卡的 12 週小圖 */
  kspark: { days: number[]; vol: number[]; pr: number[] };
}

const datesBetween = (ds: Dataset, a: DateStr, b: DateStr) =>
  ds.trainingDates.filter((d) => inRange(d, a, b));

export function weekSeries(ds: Dataset, today: DateStr, n: number): WeekStat[] {
  const ws = mondayOf(today);
  return [...Array(n)].map((_, i) => {
    const w = addDays(ws, -7 * (n - 1 - i));
    const days = datesBetween(ds, w, addDays(w, 6));
    return {
      w,
      days: days.length,
      sets: days.reduce((s, d) => s + daySets(ds, d), 0),
      vol: days.reduce((s, d) => s + dayVol(ds, d), 0),
    };
  });
}

export function streakWeeks(ds: Dataset, today: DateStr): number {
  const hasWeek = (w: DateStr) => datesBetween(ds, w, addDays(w, 6)).length > 0;
  let w = mondayOf(today);
  let streak = 0;
  if (!hasWeek(w)) w = addDays(w, -7);
  while (hasWeek(w)) {
    streak++;
    w = addDays(w, -7);
  }
  return streak;
}

export function dashboardStats(ds: Dataset, today: DateStr, P: Period): DashboardStats {
  const T = today;
  const ws = mondayOf(T);
  const wk = datesBetween(ds, ws, T).length;
  const lwk = datesBetween(ds, addDays(ws, -7), addDays(T, -7)).length;
  const cur = datesBetween(ds, addDays(T, -(P - 1)), T);
  const prev = datesBetween(ds, addDays(T, -(2 * P - 1)), addDays(T, -P));
  const vC = cur.reduce((s, d) => s + dayVol(ds, d), 0);
  const vP = prev.reduce((s, d) => s + dayVol(ds, d), 0);
  const prs = prEvents(ds);
  const prC = prs.filter((p) => inRange(p.date, addDays(T, -(P - 1)), T));
  const prP = prs.filter((p) => inRange(p.date, addDays(T, -(2 * P - 1)), addDays(T, -P))).length;
  const bal = ds.groupOrder.map((g): GroupBalance => {
    let n = 0;
    let lastD: DateStr | null = null;
    for (const d of ds.trainingDates) {
      if (d > T) continue;
      const es = dayEntries(ds, d).filter((e) => ds.exerciseById.get(e.exerciseId)?.group === g);
      if (es.length) {
        lastD = d;
        if (inRange(d, addDays(T, -(P - 1)), T)) n += es.reduce((s, e) => s + Math.max(1, e.sets.length), 0);
      }
    }
    return { g, n, since: lastD ? daysAgo(lastD, T) : null };
  });
  const ex: Record<string, number> = {};
  for (const d of cur)
    for (const e of dayEntries(ds, d)) {
      const k = exhaustionBucket(e.exhaustion);
      ex[k] = (ex[k] ?? 0) + 1;
    }
  const exTot = Object.values(ex).reduce((a, b) => a + b, 0) || 1;
  const yr = T.slice(0, 4);
  const ys = ds.trainingDates.filter((d) => d.startsWith(`${yr}-`) && d <= T);
  let best = 0;
  let run = 0;
  let pv: DateStr | null = null;
  for (const d of ys) {
    run = pv && addDays(pv, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    pv = d;
  }
  const wks = Math.max(1, Math.ceil(daysBetween(mondayOf(`${yr}-01-01`), T) / 7));
  const weeks12 = weekSeries(ds, T, 12);
  const prByWeek = (w: DateStr) => prs.filter((p) => inRange(p.date, w, addDays(w, 6))).length;
  return {
    wk,
    lwk,
    cur,
    prev,
    vC,
    vP,
    prC,
    prP,
    streak: streakWeeks(ds, T),
    bal,
    ex,
    exTot,
    neg: neglectedExercises(ds, T).map((e) => e.id),
    recent: ds.trainingDates
      .filter((d) => d <= T)
      .slice(-6)
      .reverse(),
    ysLen: ys.length,
    best,
    wks,
    kspark: {
      days: weeks12.map((w) => w.days),
      vol: weeks12.map((w) => w.vol),
      pr: weeks12.map((w) => prByWeek(w.w)),
    },
  };
}

/** 增減：百分比四捨五入，或差值 */
export function deltaOf(
  cur: number,
  prev: number,
  pct = false,
): { dir: 'up' | 'down' | 'flat'; value: number } {
  if (pct && prev) {
    const p = Math.round(((cur - prev) / prev) * 100);
    return { dir: p > 0 ? 'up' : p < 0 ? 'down' : 'flat', value: Math.abs(p) };
  }
  const d = cur - prev;
  return { dir: d > 0 ? 'up' : d < 0 ? 'down' : 'flat', value: Math.abs(d) };
}

/** 整齊刻度：步距取 1／2／2.5／5／10 × 10ⁿ，約 4 格 */
export function niceTicks(maxValue: number, targetSteps = 4): { step: number; max: number; ticks: number[] } {
  const raw = Math.max(1, maxValue) / targetSteps;
  const pw = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * pw).find((x) => x >= raw) ?? 10 * pw;
  const max = Math.ceil(Math.max(1, maxValue) / step) * step;
  const n = Math.round(max / step);
  return { step, max, ticks: [...Array(n + 1)].map((_, i) => step * i) };
}

/** 平均（排除最後一週＝本週） */
export const avgExcludingCurrent = (vals: number[]) =>
  vals.length > 1 ? vals.slice(0, -1).reduce((a, b) => a + b, 0) / (vals.length - 1) : 0;

/** 熱度等級（每日組數）：0、1–10、11–20、21–30、31+ */
export const heatLevel = (n: number) => (n === 0 ? 0 : n <= 10 ? 1 : n <= 20 ? 2 : n <= 30 ? 3 : 4);
