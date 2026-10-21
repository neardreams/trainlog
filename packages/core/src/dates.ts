// 日期工具：全專案唯一允許使用 Date 建構子的地方。
// 一律以本地日期字串 YYYY-MM-DD 表示日期（不經過 UTC），避免「差一天」的問題。

export type DateStr = string; // YYYY-MM-DD

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const DOW_ZH = ['日', '一', '二', '三', '四', '五', '六'] as const;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Date → 本地日期字串 */
export function toDateStr(d: Date): DateStr {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 本地日期字串 → 當天 00:00 的 Date（本地時區） */
export function parseDate(s: DateStr): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** 今天的本地日期字串；需要固定日期的地方（測試）請改傳參數 */
export function todayStr(now: Date = new Date()): DateStr {
  return toDateStr(now);
}

export function addDays(s: DateStr, n: number): DateStr {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** b − a 的天數（整數） */
export function daysBetween(a: DateStr, b: DateStr): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}

/** 該日所在週的週一 */
export function mondayOf(s: DateStr): DateStr {
  const d = parseDate(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toDateStr(d);
}

/** 以 centre 為中心、前後各 days 天的日期（含兩端） */
export function datesInRange(centre: DateStr, days: number): DateStr[] {
  const res: DateStr[] = [];
  for (let i = -days; i <= days; i++) res.push(addDays(centre, i));
  return res;
}

export const inRange = (d: DateStr, a: DateStr, b: DateStr) => d >= a && d <= b;
export const dowOf = (s: DateStr) => DOW_ZH[parseDate(s).getDay()] ?? '';
/** 10/19 */
export const md = (s: DateStr) => `${s.slice(5, 7)}/${s.slice(8)}`;
/** 2026/10/19 */
export const slash = (s: DateStr) => s.replace(/-/g, '/');
/** 2026 年 10 月 19 日 */
export function longDate(s: DateStr): string {
  const d = parseDate(s);
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}
export const yearOf = (s: DateStr) => Number(s.slice(0, 4));
/** 月份差（b − a），用於月曆 */
export const monthsBetween = (a: DateStr, b: DateStr) =>
  (yearOf(b) - yearOf(a)) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
