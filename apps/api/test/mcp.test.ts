// /mcp 的 JSON-RPC 處理（用 core 的測試資料）
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseDataset, type Dataset } from '@trainlog/core';
import { handleMessage, METHOD_NOT_FOUND, PROTOCOL_VERSIONS, INVALID_PARAMS } from '../src/mcp';

const fx = (f: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../packages/core/test/fixtures', f), 'utf8'));
const ds = (() => {
  const r = parseDataset(fx('training_data.json'), fx('journals_raw.json'));
  if (!r.ok) throw new Error(r.issues.join('\n'));
  return r.dataset;
})();
const get = () => Promise.resolve<Dataset>(ds);
const call = (method: string, params?: Record<string, unknown>, id: number | null = 1) =>
  handleMessage(
    { jsonrpc: '2.0', ...(id === null ? {} : { id }), method, ...(params ? { params } : {}) },
    get,
    '2026-10-21',
  );
const result = async (method: string, params?: Record<string, unknown>) => {
  const r = await call(method, params);
  if (!r || !('result' in r)) throw new Error(JSON.stringify(r));
  return r.result as Record<string, unknown>;
};

describe('MCP', () => {
  it('initialize：照用戶端要求的版本，不認得就回最新', async () => {
    expect((await result('initialize', { protocolVersion: '2025-06-18' })).protocolVersion).toBe(
      '2025-06-18',
    );
    const r = await result('initialize', { protocolVersion: '1999-01-01' });
    expect(r.protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
    expect(r.capabilities).toEqual({ tools: { listChanged: false }, prompts: { listChanged: false } });
  });

  it('通知沒有回應', async () => {
    expect(await call('notifications/initialized', undefined, null)).toBeNull();
  });

  it('tools/list 列出唯讀工具', async () => {
    const tools = (await result('tools/list')).tools as {
      name: string;
      annotations: { readOnlyHint: boolean };
    }[];
    expect(tools.map((t) => t.name)).toContain('get_training_day');
    expect(tools.every((t) => t.annotations.readOnlyHint)).toBe(true);
  });

  it('tools/call 回傳 JSON 文字；查不到時 isError', async () => {
    const r = await result('tools/call', {
      name: 'get_exercise_history',
      arguments: { exercise: 'back_squat', limit: 1 },
    });
    expect(r.isError).toBe(false);
    const body = JSON.parse((r.content as { text: string }[])[0]?.text ?? '');
    expect(body.entries[0].date).toBe('2026-10-19');
    const miss = await result('tools/call', {
      name: 'get_exercise_history',
      arguments: { exercise: 'nope' },
    });
    expect(miss.isError).toBe(true);
  });

  it('prompts/list 與 prompts/get：產生分析框架；缺必填參數或未知 prompt 回錯誤', async () => {
    const prompts = (await result('prompts/list')).prompts as { name: string; arguments: unknown[] }[];
    expect(prompts.map((p) => p.name)).toContain('analyze_training_day');
    const g = await result('prompts/get', {
      name: 'analyze_training_day',
      arguments: { date: '2026-10-19' },
    });
    const msg = (g.messages as { role: string; content: { type: string; text: string } }[])[0];
    expect(msg?.role).toBe('user');
    expect(msg?.content.text).toContain('get_training_day');
    expect(msg?.content.text).toContain('"2026-10-19"');
    const miss = await call('prompts/get', { name: 'exercise_progress', arguments: {} });
    expect(miss && 'error' in miss && miss.error.code).toBe(INVALID_PARAMS);
    const unknown = await call('prompts/get', { name: 'nope' });
    expect(unknown && 'error' in unknown && unknown.error.code).toBe(INVALID_PARAMS);
  });

  it('get_training_day 不給日期：今天以前最近的訓練日', async () => {
    const r = await result('tools/call', { name: 'get_training_day', arguments: { includeJournal: false } });
    const body = JSON.parse((r.content as { text: string }[])[0]?.text ?? '');
    expect(body.date).toBe('2026-10-19');
    expect('journal' in body).toBe(false);
  });

  it('未知工具與方法回錯誤', async () => {
    const a = await call('tools/call', { name: 'drop_table' });
    expect(a && 'error' in a && a.error.code).toBe(INVALID_PARAMS);
    const b = await call('foo/bar');
    expect(b && 'error' in b && b.error.code).toBe(METHOD_NOT_FOUND);
  });
});
