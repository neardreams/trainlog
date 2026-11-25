// Cloudflare Worker：只處理 /mcp（wrangler.jsonc 的 run_worker_first），其他網址都直接由靜態資產（apps/web/dist）回應。
// 資料從同一次部署的靜態資產 /data/*.json 讀取，所以和網頁永遠是同一份；每個 isolate 解析一次後快取。
import { parseDataset, type Dataset } from '@trainlog/core';
import { handleMessage, isRequest, PARSE_ERROR, INVALID_REQUEST, type JsonRpcResponse } from './mcp';

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
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

let cached: Promise<Dataset> | null = null;
function loadDataset(env: Env, origin: string): Promise<Dataset> {
  const get = async (file: string, optional = false): Promise<unknown> => {
    const res = await env.ASSETS.fetch(new Request(`${origin}/data/${file}`));
    if (optional && res.status === 404) return undefined;
    if (!res.ok) throw new Error(`無法讀取 ${file}（HTTP ${res.status}）`);
    return res.json();
  };
  cached ??= (async () => {
    const [t, j, v] = await Promise.all([
      get('training_data.json'),
      get('journals_raw.json'),
      get('videos.json', true),
    ]);
    const r = parseDataset(t, j, v);
    if (!r.ok) throw new Error('資料格式不正確');
    return r.dataset;
  })().catch((e: unknown) => {
    cached = null;
    throw e;
  });
  return cached;
}

/** 使用者在台灣：「今天」一律用台北時區（正式環境的 Worker 是 UTC、本機 wrangler dev 是電腦的時區） */
const TAIPEI_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const taipeiToday = () => TAIPEI_DATE.format(new Date());

async function handleMcp(request: Request, env: Env): Promise<Response> {
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

  const origin = new URL(request.url).origin;
  const getDataset = () => loadDataset(env, origin);
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
    if (pathname === '/mcp' || pathname === '/mcp/') return handleMcp(request, env);
    return env.ASSETS.fetch(request);
  },
};
