// 訓練影片：某筆紀錄對應合併影片中的哪幾段、YouTube 網址、時間顯示
import type { DateStr } from '../dates';
import type { Dataset, DayVideo, Entry, VideoSegment } from '../domain/types';

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

/** 網站內嵌播放器的網址（不留 Cookie 的網域）；從 start 秒開始自動播放、結束時不推薦其他頻道的影片 */
export function youtubeEmbedUrl(youtubeId: string, start = 0): string {
  const t = Math.max(0, Math.floor(start));
  return `https://www.youtube-nocookie.com/embed/${youtubeId}?start=${t}&autoplay=1&rel=0&playsinline=1`;
}

/** 秒數 → m:ss（滿一小時為 h:mm:ss），與 YouTube 章節時間的寫法相同 */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
