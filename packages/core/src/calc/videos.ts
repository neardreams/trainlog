// 訓練影片：某筆紀錄對應合併影片中的哪幾段、YouTube 網址、時間顯示
import type { DateStr } from '../dates';
import type { Dataset, DayVideo, Entry, VideoSegment } from '../domain/types';
import { getMaxWeight } from './sets';

export interface EntryVideo {
  video: DayVideo;
  /** 這筆紀錄（同一天、同一個動作）在影片中的各段，依時間排序 */
  segments: VideoSegment[];
}

export const dayVideo = (ds: Dataset, date: DateStr): DayVideo | undefined => ds.videosByDate.get(date);

/** 影片中某個動作的各段，依時間排序 */
export const segmentsOf = (video: DayVideo, exerciseId: string): VideoSegment[] =>
  video.segments.filter((s) => s.exerciseId === exerciseId);

export function entryVideo(ds: Dataset, entry: Entry): EntryVideo | undefined {
  const video = ds.videosByDate.get(entry.date);
  if (!video) return undefined;
  const segments = segmentsOf(video, entry.exerciseId);
  return segments.length ? { video, segments } : undefined;
}

/** 這個動作所有拍了影片的日子，新到舊 */
export function exerciseVideos(ds: Dataset, exerciseId: string): EntryVideo[] {
  const out: EntryVideo[] = [];
  for (const e of ds.entriesByExercise.get(exerciseId) ?? []) {
    const ev = entryVideo(ds, e);
    if (ev) out.push(ev);
  }
  return out.reverse();
}

/** 這個動作在其他天最近一次的影片（當天沒拍到這個動作時，改播這支） */
export const otherExerciseVideo = (ds: Dataset, exerciseId: string, date: DateStr): EntryVideo | undefined =>
  exerciseVideos(ds, exerciseId).find((x) => x.video.date !== date);

/** date 之前最近一個有影片的日子（這天沒錄影時的「前一支影片」） */
export function prevDayVideo(ds: Dataset, date: DateStr): DayVideo | undefined {
  let best: DayVideo | undefined;
  for (const [d, v] of ds.videosByDate) if (d < date && (!best || d > best.date)) best = v;
  return best;
}

/** 依組號分組的段落（組數格上的影片記號用）；標不出組號的段落不列入 */
export function segmentsBySet(segments: readonly VideoSegment[]): Map<number, VideoSegment[]> {
  const out = new Map<number, VideoSegment[]>();
  for (const s of segments) {
    if (s.set == null) continue;
    const g = out.get(s.set);
    if (g) g.push(s);
    else out.set(s.set, [s]);
  }
  return out;
}

/**
 * 最重那一組在影片中的段落（破紀錄的那一組）：同重量有好幾組時取第一組；
 * 片段標不出組號、或最重的那組沒拍到時，取這個動作的第一段
 */
export function topSetSegment(entry: Entry, segments: readonly VideoSegment[]): VideoSegment | undefined {
  const max = getMaxWeight(entry.sets);
  const top =
    max == null
      ? undefined
      : segments
          .filter((s) => s.set != null && entry.sets[s.set - 1]?.weightKg === max)
          .sort((x, y) => (x.set ?? 0) - (y.set ?? 0) || x.start - y.start)[0];
  return top ?? segments[0];
}

/** 直式影片（高 > 寬），播放器用 9:16 */
export const isPortrait = (v: DayVideo): boolean => v.height > v.width;

/** 依動作分組：各組依該動作第一次出現的時間排序，組內依時間 */
export function segmentsByExercise(video: DayVideo): { exerciseId: string; segments: VideoSegment[] }[] {
  const groups = new Map<string, VideoSegment[]>();
  for (const s of video.segments) {
    const g = groups.get(s.exerciseId);
    if (g) g.push(s);
    else groups.set(s.exerciseId, [s]);
  }
  return [...groups].map(([exerciseId, segments]) => ({ exerciseId, segments }));
}

/** sec 秒落在哪一段（start ≤ sec < end） */
export const segmentAt = (segments: readonly VideoSegment[], sec: number): VideoSegment | undefined =>
  segments.find((s) => s.start <= sec && sec < s.end);

/** 不公開影片的分享網址；start 為秒數，從該處開始播放 */
export function youtubeUrl(youtubeId: string, start = 0): string {
  const t = Math.floor(start);
  return `https://youtu.be/${youtubeId}${t > 0 ? `?t=${t}` : ''}`;
}

/** 內嵌播放器的網域（不留 Cookie）；網頁和播放器之間的訊息只收這個來源 */
export const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

/**
 * 網站內嵌播放器的網址：從 start 秒開始自動播放、結束時不推薦其他頻道的影片。
 * 有 origin（網站自己的網址）時開啟播放器的控制介面，網頁才能讓播放器跳段、播放
 */
export function youtubeEmbedUrl(youtubeId: string, start = 0, origin?: string): string {
  const t = Math.max(0, Math.floor(start));
  const api = origin ? `&enablejsapi=1&origin=${encodeURIComponent(origin)}` : '';
  return `${YOUTUBE_EMBED_ORIGIN}/embed/${youtubeId}?start=${t}&autoplay=1&rel=0&playsinline=1${api}`;
}

/** 秒數 → m:ss（滿一小時為 h:mm:ss），與 YouTube 章節時間的寫法相同 */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
