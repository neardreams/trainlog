// 動作庫的匯出動作（指令面板與動作庫頁共用）
import {
  exercisesCsv,
  filterExercises,
  type Dataset,
  type DateStr,
  type ExerciseFilter,
  type SortKey,
} from '@trainlog/core';

/** 下載 CSV，回傳通知文字 */
export function runExportCsv(
  ds: Dataset,
  today: DateStr,
  sort: SortKey = 'group',
  filter: ExerciseFilter = { q: '', groups: new Set(), status: 'all' },
): string {
  const rows = filterExercises(ds, sort, filter, today);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([exercisesCsv(ds, rows, today)], { type: 'text/csv;charset=utf-8' }));
  a.download = `trainlog-動作庫-${today}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return `已匯出 ${rows.length} 個動作`;
}
