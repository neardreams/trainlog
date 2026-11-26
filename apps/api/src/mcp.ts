// MCP（Model Context Protocol）伺服器：Streamable HTTP 的無狀態版本，只處理 JSON-RPC 請求並直接回 JSON。
// 工具清單與查詢邏輯都在 @trainlog/core（AGENT_TOOLS），和網頁的 WebMCP 共用。
// 規格：https://modelcontextprotocol.io/specification
import { AGENT_PROMPTS, AGENT_TOOLS, type Dataset, type DateStr } from '@trainlog/core';

/** 支援的協定版本，新到舊；用戶端要求的版本在清單裡就照用，否則回最新的 */
export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const;
export const SERVER_INFO = { name: 'trainlog', title: 'TrainLog 訓練紀錄', version: '1.0.0' };

const INSTRUCTIONS =
  '一個人的重量訓練紀錄（繁體中文，重量單位 kg；perSide／「kg/邊」是每邊重量；' +
  '容量＝Σ 重量×次數，左右兩邊都算（每邊重量或每邊次數 ×2），秒數／米數動作與有氧沒有容量）。' +
  '分析今天或最近一次訓練：直接 get_training_day（不給 date＝最近一個訓練日）加 includeRecentHistory: true，一次拿到每個動作的前兩次紀錄（recentSessions 可調 1–5）與先前最佳。' +
  '當天的動作依實際執行順序（order）。整體狀況用 get_training_overview；動作名稱不確定時用 list_exercises 找 id；' +
  '某個動作的進步用 get_exercise_history（exercises 可一次查多個）。所有工具都是唯讀。' +
  '常用分析框架見 prompts（analyze_training_day、weekly_review、asymmetry_review、exercise_progress）。';

type Id = string | number | null;
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: Id;
  method: string;
  params?: Record<string, unknown>;
}
export type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: Id; result: unknown }
  | { jsonrpc: '2.0'; id: Id; error: { code: number; message: string } };

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;

const ok = (id: Id, result: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result });
const fail = (id: Id, code: number, message: string): JsonRpcResponse => ({
  jsonrpc: '2.0',
  id,
  error: { code, message },
});

export function isRequest(m: unknown): m is JsonRpcRequest {
  return (
    typeof m === 'object' &&
    m !== null &&
    (m as { jsonrpc?: unknown }).jsonrpc === '2.0' &&
    typeof (m as { method?: unknown }).method === 'string'
  );
}

const asRecord = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/**
 * 處理一則 JSON-RPC 訊息。通知（沒有 id）回傳 null，HTTP 層回 202。
 * @param getDataset 只有 tools/call 才會讀資料
 */
export async function handleMessage(
  msg: JsonRpcRequest,
  getDataset: () => Promise<Dataset>,
  today: DateStr,
): Promise<JsonRpcResponse | null> {
  const id = msg.id ?? null;
  if (msg.id === undefined) return null;
  const params = asRecord(msg.params);

  switch (msg.method) {
    case 'initialize': {
      const asked = params.protocolVersion;
      const version = PROTOCOL_VERSIONS.find((v) => v === asked) ?? PROTOCOL_VERSIONS[0];
      return ok(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case 'ping':
      return ok(id, {});
    case 'tools/list':
      return ok(id, {
        tools: AGENT_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
        })),
      });
    case 'tools/call': {
      const tool = AGENT_TOOLS.find((t) => t.name === params.name);
      if (!tool) return fail(id, INVALID_PARAMS, `沒有這個工具：${String(params.name)}`);
      const result = tool.run(await getDataset(), today, asRecord(params.arguments));
      const isError = typeof result === 'object' && result !== null && 'error' in result;
      return ok(id, {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        isError,
      });
    }
    case 'resources/list':
      return ok(id, { resources: [] });
    case 'prompts/list':
      return ok(id, {
        prompts: AGENT_PROMPTS.map((p) => ({
          name: p.name,
          title: p.title,
          description: p.description,
          arguments: p.arguments,
        })),
      });
    case 'prompts/get': {
      const prompt = AGENT_PROMPTS.find((p) => p.name === params.name);
      if (!prompt) return fail(id, INVALID_PARAMS, `沒有這個 prompt：${String(params.name)}`);
      const args = Object.fromEntries(
        Object.entries(asRecord(params.arguments)).map(([k, v]) => [
          k,
          typeof v === 'string' ? v : undefined,
        ]),
      );
      const missing = prompt.arguments.filter((a) => a.required && !args[a.name]?.trim()).map((a) => a.name);
      if (missing.length) return fail(id, INVALID_PARAMS, `缺少參數：${missing.join('、')}`);
      return ok(id, {
        description: prompt.description,
        messages: [{ role: 'user', content: { type: 'text', text: prompt.render(args) } }],
      });
    }
    default:
      return fail(id, METHOD_NOT_FOUND, `不支援的方法：${msg.method}`);
  }
}
