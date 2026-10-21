// 資料驗證、adapter、與 golden 以外的工具函式
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  addDays,
  avgExcludingCurrent,
  calcVolume,
  compareDays,
  deltaOf,
  exercisesCsv,
  formatSets,
  getMaxWeight,
  groupRangeEntries,
  heatLevel,
  latestTrainingDate,
  legacyUrlToHash,
  mondayOf,
  nextTrainingDate,
  niceTicks,
  parseDataset,
  prevTrainingDate,
  rangeEntries,
  rangeStats,
  setRuns,
  stripJournalHeading,
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
