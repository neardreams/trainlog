// 訓練影片：某筆紀錄對應合併影片中的哪幾段、YouTube 網址、時間顯示
import type { DateStr } from '../dates';
import type { Dataset, DayVideo, Entry, VideoSegment } from '../domain/types';

export interface EntryVideo {
  video: DayVideo;
  /** 這筆紀錄（同一天、同一個動作）在影片中的各段，依時間排序 */
  segments: VideoSegment[];
}

export const dayVideo = (ds: Dataset, date: DateStr): DayVideo | undefined => ds.videosByDate.get(date);

export function entryVideo(ds: Dataset, entry: Entry): EntryVideo | undefined {
  const video = ds.videosByDate.get(entry.date);
  if (!video) return undefined;
  const segments = video.segments.filter((s) => s.exerciseId === entry.exerciseId);
  return segments.length ? { video, segments } : undefined;
}

/** 不公開影片的分享網址；start 為秒數，從該處開始播放 */
export function youtubeUrl(youtubeId: string, start = 0): string {
  const t = Math.floor(start);
  return `https://youtu.be/${youtubeId}${t > 0 ? `?t=${t}` : ''}`;
}

/** 秒數 → m:ss（滿一小時為 h:mm:ss），與 YouTube 章節時間的寫法相同 */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
