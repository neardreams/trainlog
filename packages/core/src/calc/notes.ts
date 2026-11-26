// 從文字欄位抽出結構化數值（不改資料，執行時解析）：感受裡的 RIR、有氧組數文字裡的速度／坡度／心率。
// 寫法規則在 SKILL.md；這裡盡量容忍舊資料的各種寫法，解析不出來就不回傳。

export type Side = '左' | '右';

/** 一次 RIR 讀數：min–max（max 為 null 表示「以上」，例：RIR 3+）；有標左右就有 side */
export interface RirReading {
  min: number;
  max: number | null;
  side?: Side;
}

const N = String.raw`(\d+(?:\.\d+)?)`;
const RANGE = String.raw`(?:\s*(?:–|-|~|～|到)\s*${N})?`;
const OPEN = String.raw`\s*(\+|以上)?`;
const SIDE = String.raw`(左|右)(?:手|腳|邊|側)?`;
/** 「右腳 RIR 0–1」「RIR 約 2」「RIR 3+」「RIR >2」「RIR 半下」「RIR 接近 0」 */
const RIR_RE = new RegExp(
  String.raw`(?:${SIDE}\s*)?RIR\s*(?:約|接近|大約)?\s*([>＞])?\s*(半下|\d+(?:\.\d+)?)${RANGE}${OPEN}`,
  'g',
);
/** 緊接在後、沒再寫 RIR 的另一邊：「右手 RIR 2+、左手 0–1」 */
const FOLLOW_RE = new RegExp(String.raw`^\s*[、，,]\s*${SIDE}\s*(?:約\s*)?${N}${RANGE}${OPEN}`);

const reading = (
  side: string | undefined,
  gt: string | undefined,
  a: string,
  b: string | undefined,
  open: string | undefined,
): RirReading => {
  const min = a === '半下' ? 0.5 : Number(a);
  const max = gt || open ? null : b != null ? Number(b) : min;
  return { min, max, ...(side ? { side: side as Side } : {}) };
};

/** 解析文字裡所有的 RIR 讀數（依出現順序） */
export function parseRir(text: string | undefined | null): RirReading[] {
  if (!text || !text.includes('RIR')) return [];
  const out: RirReading[] = [];
  for (const m of text.matchAll(RIR_RE)) {
    out.push(reading(m[1], m[2], m[3] as string, m[4], m[5]));
    const f = FOLLOW_RE.exec(text.slice((m.index ?? 0) + m[0].length));
    if (m[1] && f) out.push(reading(f[1], undefined, f[2] as string, f[3], f[4]));
  }
  return out;
}

/** 這筆紀錄最接近力竭的 RIR（所有讀數的最小值）；沒有讀數回傳 null */
export const rirMin = (rs: readonly RirReading[]): number | null =>
  rs.length ? Math.min(...rs.map((r) => r.min)) : null;

export type RirBucket = '0' | '1' | '2' | '3+';
/** RIR 分布的區間：取最小值的整數部分（半下、0–1 都算 0） */
export const rirBucket = (min: number): RirBucket => (min < 1 ? '0' : min < 2 ? '1' : min < 3 ? '2' : '3+');

/** 有氧的數值（從組數文字解析，有寫才有） */
export interface CardioMetrics {
  speedKmh?: number;
  inclinePct?: number;
  /** 心率（範圍取中間值；「不到 130」記 130） */
  hrBpm?: number;
  watts?: number;
  /** 檔位／強度（樓梯機、飛輪等沒有實際速度的器材） */
  level?: number;
  paceMinPerKm?: number;
}

const first = (re: RegExp, text: string): number | undefined => {
  const m = re.exec(text);
  if (!m) return undefined;
  const a = Number(m[1]);
  const b = m[2] != null ? Number(m[2]) : undefined;
  return b == null ? a : Math.round(((a + b) / 2) * 10) / 10;
};

/** 解析有氧組數文字，例：「30 分 · 4 km/h · 坡度 3 · 心率 120 出頭」「5×(20秒衝/40秒休) · 500–600 W」 */
export function parseCardio(text: string | undefined | null): CardioMetrics {
  if (!text) return {};
  const speedKmh = first(new RegExp(String.raw`${N}(?:\s*[–-]\s*${N})?\s*km/h`), text);
  const inclinePct = first(new RegExp(String.raw`坡度\s*${N}`), text);
  const hrBpm = first(
    new RegExp(String.raw`(?:心率|心跳)\s*(?:~|約|多在|近|不到|在)?\s*${N}(?:\s*[–-]\s*${N})?`),
    text,
  );
  const watts = first(new RegExp(String.raw`${N}(?:\s*[–-]\s*${N})?\s*W\b`), text);
  const lv = new RegExp(String.raw`(?:檔位|強度|速度)\s*${N}|第\s*${N}\s*檔`).exec(text);
  const level = lv ? Number(lv[1] ?? lv[2]) : undefined;
  const paceMinPerKm = first(new RegExp(String.raw`${N}\s*分/km`), text);
  return {
    ...(speedKmh != null ? { speedKmh } : {}),
    ...(inclinePct != null ? { inclinePct } : {}),
    ...(hrBpm != null ? { hrBpm } : {}),
    ...(watts != null ? { watts } : {}),
    ...(level != null ? { level } : {}),
    ...(paceMinPerKm != null ? { paceMinPerKm } : {}),
  };
}
