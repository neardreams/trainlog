// 給 AI agent 查詢用的純函式（WebMCP 工具、llms.txt、/mcp 端點共用）
// 回傳值一律是可 JSON 序列化的一般物件，欄位名稱用英文、數值單位寫在欄位名或說明裡。
import { addDays, daysBetween, DATE_RE, dowOf, mondayOf, type DateStr } from '../dates';
import type { Dataset, DayVideo, Entry, Exercise, VideoSegment } from '../domain/types';
import { PATTERN_LABELS, PATTERNS, type Muscle, type Pattern } from '../domain/taxonomy';
import { compareDays, dayGroups, daySets, dayVol, latestTrainingDate } from './days';
import { streakWeeks, weekSeries } from './dashboard';
import {
  entriesOf,
  entryStrengthPrs,
  familyMembers,
  neglectedExercises,
  prevEntries,
  progressOf,
  sortExercises,
  SORT_KEYS,
  statusOf,
  strengthPrEvents,
  summarize,
  type ExerciseStatus,
  type PrKind,
  type SortKey,
  type StrengthPr,
} from './exercises';
import { exhaustionBucket } from './labels';
import { parseCardio, parseRir, rirBucket, rirMin, type CardioMetrics, type RirReading } from './notes';
import {
  entryPerSide,
  estimate1rm,
  formatSets,
  formatWarmupSets,
  getMaxWeight,
  isCardio,
  unitTotal,
  volOf,
} from './sets';
import { entryVideo, exerciseVideos, youtubeUrl } from './videos';
import { stripJournalHeading } from '../adapters/fromRawJson';

export interface AgentEntry {
  /** 單日查詢時省略（外層已有日期） */
  date?: DateStr;
  /** 單一動作的歷程省略（外層已有動作） */
  exerciseId?: string;
  exercise?: string;
  group?: string;
  /** 當天第幾個做的動作（1 起算）；舊資料沒有 */
  order?: number;
  /** 純文字的組數，例如「80kg×6 / 3×5 (85kg)」 */
  setsText: string;
  sets: { weightKg: number | null; reps: number | null }[];
  /** 熱身組（不算進組數、容量、最高重量）；沒有熱身組就沒有這兩個欄位 */
  warmupSetsText?: string;
  warmupSets?: { weightKg: number | null; reps: number | null }[];
  /** 重量是每邊（一手／一腳／一側） */
  perSide: boolean;
  /** 重量記合計、次數記每邊（左右輪流） */
  repsPerSide?: boolean;
  repUnit?: string;
  maxWeightKg: number | null;
  /** 推估 1RM（Epley，只算 1–12 下的組；重量記法同 maxWeightKg） */
  e1rmKg?: number;
  /** 容量：Σ 重量×次數，左右兩邊都算（每邊重量或每邊次數 ×2）；有氧與秒數／米數動作是 null */
  volumeKg: number | null;
  /** 秒數動作：所有組的秒數合計 */
  totalSec?: number;
  /** 米數動作：所有組的米數合計；有重量時另有 kgMeters（Σ 重量×米） */
  totalMeters?: number;
  kgMeters?: number;
  /** 這筆紀錄的破紀錄（weight 最高重量／reps 同重量更多次／e1rm 推估 1RM） */
  prs?: AgentPr[];
  feel?: string;
  /** 從感受文字解析出的 RIR（左右分開記時有 side）；rirMin 是最接近力竭的那個 */
  rir?: RirReading[];
  rirMin?: number;
  exhaustion?: string;
  condition?: string;
  cue?: string;
  minutes?: number | null;
  distanceKm?: number;
  /** 有氧：從組數文字解析出的速度、坡度、心率… */
  cardio?: CardioMetrics;
  /** 這筆紀錄在當天影片中的各段（每段有直接跳到那裡的網址）；沒拍到就沒有這個欄位 */
  video?: { url: string; segments: AgentSegment[] };
}

export type AgentPr =
  | { kind: 'weight' | 'e1rm'; fromKg: number; toKg: number }
  | { kind: 'reps'; weightKg: number; prevReps: number; reps: number };

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
const nameOf = (ds: Dataset, id: string) => exOf(ds, id)?.name ?? id;

const segOut = (ds: Dataset, youtubeId: string, s: VideoSegment): AgentSegment => ({
  exercise: nameOf(ds, s.exerciseId),
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

const prOut = (p: StrengthPr): AgentPr =>
  p.kind === 'reps'
    ? { kind: 'reps', weightKg: p.weightKg ?? 0, prevReps: p.prevReps ?? 0, reps: p.reps ?? 0 }
    : { kind: p.kind, fromKg: p.from ?? 0, toKg: p.to ?? 0 };

/** 破紀錄事件（附日期與動作）給清單用 */
const prEventOut = (ds: Dataset, p: StrengthPr) => ({
  date: p.date,
  exerciseId: p.exerciseId,
  exercise: nameOf(ds, p.exerciseId),
  ...prOut(p),
});

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface AgentEntryOmit {
  /** 省略 date（單日查詢） */
  date?: boolean;
  /** 省略 exerciseId、exercise、group（單一動作的歷程） */
  exercise?: boolean;
}

export function agentEntry(ds: Dataset, e: Entry, omit: AgentEntryOmit = {}): AgentEntry {
  const ex = exOf(ds, e.exerciseId);
  const total = unitTotal(e, ex);
  const meters = ex?.repUnit === '米';
  const kgM =
    meters && e.sets.length && e.sets.every((s) => s.weightKg != null && s.reps != null)
      ? e.sets.reduce((t, s) => t + (s.weightKg ?? 0) * (s.reps ?? 0), 0)
      : null;
  const e1 = estimate1rm(e.sets, ex);
  const prs = entryStrengthPrs(ds, e);
  const rir = parseRir(e.feel);
  const cardio = isCardio(ex) ? parseCardio([e.setsDisplay, e.feel].filter(Boolean).join(' · ')) : {};
  return {
    ...(omit.date ? {} : { date: e.date }),
    ...(omit.exercise
      ? {}
      : { exerciseId: e.exerciseId, exercise: ex?.name ?? e.exerciseId, group: ex?.group ?? '' }),
    ...(e.order != null ? { order: e.order } : {}),
    setsText: ex ? formatSets(e, ex) : '',
    sets: e.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })),
    ...(e.warmupSets?.length
      ? {
          warmupSetsText: ex ? formatWarmupSets(e, ex) : '',
          warmupSets: e.warmupSets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })),
        }
      : {}),
    perSide: ex ? entryPerSide(e, ex) : false,
    ...(ex?.repsPerSide ? { repsPerSide: true } : {}),
    ...(ex?.repUnit ? { repUnit: ex.repUnit } : {}),
    maxWeightKg: getMaxWeight(e.sets),
    ...(e1 != null ? { e1rmKg: e1 } : {}),
    volumeKg: volOf(ds, e),
    ...(total != null ? (meters ? { totalMeters: total } : { totalSec: total }) : {}),
    ...(kgM ? { kgMeters: round1(kgM) } : {}),
    ...(prs.length ? { prs: prs.map(prOut) } : {}),
    ...(e.feel ? { feel: e.feel } : {}),
    ...(rir.length ? { rir, rirMin: rirMin(rir) as number } : {}),
    ...(e.exhaustion ? { exhaustion: e.exhaustion } : {}),
    ...(e.condition ? { condition: e.condition } : {}),
    ...(e.cue ? { cue: e.cue } : {}),
    ...(e.minutes != null ? { minutes: e.minutes } : {}),
    ...(e.distanceKm != null ? { distanceKm: e.distanceKm } : {}),
    ...(Object.keys(cardio).length ? { cardio } : {}),
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

/** 動作的簡短資料（候選清單、同型動作用） */
export interface ExerciseRef {
  id: string;
  name: string;
  sessions: number;
  lastDate: DateStr | null;
}
const refOf = (ds: Dataset, e: Exercise): ExerciseRef => {
  const h = entriesOf(ds, e.id);
  return { id: e.id, name: e.name, sessions: h.length, lastDate: h.at(-1)?.date ?? null };
};

/**
 * 依 id、完全相同的名稱、或名稱／id 包含關鍵字找動作。
 * 關鍵字對到多個動作時取訓練次數最多的（再比最近練的），其他放在 others，讓 AI 知道可能找錯。
 */
export function resolveExercise(
  ds: Dataset,
  query: string,
): { ex: Exercise; others: ExerciseRef[] } | undefined {
  const raw = query.trim();
  const q = raw.toLowerCase();
  if (!q) return undefined;
  const exact = ds.exerciseById.get(raw) ?? ds.exercises.find((e) => e.name.toLowerCase() === q);
  if (exact) return { ex: exact, others: [] };
  const hits = ds.exercises
    .filter((e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
    .map((e) => ({ e, r: refOf(ds, e) }))
    .sort((a, b) => b.r.sessions - a.r.sessions || (b.r.lastDate ?? '').localeCompare(a.r.lastDate ?? ''));
  const [top, ...rest] = hits;
  return top ? { ex: top.e, others: rest.slice(0, 8).map((h) => h.r) } : undefined;
}

/** 找動作（找不到回傳 undefined）；對到多個時見 resolveExercise */
export function findExercise(ds: Dataset, query: string): Exercise | undefined {
  return resolveExercise(ds, query)?.ex;
}

const notFound = (q: string) => ({
  error: `找不到動作「${q}」。先用 list_exercises 取得動作 id。`,
});
/** 關鍵字對到多個動作時附上其他候選 */
const otherMatches = (others: ExerciseRef[]) => (others.length ? { otherMatches: others } : {});

export function agentOverview(ds: Dataset, today: DateStr) {
  const dates = ds.trainingDates;
  const last = dates[dates.length - 1] ?? null;
  const inLast = (n: number) => dates.filter((d) => d > addDays(today, -n) && d <= today).length;
  const between = (a: DateStr, b: DateStr) => dates.filter((d) => d >= a && d <= b).length;
  const lastByPattern = new Map<Pattern, DateStr>();
  for (const d of dates) {
    if (d > today) continue;
    for (const e of ds.entriesByDate.get(d) ?? []) {
      const p = exOf(ds, e.exerciseId)?.pattern;
      if (p) lastByPattern.set(p, d);
    }
  }
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
    /** 每個動作模式上次練的日期（啟動／矯正與有氧不列） */
    patternLastTrained: PATTERNS.filter((p) => p !== 'activation' && p !== 'cardio').map((p) => {
      const d = lastByPattern.get(p) ?? null;
      return { pattern: p, label: PATTERN_LABELS[p], lastDate: d, daysAgo: d ? daysBetween(d, today) : null };
    }),
    /** 久未練：練過 ≥3 次、距上次 >21 天；不再做的動作、同型動作 21 天內練過的不算 */
    neglectedExercises: neglectedExercises(ds, today, 10).map((e) => ({
      id: e.id,
      name: e.name,
      lastDate: entriesOf(ds, e.id).at(-1)?.date ?? null,
    })),
    recentDays: dates
      .slice(-7)
      .reverse()
      .map((d) => daySummary(ds, d)),
    /** 最近 10 次破紀錄：weight＝最高重量、reps＝同重量（或更重）做更多下 */
    recentPRs: strengthPrEvents(ds)
      .filter((p) => p.kind !== 'e1rm')
      .slice(0, 10)
      .map((p) => prEventOut(ds, p)),
  };
}

export function daySummary(ds: Dataset, date: DateStr) {
  const entries = ds.entriesByDate.get(date) ?? [];
  const video = ds.videosByDate.get(date);
  return {
    date,
    weekday: `週${dowOf(date)}`,
    groups: dayGroups(ds, date),
    /** 依實際執行順序 */
    exercises: entries.map((e) => nameOf(ds, e.exerciseId)),
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
  pattern?: Pattern;
  /** 主要或次要肌群包含這個 */
  muscle?: string;
  /** 包含不再做的動作（預設 true） */
  includeArchived?: boolean;
  sort?: SortKey;
  limit?: number;
}

/** 動作的分類欄位（有標才有） */
const taxonomyOut = (e: Exercise) => ({
  ...(e.pattern ? { pattern: e.pattern } : {}),
  ...(e.muscles.length ? { muscles: e.muscles } : {}),
  ...(e.secondaryMuscles.length ? { secondaryMuscles: e.secondaryMuscles } : {}),
  ...(e.family ? { family: e.family } : {}),
  ...(e.archived ? { archived: true } : {}),
});

const bestE1rmOf = (ds: Dataset, ex: Exercise, entries: readonly Entry[]) => {
  let best: { kg: number; date: DateStr } | null = null;
  for (const h of entries) {
    const v = estimate1rm(h.sets, ex);
    if (v != null && (!best || v > best.kg)) best = { kg: v, date: h.date };
  }
  return best;
};

export function agentListExercises(ds: Dataset, today: DateStr, args: ListExercisesArgs = {}) {
  const q = args.query?.trim().toLowerCase();
  const sort = args.sort && SORT_KEYS.includes(args.sort) ? args.sort : 'group';
  const hasMuscle = (e: Exercise) =>
    !args.muscle ||
    e.muscles.includes(args.muscle as Muscle) ||
    e.secondaryMuscles.includes(args.muscle as Muscle);
  return sortExercises(ds, sort)
    .filter((e) => !args.group || e.group === args.group)
    .filter((e) => !q || e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q))
    .filter((e) => !args.status || statusOf(ds, e.id, today) === args.status)
    .filter((e) => !args.pattern || e.pattern === args.pattern)
    .filter(hasMuscle)
    .filter((e) => args.includeArchived !== false || !e.archived)
    .slice(0, clampLimit(args.limit, 500))
    .map((e) => {
      const s = summarize(ds, e, today);
      const pg = progressOf(ds, e.id);
      const e1 = bestE1rmOf(ds, e, entriesOf(ds, e.id));
      return {
        id: e.id,
        name: e.name,
        group: e.group,
        kind: e.kind,
        ...taxonomyOut(e),
        ...(e.perSide ? { perSide: true } : {}),
        ...(e.repsPerSide ? { repsPerSide: true } : {}),
        ...(e.repUnit ? { repUnit: e.repUnit } : {}),
        sessions: s.sessions,
        lastDate: s.lastDate,
        daysAgo: s.daysAgo,
        latestWeightKg: s.latestWeight,
        maxWeightKg: s.maxWeight || null,
        ...(e1 ? { bestE1rmKg: e1.kg } : {}),
        totalVolumeKg: s.totalVolume || null,
        ...(pg ? { progressKg: pg } : {}),
        ...(isCardio(e) ? { cardioTotal: { minutes: s.cardio.mins, km: s.cardio.km } } : {}),
        ...(e.notes.length ? { notes: e.notes } : {}),
      };
    });
}

export interface ExerciseHistoryArgs {
  exercise?: string;
  /** 一次查多個動作（最多 10 個）；有給時回傳 { results: [...] } */
  exercises?: string[];
  from?: DateStr;
  to?: DateStr;
  /** 每個動作只取最新的 N 筆（預設 20，最多 500） */
  limit?: number;
  /** 一併附上同型動作（family）的最近紀錄 */
  includeFamily?: boolean;
}

const bestOf = (entries: readonly Entry[]) => {
  let best: { weight: number; date: DateStr } | null = null;
  for (const e of entries) {
    const w = getMaxWeight(e.sets);
    if (w != null && (!best || w > best.weight)) best = { weight: w, date: e.date };
  }
  return best;
};

function oneHistory(ds: Dataset, query: string, args: ExerciseHistoryArgs) {
  if (!query.trim()) return { error: '請給 exercise（動作 id、名稱或關鍵字）或 exercises' };
  const r = resolveExercise(ds, query);
  if (!r) return notFound(query);
  const ex = r.ex;
  const limit = clampLimit(args.limit, 20);
  const inRange = (e: Entry) => (!args.from || e.date >= args.from) && (!args.to || e.date <= args.to);
  const hist = entriesOf(ds, ex.id);
  const all = hist.filter(inRange);
  const best = bestOf(hist);
  const e1 = bestE1rmOf(ds, ex, hist);
  const pg = progressOf(ds, ex.id);
  const fam = args.includeFamily ? familyMembers(ds, ex) : [];
  return {
    exercise: {
      id: ex.id,
      name: ex.name,
      group: ex.group,
      kind: ex.kind,
      ...taxonomyOut(ex),
      ...(ex.perSide ? { perSide: true } : {}),
      ...(ex.repsPerSide ? { repsPerSide: true } : {}),
      ...(ex.repUnit ? { repUnit: ex.repUnit } : {}),
      notes: ex.notes,
    },
    ...otherMatches(r.others),
    summary: {
      sessions: hist.length,
      firstDate: hist[0]?.date ?? null,
      lastDate: hist.at(-1)?.date ?? null,
      bestWeightKg: best?.weight ?? null,
      bestDate: best?.date ?? null,
      ...(e1 ? { bestE1rmKg: e1.kg, bestE1rmDate: e1.date } : {}),
      ...(pg ? { progressKg: pg } : {}),
      videoDays: exerciseVideos(ds, ex.id).length,
    },
    totalMatching: all.length,
    entries: all
      .slice(-limit)
      .reverse()
      .map((e) => agentEntry(ds, e, { exercise: true })),
    prs: strengthPrEvents(ds)
      .filter((p) => p.exerciseId === ex.id)
      .map((p) => ({ date: p.date, ...prOut(p) })),
    ...(familyMembers(ds, ex).length
      ? {
          /** 同型動作（同一個動作換器材或單雙邊）；includeFamily 時附最近紀錄 */
          family: familyMembers(ds, ex).map((m) => ({
            ...refOf(ds, m),
            ...(fam.includes(m)
              ? {
                  entries: entriesOf(ds, m.id)
                    .filter(inRange)
                    .slice(-limit)
                    .reverse()
                    .map((e) => agentEntry(ds, e, { exercise: true })),
                }
              : {}),
          })),
        }
      : {}),
  };
}

/** 單一動作的歷程（exercise）；找不到回傳 { error } */
export function agentExerciseHistory(ds: Dataset, args: ExerciseHistoryArgs) {
  return oneHistory(ds, args.exercise ?? '', args);
}

/** 一次查多個動作（exercises，加上 exercise 如果有給；最多 10 個）：{ results: [每個動作的歷程或 { error }] } */
export function agentExercisesHistory(ds: Dataset, args: ExerciseHistoryArgs) {
  const qs = [...(args.exercises ?? []), ...(args.exercise ? [args.exercise] : [])]
    .map((x) => x.trim())
    .filter(Boolean);
  return { results: [...new Set(qs)].slice(0, 10).map((q) => oneHistory(ds, q, args)) };
}

export interface DayArgs {
  /** 帶回每個動作的前幾次紀錄、先前最佳、動作要點與同型動作的最近一次 */
  includeRecentHistory?: boolean;
  /** 前幾次（1–5，預設 2，和網頁明細卡一樣）；有給就等於 includeRecentHistory */
  recentSessions?: number;
  /** 附上日誌全文（預設 true） */
  includeJournal?: boolean;
  /** date 沒給、或給 latest／today 時用 */
  today?: DateStr;
}

/** 某動作在某天之前的參考資料：前 n 次（新到舊）、先前最佳、動作要點、同型動作的最近一次 */
function recentHistory(ds: Dataset, e: Entry, n: number) {
  const ex = exOf(ds, e.exerciseId);
  const before = entriesOf(ds, e.exerciseId).filter((h) => h.date < e.date);
  const best = bestOf(before);
  const e1 = ex ? bestE1rmOf(ds, ex, before) : null;
  const family = ex
    ? familyMembers(ds, ex).flatMap((m) => {
        const last = entriesOf(ds, m.id)
          .filter((h) => h.date < e.date)
          .at(-1);
        return last
          ? [{ exerciseId: m.id, exercise: m.name, date: last.date, setsText: formatSets(last, m) }]
          : [];
      })
    : [];
  return {
    sessionsBefore: before.length,
    previous: prevEntries(ds, e, n).map((p) => {
      const v = estimate1rm(p.sets, ex);
      const rir = rirMin(parseRir(p.feel));
      const ev = entryVideo(ds, p);
      return {
        date: p.date,
        daysBefore: daysBetween(p.date, e.date),
        setsText: ex ? formatSets(p, ex) : '',
        maxWeightKg: getMaxWeight(p.sets),
        ...(v != null ? { e1rmKg: v } : {}),
        volumeKg: volOf(ds, p),
        ...(rir != null ? { rirMin: rir } : {}),
        ...(p.feel ? { feel: p.feel } : {}),
        ...(p.exhaustion ? { exhaustion: p.exhaustion } : {}),
        ...(ev ? { videoUrl: youtubeUrl(ev.video.youtubeId, ev.segments[0]?.start ?? 0) } : {}),
      };
    }),
    bestBefore: best
      ? {
          weightKg: best.weight,
          date: best.date,
          ...(e1 ? { e1rmKg: e1.kg, e1rmDate: e1.date } : {}),
        }
      : null,
    ...(ex?.notes.length ? { notes: ex.notes } : {}),
    ...(family.length ? { family } : {}),
  };
}

/**
 * 某一天的完整紀錄。date 沒給或給 latest 時取今天以前最近的訓練日，給 today 時取今天。
 */
export function agentDay(ds: Dataset, dateArg?: string, args: DayArgs = {}) {
  const today = args.today;
  const a = dateArg?.trim().toLowerCase();
  const date =
    !a || a === 'latest'
      ? today
        ? latestTrainingDate(ds, today)
        : (ds.trainingDates.at(-1) ?? null)
      : a === 'today'
        ? (today ?? null)
        : (dateArg as string).trim();
  if (!date) return { error: '沒有任何訓練紀錄' };
  if (!DATE_RE.test(date)) return { error: '日期格式需為 YYYY-MM-DD（或 latest、today）' };
  const entries = ds.entriesByDate.get(date) ?? [];
  // 有給 recentSessions 就等於要 recent；只給 includeRecentHistory 時預設前 2 次（和網頁明細卡一樣）
  const recentN =
    args.recentSessions != null || args.includeRecentHistory
      ? Math.min(Math.max(1, Math.round(args.recentSessions ?? 2)), 5)
      : 0;
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
    /** 當天熱身清單（滾筒、伸展、啟動動作…），和正式訓練分開 */
    warmups: ds.warmupsByDate.get(date) ?? [],
    /** 依實際執行順序（order） */
    entries: entries.map((e) => ({
      ...agentEntry(ds, e, { date: true }),
      ...(recentN ? { recent: recentHistory(ds, e, recentN) } : {}),
    })),
    ...(args.includeJournal === false
      ? {}
      : { journal: journal ? stripJournalHeading(journal).trim() : null }),
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
      exercises: (ds.entriesByDate.get(d) ?? []).map((e) => nameOf(ds, e.exerciseId)),
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
  const r = args.exercise ? resolveExercise(ds, args.exercise) : undefined;
  if (args.exercise && !r) return notFound(args.exercise);
  const ex = r?.ex;
  const limit = clampLimit(args.limit, 30);
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
    ...(ex ? { exercise: { id: ex.id, name: ex.name }, ...otherMatches(r?.others ?? []) } : {}),
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

const clampLimit = (v: number | undefined, def: number, max = 500) => Math.min(Math.max(1, v ?? def), max);

export interface PeriodArgs {
  from?: DateStr;
  to?: DateStr;
  /** 沒給 from 時：最近 N 天（含 to；預設 30） */
  days?: number;
}

const add = (o: Record<string, number>, k: string, n: number) => {
  o[k] = round1((o[k] ?? 0) + n);
};

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
    const setsByPattern: Record<string, number> = {};
    const setsByMuscle: Record<string, number> = {};
    const exhaustion: Record<string, number> = {};
    const rir: Record<string, number> = { '0': 0, '1': 0, '2': 0, '3+': 0 };
    const exerciseCount: Record<string, number> = {};
    const cardio = {
      sessions: 0,
      minutes: 0,
      km: 0,
      byExercise: {} as Record<string, number>,
      hr: [] as number[],
    };
    let rirEntries = 0;
    for (const e of entries) {
      const ex = exOf(ds, e.exerciseId);
      const g = ex?.group ?? '';
      setsByGroup[g] = (setsByGroup[g] ?? 0) + Math.max(1, e.sets.length);
      if (ex?.pattern && e.sets.length) add(setsByPattern, ex.pattern, e.sets.length);
      if (ex && !isCardio(ex) && e.sets.length) {
        for (const m of ex.muscles) add(setsByMuscle, m, e.sets.length);
        for (const m of ex.secondaryMuscles) add(setsByMuscle, m, e.sets.length * 0.5);
      }
      const k = exhaustionBucket(e.exhaustion);
      exhaustion[k] = (exhaustion[k] ?? 0) + 1;
      const rm = rirMin(parseRir(e.feel));
      if (rm != null) {
        rirEntries++;
        rir[rirBucket(rm)] = (rir[rirBucket(rm)] ?? 0) + 1;
      }
      const n = ex?.name ?? e.exerciseId;
      exerciseCount[n] = (exerciseCount[n] ?? 0) + 1;
      if (ex && isCardio(ex)) {
        cardio.sessions++;
        cardio.minutes += e.minutes ?? 0;
        cardio.km += e.distanceKm ?? 0;
        add(cardio.byExercise, ex.name, e.minutes ?? 0);
        const hr = parseCardio([e.setsDisplay, e.feel].filter(Boolean).join(' · ')).hrBpm;
        if (hr != null) cardio.hr.push(hr);
      }
    }
    const prs = strengthPrEvents(ds).filter((p) => p.date >= a && p.date <= b);
    return {
      from: a,
      to: b,
      trainingDays: dates.length,
      sets: entries.reduce((s, e) => s + e.sets.length, 0),
      volumeKg: entries.reduce((s, e) => s + (volOf(ds, e) ?? 0), 0),
      setsByGroup,
      /** 動作模式 → 組數 */
      setsByPattern,
      /** 肌群 → 組數（主要肌群算 1、次要肌群算 0.5） */
      setsByMuscle,
      exhaustion,
      /** 從感受文字解析出的 RIR（每筆取最接近力竭的值）分布；entries 是有記 RIR 的筆數 */
      rir: { entries: rirEntries, distribution: rir },
      cardio: {
        sessions: cardio.sessions,
        minutes: round1(cardio.minutes),
        km: round1(cardio.km),
        byExerciseMinutes: cardio.byExercise,
        ...(cardio.hr.length
          ? {
              avgHrBpm: Math.round(cardio.hr.reduce((s, x) => s + x, 0) / cardio.hr.length),
              hrReadings: cardio.hr.length,
            }
          : {}),
      },
      exercises: Object.entries(exerciseCount)
        .sort((x, y) => y[1] - x[1])
        .map(([name, times]) => ({ name, times })),
      conditions: [
        ...new Set(entries.map((e) => e.condition).filter((c): c is string => !!c && c !== '正常')),
      ],
      prs: prs.filter((p) => p.kind !== 'e1rm').map((p) => prEventOut(ds, p)),
      e1rmPrCount: prs.filter((p) => p.kind === 'e1rm').length,
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
      setsByPattern: prev.setsByPattern,
      prCount: prev.prs.filter((p) => p.kind === 'weight').length,
      repPrCount: prev.prs.filter((p) => p.kind === 'reps').length,
    },
  };
}

/** 每週（週一到週日）的訓練日數、組數、容量與破紀錄次數，舊到新 */
export function agentWeeklyVolume(ds: Dataset, today: DateStr, args: { weeks?: number } = {}) {
  const prs = strengthPrEvents(ds);
  return weekSeries(ds, today, clampLimit(args.weeks, 12, 104)).map((w) => {
    const inWeek = prs.filter((p) => p.date >= w.w && p.date <= addDays(w.w, 6));
    return {
      weekStart: w.w,
      trainingDays: w.days,
      sets: w.sets,
      volumeKg: w.vol,
      prCount: inWeek.filter((p) => p.kind === 'weight').length,
      repPrCount: inWeek.filter((p) => p.kind === 'reps').length,
    };
  });
}

export interface RecordsArgs {
  exercise?: string;
  group?: string;
  from?: DateStr;
  to?: DateStr;
  /** weight＝最高重量、reps＝同重量更多次、e1rm＝推估 1RM；預設全部 */
  kind?: PrKind;
  limit?: number;
}

/** 破紀錄事件（新到舊）＋每個動作目前的最高重量與推估 1RM */
export function agentPersonalRecords(ds: Dataset, args: RecordsArgs = {}) {
  const r = args.exercise ? resolveExercise(ds, args.exercise) : undefined;
  if (args.exercise && !r) return notFound(args.exercise);
  const ex = r?.ex;
  const keep = (id: string) => (!ex || id === ex.id) && (!args.group || exOf(ds, id)?.group === args.group);
  const events = strengthPrEvents(ds)
    .filter((p) => keep(p.exerciseId))
    .filter((p) => !args.kind || p.kind === args.kind)
    .filter((p) => (!args.from || p.date >= args.from) && (!args.to || p.date <= args.to));
  const bests = ds.exercises
    .filter((e) => !isCardio(e) && keep(e.id))
    .flatMap((e) => {
      const h = entriesOf(ds, e.id);
      const b = bestOf(h);
      const e1 = bestE1rmOf(ds, e, h);
      return b
        ? [
            {
              exerciseId: e.id,
              exercise: e.name,
              group: e.group,
              bestWeightKg: b.weight,
              date: b.date,
              ...(e1 ? { bestE1rmKg: e1.kg, e1rmDate: e1.date } : {}),
            },
          ]
        : [];
    });
  return {
    ...otherMatches(r?.others ?? []),
    totalEvents: events.length,
    events: events.slice(0, clampLimit(args.limit, 50)).map((p) => prEventOut(ds, p)),
    currentBests: bests,
  };
}

/** 兩天並排比較：各自的紀錄、共同動作在另一天的重量與容量 */
export function agentCompareDays(ds: Dataset, a: DateStr, b: DateStr) {
  if (!DATE_RE.test(a) || !DATE_RE.test(b)) return { error: '日期格式需為 YYYY-MM-DD' };
  const c = compareDays(ds, a, b);
  const row = (r: (typeof c.a)[number]) => ({
    ...agentEntry(ds, r.entry, { date: true }),
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
interface NoteDoc {
  source: NoteSource;
  date?: DateStr;
  exercise?: string;
  field?: string;
  text: string;
  /** 小寫的比對用文字（含動作名稱） */
  low: string;
}
const noteIndexCache = new WeakMap<Dataset, NoteDoc[]>();
/** 全文搜尋的索引：每份資料只建一次（日誌約 30 萬字，每次搜尋都轉小寫太花 CPU）；依日期新到舊 */
function noteIndex(ds: Dataset): NoteDoc[] {
  let docs = noteIndexCache.get(ds);
  if (docs) return docs;
  docs = [];
  for (const [d, raw] of ds.journals) {
    const text = stripJournalHeading(raw);
    docs.push({ source: 'journal', date: d, text, low: text.toLowerCase() });
  }
  for (const [d, es] of ds.entriesByDate)
    for (const e of es) {
      const name = nameOf(ds, e.exerciseId);
      for (const field of ['feel', 'cue', 'condition', 'exhaustion'] as const) {
        const text = e[field];
        if (text)
          docs.push({
            source: 'entry',
            date: d,
            exercise: name,
            field,
            text,
            low: `${name} ${text}`.toLowerCase(),
          });
      }
    }
  for (const ex of ds.exercises)
    for (const text of ex.notes)
      docs.push({ source: 'exercise', exercise: ex.name, text, low: `${ex.name} ${text}`.toLowerCase() });
  docs.sort((x, y) => (y.date ?? '').localeCompare(x.date ?? ''));
  noteIndexCache.set(ds, docs);
  return docs;
}

export function agentSearchNotes(ds: Dataset, args: SearchNotesArgs) {
  const terms = args.query.toLowerCase().split(/\s+/).filter(Boolean);
  const first = terms[0];
  if (!first) return { error: 'query 不能是空的' };
  const src = new Set<NoteSource>(args.sources?.length ? args.sources : ['journal', 'entry', 'exercise']);
  const ranged = !!(args.from || args.to);
  const out: { source: NoteSource; date?: DateStr; exercise?: string; field?: string; text: string }[] = [];
  for (const d of noteIndex(ds)) {
    if (!src.has(d.source)) continue;
    // 動作要點沒有日期：有日期區間時不搜
    if (d.date ? (args.from && d.date < args.from) || (args.to && d.date > args.to) : ranged) continue;
    if (!terms.every((x) => d.low.includes(x))) continue;
    out.push({
      source: d.source,
      ...(d.date ? { date: d.date } : {}),
      ...(d.exercise ? { exercise: d.exercise } : {}),
      ...(d.field ? { field: d.field } : {}),
      text: d.source === 'journal' ? snippet(d.text, first) : d.text,
    });
  }
  return { totalMatching: out.length, results: out.slice(0, clampLimit(args.limit, 30, 200)) };
}

/** 訓練影片：某一天的影片（含各段章節）、某個動作所有拍了影片的日子，或最近的影片清單 */
export function agentVideos(ds: Dataset, args: { date?: DateStr; exercise?: string; limit?: number } = {}) {
  if (args.exercise) {
    const r = resolveExercise(ds, args.exercise);
    if (!r) return notFound(args.exercise);
    const list = exerciseVideos(ds, r.ex.id);
    return {
      exercise: r.ex.name,
      ...otherMatches(r.others),
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
      exercises: [...new Set(v.segments.map((s) => nameOf(ds, s.exerciseId)))],
    })),
  };
}
