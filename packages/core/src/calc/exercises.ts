// 動作層級的統計、排序、篩選
import { daysBetween, type DateStr } from '../dates';
import type { Dataset, Entry, Exercise } from '../domain/types';
import { calcVolume, cardioTotals, entryVolume, estimate1rm, getMaxWeight, isCardio } from './sets';

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
    latestVolume: lq ? entryVolume(lq, ex) : null,
    maxWeight: Math.max(0, ...h.map((x) => getMaxWeight(x.sets) ?? 0)),
    totalVolume: h.reduce((s, x) => s + (entryVolume(x, ex) ?? 0), 0),
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
  // 排序鍵每個動作只算一次（比較函式會被呼叫 n log n 次）
  const by = (f: (e: Exercise) => number, dir: 1 | -1 = -1) => {
    const k = new Map(exs.map((e) => [e, f(e)]));
    return exs.sort((a, b) => dir * ((k.get(a) ?? 0) - (k.get(b) ?? 0)));
  };
  const byDate = (dir: 1 | -1) => {
    const k = new Map(exs.map((e) => [e, lastDate(ds, e.id)]));
    return exs.sort((a, b) => dir * (k.get(a) ?? '').localeCompare(k.get(b) ?? ''));
  };
  switch (key) {
    case 'group': {
      const gi = new Map(ds.groupOrder.map((g, i) => [g, i]));
      return by((e) => gi.get(e.group) ?? 99, 1);
    }
    case 'recent':
      return byDate(-1);
    case 'overdue':
      return byDate(1);
    case 'maxwt':
      return by((e) => Math.max(0, ...entriesOf(ds, e.id).map((h) => getMaxWeight(h.sets) ?? 0)));
    case 'volume':
      return by((e) => entriesOf(ds, e.id).reduce((s, h) => s + (entryVolume(h, e) ?? 0), 0));
    case 'sessions':
      return by((e) => entriesOf(ds, e.id).length);
    case 'progress':
      return by((e) => progressOf(ds, e.id)?.delta ?? 0);
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

/** 同型動作（同一個 family 的其他動作，不含自己）；沒有 family 回傳空陣列 */
export function familyMembers(ds: Dataset, ex: Exercise): Exercise[] {
  return ex.family ? ds.exercises.filter((e) => e.family === ex.family && e.id !== ex.id) : [];
}

/**
 * 久未練：練過 ≥3 次、距上次 >21 天；依次數多到少。
 * 不再做的動作（archived）不算；同型動作（family）裡有任何一個 21 天內練過也不算（例：改做單腳腿伸展後，坐姿踢腿機不算久未練）。
 */
export function neglectedExercises(ds: Dataset, today: DateStr, limit = 6): Exercise[] {
  const stale = (id: string) => daysAgo(lastDate(ds, id), today) > 21;
  return ds.exercises
    .filter(
      (e) =>
        !e.archived &&
        entriesOf(ds, e.id).length >= 3 &&
        stale(e.id) &&
        familyMembers(ds, e).every((m) => stale(m.id)),
    )
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
const prEventsCache = new WeakMap<Dataset, readonly PrEvent[]>();
/** 同一份資料只算一次（總覽、動作庫、AI 查詢都會重複呼叫）；回傳凍結的陣列，呼叫端不能修改 */
export function prEvents(ds: Dataset): readonly PrEvent[] {
  let v = prEventsCache.get(ds);
  if (!v) {
    v = Object.freeze(computePrEvents(ds));
    prEventsCache.set(ds, v);
  }
  return v;
}
function computePrEvents(ds: Dataset): PrEvent[] {
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

const prCache = new WeakMap<Dataset, Map<string, PrEvent>>();
/** 這筆紀錄是不是破紀錄（是的話回傳原紀錄與新紀錄） */
export function entryPr(ds: Dataset, entry: Pick<Entry, 'exerciseId' | 'date'>): PrEvent | undefined {
  let m = prCache.get(ds);
  if (!m) {
    m = new Map(prEvents(ds).map((p) => [`${p.exerciseId}|${p.date}`, p]));
    prCache.set(ds, m);
  }
  return m.get(`${entry.exerciseId}|${entry.date}`);
}

/**
 * 給 AI 分析用的破紀錄（網站的「破紀錄」仍只看最高重量，見 prEvents）：
 * - weight：最高重量超過先前所有紀錄（同 prEvents）
 * - reps：在某個重量（或更重）做到的次數超過先前所有紀錄（同一天已經是 weight 破紀錄就不另外算）；
 *   秒數／米數動作就是撐更久、走更遠
 * - e1rm：推估 1RM（estimate1rm）超過先前所有紀錄
 * 都需要有先前紀錄；有氧不計；依日期新到舊。
 */
export type PrKind = 'weight' | 'reps' | 'e1rm';
export interface StrengthPr {
  kind: PrKind;
  exerciseId: string;
  date: DateStr;
  /** weight／e1rm：舊紀錄 → 新紀錄（kg） */
  from?: number;
  to?: number;
  /** reps：那一組的重量（無重量記 0）、先前在這個重量或更重做到的最多次數、這次的次數 */
  weightKg?: number;
  prevReps?: number;
  reps?: number;
}
const strengthPrCache = new WeakMap<Dataset, readonly StrengthPr[]>();
export function strengthPrEvents(ds: Dataset): readonly StrengthPr[] {
  let v = strengthPrCache.get(ds);
  if (!v) {
    v = Object.freeze(computeStrengthPrs(ds));
    strengthPrCache.set(ds, v);
  }
  return v;
}
function computeStrengthPrs(ds: Dataset): StrengthPr[] {
  const out: StrengthPr[] = [];
  for (const ex of ds.exercises) {
    if (isCardio(ex)) continue;
    let bestW: number | null = null;
    let bestE: number | null = null;
    /** 重量 → 做到的最多次數（先前所有紀錄） */
    const repsAt = new Map<number, number>();
    const prevRepsAtLeast = (w: number) => {
      let r: number | null = null;
      for (const [k, n] of repsAt) if (k >= w && (r == null || n > r)) r = n;
      return r;
    };
    for (const h of entriesOf(ds, ex.id)) {
      const w = getMaxWeight(h.sets);
      const e1 = estimate1rm(h.sets, ex);
      const weightPr = w != null && bestW != null && w > bestW;
      if (weightPr)
        out.push({ kind: 'weight', exerciseId: ex.id, date: h.date, from: bestW as number, to: w });
      if (e1 != null && bestE != null && e1 > bestE)
        out.push({ kind: 'e1rm', exerciseId: ex.id, date: h.date, from: bestE, to: e1 });
      if (!weightPr) {
        let cand: { weightKg: number; reps: number; prevReps: number } | null = null;
        for (const s of h.sets) {
          if (s.reps == null) continue;
          const sw = s.weightKg ?? 0;
          const prev = prevRepsAtLeast(sw);
          if (prev == null || s.reps <= prev) continue;
          if (!cand || sw > cand.weightKg || (sw === cand.weightKg && s.reps > cand.reps))
            cand = { weightKg: sw, reps: s.reps, prevReps: prev };
        }
        if (cand) out.push({ kind: 'reps', exerciseId: ex.id, date: h.date, ...cand });
      }
      if (w != null && (bestW == null || w > bestW)) bestW = w;
      if (e1 != null && (bestE == null || e1 > bestE)) bestE = e1;
      for (const s of h.sets)
        if (s.reps != null) {
          const sw = s.weightKg ?? 0;
          repsAt.set(sw, Math.max(repsAt.get(sw) ?? 0, s.reps));
        }
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

const strengthPrByEntry = new WeakMap<Dataset, Map<string, StrengthPr[]>>();
/** 這筆紀錄的所有破紀錄（weight／reps／e1rm）；沒有回傳空陣列 */
export function entryStrengthPrs(ds: Dataset, entry: Pick<Entry, 'exerciseId' | 'date'>): StrengthPr[] {
  let m = strengthPrByEntry.get(ds);
  if (!m) {
    m = new Map();
    for (const p of strengthPrEvents(ds)) {
      const k = `${p.exerciseId}@${p.date}`;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    strengthPrByEntry.set(ds, m);
  }
  return m.get(`${entry.exerciseId}@${entry.date}`) ?? [];
}

/** 重量進步幅度：最後一次最高重量 − 第一次（有重量的紀錄不到 2 次時沒有） */
export function progressOf(ds: Dataset, exId: string): { first: number; last: number; delta: number } | null {
  const qs = entriesOf(ds, exId).filter((h) => getMaxWeight(h.sets));
  if (qs.length < 2) return null;
  const first = getMaxWeight((qs[0] as Entry).sets) ?? 0;
  const last = getMaxWeight((qs[qs.length - 1] as Entry).sets) ?? 0;
  return { first, last, delta: last - first };
}

/** 動作庫展開列的趨勢圖：每次的最高重量（有氧用分鐘），標出破紀錄的那幾次（有氧不計） */
export function trendPoints(ds: Dataset, ex: Exercise): { date: DateStr; value: number; pr: boolean }[] {
  const cardio = isCardio(ex);
  return entriesOf(ds, ex.id).flatMap((h) => {
    const value = cardio ? (h.minutes ?? null) : getMaxWeight(h.sets);
    return value == null ? [] : [{ date: h.date, value, pr: !cardio && !!entryPr(ds, h) }];
  });
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
      const v = entryVolume(x, ex);
      return v == null ? [] : [[x.date, v] as [DateStr, number]];
    }),
    secondary: h.flatMap((x) => {
      const v = getMaxWeight(x.sets);
      return v == null ? [] : [[x.date, v] as [DateStr, number]];
    }),
  };
}
