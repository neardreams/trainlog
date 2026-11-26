// 現有 JSON 檔（data/training_data.json、data/journals_raw.json）的 zod schema。
// 只用於讀檔與驗證；畫面與計算一律使用 domain/ 的領域模型（ESLint 禁止 apps 匯入本檔）。
import { z } from 'zod';
import { DATE_RE } from '../dates';
import { MUSCLES, PATTERNS } from '../domain/taxonomy';

const optStr = z.string().nullish();

export const RawSetSchema = z.tuple([z.number().nullable(), z.number().nullable()]);

export const RawHistoryEntrySchema = z
  .object({
    date: z.string().regex(DATE_RE, '日期必須是 YYYY-MM-DD'),
    sets: z.array(RawSetSchema),
    /** 熱身組（日誌標明「熱身組」的組）：和正式組分開，不算進組數、容量、最高重量與破紀錄 */
    warmup_sets: z.array(RawSetSchema).min(1, 'warmup_sets 沒有內容時不要寫這個欄位').optional(),
    sets_display: optStr,
    feel: optStr,
    exhaustion: optStr,
    condition: optStr,
    cue: optStr,
    minutes: z.number().nullish(),
    distance_km: z.number().nullish(),
    /** 這筆紀錄的重量是不是每邊（一手／一腳／一側）的重量；有值時覆蓋動作的 per_side（同一動作混了啞鈴與槓鈴時用） */
    per_side: z.boolean().optional(),
    /** 當天第幾個做的動作（1 起算，依日誌的實際執行順序）；同一天要嘛全部都有、要嘛全部都沒有 */
    order: z.number().int().positive().optional(),
  })
  .strict();

export const RawExerciseSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/, 'id 必須是小寫英文、數字與底線'),
    name: z.string().min(1),
    group: z.string().min(1),
    icon: z.string().optional(),
    notes: z.array(z.string()).optional(),
    kind: z.literal('cardio').optional(),
    rep_unit: z.string().optional(),
    zero_label: z.string().optional(),
    /** 重量記每邊（一手／一腳／一側）：單手單腳動作、雙手各拿一顆啞鈴、左右分開的器械或繩索 */
    per_side: z.boolean().optional(),
    /** 重量記合計、次數記每邊（左右輪流做，例：雙手持啞鈴的後腳抬高蹲）：容量 ×2 */
    reps_per_side: z.boolean().optional(),
    /** 同型動作（同一個動作換器材、換單雙邊）共用的代號，例：坐姿踢腿機與單腳腿伸展都是 leg_extension */
    family: z
      .string()
      .regex(/^[a-z0-9_]+$/, 'family 必須是小寫英文、數字與底線')
      .optional(),
    /** 不再做的動作：不列入久未練 */
    archived: z.boolean().optional(),
    /** 動作模式 */
    pattern: z.enum(PATTERNS).optional(),
    /** 主要肌群 */
    muscles: z.array(z.enum(MUSCLES)).min(1).optional(),
    /** 次要肌群 */
    secondary_muscles: z.array(z.enum(MUSCLES)).min(1).optional(),
    history: z.array(RawHistoryEntrySchema),
  })
  .strict();

/** 當天熱身清單的一項（滾筒放鬆、伸展、活動度、啟動動作…），依日誌順序 */
export const RawWarmupItemSchema = z
  .object({
    name: z.string().min(1),
    /** 組數、次數、秒數或部位，例如「2 組 × 10 下」「40 秒」「背、胸椎」 */
    detail: optStr,
  })
  .strict();

export const RawTrainingDataSchema = z
  .object({
    meta: z
      .object({
        group_order: z.array(z.string()).min(1),
        group_accent: z.record(z.string(), z.string()).optional(),
        exhaustion_style: z.record(z.string(), z.string()).optional(),
      })
      .loose(),
    exercises: z.array(RawExerciseSchema),
    /** 每天的熱身清單（日誌「今天的熱身」段落），和正式訓練分開 */
    warmups: z
      .record(
        z.string().regex(DATE_RE, '熱身清單的 key 必須是 YYYY-MM-DD'),
        z.array(RawWarmupItemSchema).min(1, '沒有熱身就不要寫那一天'),
      )
      .optional(),
  })
  .superRefine((d, ctx) => {
    const ids = new Set<string>();
    d.exercises.forEach((e, i) => {
      if (ids.has(e.id))
        ctx.addIssue({ code: 'custom', path: ['exercises', i, 'id'], message: `id 重複：${e.id}` });
      ids.add(e.id);
      if (!d.meta.group_order.includes(e.group))
        ctx.addIssue({
          code: 'custom',
          path: ['exercises', i, 'group'],
          message: `部位不在 group_order：${e.group}`,
        });
      e.history.forEach((h, j) => {
        const prev = e.history[j - 1];
        if (prev && h.date <= prev.date)
          ctx.addIssue({
            code: 'custom',
            path: ['exercises', i, 'history', j, 'date'],
            message: `history 必須依日期由舊到新且同一天只有一筆：${e.id} ${prev.date} → ${h.date}`,
          });
      });
    });
    // 動作順序：同一天要嘛全部都有 order、要嘛全部都沒有；有的話必須剛好是 1..N
    const byDate = new Map<string, (number | undefined)[]>();
    for (const e of d.exercises)
      for (const h of e.history) byDate.set(h.date, [...(byDate.get(h.date) ?? []), h.order]);
    for (const [date, orders] of byDate) {
      const given = orders.filter((o): o is number => o != null);
      if (!given.length) continue;
      const ok =
        given.length === orders.length && [...given].sort((a, b) => a - b).every((o, i) => o === i + 1);
      if (!ok)
        ctx.addIssue({
          code: 'custom',
          path: ['exercises'],
          message: `${date} 的 order 必須每筆都有且剛好是 1..${orders.length}（目前：${orders.map((o) => o ?? '缺').join(', ')}）`,
        });
    }
  });

export const RawJournalsSchema = z.record(
  z.string().regex(DATE_RE, '日誌的 key 必須是 YYYY-MM-DD'),
  z.string(),
);

/** data/videos.json：每個訓練日合併成一支 YouTube 影片，segments 是影片中各段（章節）的時間 */
export const RawVideoSegmentSchema = z
  .object({
    exercise_id: z.string().regex(/^[a-z0-9_]+$/, 'exercise_id 必須是小寫英文、數字與底線'),
    start: z.number().min(0),
    end: z.number(),
    label: z.string().min(1),
    set: z.number().int().positive().nullish(),
    side: z.enum(['左', '右']).nullish(),
  })
  .strict()
  .refine((s) => s.end > s.start, '片段的結束時間必須晚於開始時間');

export const RawDayVideoSchema = z
  .object({
    date: z.string().regex(DATE_RE, '日期必須是 YYYY-MM-DD'),
    youtube_id: z.string().regex(/^[A-Za-z0-9_-]{11}$/, 'YouTube 影片 ID 必須是 11 個字元'),
    duration_sec: z.number().positive(),
    /** 畫面尺寸「寬x高」：1080x1920 是直式、1920x1080 是橫式（網站播放器依此決定長寬比） */
    canvas: z.string().regex(/^[1-9]\d*x[1-9]\d*$/, '畫面尺寸必須是「寬x高」，例如 1080x1920'),
    title: z.string().min(1),
    segments: z.array(RawVideoSegmentSchema).min(1),
  })
  .strict()
  .superRefine((v, ctx) => {
    v.segments.forEach((s, i) => {
      const prev = v.segments[i - 1];
      if (prev && s.start < prev.end - 0.01)
        ctx.addIssue({
          code: 'custom',
          path: ['segments', i, 'start'],
          message: '片段必須依時間排序且不重疊',
        });
      if (s.end > v.duration_sec + 0.5)
        ctx.addIssue({ code: 'custom', path: ['segments', i, 'end'], message: '片段超過影片長度' });
    });
  });

export const RawVideosSchema = z
  .object({ videos: z.array(RawDayVideoSchema) })
  .strict()
  .superRefine((d, ctx) => {
    const dates = new Set<string>();
    d.videos.forEach((v, i) => {
      if (dates.has(v.date))
        ctx.addIssue({
          code: 'custom',
          path: ['videos', i, 'date'],
          message: `同一天只能有一支影片：${v.date}`,
        });
      dates.add(v.date);
    });
  });

export type RawTrainingData = z.infer<typeof RawTrainingDataSchema>;
export type RawExercise = z.infer<typeof RawExerciseSchema>;
export type RawHistoryEntry = z.infer<typeof RawHistoryEntrySchema>;
export type RawWarmupItem = z.infer<typeof RawWarmupItemSchema>;
export type RawJournals = z.infer<typeof RawJournalsSchema>;
export type RawVideos = z.infer<typeof RawVideosSchema>;
