// 特性測試：TypeScript 版的計算結果必須與 v9 預覽頁原始程式（tools/extract-v9-golden.mjs 產出）完全一致。
// 例外：2026-11-26 起容量的定義改了（秒數／米數動作不算、每邊 ×2，見 entryVolume），
// 所以每日／每週／總覽的容量與「依容量排序」不再和 v9 比對，改由 analysis.test.ts 驗證。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  calcVolume,
  cardioTotals,
  daysAgo,
  dayGroups,
  daySets,
  dayVol,
  dashboardStats,
  datesInRange,
  daysLabel,
  daysTone,
  entriesOf,
  exhTone,
  filterExercises,
  getMaxWeight,
  lastDate,
  longDate,
  matchPalette,
  mondayOf,
  parseDataset,
  prEvents,
  SORT_KEYS,
  sortExercises,
  statusOf,
  weekSeries,
  type Dataset,
  type Period,
} from '../src';

const fx = (f: string): unknown =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures', f), 'utf8'));
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- golden 是 v9 原始輸出的 JSON
const golden = fx('v9-golden.json') as any;
const parsed = parseDataset(fx('training_data.json'), fx('journals_raw.json'));
if (!parsed.ok) throw new Error(parsed.issues.join('\n'));
const ds: Dataset = parsed.dataset;
const T: string = golden.today;

describe('與 v9 golden 一致', () => {
  it('每個動作的容量、最高重量、上次訓練、狀態', () => {
    const actual = ds.exercises.map((e) => ({
      id: e.id,
      last: lastDate(ds, e.id),
      status: statusOf(ds, e.id, T),
      daysAgo: daysAgo(lastDate(ds, e.id), T),
      vol: entriesOf(ds, e.id).map((h) => calcVolume(h.sets)),
      maxWt: entriesOf(ds, e.id).map((h) => getMaxWeight(h.sets)),
      cardio: cardioTotals(entriesOf(ds, e.id)),
    }));
    expect(actual).toEqual(golden.perExercise);
  });

  for (const k of SORT_KEYS.filter((k) => k !== 'volume'))
    it(`排序：${k}`, () => expect(sortExercises(ds, k).map((e) => e.id)).toEqual(golden.sorted[k]));

  it('破紀錄清單', () =>
    expect(prEvents(ds).map((p) => ({ id: p.exerciseId, date: p.date, from: p.from, to: p.to }))).toEqual(
      golden.prEvents,
    ));

  it('每個訓練日的組數、容量、部位', () => {
    const actual = Object.fromEntries(
      ds.trainingDates.map((d) => [d, { sets: daySets(ds, d), groups: dayGroups(ds, d) }]),
    );
    const expected = Object.fromEntries(
      Object.entries(golden.days as Record<string, { sets: number; groups: string[] }>).map(([d, v]) => [
        d,
        { sets: v.sets, groups: v.groups },
      ]),
    );
    expect(actual).toEqual(expected);
    // 容量：沒有秒數／米數動作、也沒有每邊重量的日子，和 v9 一樣
    const plain = ds.trainingDates.filter((d) =>
      (ds.entriesByDate.get(d) ?? []).every((e) => {
        const ex = ds.exerciseById.get(e.exerciseId);
        return !ex?.repUnit && !ex?.perSide && !ex?.repsPerSide;
      }),
    );
    expect(plain.length).toBeGreaterThan(10);
    for (const d of plain) expect(dayVol(ds, d), d).toBe(golden.days[d].vol);
  });

  for (const p of [7, 30, 90] as Period[])
    it(`總覽（近 ${p} 天）`, () => {
      const s = dashboardStats(ds, T, p);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 容量另外驗證
      const { vC, vP, kspark, ...rest } = s;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { vC: gC, vP: gP, kspark: gk, ...grest } = golden.dashboard[p];
      expect({
        ...rest,
        kspark: { days: kspark.days, pr: kspark.pr },
        prC: s.prC.map((x) => ({ id: x.exerciseId, date: x.date, from: x.from, to: x.to })),
      }).toEqual({ ...grest, kspark: { days: gk.days, pr: gk.pr } });
    });

  it('每週訓練量（26 週，容量另外驗證）', () =>
    expect(weekSeries(ds, T, 26).map(({ w, days, sets }) => ({ w, days, sets }))).toEqual(
      (golden.weeks as { w: string; days: number; sets: number }[]).map(({ w, days, sets }) => ({
        w,
        days,
        sets,
      })),
    ));

  it('指令面板搜尋', () => {
    for (const [q, expected] of Object.entries(golden.palette as Record<string, string[]>))
      expect(
        matchPalette(ds, q, { mode: 'light', sidebarCollapsed: true, today: T }).map(
          (i) => `${i.sec}|${i.label}`,
        ),
        `查詢「${q}」`,
      ).toEqual(expected);
  });

  it('動作庫篩選', () => {
    const f = (status: 'all' | '7' | '30' | 'old', q = '', groups: string[] = []) => ({
      q,
      status,
      groups: new Set(groups),
    });
    const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
    const g = golden.filters;
    for (const s of ['all', '7', '30', 'old'] as const)
      expect(ids(filterExercises(ds, 'group', f(s), T))).toEqual(g[`status:${s}`]);
    expect(ids(filterExercises(ds, 'recent', f('all', '深蹲'), T))).toEqual(g['q:深蹲']);
    expect(ids(filterExercises(ds, 'name', f('all', '', ['胸部', '背部']), T))).toEqual(
      g['groups:胸部,背部'],
    );
  });

  it('文字與分類', () =>
    expect({
      daysLabel: [0, 1, 2, 15].map(daysLabel),
      daysTone: [0, 3, 4, 7, 8, 100].map(daysTone),
      exhTone: ['輕鬆', '普通', '吃力', '力竭', '力竭（左）', '—', undefined].map(exhTone),
      datesInRange: datesInRange('2026-10-19', 3),
      mondayOf: ['2026-10-19', '2026-10-21', '2026-10-25'].map(mondayOf),
      longDate: longDate('2026-10-19'),
    }).toEqual(golden.labels));
});
