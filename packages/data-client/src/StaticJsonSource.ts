// 靜態 JSON 資料來源：開頁時讀 data/training_data.json、data/journals_raw.json 與 data/videos.json（可選），驗證後轉成領域模型
import { parseDataset, type DataSource, type Dataset, type DateStr } from '@trainlog/core';

export class DataLoadError extends Error {
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
    this.name = 'DataLoadError';
  }
}

export class StaticJsonSource implements DataSource {
  private cache: Promise<Dataset> | null = null;

  /** @param baseUrl 資料所在的網址前綴，例如 './data/' */
  constructor(private readonly baseUrl: string) {}

  getDataset(): Promise<Dataset> {
    this.cache ??= this.load();
    return this.cache;
  }

  async getJournal(date: DateStr): Promise<string | null> {
    return (await this.getDataset()).journals.get(date) ?? null;
  }

  private async load(): Promise<Dataset> {
    const get = async (file: string): Promise<unknown> => {
      const res = await fetch(`${this.baseUrl}${file}`, { cache: 'no-cache' });
      if (!res.ok) throw new DataLoadError(`無法讀取 ${file}（HTTP ${res.status}）`);
      return res.json();
    };
    // 影片清單是可選的：還沒有任何影片時沒有這個檔案（404），網站照常顯示
    const getOptional = async (file: string): Promise<unknown> => {
      const res = await fetch(`${this.baseUrl}${file}`, { cache: 'no-cache' });
      if (res.status === 404) return undefined;
      if (!res.ok) throw new DataLoadError(`無法讀取 ${file}（HTTP ${res.status}）`);
      return res.json();
    };
    const [training, journals, videos] = await Promise.all([
      get('training_data.json'),
      get('journals_raw.json'),
      getOptional('videos.json'),
    ]);
    const r = parseDataset(training, journals, videos);
    if (!r.ok) {
      this.cache = null;
      throw new DataLoadError('資料格式不正確', r.issues);
    }
    return r.dataset;
  }
}
