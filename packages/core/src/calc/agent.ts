// 給 AI agent 查詢用的純函式（WebMCP 工具、llms.txt、日後的 /mcp 端點共用）
// 回傳值一律是可 JSON 序列化的一般物件，欄位名稱用英文、數值單位寫在欄位名或說明裡。
import { addDays, daysBetween, DATE_RE, dowOf, mondayOf, type DateStr } from '../dates';
import type { Dataset, DayVideo, Entry, Exercise, VideoSegment } from '../domain/types';
import { compareDays, dayGroups, daySets, dayVol } from './days';
import { streakWeeks, weekSeries } from './dashboard';
import {
  entriesOf,
  neglectedExercises,
  prEvents,
  progressOf,
  sortExercises,
  SORT_KEYS,
  statusOf,
  summarize,
  type ExerciseStatus,
  type SortKey,
} from './exercises';
import { exhaustionBucket } from './labels';
import { calcVolume, entryPerSide, formatSets, getMaxWeight, isCardio } from './sets';
import { entryVideo, exerciseVideos, youtubeUrl } from './videos';
import { stripJournalHeading } from '../adapters/fromRawJson';

export interface AgentEntry {
  date: DateStr;
  exerciseId: string;
  exercise: string;
  group: string;
  /** 純文字的組數，例如「80kg×6 / 3×5 (85kg)」 */
  setsText: string;
  sets: { weightKg: number | null; reps: number | null }[];
  /** 重量是每邊（一手／一腳／一側） */
  perSide: boolean;
  repUnit?: string;
  maxWeightKg: number | null;
  volumeKg: number | null;
  feel?: string;
  exhaustion?: string;
  condition?: string;
  cue?: string;
  minutes?: number | null;
  distanceKm?: number;
  /** 這筆紀錄在當天影片中的各段（每段有直接跳到那裡的網址）；沒拍到就沒有這個欄位 */
  video?: { url: string; segments: AgentSegment[] };
}

export interface AgentSegment {
  exercise: string;
  label: string;
  set?: number;
  side?: string;
  startSec: number;
  endSec: number;
  url: string;
}

/** 正式網站網址（回傳給 AI 的頁面連結用） */
export const SITE_URL = 'https://trainlog.x-hu.com';
export const dayPageUrl = (date: DateStr) => `${SITE_URL}/days/${date}`;

const exOf = (ds: Dataset, id: string): Exercise | undefined => ds.exerciseById.get(id);

const segOut = (ds: Dataset, youtubeId: string, s: VideoSegment): AgentSegment => ({
  exercise: exOf(ds, s.exerciseId)?.name ?? s.exerciseId,
  label: s.label,
  ...(s.set != null ? { set: s.set } : {}),
  ...(s.side ? { side: s.side } : {}),
  startSec: s.start,
  endSec: s.end,
  url: youtubeUrl(youtubeId, s.start),
});

/** 一天的影片：整支影片網址＋每一段 */
function dayVideoOut(ds: Dataset, v: DayVideo) {
  return {
    title: v.title,
    url: youtubeUrl(v.youtubeId),
    durationSec: v.durationSec,
    orientation: v.height > v.width ? 'portrait' : 'landscape',
    segments: v.segments.map((s) => segOut(ds, v.youtubeId, s)),
  };
}

export function agentEntry(ds: Dataset, e: Entry): AgentEntry {
  const ex = exOf(ds, e.exerciseId);
  return {
    date: e.date,
    exerciseId: e.exerciseId,
    exercise: ex?.name ?? e.exerciseId,
    group: ex?.group ?? '',
    setsText: ex ? formatSets(e, ex) : '',
    sets: e.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })),
    perSide: ex ? entryPerSide(e, ex) : false,
    ...(ex?.repUnit ? { repUnit: ex.repUnit } : {}),
    maxWeightKg: getMaxWeight(e.sets),
    volumeKg: calcVolume(e.sets),
    ...(e.feel ? { feel: e.feel } : {}),
    ...(e.exhaustion ? { exhaustion: e.exhaustion } : {}),
    ...(e.condition ? { condition: e.condition } : {}),
    ...(e.cue ? { cue: e.cue } : {}),
    ...(e.minutes != null ? { minutes: e.minutes } : {}),
    ...(e.distanceKm != null ? { distanceKm: e.distanceKm } : {}),
    ...(() => {
      const ev = entryVideo(ds, e);
      if (!ev) return {};
      const first = ev.segments[0];
      return {
        video: {
          url: youtubeUrl(ev.video.youtubeId, first?.start ?? 0),
          segments: ev.segments.map((s) => segOut(ds, ev.video.youtubeId, s)),
        },
      };
    })(),
  };
}

/** 依 id、完全相同的名稱、或名稱包含關鍵字找動作（找不到回傳 undefined） */
export function findExercise(ds: Dataset, query: string): Exercise | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return (
    ds.exerciseById.get(query.trim()) ??
    ds.exercises.find((e) => e.name.toLowerCase() === q) ??
    ds.exercises.find((e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
  );
}

export function agentOverview(ds: Dataset, today: DateStr) {
  const dates = ds.trainingDates;
  const last = dates[dates.length - 1] ?? null;
  const inLast = (n: number) => dates.filter((d) => d > addDays(today, -n) && d <= today).length;
  const between = (a: DateStr, b: DateStr) => dates.filter((d) => d >= a && d <= b).length;
  const prs = prEvents(ds);
  return {
    site: 'TrainLog — 個人重量訓練紀錄',
    today,
    firstDate: dates[0] ?? null,
    lastDate: last,
    trainingDays: dates.length,
    trainingDaysLast7: inLast(7),
    trainingDaysLast30: inLast(30),
    /** 本週（週一到今天）與上週同期的訓練日數 */
    thisWeekDays: between(mondayOf(today), today),
    lastWeekSamePeriodDays: between(addDays(mondayOf(today), -7), addDays(today, -7)),
    /** 連續有訓練的週數（本週還沒練就從上週數） */
    streakWeeks: streakWeeks(ds, today),
    exerciseCount: ds.exercises.length,
    groups: ds.groupOrder,
    /** 每個部位上次練的日期 */
    groupLastTrained: ds.groupOrder.map((g) => {
      const d = [...dates].reverse().find((x) => x <= today && dayGroups(ds, x).includes(g)) ?? null;
      return { group: g, lastDate: d, daysAgo: d ? daysBetween(d, today) : null };
    }),
    /** 久未練：練過 ≥3 次、距上次 >21 天 */
    neglectedExercises: neglectedExercises(ds, today, 10).map((e) => ({
      id: e.id,
      name: e.name,
      lastDate: entriesOf(ds, e.id).at(-1)?.date ?? null,
    })),
    recentDays: dates
      .slice(-7)
      .reverse()
      .map((d) => daySummary(ds, d)),
    // prEvents 已依日期由新到舊排序
    recentPRs: prs.slice(0, 10).map((p) => ({
      date: p.date,
      exerciseId: p.exerciseId,
      exercise: exOf(ds, p.exerciseId)?.name ?? p.exerciseId,
      fromKg: p.from,
      toKg: p.to,
    })),
  };
}

export function daySummary(ds: Dataset, date: DateStr) {
  const entries = ds.entriesByDate.get(date) ?? [];
  const video = ds.videosByDate.get(date);
  return {
    date,
    weekday: `週${dowOf(date)}`,
    groups: dayGroups(ds, date),
    exercises: entries.map((e) => exOf(ds, e.exerciseId)?.name ?? e.exerciseId),
    sets: daySets(ds, date),
    volumeKg: dayVol(ds, date),
    hasJournal: ds.journals.has(date),
    videoUrl: video ? youtubeUrl(video.youtubeId) : null,
    pageUrl: dayPageUrl(date),
  };
}

export interface ListExercisesArgs {
  group?: string;
  query?: string;
  /** 7＝近 7 天練過、30＝8–30 天、old＝超過 30 天 */
  status?: ExerciseStatus;
  sort?: SortKey;
  limit?: number;
}

export function agentListExercises(ds: Dataset, today: DateStr, args: ListExercisesArgs = {}) {
  const q = args.query?.trim().toLowerCase();
  const sort = args.sort && SORT_KEYS.includes(args.sort) ? args.sort : 'group';
  return sortExercises(ds, sort)
    .filter((e) => !args.group || e.group === args.group)
    .filter((e) => !q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
    .filter((e) => !args.status || statusOf(ds, e.id, today) === args.status)
    .slice(0, clampLimit(args.limit, 500))
    .map((e) => {
      const s = summarize(ds, e, today);
      const pg = progressOf(ds, e.id);
      return {
        id: e.id,
        name: e.name,
        group: e.group,
        kind: e.kind,
        sessions: s.sessions,
        lastDate: s.lastDate,
        daysAgo: s.daysAgo,
        latestWeightKg: s.latestWeight,
        maxWeightKg: s.maxWeight || null,
        totalVolumeKg: s.totalVolume || null,
        ...(pg ? { progressKg: pg } : {}),
        ...(isCardio(e) ? { cardioTotal: { minutes: s.cardio.mins, km: s.cardio.km } } : {}),
        ...(e.notes.length ? { notes: e.notes } : {}),
      };
    });
}

export interface ExerciseHistoryArgs {
  exercise: string;
  from?: DateStr;
  to?: DateStr;
  /** 只取最新的 N 筆（預設 20，最多 500） */
  limit?: number;
}

export function agentExerciseHistory(ds: Dataset, args: ExerciseHistoryArgs) {
  const ex = findExercise(ds, args.exercise);
  if (!ex) return { error: `找不到動作「${args.exercise}」。先用 list_exercises 取得動作 id。` };
  const limit = Math.min(Math.max(1, args.limit ?? 20), 500);
  const all = entriesOf(ds, ex.id).filter(
    (e) => (!args.from || e.date >= args.from) && (!args.to || e.date <= args.to),
  );
  const prs = prEvents(ds).filter((p) => p.exerciseId === ex.id);
  const hist = entriesOf(ds, ex.id);
  const best = bestOf(hist);
  const pg = progressOf(ds, ex.id);
  return {
    exercise: { id: ex.id, name: ex.name, group: ex.group, kind: ex.kind, notes: ex.notes },
    summary: {
      sessions: hist.length,
      firstDate: hist[0]?.date ?? null,
      lastDate: hist.at(-1)?.date ?? null,
      bestWeightKg: best?.weight ?? null,
      bestDate: best?.date ?? null,
      ...(pg ? { progressKg: pg } : {}),
      videoDays: exerciseVideos(ds, ex.id).length,
    },
    totalMatching: all.length,
    entries: all
      .slice(-limit)
      .reverse()
      .map((e) => agentEntry(ds, e)),
    prs: prs.map((p) => ({ date: p.date, fromKg: p.from, toKg: p.to })),
  };
}

export function agentDay(ds: Dataset, date: DateStr) {
  if (!DATE_RE.test(date)) return { error: '日期格式需為 YYYY-MM-DD' };
  const entries = ds.entriesByDate.get(date) ?? [];
  const journal = ds.journals.get(date);
  const video = ds.videosByDate.get(date);
  if (!entries.length && !journal)
    return {
      error: `${date} 沒有訓練紀錄`,
      nearest: {
        before: [...ds.trainingDates].reverse().find((d) => d < date) ?? null,
        after: ds.trainingDates.find((d) => d > date) ?? null,
      },
    };
  return {
    ...daySummary(ds, date),
    entries: entries.map((e) => agentEntry(ds, e)),
    journal: journal ? stripJournalHeading(journal).trim() : null,
    video: video ? dayVideoOut(ds, video) : null,
  };
}

export interface JournalsArgs {
  from?: DateStr;
  to?: DateStr;
  /** 只要包含這些關鍵字（空白分隔＝都要出現）的日誌 */
  query?: string;
  /** 只取最新的 N 篇（預設 10，最多 100） */
  limit?: number;
}

/** 日誌全文（新到舊）：包含沒有訓練、只寫了日誌的日子 */
export function agentJournals(ds: Dataset, args: JournalsArgs = {}) {
  const terms = (args.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const dates = [...ds.journals.keys()]
    .filter((d) => (!args.from || d >= args.from) && (!args.to || d <= args.to))
    .filter((d) => {
      if (!terms.length) return true;
      const t = (ds.journals.get(d) ?? '').toLowerCase();
      return terms.every((x) => t.includes(x));
    })
    .sort((a, b) => b.localeCompare(a));
  return {
    totalMatching: dates.length,
    journals: dates.slice(0, clampLimit(args.limit, 10, 100)).map((d) => ({
      date: d,
      weekday: `週${dowOf(d)}`,
      exercises: (ds.entriesByDate.get(d) ?? []).map((e) => exOf(ds, e.exerciseId)?.name ?? e.exerciseId),
      videoUrl: ds.videosByDate.has(d) ? youtubeUrl((ds.videosByDate.get(d) as DayVideo).youtubeId) : null,
      pageUrl: dayPageUrl(d),
      text: stripJournalHeading(ds.journals.get(d) ?? '').trim(),
    })),
  };
}

export interface SearchDaysArgs {
  from?: DateStr;
  to?: DateStr;
  exercise?: string;
  group?: string;
  /** true＝只要有影片的日子、false＝只要沒影片的日子 */
  hasVideo?: boolean;
  /** 每天附上日誌全文 */
  includeJournal?: boolean;
  /** 只取最新的 N 天（預設 30，最多 500） */
  limit?: number;
}

export function agentSearchDays(ds: Dataset, args: SearchDaysArgs = {}) {
  const ex = args.exercise ? findExercise(ds, args.exercise) : undefined;
  if (args.exercise && !ex) return { error: `找不到動作「${args.exercise}」` };
  const limit = Math.min(Math.max(1, args.limit ?? 30), 500);
  const days = ds.trainingDates.filter((d) => {
    if (args.from && d < args.from) return false;
    if (args.to && d > args.to) return false;
    const es = ds.entriesByDate.get(d) ?? [];
    if (ex && !es.some((e) => e.exerciseId === ex.id)) return false;
    if (args.group && !dayGroups(ds, d).includes(args.group)) return false;
    if (args.hasVideo != null && ds.videosByDate.has(d) !== args.hasVideo) return false;
    return true;
  });
  return {
    totalMatching: days.length,
    days: days
      .slice(-limit)
      .reverse()
      .map((d) => {
        const j = args.includeJournal ? ds.journals.get(d) : undefined;
        return { ...daySummary(ds, d), ...(j ? { journal: stripJournalHeading(j).trim() } : {}) };
      }),
  };
}

const bestOf = (entries: readonly Entry[]) => {
  let best: { weight: number; date: DateStr } | null = null;
  for (const e of entries) {
    const w = getMaxWeight(e.sets);
    if (w != null && (!best || w > best.weight)) best = { weight: w, date: e.date };
  }
  return best;
};

const clampLimit = (v: number | undefined, def: number, max = 500) => Math.min(Math.max(1, v ?? def), max);

export interface PeriodArgs {
  from?: DateStr;
  to?: DateStr;
  /** 沒給 from 時：最近 N 天（含 to；預設 30） */
  days?: number;
}

/** 一段期間的統計，並和前一段同長度的期間比較 */
export function agentPeriodStats(ds: Dataset, today: DateStr, args: PeriodArgs = {}) {
  const to = args.to && DATE_RE.test(args.to) ? args.to : today;
  const from =
    args.from && DATE_RE.test(args.from) ? args.from : addDays(to, -(clampLimit(args.days, 30, 3660) - 1));
  if (from > to) return { error: 'from 不能晚於 to' };
  const len = daysBetween(from, to) + 1;
  const stats = (a: DateStr, b: DateStr) => {
    const dates = ds.trainingDates.filter((d) => d >= a && d <= b);
    const entries = dates.flatMap((d) => ds.entriesByDate.get(d) ?? []);
    const setsByGroup: Record<string, number> = {};
    const exhaustion: Record<string, number> = {};
    const exerciseCount: Record<string, number> = {};
    for (const e of entries) {
      const ex = exOf(ds, e.exerciseId);
      const g = ex?.group ?? '';
      setsByGroup[g] = (setsByGroup[g] ?? 0) + Math.max(1, e.sets.length);
      const k = exhaustionBucket(e.exhaustion);
      exhaustion[k] = (exhaustion[k] ?? 0) + 1;
      const n = ex?.name ?? e.exerciseId;
      exerciseCount[n] = (exerciseCount[n] ?? 0) + 1;
    }
    const prs = prEvents(ds).filter((p) => p.date >= a && p.date <= b);
    return {
      from: a,
      to: b,
      trainingDays: dates.length,
      sets: entries.reduce((s, e) => s + e.sets.length, 0),
      volumeKg: entries.reduce((s, e) => s + (calcVolume(e.sets) ?? 0), 0),
      setsByGroup,
      exhaustion,
      exercises: Object.entries(exerciseCount)
        .sort((x, y) => y[1] - x[1])
        .map(([name, times]) => ({ name, times })),
      conditions: [
        ...new Set(entries.map((e) => e.condition).filter((c): c is string => !!c && c !== '正常')),
      ],
      prs: prs.map((p) => ({
        date: p.date,
        exercise: exOf(ds, p.exerciseId)?.name ?? p.exerciseId,
        fromKg: p.from,
        toKg: p.to,
      })),
      dates,
    };
  };
  const cur = stats(from, to);
  const prev = stats(addDays(from, -len), addDays(from, -1));
  return {
    period: cur,
    previousPeriod: {
      from: prev.from,
      to: prev.to,
      trainingDays: prev.trainingDays,
      sets: prev.sets,
      volumeKg: prev.volumeKg,
      prCount: prev.prs.length,
    },
  };
}

/** 每週（週一到週日）的訓練日數、組數、容量與破紀錄次數，舊到新 */
export function agentWeeklyVolume(ds: Dataset, today: DateStr, args: { weeks?: number } = {}) {
  const prs = prEvents(ds);
  return weekSeries(ds, today, clampLimit(args.weeks, 12, 104)).map((w) => ({
    weekStart: w.w,
    trainingDays: w.days,
    sets: w.sets,
    volumeKg: w.vol,
    prCount: prs.filter((p) => p.date >= w.w && p.date <= addDays(w.w, 6)).length,
  }));
}

export interface RecordsArgs {
  exercise?: string;
  group?: string;
  from?: DateStr;
  to?: DateStr;
  limit?: number;
}

/** 破紀錄事件（新到舊）＋每個動作目前的最高重量 */
export function agentPersonalRecords(ds: Dataset, args: RecordsArgs = {}) {
  const ex = args.exercise ? findExercise(ds, args.exercise) : undefined;
  if (args.exercise && !ex) return { error: `找不到動作「${args.exercise}」` };
  const keep = (id: string) => (!ex || id === ex.id) && (!args.group || exOf(ds, id)?.group === args.group);
  const events = prEvents(ds)
    .filter((p) => keep(p.exerciseId))
    .filter((p) => (!args.from || p.date >= args.from) && (!args.to || p.date <= args.to));
  const bests = ds.exercises
    .filter((e) => !isCardio(e) && keep(e.id))
    .flatMap((e) => {
      const b = bestOf(entriesOf(ds, e.id));
      return b
        ? [{ exerciseId: e.id, exercise: e.name, group: e.group, bestWeightKg: b.weight, date: b.date }]
        : [];
    });
  return {
    totalEvents: events.length,
    events: events.slice(0, clampLimit(args.limit, 50)).map((p) => ({
      date: p.date,
      exerciseId: p.exerciseId,
      exercise: exOf(ds, p.exerciseId)?.name ?? p.exerciseId,
      fromKg: p.from,
      toKg: p.to,
    })),
    currentBests: bests,
  };
}

/** 兩天並排比較：各自的紀錄、共同動作在另一天的重量與容量 */
export function agentCompareDays(ds: Dataset, a: DateStr, b: DateStr) {
  if (!DATE_RE.test(a) || !DATE_RE.test(b)) return { error: '日期格式需為 YYYY-MM-DD' };
  const c = compareDays(ds, a, b);
  const row = (r: (typeof c.a)[number]) => ({
    ...agentEntry(ds, r.entry),
    other: r.other ? { maxWeightKg: r.other.maxWeight, volumeKg: r.other.volume } : null,
  });
  return {
    a: { ...daySummary(ds, a), entries: c.a.map(row) },
    b: { ...daySummary(ds, b), entries: c.b.map(row) },
    totalVolumeKg: { a: c.totalA, b: c.totalB },
    commonExercises: c.common,
  };
}

export type NoteSource = 'journal' | 'entry' | 'exercise';
export interface SearchNotesArgs {
  query: string;
  from?: DateStr;
  to?: DateStr;
  /** journal＝日誌原文、entry＝每筆紀錄的感受／力竭／身心狀態／教練提醒、exercise＝動作要點；預設全部 */
  sources?: NoteSource[];
  limit?: number;
}

/** 長文字只回傳關鍵字附近的一段 */
function snippet(text: string, term: string): string {
  if (text.length <= 400) return text;
  const i = Math.max(0, text.toLowerCase().indexOf(term));
  const a = Math.max(0, i - 120);
  const b = Math.min(text.length, i + 280);
  return (a > 0 ? '…' : '') + text.slice(a, b) + (b < text.length ? '…' : '');
}

/** 全文搜尋日誌、紀錄備註與動作要點；空白分隔的關鍵字都要出現（不分大小寫）；新到舊 */
export function agentSearchNotes(ds: Dataset, args: SearchNotesArgs) {
  const terms = args.query.toLowerCase().split(/\s+/).filter(Boolean);
  const first = terms[0];
  if (!first) return { error: 'query 不能是空的' };
  const src = new Set<NoteSource>(args.sources?.length ? args.sources : ['journal', 'entry', 'exercise']);
  const inDate = (d: DateStr) => (!args.from || d >= args.from) && (!args.to || d <= args.to);
  const hit = (t: string) => {
    const low = t.toLowerCase();
    return terms.every((x) => low.includes(x));
  };
  const out: { source: NoteSource; date?: DateStr; exercise?: string; field?: string; text: string }[] = [];
  if (src.has('journal'))
    for (const [d, raw] of ds.journals) {
      if (!inDate(d)) continue;
      const t = stripJournalHeading(raw);
      if (hit(t)) out.push({ source: 'journal', date: d, text: snippet(t, first) });
    }
  if (src.has('entry'))
    for (const [d, es] of ds.entriesByDate) {
      if (!inDate(d)) continue;
      for (const e of es)
        for (const field of ['feel', 'cue', 'condition', 'exhaustion'] as const) {
          const t = e[field];
          const name = exOf(ds, e.exerciseId)?.name ?? e.exerciseId;
          if (t && hit(`${name} ${t}`))
            out.push({ source: 'entry', date: d, exercise: name, field, text: t });
        }
    }
  if (src.has('exercise') && !args.from && !args.to)
    for (const ex of ds.exercises)
      for (const n of ex.notes)
        if (hit(`${ex.name} ${n}`)) out.push({ source: 'exercise', exercise: ex.name, text: n });
  out.sort((x, y) => (y.date ?? '').localeCompare(x.date ?? ''));
  return { totalMatching: out.length, results: out.slice(0, clampLimit(args.limit, 30, 200)) };
}

/** 訓練影片：某一天的影片（含各段章節）、某個動作所有拍了影片的日子，或最近的影片清單 */
export function agentVideos(ds: Dataset, args: { date?: DateStr; exercise?: string; limit?: number } = {}) {
  if (args.exercise) {
    const ex = findExercise(ds, args.exercise);
    if (!ex) return { error: `找不到動作「${args.exercise}」` };
    const list = exerciseVideos(ds, ex.id);
    return {
      exercise: ex.name,
      totalDays: list.length,
      videos: list.slice(0, clampLimit(args.limit, 20)).map((v) => ({
        date: v.video.date,
        url: youtubeUrl(v.video.youtubeId, v.segments[0]?.start ?? 0),
        segments: v.segments.map((s) => segOut(ds, v.video.youtubeId, s)),
      })),
    };
  }
  if (args.date) {
    const v = ds.videosByDate.get(args.date);
    if (!v) return { error: `${args.date} 沒有影片` };
    return { date: v.date, pageUrl: dayPageUrl(v.date), ...dayVideoOut(ds, v) };
  }
  const days = [...ds.videosByDate.values()].sort((a, b) => b.date.localeCompare(a.date));
  return {
    totalDays: days.length,
    videos: days.slice(0, clampLimit(args.limit, 20)).map((v) => ({
      date: v.date,
      url: youtubeUrl(v.youtubeId),
      durationSec: v.durationSec,
      exercises: [...new Set(v.segments.map((s) => exOf(ds, s.exerciseId)?.name ?? s.exerciseId))],
    })),
  };
}
