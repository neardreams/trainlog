// 取得已載入的資料；只能在 AppShell（已確認資料載入完成）之內使用
import { useDataset } from '@trainlog/data-client';
import type { Dataset } from '@trainlog/core';

export function useDs(): Dataset {
  const { data } = useDataset();
  if (!data) throw new Error('useDs 只能在資料載入完成後使用');
  return data;
}
