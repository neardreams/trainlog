// Cloudflare Worker：只處理 /mcp（wrangler.jsonc 的 run_worker_first），其他網址都直接由靜態資產（apps/web/dist）回應。
//
// 效能設計（免費方案每個請求只有 10ms CPU）：
// - 資料在建置時就驗證過（tools/prerender.mjs 用 zod 驗證後寫出 generated/dataset.txt），這裡不再驗證，
//   冷啟動時省下約 15ms 的驗證。
// - 資料打包進 Worker，在全域範圍（isolate 啟動時）就建好 Dataset 並把每個工具跑一次讓 JIT 熱身；
//   啟動時間另有限制，不算進請求的 CPU，請求只剩查詢本身（通常 < 1ms）。
// - 全域範圍不能用 Date（啟動時時間固定在 1970），所以熱身用資料裡的日期，「今天」在請求裡才算。
import { AGENT_TOOLS, fromRawJson, SORT_KEYS } from '@trainlog/core';
import { handleMessage, isRequest, PARSE_ERROR, INVALID_REQUEST, type JsonRpcResponse } from './mcp';
import rawDataset from './generated/dataset.txt';

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
}

type RawArgs = Parameters<typeof fromRawJson>;
const RAW = JSON.parse(rawDataset) as { training: RawArgs[0]; journals: RawArgs[1]; videos: RawArgs[2] };
const DATASET = fromRawJson(RAW.training, RAW.journals, RAW.videos);

// JIT 熱身：每個工具用代表性的參數跑一次
{
  const last = DATASET.trainingDates.at(-1) ?? '2026-01-01';
  const sample: Record<string, Record<string, unknown>> = {
    get_exercise_history: {
      exercises: DATASET.exercises.slice(0, 2).map((e) => e.id),
      includeFamily: true,
    },
    get_training_day: { date: last, includeRecentHistory: true },
    compare_training_days: { a: last, b: DATASET.trainingDates.at(-2) ?? last },
    search_notes: { query: '的' },
  };
  const runs: [string, Record<string, unknown>][] = [
    ...AGENT_TOOLS.map((t): [string, Record<string, unknown>] => [t.name, sample[t.name] ?? {}]),
    ...SORT_KEYS.map((sort): [string, Record<string, unknown>] => ['list_exercises', { sort }]),
  ];
  for (const [name, args] of runs)
    try {
      JSON.stringify(AGENT_TOOLS.find((t) => t.name === name)?.run(DATASET, last, args));
    } catch {
      /* 熱身失敗不影響服務，請求時會回錯誤 */
    }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Authorization',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });

/** 使用者在台灣：「今天」一律用台北時區（正式環境的 Worker 是 UTC、本機 wrangler dev 是電腦的時區） */
const TAIPEI_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const taipeiToday = () => TAIPEI_DATE.format(new Date());

async function handleMcp(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST')
    // 無狀態伺服器：不提供 GET 的 SSE 串流
    return new Response('只接受 POST（MCP Streamable HTTP）', {
      status: 405,
      headers: { Allow: 'POST, OPTIONS', ...CORS },
    });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: PARSE_ERROR, message: 'JSON 格式錯誤' } }, 400);
  }

  const getDataset = () => Promise.resolve(DATASET);
  const today = taipeiToday();
  const one = async (m: unknown): Promise<JsonRpcResponse | null> => {
    if (!isRequest(m))
      return {
        jsonrpc: '2.0',
        id: null,
        error: { code: INVALID_REQUEST, message: '不是 JSON-RPC 2.0 請求' },
      };
    try {
      return await handleMessage(m, getDataset, today);
    } catch (e) {
      return {
        jsonrpc: '2.0',
        id: m.id ?? null,
        error: { code: -32603, message: e instanceof Error ? e.message : String(e) },
      };
    }
  };

  // 舊版協定（2025-03-26）允許批次；一併支援
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(one))).filter((r): r is JsonRpcResponse => r !== null);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const res = await one(body);
  return res ? json(res) : new Response(null, { status: 202, headers: CORS });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/mcp' || pathname === '/mcp/') return handleMcp(request);
    return env.ASSETS.fetch(request);
  },
};
