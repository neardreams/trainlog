// AI agent 查詢函式（WebMCP 工具、llms.txt 用）
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AGENT_TOOLS,
  agentCompareDays,
  agentDay,
  agentExerciseHistory,
  agentJournals,
  agentListExercises,
  agentOverview,
  agentPeriodStats,
  agentPersonalRecords,
  agentSearchDays,
  agentSearchNotes,
  agentVideos,
  agentWeeklyVolume,
  findExercise,
  parseDataset,
  prEvents,
} from '../src';

const read = (f: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures', f), 'utf8'));
// 測試用影片：10/19 背槓深蹲第 1、2 組
const videos = {
  videos: [
    {
      date: '2026-10-19',
      youtube_id: 'abcdefghijk',
      duration_sec: 120,
      canvas: '1080x1920',
      title: '10/19 訓練',
      segments: [
        { exercise_id: 'back_squat', start: 0, end: 50, label: '第 1 組 90kg×6', set: 1 },
        { exercise_id: 'back_squat', start: 50, end: 100, label: '第 2 組 90kg×6', set: 2 },
      ],
    },
  ],
};
const ds = (() => {
  const r = parseDataset(read('training_data.json'), read('journals_raw.json'), videos);
  if (!r.ok) throw new Error(r.issues.join('\n'));
  return r.dataset;
})();
const T = '2026-10-21';

describe('agent 查詢', () => {
  it('依 id、名稱、關鍵字找動作', () => {
    expect(findExercise(ds, 'back_squat')?.id).toBe('back_squat');
    expect(findExercise(ds, '背槓深蹲')?.id).toBe('back_squat');
    expect(findExercise(ds, '深蹲')).toBeDefined();
    expect(findExercise(ds, '不存在的動作')).toBeUndefined();
    expect(findExercise(ds, '  ')).toBeUndefined();
  });

  it('總覽', () => {
    const o = agentOverview(ds, T);
    expect(o.trainingDays).toBe(ds.trainingDates.length);
    expect(o.lastDate).toBe(ds.trainingDates[ds.trainingDates.length - 1]);
    expect(o.recentDays.length).toBeLessThanOrEqual(7);
    expect(o.recentDays[0]?.date).toBe(o.lastDate);
    const prDates = o.recentPRs.map((p) => p.date);
    expect(prDates[0]).toBe(prEvents(ds)[0]?.date);
    expect([...prDates].sort().reverse()).toEqual(prDates);
    expect(() => JSON.stringify(o)).not.toThrow();
  });

  it('動作清單可依部位與關鍵字篩選', () => {
    const all = agentListExercises(ds, T);
    expect(all).toHaveLength(ds.exercises.length);
    const legs = agentListExercises(ds, T, { group: '腿部' });
    expect(legs.length).toBeGreaterThan(0);
    expect(legs.every((e) => e.group === '腿部')).toBe(true);
    const sq = agentListExercises(ds, T, { query: 'squat' });
    expect(sq.some((e) => e.id === 'back_squat')).toBe(true);
  });

  it('動作歷程：最新在前、limit 與日期區間', () => {
    const h = agentExerciseHistory(ds, { exercise: 'back_squat', limit: 2 });
    if ('error' in h) throw new Error(h.error);
    expect(h.totalMatching).toBe(34);
    expect(h.entries.map((e) => e.date)).toEqual(['2026-10-19', '2026-10-14']);
    expect(h.entries[0]?.maxWeightKg).toBe(90);
    expect(h.entries[0]?.volumeKg).toBe(1080);
    const r = agentExerciseHistory(ds, { exercise: 'back_squat', from: '2026-10-15', to: '2026-10-31' });
    if ('error' in r) throw new Error(r.error);
    expect(r.entries.map((e) => e.date)).toEqual(['2026-10-19']);
    expect('error' in agentExerciseHistory(ds, { exercise: 'nope' })).toBe(true);
  });

  it('單日：紀錄、日誌去掉標題、沒有紀錄時給最近的訓練日', () => {
    const d = agentDay(ds, '2026-10-19');
    if ('error' in d) throw new Error(d.error);
    expect(d.entries.some((e) => e.exerciseId === 'back_squat')).toBe(true);
    expect(d.journal?.startsWith('#')).toBe(false);
    const miss = agentDay(ds, '2026-10-20');
    expect('nearest' in miss ? miss.nearest?.before : null).toBe('2026-10-19');
    expect('error' in agentDay(ds, '2026/10/19')).toBe(true);
  });

  it('搜尋訓練日', () => {
    const r = agentSearchDays(ds, { exercise: 'back_squat', from: '2026-10-01' });
    if ('error' in r) throw new Error(r.error);
    expect(r.days.map((d) => d.date)).toContain('2026-10-19');
    expect(r.days.every((d) => d.date >= '2026-10-01')).toBe(true);
    expect(r.days[0]?.date).toBe('2026-10-19');
  });

  it('紀錄帶影片段落網址、每天摘要帶日誌／影片／網頁連結', () => {
    const d = agentDay(ds, '2026-10-19');
    if ('error' in d) throw new Error(d.error);
    expect(d.pageUrl).toBe('https://trainlog.x-hu.com/days/2026-10-19');
    expect(d.hasJournal).toBe(true);
    expect(d.video?.url).toBe('https://youtu.be/abcdefghijk');
    expect(d.video?.segments).toHaveLength(2);
    const sq = d.entries.find((e) => e.exerciseId === 'back_squat');
    expect(sq?.video?.segments.map((s) => s.url)).toEqual([
      'https://youtu.be/abcdefghijk',
      'https://youtu.be/abcdefghijk?t=50',
    ]);
    expect(d.entries.find((e) => e.exerciseId !== 'back_squat')?.video).toBeUndefined();
    const h = agentExerciseHistory(ds, { exercise: 'back_squat', limit: 1 });
    if ('error' in h) throw new Error(h.error);
    expect(h.entries[0]?.video?.segments[1]?.set).toBe(2);
    expect(h.summary.videoDays).toBe(1);
  });

  it('搜尋訓練日：有影片篩選、附日誌', () => {
    const r = agentSearchDays(ds, { hasVideo: true, includeJournal: true });
    if ('error' in r) throw new Error(r.error);
    expect(r.days.map((d) => d.date)).toEqual(['2026-10-19']);
    expect(r.days[0]?.journal?.length).toBeGreaterThan(10);
  });

  it('日誌全文：新到舊、關鍵字、去掉標題', () => {
    const all = agentJournals(ds, { limit: 3 });
    expect(all.journals).toHaveLength(3);
    expect(all.journals[0]?.date.localeCompare(all.journals[1]?.date ?? '')).toBe(1);
    expect(all.journals.every((j) => !j.text.startsWith('#'))).toBe(true);
    const q = agentJournals(ds, { query: '深蹲', limit: 100 });
    expect(q.journals.every((j) => j.text.includes('深蹲'))).toBe(true);
  });

  it('期間統計並附前一段', () => {
    const r = agentPeriodStats(ds, T, { days: 7 });
    if ('error' in r) throw new Error(r.error);
    expect(r.period.from).toBe('2026-10-15');
    expect(r.previousPeriod.to).toBe('2026-10-14');
    expect(r.period.dates).toContain('2026-10-19');
    expect('error' in agentPeriodStats(ds, T, { from: '2026-10-21', to: '2026-10-01' })).toBe(true);
  });

  it('每週訓練量、破紀錄、兩天比較、全文搜尋', () => {
    const w = agentWeeklyVolume(ds, T, { weeks: 4 });
    expect(w).toHaveLength(4);
    expect(w[3]?.weekStart).toBe('2026-10-19');
    const pr = agentPersonalRecords(ds, { exercise: 'back_squat' });
    if ('error' in pr) throw new Error(pr.error);
    expect(pr.currentBests[0]?.exerciseId).toBe('back_squat');
    const c = agentCompareDays(ds, '2026-10-19', '2026-10-12');
    if ('error' in c) throw new Error(c.error);
    expect(c.totalVolumeKg).toEqual({ a: 7236, b: 4975 });
    const n = agentSearchNotes(ds, { query: '深蹲' });
    if ('error' in n) throw new Error(n.error);
    expect(n.totalMatching).toBeGreaterThan(0);
    expect('error' in agentSearchNotes(ds, { query: '  ' })).toBe(true);
  });

  it('影片：某天、某動作、最近清單', () => {
    const v = agentVideos(ds, { date: '2026-10-19' });
    expect('segments' in v && v.segments[1]?.url).toBe('https://youtu.be/abcdefghijk?t=50');
    const e = agentVideos(ds, { exercise: 'back_squat' });
    expect('totalDays' in e && e.totalDays).toBe(1);
    expect('error' in agentVideos(ds, { date: '2026-10-20' })).toBe(true);
  });

  it('每個工具都能執行、結果可序列化', () => {
    const names = AGENT_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    const sample: Record<string, Record<string, unknown>> = {
      get_exercise_history: { exercise: 'back_squat' },
      get_training_day: { date: '2026-10-19' },
      compare_training_days: { a: '2026-10-19', b: '2026-10-12' },
      search_notes: { query: '深蹲' },
    };
    for (const t of AGENT_TOOLS)
      expect(() => JSON.stringify(t.run(ds, T, sample[t.name] ?? {}))).not.toThrow();
  });
});
