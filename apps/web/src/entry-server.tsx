// 建置時預先渲染（SSR）：每一頁在 Node 裡用 React 渲染成 HTML，讓搜尋引擎與 AI 爬蟲不必執行 JavaScript 就看得到內容。
// 由 tools/prerender.mjs 呼叫；瀏覽器載入後 main.tsx 會用同一棵元件樹接手。
import { renderToString } from 'react-dom/server';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory } from '@tanstack/react-router';
import {
  AGENT_TOOLS,
  SITE_URL,
  agentOverview,
  dayGroups,
  longDate,
  parseDataset,
  slash,
  stripJournalHeading,
  todayStr,
  type Dataset,
  type DataSource,
} from '@trainlog/core';
import { App } from './App';
import { createAppRouter } from './router';
import { pageTitle } from './lib/meta';

export const SITE = SITE_URL;

export function loadDataset(training: unknown, journals: unknown, videos: unknown): Dataset {
  const r = parseDataset(training, journals, videos);
  if (!r.ok) throw new Error(`資料格式不正確：\n${r.issues.join('\n')}`);
  return r.dataset;
}

export interface PageMeta {
  path: string;
  title: string;
  description: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nameOf = (ds: Dataset, id: string) => ds.exerciseById.get(id)?.name ?? id;

/** 要預先渲染的頁面（/days 會轉到最近的訓練日、/spec 是內部設計規格，都不預先渲染） */
export function pages(ds: Dataset): PageMeta[] {
  const last = ds.trainingDates[ds.trainingDates.length - 1];
  const out: PageMeta[] = [
    {
      path: '/',
      title: pageTitle('/'),
      description: `個人重量訓練紀錄與分析：${ds.trainingDates.length} 個訓練日、${ds.exercises.length} 個動作${last ? `，資料至 ${slash(last)}` : ''}。`,
    },
    {
      path: '/exercises',
      title: pageTitle('/exercises'),
      description: `${ds.exercises.length} 個動作的訓練次數、最高重量、累計容量與歷程：${ds.exercises
        .slice(0, 12)
        .map((e) => e.name)
        .join('、')}…`,
    },
  ];
  for (const s of ds.sessions) {
    const names = (ds.entriesByDate.get(s.date) ?? []).map((e) => nameOf(ds, e.exerciseId));
    const groups = dayGroups(ds, s.date);
    out.push({
      path: `/days/${s.date}`,
      title: pageTitle(`/days/${s.date}`),
      description: names.length
        ? `${longDate(s.date)}${groups.length ? `，${groups.join('、')}` : ''}：${names.join('、')}。`
        : `${longDate(s.date)} 的訓練日誌。`,
    });
  }
  return out;
}

export async function render(url: string, ds: Dataset): Promise<string> {
  const router = createAppRouter(createMemoryHistory({ initialEntries: [url] }));
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  queryClient.setQueryData(['dataset'], ds);
  const source: DataSource = {
    getDataset: () => Promise.resolve(ds),
    getJournal: (d) => Promise.resolve(ds.journals.get(d) ?? null),
  };
  await router.load();
  return renderToString(<App router={router} queryClient={queryClient} source={source} />);
}

/** 每頁 <head> 要換掉或加上的標籤 */
export function headTags(p: PageMeta): string {
  const url = SITE + p.path;
  return [
    `<title>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="TrainLog" />`,
    `<meta property="og:title" content="${esc(p.title)}" />`,
    `<meta property="og:description" content="${esc(p.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<link rel="alternate" type="text/markdown" title="llms.txt" href="/llms.txt" />`,
  ].join('\n    ');
}

export function sitemapXml(list: PageMeta[]): string {
  const urls = list.map((p) => `  <url><loc>${SITE}${p.path}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;
}

/** 給 AI 的網站說明（https://llmstxt.org 格式） */
export function llmsTxt(ds: Dataset): string {
  const o = agentOverview(ds, todayStr());
  const tools = AGENT_TOOLS.map((t) => `- \`${t.name}\`：${t.description}`).join('\n');
  const recent = o.recentDays
    .map(
      (d) =>
        `- [${slash(d.date)}（${d.weekday}）](${SITE}/days/${d.date})：${d.exercises.join('、') || '只有日誌'}`,
    )
    .join('\n');
  return `# TrainLog

> 一個人的重量訓練紀錄與分析網站（繁體中文）。共 ${o.trainingDays} 個訓練日（${o.firstDate ? slash(o.firstDate) : '—'}–${o.lastDate ? slash(o.lastDate) : '—'}）、${o.exerciseCount} 個動作，部位：${o.groups.join('、')}。

每一頁都已預先渲染成 HTML，不執行 JavaScript 也讀得到內容。重量單位是公斤；「kg/邊」表示每邊（單手、單腳或一側）的重量；容量＝Σ 重量×次數。

## 頁面

- [總覽](${SITE}/)：本週訓練、訓練日、總容量、破紀錄、連續週數、部位分布、全年熱度圖
- [動作庫](${SITE}/exercises)：所有動作的訓練次數、最高重量、累計容量；\`/exercises?ex=<動作 id>\` 直接展開某個動作
- 訓練紀錄：\`${SITE}/days/YYYY-MM-DD\`，某一天的每個動作、組數、感受、力竭程度、教練提醒與日誌原文
- [網站地圖](${SITE}/sitemap.xml)：所有訓練日的網址

## 最近的訓練日

${recent}

## 原始資料（JSON）

- [${SITE}/data/training_data.json](${SITE}/data/training_data.json)：所有動作與每次的組數；\`sets\` 是 \`[重量kg, 次數]\` 陣列，null 表示未記錄
- [${SITE}/data/journals_raw.json](${SITE}/data/journals_raw.json)：\`{ "YYYY-MM-DD": "日誌原文" }\`
- [${SITE}/data/videos.json](${SITE}/data/videos.json)：每個訓練日的 YouTube 影片與章節

## MCP 伺服器與 WebMCP 工具

- MCP 伺服器（Streamable HTTP，不需驗證、唯讀）：\`${SITE}/mcp\`，可加進 Claude、ChatGPT 等的自訂連接器
- 在支援 WebMCP 的瀏覽器開啟本站時，頁面也會註冊同樣的工具（\`document.modelContext\`）

工具：

${tools}

## 日誌節錄

${o.lastDate && ds.journals.get(o.lastDate) ? `最近一次（${slash(o.lastDate)}）：\n\n${stripJournalHeading(ds.journals.get(o.lastDate) as string).trim()}` : '（無）'}
`;
}
