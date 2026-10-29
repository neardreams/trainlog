// 資料驗證、adapter、與 golden 以外的工具函式
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  addDays,
  avgExcludingCurrent,
  calcVolume,
  compareDays,
  dayVideo,
  deltaOf,
  entryVideo,
  exerciseVideos,
  fmtClock,
  exercisesCsv,
  formatSets,
  getMaxWeight,
  groupRangeEntries,
  heatLevel,
  isPortrait,
  latestTrainingDate,
  legacyUrlToHash,
  mondayOf,
  nextTrainingDate,
  niceTicks,
  parseDataset,
  prevTrainingDate,
  rangeEntries,
  rangeStats,
  segmentAt,
  segmentsByExercise,
  setBlocks,
  setRuns,
  stripJournalHeading,
  topSetSegment,
  youtubeEmbedUrl,
  youtubeUrl,
  type Entry,
} from '../src';

const read = (f: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures', f), 'utf8'));
const training = read('training_data.json');
const journals = read('journals_raw.json');
const clone = () => structuredClone(training);
const ds = (() => {
  const r = parseDataset(training, journals);
  if (!r.ok) throw new Error(r.issues.join('\n'));
  return r.dataset;
})();
const T = '2026-10-21';

describe('資料驗證', () => {
  it('真實資料通過', () => expect(parseDataset(training, journals).ok).toBe(true));
  it('id 重複會失敗', () => {
    const d = clone();
    d.exercises[1].id = d.exercises[0].id;
    expect(parseDataset(d).ok).toBe(false);
  });
  it('日期格式錯誤會失敗', () => {
    const d = clone();
    d.exercises[0].history[0].date = '2026/1/2';
    expect(parseDataset(d).ok).toBe(false);
  });
  it('history 順序錯亂或同日重複會失敗', () => {
    const d = clone();
    const h = d.exercises.find((e: { history: unknown[] }) => e.history.length > 2).history;
    h[1].date = h[0].date;
    expect(parseDataset(d).ok).toBe(false);
  });
  it('部位不在 group_order 會失敗', () => {
    const d = clone();
    d.exercises[0].group = '不存在的部位';
    expect(parseDataset(d).ok).toBe(false);
  });
  it('未知欄位會失敗（避免打錯欄位名稱）', () => {
    const d = clone();
    d.exercises[0].history[0].exhuastion = '普通';
    expect(parseDataset(d).ok).toBe(false);
  });
});

describe('adapter', () => {
  it('紀錄與組數沒有遺漏', () => {
    const rawEntries = training.exercises.reduce(
      (s: number, e: { history: unknown[] }) => s + e.history.length,
      0,
    );
    const rawSets = training.exercises.reduce(
      (s: number, e: { history: { sets: unknown[] }[] }) =>
        s + e.history.reduce((a, h) => a + h.sets.length, 0),
      0,
    );
    const entries = [...ds.entriesByExercise.values()].flat();
    expect(entries.length).toBe(rawEntries);
    expect(entries.reduce((s, e) => s + e.sets.length, 0)).toBe(rawSets);
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
  });
  it('只有日誌、沒有訓練的日子也有 Session', () => {
    const journalOnly = ds.sessions.filter((s) => s.hasJournal && s.entryIds.length === 0);
    const expected = Object.keys(journals).filter((d) => !ds.entriesByDate.has(d));
    expect(journalOnly.map((s) => s.date)).toEqual(expected.sort());
  });
  it('去掉日誌標題', () => expect(stripJournalHeading('# 2026年10月19日\n\n今天')).toBe('今天'));
});

describe('計算', () => {
  const e = (sets: [number | null, number | null][]): Entry => ({
    id: 'x@2026-01-01',
    exerciseId: 'x',
    date: '2026-01-01',
    sets: sets.map(([w, r]) => ({ weightKg: w, reps: r })),
  });
  it('容量：任一組為 null 就是 null', () => {
    expect(
      calcVolume(
        e([
          [90, 6],
          [90, 6],
        ]).sets,
      ),
    ).toBe(1080);
    expect(
      calcVolume(
        e([
          [90, 6],
          [null, 6],
        ]).sets,
      ),
    ).toBeNull();
    expect(calcVolume([])).toBeNull();
  });
  it('最高重量只看大於 0 的重量', () => {
    expect(
      getMaxWeight(
        e([
          [0, 10],
          [12.5, 8],
        ]).sets,
      ),
    ).toBe(12.5);
    expect(getMaxWeight(e([[0, 10]]).sets)).toBeNull();
  });
  it('每組一格：組號與重量深淺', () => {
    const r = setBlocks(
      e([
        [55, 10],
        [60, 10],
        [57.5, 8],
        [55, 10],
      ]),
      {},
    );
    expect(r.kind).toBe('blocks');
    if (r.kind !== 'blocks') return;
    expect(r.blocks.map((b) => b.no)).toEqual([1, 2, 3, 4]);
    expect(r.blocks.map((b) => b.level)).toEqual([1, 3, 2, 1]);
    const same = setBlocks(
      e([
        [32, 10],
        [32, 8],
      ]),
      {},
    );
    expect(same.kind === 'blocks' && same.blocks.map((b) => b.level)).toEqual([1, 1]);
    const zero = setBlocks(e([[0, 20]]), { zeroLabel: '空重', repUnit: '秒' });
    expect(zero.kind === 'blocks' && zero.blocks[0]).toMatchObject({ zeroLabel: '空重', unit: '秒' });
    expect(setBlocks({ ...e([]), setsDisplay: '19:00 階梯有氧課' }, {})).toEqual({
      kind: 'text',
      text: '19:00 階梯有氧課',
    });
  });
  it('組數合併與文字格式（沿用 v6）', () => {
    const en = e([
      [15, 10],
      [15, 10],
      [15, 10],
      [20, 8],
    ]);
    expect(setRuns(en, {})).toEqual([
      { kind: 'run', weightKg: 15, reps: 10, count: 3 },
      { kind: 'run', weightKg: 20, reps: 8, count: 1 },
    ]);
    expect(formatSets(en, {})).toBe('3×10　(15kg) / 20kg×8');
    expect(
      formatSets(
        e([
          [0, 40],
          [0, 40],
        ]),
        { repUnit: '秒', zeroLabel: '自重' },
      ),
    ).toBe('2×40秒　(自重)');
    expect(formatSets(e([[null, 10]]), {})).toBe('動作練習');
  });
  it('整齊刻度', () => {
    expect(niceTicks(45000)).toEqual({ step: 20000, max: 60000, ticks: [0, 20000, 40000, 60000] });
    expect(niceTicks(6).ticks).toEqual([0, 2, 4, 6]);
  });
  it('增減與平均', () => {
    expect(deltaOf(87669, 76248.5, true)).toEqual({ dir: 'up', value: 15 });
    expect(deltaOf(1, 3)).toEqual({ dir: 'down', value: 2 });
    expect(avgExcludingCurrent([2, 4, 100])).toBe(3);
    expect([0, 1, 10, 11, 21, 31].map(heatLevel)).toEqual([0, 1, 1, 2, 3, 4]);
  });
  it('日期工具不會差一天', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(mondayOf('2026-11-01')).toBe('2026-10-26');
  });
  it('前後訓練日', () => {
    expect(latestTrainingDate(ds, T)).toBe('2026-10-19');
    expect(nextTrainingDate(ds, '2026-10-19')).toBeNull();
    expect(prevTrainingDate(ds, '2026-10-19')).toBe('2026-10-17');
  });
  it('範圍、分組、統計、比較', () => {
    const r = rangeEntries(ds, '2026-10-19', 0, 'date-desc');
    expect(r.length).toBe(8);
    expect(groupRangeEntries(ds, r, 'group', 'date-desc').map((g) => g.id)).toEqual([
      '腿部',
      '背部',
      '肩部',
      '手臂',
    ]);
    const st = rangeStats(ds, '2026-10-19', 0);
    expect({ entries: st.entries, sets: st.sets, volume: st.volume }).toEqual({
      entries: 8,
      sets: 23,
      volume: 7236,
    });
    const c = compareDays(ds, '2026-10-19', '2026-10-12');
    expect({ a: c.totalA, b: c.totalB, common: c.common }).toEqual({ a: 7236, b: 4975, common: 1 });
  });
  it('CSV 有 BOM 與表頭', () => {
    const csv = exercisesCsv(ds, ds.exercises.slice(0, 2), T);
    expect(csv.startsWith('﻿動作,部位,上次訓練')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(3);
  });
  it('舊網址轉換', () => {
    expect(legacyUrlToHash('?date=2026-10-19')).toBe('#/days/2026-10-19');
    expect(legacyUrlToHash('?exercise=back_squat')).toBe('#/exercises?ex=back_squat');
    expect(legacyUrlToHash('?view=spec')).toBe('#/spec');
    expect(legacyUrlToHash('?m=dark')).toBeNull();
  });
});

describe('影片', () => {
  // 取 fixture 裡某天有兩個以上動作、且第一個動作有組數的日子，做一支假影片
  const day = [...ds.entriesByDate.entries()].find(([, es]) => es.length >= 2 && es[0]!.sets.length >= 2)!;
  const [date, [a, b]] = [day[0], day[1] as [Entry, Entry]];
  type Seg = { exercise_id: string; start: number; end: number; label: string; set?: number; side?: string };
  const videos = () => ({
    videos: [
      {
        date,
        youtube_id: 'abcDEF_12-3',
        duration_sec: 120,
        canvas: '1080x1920',
        title: `${date} 測試`,
        segments: [
          { exercise_id: a.exerciseId, start: 0, end: 40, label: '第 1 組', set: 1 },
          { exercise_id: a.exerciseId, start: 40, end: 80, label: '片段 2', side: '左' },
        ] as Seg[],
      },
    ],
  });
  const parsed = (v: unknown) => parseDataset(training, journals, v);

  it('沒有 videos.json 時一樣通過，且沒有影片', () => {
    const r = parseDataset(training, journals);
    expect(r.ok && r.dataset.videosByDate.size).toBe(0);
  });
  it('影片對應到當天那個動作的各段', () => {
    const r = parsed(videos());
    if (!r.ok) throw new Error(r.issues.join('\n'));
    expect(dayVideo(r.dataset, date)?.youtubeId).toBe('abcDEF_12-3');
    const ev = entryVideo(r.dataset, a);
    expect(ev?.segments.map((s) => [s.start, s.label, s.set ?? null, s.side ?? null])).toEqual([
      [0, '第 1 組', 1, null],
      [40, '片段 2', null, '左'],
    ]);
    expect(entryVideo(r.dataset, b)).toBeUndefined();
  });
  it('畫面尺寸：直式／橫式', () => {
    const r = parsed(videos());
    if (!r.ok) throw new Error(r.issues.join('\n'));
    const v = dayVideo(r.dataset, date)!;
    expect([v.width, v.height, isPortrait(v)]).toEqual([1080, 1920, true]);
    const land = videos();
    land.videos[0]!.canvas = '1920x1080';
    const r2 = parsed(land);
    expect(r2.ok && isPortrait(dayVideo(r2.dataset, date)!)).toBe(false);
  });
  it('畫面尺寸缺少或格式錯誤會失敗', () => {
    for (const canvas of [undefined, '1080', '1080×1920', '0x1920']) {
      const v = videos();
      if (canvas === undefined) delete (v.videos[0] as { canvas?: string }).canvas;
      else v.videos[0]!.canvas = canvas;
      expect(parsed(v).ok, String(canvas)).toBe(false);
    }
  });
  it('依動作分組、找出某秒所在的段', () => {
    const v = videos();
    v.videos[0]!.segments.push(
      { exercise_id: b.exerciseId, start: 80, end: 100, label: '暖身' },
      { exercise_id: a.exerciseId, start: 100, end: 120, label: '片段 4' },
    );
    const r = parsed(v);
    if (!r.ok) throw new Error(r.issues.join('\n'));
    const vid = dayVideo(r.dataset, date)!;
    // 同一個動作分在同一組（即使中間穿插別的動作），組依第一次出現的時間排序
    expect(segmentsByExercise(vid).map((g) => [g.exerciseId, g.segments.map((s) => s.start)])).toEqual([
      [a.exerciseId, [0, 40, 100]],
      [b.exerciseId, [80]],
    ]);
    expect(segmentAt(vid.segments, 0)?.start).toBe(0);
    expect(segmentAt(vid.segments, 40)?.start).toBe(40);
    expect(segmentAt(vid.segments, 99.9)?.label).toBe('暖身');
    expect(segmentAt(vid.segments, 120)).toBeUndefined();
  });
  it('這個動作所有拍了影片的日子（新到舊）', () => {
    // 找同一個動作的另一天，也做一支影片
    const other = ds.entriesByExercise.get(a.exerciseId)!.find((e) => e.date < date)!;
    const v = videos();
    v.videos.push({
      date: other.date,
      youtube_id: 'zyxWVU_98-7',
      duration_sec: 60,
      canvas: '1920x1080',
      title: `${other.date} 測試`,
      segments: [{ exercise_id: a.exerciseId, start: 0, end: 30, label: '片段 1' }],
    });
    const r = parsed(v);
    if (!r.ok) throw new Error(r.issues.join('\n'));
    expect(exerciseVideos(r.dataset, a.exerciseId).map((x) => [x.video.date, x.segments.length])).toEqual([
      [date, 2],
      [other.date, 1],
    ]);
    expect(exerciseVideos(r.dataset, b.exerciseId)).toEqual([]);
  });
  it('最重那一組的段落', () => {
    const seg = (start: number, set?: number) => ({
      exerciseId: a.exerciseId,
      start,
      end: start + 10,
      label: '',
      ...(set ? { set } : {}),
    });
    const e = (...w: (number | null)[]) => ({ ...a, sets: w.map((weightKg) => ({ weightKg, reps: 5 })) });
    // 第 3 組最重
    expect(topSetSegment(e(60, 70, 80), [seg(0, 1), seg(10, 2), seg(20, 3)])?.start).toBe(20);
    // 同重量取第一組（不管片段順序）
    expect(topSetSegment(e(60, 80, 80), [seg(0, 3), seg(10, 2)])?.start).toBe(10);
    // 最重的組沒拍到、或沒有組號、或沒有重量：取第一段
    expect(topSetSegment(e(60, 80), [seg(5, 1), seg(15)])?.start).toBe(5);
    expect(topSetSegment(e(null, null), [seg(7), seg(17, 2)])?.start).toBe(7);
    expect(topSetSegment(e(60), [])).toBeUndefined();
  });
  it('YouTube ID 格式錯誤會失敗', () => {
    const v = videos();
    v.videos[0]!.youtube_id = 'short';
    expect(parsed(v).ok).toBe(false);
  });
  it('對不到訓練紀錄的片段會失敗', () => {
    const v = videos();
    v.videos[0]!.segments[0]!.exercise_id = 'no_such_exercise';
    const r = parsed(v);
    expect(!r.ok && r.issues.some((i) => i.includes('找不到'))).toBe(true);
  });
  it('組號超過當天組數會失敗', () => {
    const v = videos();
    v.videos[0]!.segments[0]!.set = a.sets.length + 1;
    expect(parsed(v).ok).toBe(false);
  });
  it('片段重疊或超過影片長度會失敗', () => {
    const overlap = videos();
    overlap.videos[0]!.segments[1]!.start = 30;
    expect(parsed(overlap).ok).toBe(false);
    const tooLong = videos();
    tooLong.videos[0]!.segments[1]!.end = 200;
    expect(parsed(tooLong).ok).toBe(false);
  });
  it('同一天兩支影片會失敗', () => {
    const v = videos();
    v.videos.push(structuredClone(v.videos[0]!));
    expect(parsed(v).ok).toBe(false);
  });
  it('網址與時間格式', () => {
    expect(youtubeUrl('abcDEF_12-3')).toBe('https://youtu.be/abcDEF_12-3');
    expect(youtubeUrl('abcDEF_12-3', 45.9)).toBe('https://youtu.be/abcDEF_12-3?t=45');
    expect(youtubeEmbedUrl('abcDEF_12-3')).toBe(
      'https://www.youtube-nocookie.com/embed/abcDEF_12-3?start=0&autoplay=1&rel=0&playsinline=1',
    );
    expect(youtubeEmbedUrl('abcDEF_12-3', 32.31)).toBe(
      'https://www.youtube-nocookie.com/embed/abcDEF_12-3?start=32&autoplay=1&rel=0&playsinline=1',
    );
    expect(youtubeEmbedUrl('abcDEF_12-3', 5, 'https://trainlog.x-hu.com')).toBe(
      'https://www.youtube-nocookie.com/embed/abcDEF_12-3?start=5&autoplay=1&rel=0&playsinline=1' +
        '&enablejsapi=1&origin=https%3A%2F%2Ftrainlog.x-hu.com',
    );
    expect(fmtClock(0)).toBe('0:00');
    expect(fmtClock(75.6)).toBe('1:15');
    expect(fmtClock(3725)).toBe('1:02:05');
  });
});
