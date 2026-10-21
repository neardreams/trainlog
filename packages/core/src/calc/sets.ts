// 單筆紀錄的計算（定義沿用 generate_v6.py；改動前要先問使用者）
import type { Entry, Exercise, SetRow } from '../domain/types';

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

/** 最高重量：重量 > 0 的最大值；沒有則 null */
export function getMaxWeight(sets: readonly SetRow[]): number | null {
  const ws = sets.filter((s) => s.weightKg != null && s.weightKg > 0).map((s) => s.weightKg as number);
  return ws.length ? Math.max(...ws) : null;
}

export const isCardio = (ex: Pick<Exercise, 'kind'> | undefined) => ex?.kind === 'cardio';

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

/** 全形空白（v6 的組數文字格式使用） */
const FULLWIDTH_SPACE = String.fromCharCode(0x3000);

/** 純文字版的組數（用於 CSV、提示框、比較頁），格式沿用 v6 的 formatSets */
export function formatSets(entry: Entry, ex: Pick<Exercise, 'repUnit' | 'zeroLabel'>): string {
  if (entry.setsDisplay) return entry.setsDisplay;
  const sets = entry.sets;
  if (!sets.length) return '-';
  const unit = ex.repUnit ?? '';
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
    const wStr = w == null ? '' : w === 0 && ex.zeroLabel ? ex.zeroLabel : `${w}kg`;
    if (!wStr) parts.push(c > 1 ? `${c}×${rStr}` : rStr);
    else parts.push(c > 1 ? `${c}×${rStr}${FULLWIDTH_SPACE}(${wStr})` : `${wStr}×${rStr}`);
    i += c;
  }
  return parts.join(' / ');
}
