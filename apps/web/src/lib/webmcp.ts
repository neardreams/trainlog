// WebMCP：在支援的瀏覽器（document.modelContext；舊草案是 navigator.modelContext）註冊查詢工具，
// 讓瀏覽器裡的 AI agent 直接查訓練資料，不必解析畫面。不支援的瀏覽器什麼都不做。
// 規格：https://webmachinelearning.github.io/webmcp/ 、https://developer.chrome.com/docs/ai/webmcp/imperative-api
import { AGENT_TOOLS, type DataSource } from '@trainlog/core';
import { TODAY } from './today';
import type { createAppRouter } from '@/router';

interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: object;
  execute: (args: Record<string, unknown>) => Promise<string>;
  annotations?: { readOnlyHint?: boolean };
}
interface ModelContext {
  registerTool: (tool: ModelContextTool, options?: { signal?: AbortSignal }) => unknown;
}

function modelContext(): ModelContext | undefined {
  const d = document as Document & { modelContext?: ModelContext };
  const n = navigator as Navigator & { modelContext?: ModelContext };
  const mc = d.modelContext ?? n.modelContext;
  return mc && typeof mc.registerTool === 'function' ? mc : undefined;
}

const PAGE_PATH = /^\/(exercises|days\/\d{4}-\d{2}-\d{2})?$/;

/** 註冊所有工具；回傳取消註冊的函式 */
export function registerWebMcp(source: DataSource, router: ReturnType<typeof createAppRouter>): () => void {
  const mc = modelContext();
  if (!mc) return () => {};
  const controller = new AbortController();
  const tools: ModelContextTool[] = AGENT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
    annotations: { readOnlyHint: true },
    execute: async (args) => JSON.stringify(t.run(await source.getDataset(), TODAY, args ?? {})),
  }));
  tools.push({
    name: 'open_page',
    description:
      '在畫面上切換到 TrainLog 的某一頁給使用者看：「/」總覽、「/exercises」動作庫、「/days/YYYY-MM-DD」某一天的訓練紀錄。',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: '例如 /days/2026-11-24' } },
      required: ['path'],
      additionalProperties: false,
    },
    execute: async (args) => {
      const path = typeof args?.path === 'string' ? args.path : '';
      if (!PAGE_PATH.test(path)) return `不支援的頁面：${path}`;
      await router.navigate({ href: path });
      return `已開啟 ${path}`;
    },
  });
  for (const tool of tools) {
    try {
      void Promise.resolve(mc.registerTool(tool, { signal: controller.signal })).catch((e: unknown) =>
        console.warn('WebMCP 註冊失敗', tool.name, e),
      );
    } catch (e) {
      console.warn('WebMCP 註冊失敗', tool.name, e);
    }
  }
  return () => controller.abort();
}
