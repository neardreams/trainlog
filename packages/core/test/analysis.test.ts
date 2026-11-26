// 2026-11-26 加的分析功能：動作順序、容量（秒數／米數不算、每邊 ×2）、推估 1RM、次數破紀錄、
// 同型動作與久未練、RIR／有氧解析、動作分類，以及對應的 AI 查詢
import { describe, expect, it } from 'vitest';
import {
  AGENT_PROMPTS,
  AGENT_TOOLS,
  agentDay,
  agentExerciseHistory,
  agentExercisesHistory,
  agentListExercises,
  agentOverview,
  agentPeriodStats,
  agentPersonalRecords,
  dayVol,
  entryVolume,
  estimate1rm,
  neglectedExercises,
  parseCardio,
  parseDataset,
  parseRir,
  prevEntries,
  resolveExercise,
  rirBucket,
  rirMin,
  strengthPrEvents,
  unitTotal,
  volumeFactor,
  type Dataset,
} from '../src';

type H = { date: string; sets: [number | null, number | null][]; order?: number; feel?: string } & Record<
  string,
  unknown
>;
const ex = (id: string, name: string, group: string, history: H[], extra: Record<string, unknown> = {}) => ({
  id,
  name,
  group,
  ...extra,
  history,
});

const raw = () => ({
  meta: { group_order: ['腿部', '背部', '核心', '有氧'] },
  exercises: [
    ex(
      'leg_extension',
      '坐姿踢腿機',
      '腿部',
      [
        { date: '2026-09-01', sets: [[38, 10]], order: 2 },
        { date: '2026-09-05', sets: [[38, 10]], order: 1 },
        { date: '2026-09-10', sets: [[40, 10]], order: 1 },
      ],
      { family: 'leg_extension', pattern: 'isolation', muscles: ['股四頭'] },
    ),
    ex(
      'leg_extension_single',
      '單腳腿伸展',
      '腿部',
      [
        {
          date: '2026-10-02',
          sets: [
            [30, 10],
            [30, 10],
            [30, 10],
          ],
          order: 1,
        },
        { date: '2026-10-20', sets: [[25, 12]], order: 1 },
        {
          date: '2026-11-25',
          sets: [
            [25, 12],
            [30, 12],
            [30, 11],
          ],
          order: 1,
          feel: '單腳、右腳先；第三組右腳 RIR 0–1、左腳 RIR 2–3',
        },
      ],
      { per_side: true, family: 'leg_extension', pattern: 'isolation', muscles: ['股四頭'] },
    ),
    ex(
      'hack_squat',
      '哈克深蹲',
      '腿部',
      [
        { date: '2026-09-01', sets: [[50, 10]], order: 1 },
        {
          date: '2026-11-25',
          sets: [
            [40, 10],
            [50, 10],
          ],
          order: 2,
          feel: 'RIR 約 2',
        },
      ],
      { pattern: 'squat', muscles: ['股四頭', '臀'], secondary_muscles: ['內收'] },
    ),
    ex('bulgarian_split', '後腳抬高蹲', '腿部', [{ date: '2026-11-25', sets: [[30, 10]], order: 3 }], {
      reps_per_side: true,
      pattern: 'lunge',
      muscles: ['股四頭', '臀'],
    }),
    ex(
      'plank',
      '棒式（負重）',
      '核心',
      [
        {
          date: '2026-09-05',
          sets: [
            [20, 40],
            [20, 40],
          ],
          order: 2,
        },
        { date: '2026-09-10', sets: [[20, 50]], order: 2 },
      ],
      { rep_unit: '秒', pattern: 'core', muscles: ['腹'] },
    ),
    ex(
      'farmer_walk',
      '農夫走路',
      '核心',
      [
        {
          date: '2026-11-25',
          sets: [
            [74.2, 15],
            [74.2, 15],
          ],
          order: 4,
        },
      ],
      { rep_unit: '米', pattern: 'carry', muscles: ['前臂'] },
    ),
    ex(
      'sled_push',
      '推雪橇',
      '核心',
      [
        { date: '2026-03-10', sets: [[40, 2]], order: 1 },
        { date: '2026-03-11', sets: [[40, 2]], order: 1 },
        { date: '2026-03-12', sets: [[44, 2]], order: 1 },
      ],
      { archived: true, pattern: 'carry' },
    ),
    ex(
      'treadmill',
      '跑步機',
      '有氧',
      [
        {
          date: '2026-11-25',
          sets: [],
          order: 5,
          minutes: 30,
          sets_display: '30 分 · 4 km/h · 坡度 3 · 心率 120 出頭',
        },
      ],
      { kind: 'cardio', pattern: 'cardio', muscles: ['心肺'] },
    ),
  ],
});

const build = (r: unknown): Dataset => {
  const p = parseDataset(r);
  if (!p.ok) throw new Error(p.issues.join('\n'));
  return p.dataset;
};
const ds = build(raw());
const T = '2026-11-26';
const E = (id: string, date: string) => ds.entriesByExercise.get(id)!.find((e) => e.date === date)!;
const X = (id: string) => ds.exerciseById.get(id)!;

describe('動作順序（order）', () => {
  it('每天依 order 排，不是動作主檔順序', () => {
    expect(ds.entriesByDate.get('2026-11-25')!.map((e) => e.exerciseId)).toEqual([
      'leg_extension_single',
      'hack_squat',
      'bulgarian_split',
      'farmer_walk',
      'treadmill',
    ]);
    expect(ds.entriesByDate.get('2026-09-05')!.map((e) => e.exerciseId)).toEqual(['leg_extension', 'plank']);
    expect(ds.sessions.find((s) => s.date === '2026-11-25')!.entryIds[0]).toBe(
      'leg_extension_single@2026-11-25',
    );
  });
  it('同一天缺 order、重複或不連續會失敗；整天都沒有 order 可以', () => {
    const a = raw();
    delete a.exercises[2]!.history[1]!.order;
    expect(parseDataset(a).ok).toBe(false);
    const b = raw();
    b.exercises[2]!.history[1]!.order = 1;
    expect(parseDataset(b).ok).toBe(false);
    const c = raw();
    for (const e of c.exercises) for (const h of e.history) delete h.order;
    const dc = build(c);
    // 沒有 order：依動作主檔順序
    expect(dc.entriesByDate.get('2026-11-25')![0]!.exerciseId).toBe('leg_extension_single');
  });
  it('分類欄位：未知的動作模式或肌群會失敗', () => {
    const a = raw();
    (a.exercises[0] as Record<string, unknown>).pattern = 'push';
    expect(parseDataset(a).ok).toBe(false);
    const b = raw();
    (b.exercises[0] as Record<string, unknown>).muscles = ['大腿'];
    expect(parseDataset(b).ok).toBe(false);
    expect(X('hack_squat').secondaryMuscles).toEqual(['內收']);
    expect(X('sled_push').muscles).toEqual([]);
  });
});

describe('容量', () => {
  it('每邊重量 ×2、每邊次數 ×2、秒數／米數與有氧沒有容量', () => {
    expect(volumeFactor(E('leg_extension_single', '2026-11-25'), X('leg_extension_single'))).toBe(2);
    expect(entryVolume(E('leg_extension_single', '2026-11-25'), X('leg_extension_single'))).toBe(
      (25 * 12 + 30 * 12 + 30 * 11) * 2,
    );
    expect(entryVolume(E('bulgarian_split', '2026-11-25'), X('bulgarian_split'))).toBe(600);
    expect(entryVolume(E('hack_squat', '2026-11-25'), X('hack_squat'))).toBe(900);
    expect(entryVolume(E('farmer_walk', '2026-11-25'), X('farmer_walk'))).toBeNull();
    expect(entryVolume(E('plank', '2026-09-05'), X('plank'))).toBeNull();
    expect(entryVolume(E('treadmill', '2026-11-25'), X('treadmill'))).toBeNull();
    expect(dayVol(ds, '2026-11-25')).toBe(1980 + 900 + 600);
  });
  it('秒數／米數合計', () => {
    expect(unitTotal(E('farmer_walk', '2026-11-25'), X('farmer_walk'))).toBe(30);
    expect(unitTotal(E('plank', '2026-09-05'), X('plank'))).toBe(80);
    expect(unitTotal(E('hack_squat', '2026-11-25'), X('hack_squat'))).toBeNull();
  });
});

describe('推估 1RM 與破紀錄', () => {
  it('Epley，只算 1–12 下；秒數動作沒有', () => {
    expect(estimate1rm([{ weightKg: 100, reps: 5 }], X('hack_squat'))).toBe(116.7);
    expect(estimate1rm([{ weightKg: 100, reps: 1 }], X('hack_squat'))).toBe(100);
    expect(estimate1rm([{ weightKg: 50, reps: 20 }], X('hack_squat'))).toBeNull();
    expect(estimate1rm([{ weightKg: 20, reps: 40 }], X('plank'))).toBeNull();
  });
  it('前兩次：同動作在這天之前最近 n 次，新到舊，不含當天', () => {
    const e = E('leg_extension_single', '2026-11-25');
    expect(prevEntries(ds, e, 2).map((x) => x.date)).toEqual(['2026-10-20', '2026-10-02']);
    expect(prevEntries(ds, E('leg_extension_single', '2026-10-02'), 2)).toEqual([]);
  });
  it('同重量做更多下算 reps 破紀錄（10/2 30×10 → 11/25 30×12）', () => {
    const p = strengthPrEvents(ds).filter((x) => x.exerciseId === 'leg_extension_single');
    expect(p.find((x) => x.date === '2026-11-25' && x.kind === 'reps')).toMatchObject({
      weightKg: 30,
      prevReps: 10,
      reps: 12,
    });
    // 30×12 的推估 1RM 也超過 30×10
    expect(p.some((x) => x.date === '2026-11-25' && x.kind === 'e1rm')).toBe(true);
    // 最高重量沒超過，不算 weight
    expect(p.some((x) => x.date === '2026-11-25' && x.kind === 'weight')).toBe(false);
  });
  it('最高重量破紀錄就不另算 reps；秒數動作撐更久算 reps', () => {
    const p = strengthPrEvents(ds);
    expect(
      p.filter((x) => x.exerciseId === 'leg_extension' && x.date === '2026-09-10').map((x) => x.kind),
    ).toEqual(['weight', 'e1rm']);
    expect(p.find((x) => x.exerciseId === 'plank')).toMatchObject({ kind: 'reps', prevReps: 40, reps: 50 });
  });
});

describe('同型動作與久未練', () => {
  it('同型動作近期練過、或不再做的動作，不算久未練', () => {
    // 坐姿踢腿機 9/10 後沒練，但同型的單腳腿伸展 11/25 練過
    expect(neglectedExercises(ds, T, 10).map((e) => e.id)).toEqual([]);
    const a = raw();
    delete (a.exercises[0] as Record<string, unknown>).family;
    delete (a.exercises[6] as Record<string, unknown>).archived;
    expect(neglectedExercises(build(a), T, 10).map((e) => e.id)).toEqual(['leg_extension', 'sled_push']);
  });
});

describe('文字解析', () => {
  it('RIR：範圍、約、以上、半下、左右分開', () => {
    expect(parseRir('第三組右腳 RIR 0–1、左腳 RIR 2–3')).toEqual([
      { min: 0, max: 1, side: '右' },
      { min: 2, max: 3, side: '左' },
    ]);
    expect(parseRir('單手右手先；右手 RIR 2+、左手 0–1')).toEqual([
      { min: 2, max: null, side: '右' },
      { min: 0, max: 1, side: '左' },
    ]);
    expect(parseRir('最後一組 RIR 約 2')).toEqual([{ min: 2, max: 2 }]);
    expect(parseRir('RIR 3+，略輕')).toEqual([{ min: 3, max: null }]);
    expect(parseRir('第三組 RIR >2')).toEqual([{ min: 2, max: null }]);
    expect(parseRir('RIR 半下')).toEqual([{ min: 0.5, max: 0.5 }]);
    expect(parseRir('第三組 RIR 接近 0')).toEqual([{ min: 0, max: 0 }]);
    expect(parseRir('RIR 還有好幾下')).toEqual([]);
    expect(parseRir(undefined)).toEqual([]);
    expect(rirMin(parseRir('右腳 RIR 0–1、左腳 RIR 2–3'))).toBe(0);
    expect(['0', '1', '2', '3+'].map((_, i) => rirBucket([0.5, 1, 2.5, 4][i]!))).toEqual([
      '0',
      '1',
      '2',
      '3+',
    ]);
  });
  it('有氧：速度、坡度、心率、瓦數、檔位、配速', () => {
    expect(parseCardio('30 分 · 4 km/h · 坡度 3 · 心率 120 出頭')).toEqual({
      speedKmh: 4,
      inclinePct: 3,
      hrBpm: 120,
    });
    expect(parseCardio('15 分 · 3.5–4.5 km/h · 坡度 0 · 心率 125–130')).toEqual({
      speedKmh: 4,
      inclinePct: 0,
      hrBpm: 127.5,
    });
    expect(parseCardio('5×(20秒衝/40秒休) · 500–600 W')).toEqual({ watts: 550 });
    expect(parseCardio('10 + 10 分 · 檔位 2 · 組間休 2 分')).toEqual({ level: 2 });
    expect(parseCardio('5 分 · 第 3 檔 · 心率 140+')).toEqual({ level: 3, hrBpm: 140 });
    expect(parseCardio('15 圈（約 3 km）· 約 26 分半 · 均速約 8.8 分/km')).toEqual({ paceMinPerKm: 8.8 });
  });
});

describe('AI 查詢', () => {
  it('單日：不給日期＝最近一個訓練日、today、依順序、可省日誌、附上次紀錄', () => {
    const d = agentDay(ds, undefined, { today: T, includeRecentHistory: true, includeJournal: false });
    if ('error' in d) throw new Error(d.error);
    expect(d.date).toBe('2026-11-25');
    expect('journal' in d).toBe(false);
    expect(d.entries.map((e) => e.order)).toEqual([1, 2, 3, 4, 5]);
    expect(d.entries.every((e) => !('date' in e))).toBe(true);
    const le = d.entries[0]!;
    expect(le.volumeKg).toBe(1980);
    expect(le.rirMin).toBe(0);
    expect(le.prs?.map((p) => p.kind).sort()).toEqual(['e1rm', 'reps']);
    expect(le.recent?.previous).toMatchObject({ date: '2026-10-20', daysBefore: 36 });
    expect(le.recent?.bestBefore).toMatchObject({ weightKg: 30, date: '2026-10-02' });
    expect(le.recent?.family?.[0]).toMatchObject({ exerciseId: 'leg_extension', date: '2026-09-10' });
    const fw = d.entries.find((e) => e.exercise === '農夫走路')!;
    expect(fw).toMatchObject({ volumeKg: null, totalMeters: 30, kgMeters: 2226 });
    expect(d.entries.find((e) => e.exercise === '跑步機')?.cardio).toMatchObject({ speedKmh: 4, hrBpm: 120 });
    const t = agentDay(ds, 'today', { today: T });
    expect('error' in t && t.nearest?.before).toBe('2026-11-25');
    expect('error' in agentDay(ds, 'yesterday', { today: T })).toBe(true);
  });
  it('動作歷程：一次查多個、同型動作、關鍵字對到多個時附候選', () => {
    const r = agentExercisesHistory(ds, { exercises: ['hack_squat', 'leg_extension_single', 'nope'] });
    expect(r.results).toHaveLength(3);
    expect('error' in r.results[2]!).toBe(true);
    const h = agentExerciseHistory(ds, { exercise: 'leg_extension_single', includeFamily: true });
    if ('error' in h) throw new Error(h.error);
    expect(h.entries.every((e) => !('exerciseId' in e) && !('group' in e))).toBe(true);
    expect(h.summary.bestE1rmKg).toBe(42);
    expect(h.family?.[0]?.entries?.[0]?.date).toBe('2026-09-10');
    expect(h.prs.some((p) => p.kind === 'reps')).toBe(true);
    const amb = resolveExercise(ds, '腿伸展');
    expect(amb?.ex.id).toBe('leg_extension_single');
    const many = resolveExercise(ds, 'leg_extension');
    expect(many?.ex.id).toBe('leg_extension');
    expect(resolveExercise(ds, 'leg_ext')?.others.map((o) => o.id)).toEqual(['leg_extension']);
  });
  it('期間統計：動作模式、肌群（次要 0.5）、RIR 分布、有氧', () => {
    const r = agentPeriodStats(ds, T, { days: 7 });
    if ('error' in r) throw new Error(r.error);
    const p = r.period;
    expect(p.setsByPattern).toEqual({ isolation: 3, squat: 2, lunge: 1, carry: 2 });
    expect(p.setsByMuscle).toEqual({ 股四頭: 6, 臀: 3, 內收: 1, 前臂: 2 });
    expect(p.rir).toEqual({ entries: 2, distribution: { '0': 1, '1': 0, '2': 1, '3+': 0 } });
    expect(p.cardio).toMatchObject({ sessions: 1, minutes: 30, avgHrBpm: 120 });
    expect(p.volumeKg).toBe(3480);
  });
  it('總覽、破紀錄種類篩選、動作清單分類篩選', () => {
    const o = agentOverview(ds, T);
    expect(o.patternLastTrained.find((x) => x.pattern === 'squat')?.lastDate).toBe('2026-11-25');
    expect(o.recentPRs.every((x) => x.kind !== 'e1rm')).toBe(true);
    const pr = agentPersonalRecords(ds, { kind: 'reps' });
    if ('error' in pr) throw new Error(pr.error);
    expect(pr.events.every((x) => x.kind === 'reps')).toBe(true);
    expect(agentListExercises(ds, T, { pattern: 'carry' }).map((e) => e.id)).toEqual([
      'farmer_walk',
      'sled_push',
    ]);
    expect(agentListExercises(ds, T, { pattern: 'carry', includeArchived: false }).map((e) => e.id)).toEqual([
      'farmer_walk',
    ]);
    expect(agentListExercises(ds, T, { muscle: '內收' }).map((e) => e.id)).toEqual(['hack_squat']);
  });
  it('工具：exercises 走批次、get_training_day 不給日期也能跑', () => {
    const tool = (n: string) => AGENT_TOOLS.find((t) => t.name === n)!;
    const b = tool('get_exercise_history').run(ds, T, { exercises: ['hack_squat'] }) as {
      results: unknown[];
    };
    expect(b.results).toHaveLength(1);
    const d = tool('get_training_day').run(ds, T, {}) as { date: string };
    expect(d.date).toBe('2026-11-25');
  });
  it('prompts：名稱不重複、必填參數、產生的文字提到要用的工具', () => {
    const names = AGENT_PROMPTS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    const day = AGENT_PROMPTS.find((p) => p.name === 'analyze_training_day')!;
    expect(day.render({})).toContain('includeRecentHistory: true');
    expect(day.render({ date: '2026-11-25' })).toContain('"2026-11-25"');
    const ep = AGENT_PROMPTS.find((p) => p.name === 'exercise_progress')!;
    expect(ep.arguments.find((a) => a.name === 'exercise')?.required).toBe(true);
  });
});
