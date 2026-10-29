// pnpm validate:data —— 驗證 data/training_data.json、data/journals_raw.json 與 data/videos.json（有的話）
// 同步 skill 寫完資料後必須執行；失敗（exit 1）時不得 commit／部署。
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDataset } from '../parse';

const dir = resolve(process.argv[2] ?? resolve(import.meta.dirname, '../../../../data'));
const read = (f: string): unknown => JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
const hasVideos = existsSync(resolve(dir, 'videos.json'));

const r = parseDataset(
  read('training_data.json'),
  read('journals_raw.json'),
  hasVideos ? read('videos.json') : undefined,
);
if (!r.ok) {
  console.error(`資料驗證失敗（${r.issues.length} 個問題）：`);
  for (const i of r.issues.slice(0, 50)) console.error('  - ' + i);
  process.exit(1);
}
const ds = r.dataset;
const entries = [...ds.entriesByExercise.values()].reduce((s, l) => s + l.length, 0);
const segs = [...ds.videosByDate.values()].reduce((s, v) => s + v.segments.length, 0);
console.log(
  `資料驗證通過：${ds.exercises.length} 個動作、${entries} 筆紀錄、${ds.trainingDates.length} 個訓練日、${ds.journals.size} 篇日誌` +
    (hasVideos ? `、${ds.videosByDate.size} 支影片（${segs} 段）。` : '。'),
);
