// 資料來源注入：畫面只透過 hooks 取資料，切換實作（日後的 ApiSource）不需要改畫面
import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DataSource, DateStr } from '@trainlog/core';

const DataSourceContext = createContext<DataSource | null>(null);

export function DataSourceProvider({ source, children }: { source: DataSource; children: ReactNode }) {
  return <DataSourceContext.Provider value={source}>{children}</DataSourceContext.Provider>;
}

export function useDataSource(): DataSource {
  const s = useContext(DataSourceContext);
  if (!s) throw new Error('缺少 DataSourceProvider');
  return s;
}

/** 整份資料（Dataset）；載入一次後快取 */
export function useDataset() {
  const source = useDataSource();
  return useQuery({
    queryKey: ['dataset'],
    queryFn: () => source.getDataset(),
    staleTime: Infinity,
    retry: 1,
  });
}

/** 單日日誌原文 */
export function useJournal(date: DateStr | null) {
  const source = useDataSource();
  return useQuery({
    queryKey: ['journal', date],
    queryFn: () => (date ? source.getJournal(date) : Promise.resolve(null)),
    enabled: !!date,
    staleTime: Infinity,
  });
}
