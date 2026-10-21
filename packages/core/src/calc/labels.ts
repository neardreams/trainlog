// 顯示用的分類與文字（門檻沿用 v6／v9）
export type Tone = 'tone-ok' | 'tone-warn' | 'tone-bad' | 'tone-mute' | 'tone-none';

export function daysLabel(n: number): string {
  return n <= 0 ? '今天' : n === 1 ? '昨天' : `${n} 天前`;
}

/** 上次訓練：≤3 天成功色、≤7 天警示色、其他危險色 */
export function daysTone(n: number): Tone {
  return n <= 3 ? 'tone-ok' : n <= 7 ? 'tone-warn' : 'tone-bad';
}

export function exhTone(x: string | undefined | null): Tone {
  if (!x || x === '—') return 'tone-none';
  if (x.startsWith('力竭')) return 'tone-bad';
  if (x === '吃力') return 'tone-warn';
  if (x === '輕鬆') return 'tone-ok';
  return 'tone-mute';
}

/** 力竭分布的分類：所有「力竭（…）」都歸為力竭；未標示為 — */
export function exhaustionBucket(x: string | undefined | null): string {
  const v = x || '—';
  return v.startsWith('力竭') ? '力竭' : v;
}
export const EXHAUSTION_ORDER = ['輕鬆', '普通', '吃力', '力竭', '—'] as const;

/** 數字格式：千分位、最多一位小數 */
export function fmtN(n: number | null | undefined, dp = 1): string {
  return n == null ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: dp });
}
