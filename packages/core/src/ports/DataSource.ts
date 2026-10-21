// 資料來源介面：畫面只透過它取資料，不知道資料從哪來。
// 現在的實作是 StaticJsonSource（讀 data/*.json）；日後的後端只要新增 ApiSource。
import type { DateStr } from '../dates';
import type { Dataset, Entry } from '../domain/types';

export interface DataSource {
  /** 一次取得整份正規化資料（含日誌） */
  getDataset(): Promise<Dataset>;
  /** 單日日誌原文（含第一行標題）；沒有則 null */
  getJournal(date: DateStr): Promise<string | null>;
}

/**
 * 寫入介面（預留，尚未實作）。有後端之後由 ApiSource 實作，
 * 畫面要新增或修改紀錄時才會用到。
 */
export interface WritableDataSource extends DataSource {
  upsertEntry(entry: Entry): Promise<void>;
  deleteEntry(entryId: string): Promise<void>;
}
