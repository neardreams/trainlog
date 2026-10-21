// 驗證原始 JSON 並轉成領域模型；任何資料來源（靜態檔、API）讀進來都要經過這裡
import { fromRawJson } from './adapters/fromRawJson';
import type { Dataset } from './domain/types';
import { RawJournalsSchema, RawTrainingDataSchema } from './schema/raw';

export type ParseResult = { ok: true; dataset: Dataset } | { ok: false; issues: string[] };

export function parseDataset(trainingJson: unknown, journalsJson: unknown = {}): ParseResult {
  const t = RawTrainingDataSchema.safeParse(trainingJson);
  const j = RawJournalsSchema.safeParse(journalsJson);
  const issues = [
    ...(t.success ? [] : t.error.issues.map((i) => `training_data.json ${i.path.join('.')}：${i.message}`)),
    ...(j.success ? [] : j.error.issues.map((i) => `journals_raw.json ${i.path.join('.')}：${i.message}`)),
  ];
  if (!t.success || !j.success) return { ok: false, issues };
  return { ok: true, dataset: fromRawJson(t.data, j.data) };
}
