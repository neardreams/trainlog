// 單筆紀錄的計算（定義沿用 generate_v6.py；改動前要先問使用者）
import type { Dataset, Entry, Exercise, SetRow } from '../domain/types';

/** 容量：Σ 重量×次數；任一組重量或次數為 null 就回傳 null；沒有組數回傳 null */
export function calcVolume(sets: readonly SetRow[]): number | null {
  if (!sets.length) return null;
  let t = 0;
  for (const s of sets) {
    if (s.weightKg == null || s.reps == null) return null;
    t += s.weightKg * s.reps;
  }
  return t;
}

type VolumeEx = Pick<Exercise, 'kind' | 'repUnit' | 'perSide' | 'repsPerSide'>;

/** 用秒數或米數計次的動作（棒式、持槓、農夫走路…）：次數欄不是「下」，不算容量 */
export const hasRepUnit = (ex: Pick<Exercise, 'repUnit'> | undefined) => !!ex?.repUnit;

/**
 * 容量倍數：左右兩邊都要算進去。
 * - 重量記每邊（單手／單腳、雙手各一顆啞鈴、左右分開的器械）→ ×2
 * - 重量記合計、次數記每邊（雙手持重、左右腳輪流）→ ×2
 * 兩者不會疊成 ×4：雙手持重又左右腳輪流的動作，重量一律記兩顆合計（per_side 不標）。
 */
export function volumeFactor(entry: Pick<Entry, 'perSide'>, ex: VolumeEx | undefined): 1 | 2 {
  return entryPerSide(entry, ex) || ex?.repsPerSide ? 2 : 1;
}

/**
 * 一筆紀錄的容量（kg）：Σ 重量×次數×倍數（見 volumeFactor）。
 * 有氧、用秒數或米數計次的動作沒有容量（null）；組數不完整時同 calcVolume 回傳 null。
 */
export function entryVolume(entry: Pick<Entry, 'sets' | 'perSide'>, ex: VolumeEx | undefined): number | null {
  if (!ex || isCardio(ex) || hasRepUnit(ex)) return null;
  const v = calcVolume(entry.sets);
  return v == null ? null : v * volumeFactor(entry, ex);
}

/** 某筆紀錄的容量（從資料集找動作）；見 entryVolume */
export const volOf = (ds: Pick<Dataset, 'exerciseById'>, e: Entry): number | null =>
  entryVolume(e, ds.exerciseById.get(e.exerciseId));

/** 用秒數或米數計次的動作：所有組的秒數或米數合計（沒有單位或組數不完整時 null） */
export function unitTotal(
  entry: Pick<Entry, 'sets'>,
  ex: Pick<Exercise, 'repUnit'> | undefined,
): number | null {
  if (!hasRepUnit(ex) || !entry.sets.length || entry.sets.some((s) => s.reps == null)) return null;
  return entry.sets.reduce((t, s) => t + (s.reps ?? 0), 0);
}

/** 推估 1RM 只採用這個次數以內的組（次數越多 Epley 越不準） */
export const E1RM_MAX_REPS = 12;

/**
 * 推估 1RM（Epley：重量 × (1 + 次數/30)），取各組最大值、四捨五入到 0.1 kg。
 * 只算有重量、1–12 下的組；有氧與秒數／米數動作沒有。重量照紀錄的記法（每邊或合計），和最高重量一致。
 */
export function estimate1rm(
  sets: readonly SetRow[],
  ex: Pick<Exercise, 'kind' | 'repUnit'> | undefined,
): number | null {
  if (!ex || isCardio(ex) || hasRepUnit(ex)) return null;
  let best: number | null = null;
  for (const s of sets) {
    if (s.weightKg == null || s.weightKg <= 0 || s.reps == null || s.reps < 1 || s.reps > E1RM_MAX_REPS)
      continue;
    const v = s.reps === 1 ? s.weightKg : s.weightKg * (1 + s.reps / 30);
    if (best == null || v > best) best = v;
  }
  return best == null ? null : Math.round(best * 10) / 10;
}

/** 最高重量：重量 > 0 的最大值；沒有則 null */
export function getMaxWeight(sets: readonly SetRow[]): number | null {
  const ws = sets.filter((s) => s.weightKg != null && s.weightKg > 0).map((s) => s.weightKg as number);
  return ws.length ? Math.max(...ws) : null;
}

/** 最重那一組的位置（0 起算；同重量取第一組）；沒有重量回傳 -1。破紀錄只標這一組 */
export function topSetIndex(sets: readonly SetRow[]): number {
  const mx = getMaxWeight(sets);
  return mx == null ? -1 : sets.findIndex((s) => s.weightKg === mx);
}

export const isCardio = (ex: Pick<Exercise, 'kind'> | undefined) => ex?.kind === 'cardio';

/** 這筆紀錄的重量是不是每邊（一手／一腳／一側）：紀錄本身有標就照紀錄，否則看動作 */
export function entryPerSide(
  entry: Pick<Entry, 'perSide'>,
  ex: Pick<Exercise, 'perSide'> | undefined,
): boolean {
  return entry.perSide ?? ex?.perSide ?? false;
}

/** 重量單位文字：每邊的重量寫「kg/邊」，避免和兩邊合計混淆 */
export const weightUnit = (perSide: boolean) => (perSide ? 'kg/邊' : 'kg');

/** 有氧累計：分鐘與公里（四捨五入到小數一位） */
export function cardioTotals(entries: readonly Entry[]): { mins: number; km: number } {
  const mins = entries.reduce((s, h) => s + (h.minutes ?? 0), 0);
  const km = entries.reduce((s, h) => s + (h.distanceKm ?? 0), 0);
  return { mins: Math.round(mins * 10) / 10, km: Math.round(km * 10) / 10 };
}

/** 連續相同的組合併成一段，用於顯示「15 kg × 10 ×3」 */
export type SetRun =
  | { kind: 'text'; text: string } // sets_display 覆寫文字
  | { kind: 'none' } // 沒有組數
  | { kind: 'practice' } // 動作練習（無重量也無單位）
  | {
      kind: 'run';
      weightKg: number | null;
      /** 重量為 0 且有 zeroLabel 時顯示的文字 */
      zeroLabel?: string;
      reps: number | null;
      unit?: string;
      count: number;
    };

export function setRuns(entry: Entry, ex: Pick<Exercise, 'repUnit' | 'zeroLabel'>): SetRun[] {
  if (entry.setsDisplay) return [{ kind: 'text', text: entry.setsDisplay }];
  const sets = entry.sets;
  if (!sets.length) return [{ kind: 'none' }];
  const unit = ex.repUnit;
  if (sets[0]?.weightKg == null && !unit) return [{ kind: 'practice' }];
  const out: SetRun[] = [];
  let i = 0;
  while (i < sets.length) {
    const s = sets[i] as SetRow;
    let c = 1;
    while (i + c < sets.length && sets[i + c]?.weightKg === s.weightKg && sets[i + c]?.reps === s.reps) c++;
    out.push({
      kind: 'run',
      weightKg: s.weightKg,
      ...(s.weightKg === 0 && ex.zeroLabel ? { zeroLabel: ex.zeroLabel } : {}),
      reps: s.reps,
      ...(unit ? { unit } : {}),
      count: c,
    });
    i += c;
  }
  return out;
}

/** 每組一格（日曆頁樣式）的資料 */
export interface SetBlock {
  /** 組號，從 1 開始 */
  no: number;
  weightKg: number | null;
  /** 重量為 0 且有 zeroLabel 時顯示的文字 */
  zeroLabel?: string;
  reps: number | null;
  unit?: string;
  /** 重量深淺：1 最輕（或全部同重量）、2 中間、3 當天最重（只有重量有變化時才會出現 2、3） */
  level: 1 | 2 | 3;
}
export type SetBlocks =
  | { kind: 'text'; text: string }
  | { kind: 'none' }
  | { kind: 'practice' }
  /** note：有 sets_display 但每組資料完整時，格子照畫，覆寫文字當補充說明（例如左右重量不同） */
  | { kind: 'blocks'; blocks: SetBlock[]; note?: string };

/** 每組都有次數，而且有重量（或次數單位，例如秒）：可以畫成每組一格 */
export function hasCompleteSets(entry: Entry, ex: Pick<Exercise, 'repUnit'>): boolean {
  return (
    entry.sets.length > 0 && entry.sets.every((s) => s.reps != null && (s.weightKg != null || !!ex.repUnit))
  );
}

export function setBlocks(entry: Entry, ex: Pick<Exercise, 'repUnit' | 'zeroLabel'>): SetBlocks {
  if (entry.setsDisplay && !hasCompleteSets(entry, ex)) return { kind: 'text', text: entry.setsDisplay };
  const sets = entry.sets;
  if (!sets.length) return { kind: 'none' };
  const unit = ex.repUnit;
  if (sets[0]?.weightKg == null && !unit) return { kind: 'practice' };
  const ws = sets.map((s) => s.weightKg ?? 0);
  const mx = Math.max(...ws);
  const mn = Math.min(...ws);
  const level = (w: number): 1 | 2 | 3 => (mx === mn ? 1 : w >= mx ? 3 : w > mn ? 2 : 1);
  return {
    kind: 'blocks',
    blocks: sets.map((s, i) => ({
      no: i + 1,
      weightKg: s.weightKg,
      ...(s.weightKg === 0 && ex.zeroLabel ? { zeroLabel: ex.zeroLabel } : {}),
      reps: s.reps,
      ...(unit ? { unit } : {}),
      level: level(s.weightKg ?? 0),
    })),
    ...(entry.setsDisplay ? { note: entry.setsDisplay } : {}),
  };
}

/** 熱身組只拿來顯示：組數、容量、最高重量、破紀錄都只看正式組（entry.sets） */
const warmupAsEntry = (entry: Entry): Entry => ({
  id: entry.id,
  exerciseId: entry.exerciseId,
  date: entry.date,
  sets: entry.warmupSets ?? [],
  ...(entry.perSide != null ? { perSide: entry.perSide } : {}),
});

/** 熱身組的格子（深淺一律最淺；沒有熱身組回傳空陣列） */
export function warmupBlocks(entry: Entry, ex: Pick<Exercise, 'repUnit' | 'zeroLabel'>): SetBlock[] {
  if (!entry.warmupSets?.length) return [];
  const r = setBlocks(warmupAsEntry(entry), ex);
  return r.kind === 'blocks' ? r.blocks.map((b) => ({ ...b, level: 1 })) : [];
}

/** 純文字版的熱身組（格式同 formatSets）；沒有熱身組回傳空字串 */
export function formatWarmupSets(
  entry: Entry,
  ex: Pick<Exercise, 'repUnit' | 'zeroLabel' | 'perSide'>,
): string {
  return entry.warmupSets?.length ? formatSets(warmupAsEntry(entry), ex) : '';
}

/** 全形空白（v6 的組數文字格式使用） */
const FULLWIDTH_SPACE = String.fromCharCode(0x3000);

/** 純文字版的組數（用於 CSV、提示框、比較頁），格式沿用 v6 的 formatSets */
export function formatSets(entry: Entry, ex: Pick<Exercise, 'repUnit' | 'zeroLabel' | 'perSide'>): string {
  if (entry.setsDisplay) return entry.setsDisplay;
  const sets = entry.sets;
  if (!sets.length) return '-';
  const unit = ex.repUnit ?? '';
  const kg = weightUnit(entryPerSide(entry, ex));
  if (sets[0]?.weightKg == null && !unit) return '動作練習';
  const parts: string[] = [];
  let i = 0;
  while (i < sets.length) {
    const { weightKg: w, reps: r } = sets[i] as SetRow;
    if (r == null || (w == null && !unit)) {
      parts.push('？');
      i++;
      continue;
    }
    let c = 1;
    while (i + c < sets.length && sets[i + c]?.weightKg === w && sets[i + c]?.reps === r) c++;
    const rStr = (Number.isInteger(r) ? String(r) : r.toFixed(1)) + unit;
    const wStr = w == null ? '' : w === 0 && ex.zeroLabel ? ex.zeroLabel : `${w}${kg}`;
    if (!wStr) parts.push(c > 1 ? `${c}×${rStr}` : rStr);
    else parts.push(c > 1 ? `${c}×${rStr}${FULLWIDTH_SPACE}(${wStr})` : `${wStr}×${rStr}`);
    i += c;
  }
  return parts.join(' / ');
}
