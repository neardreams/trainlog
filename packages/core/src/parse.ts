// 驗證原始 JSON 並轉成領域模型；任何資料來源（靜態檔、API）讀進來都要經過這裡
import { fromRawJson } from './adapters/fromRawJson';
import type { Dataset } from './domain/types';
import { RawJournalsSchema, RawTrainingDataSchema, RawVideosSchema } from './schema/raw';

export type ParseResult = { ok: true; dataset: Dataset } | { ok: false; issues: string[] };

export function parseDataset(
  trainingJson: unknown,
  journalsJson: unknown = {},
  videosJson: unknown = { videos: [] },
): ParseResult {
  const t = RawTrainingDataSchema.safeParse(trainingJson);
  const j = RawJournalsSchema.safeParse(journalsJson);
  const v = RawVideosSchema.safeParse(videosJson);
  const issues = [
    ...(t.success ? [] : t.error.issues.map((i) => `training_data.json ${i.path.join('.')}：${i.message}`)),
    ...(j.success ? [] : j.error.issues.map((i) => `journals_raw.json ${i.path.join('.')}：${i.message}`)),
    ...(v.success ? [] : v.error.issues.map((i) => `videos.json ${i.path.join('.')}：${i.message}`)),
  ];
  if (!t.success || !j.success || !v.success) return { ok: false, issues };
  // 每段影片都必須對得到一筆訓練紀錄，組號也不能超過那筆的組數
  const sets = new Map(
    t.data.exercises.flatMap((e) => e.history.map((h) => [`${e.id}@${h.date}`, h.sets.length])),
  );
  v.data.videos.forEach((vid, i) =>
    vid.segments.forEach((s, k) => {
      const n = sets.get(`${s.exercise_id}@${vid.date}`);
      const at = `videos.json videos.${i}.segments.${k}`;
      if (n === undefined) issues.push(`${at}：找不到 ${s.exercise_id} 在 ${vid.date} 的訓練紀錄`);
      else if (s.set != null && s.set > n) issues.push(`${at}：第 ${s.set} 組超過那天的 ${n} 組`);
    }),
  );
  if (issues.length) return { ok: false, issues };
  return { ok: true, dataset: fromRawJson(t.data, j.data, v.data) };
}
