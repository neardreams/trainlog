// 每一頁的 <title>：建置時預先渲染（entry-server.tsx）與瀏覽器切頁（main.tsx）共用
import { DATE_RE, dowOf, slash } from '@trainlog/core';

export const HOME_TITLE = 'TrainLog · 訓練管理';

export function pageTitle(pathname: string): string {
  if (pathname === '/exercises') return '動作庫 · TrainLog';
  if (pathname === '/spec') return '設計規格 · TrainLog';
  const d = pathname.match(/^\/days\/([^/]+)$/)?.[1];
  if (d && DATE_RE.test(d)) return `${slash(d)}（週${dowOf(d)}）訓練紀錄 · TrainLog`;
  return HOME_TITLE;
}
