// 現有 JSON 檔（data/training_data.json、data/journals_raw.json）的 zod schema。
// 只用於讀檔與驗證；畫面與計算一律使用 domain/ 的領域模型（ESLint 禁止 apps 匯入本檔）。
import { z } from 'zod';
import { DATE_RE } from '../dates';

const optStr = z.string().nullish();

export const RawSetSchema = z.tuple([z.number().nullable(), z.number().nullable()]);

export const RawHistoryEntrySchema = z
  .object({
    date: z.string().regex(DATE_RE, '日期必須是 YYYY-MM-DD'),
    sets: z.array(RawSetSchema),
    sets_display: optStr,
    feel: optStr,
    exhaustion: optStr,
    condition: optStr,
    cue: optStr,
    minutes: z.number().nullish(),
    distance_km: z.number().nullish(),
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
    history: z.array(RawHistoryEntrySchema),
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
  });

export const RawJournalsSchema = z.record(
  z.string().regex(DATE_RE, '日誌的 key 必須是 YYYY-MM-DD'),
  z.string(),
);

export type RawTrainingData = z.infer<typeof RawTrainingDataSchema>;
export type RawExercise = z.infer<typeof RawExerciseSchema>;
export type RawHistoryEntry = z.infer<typeof RawHistoryEntrySchema>;
export type RawJournals = z.infer<typeof RawJournalsSchema>;
