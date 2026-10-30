// 確認產生的 tokens.css 與 v14 設計稿（fixture 快照）的每一個值一致
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type VarMap = Record<string, string>;
const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(resolve(here, 'fixtures/v14-tokens.json'), 'utf8')) as {
  root: VarMap;
  light: VarMap;
  dark: VarMap;
  semantic: VarMap;
  accent: Record<string, VarMap>;
};
const css = readFileSync(resolve(here, '../dist/tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const blocks: Record<string, VarMap> = {};
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const sel = (m[1] ?? '').trim().replace(/'/g, '');
  const vars: VarMap = {};
  for (const d of (m[2] ?? '').matchAll(/--([\w-]+)\s*:\s*([^;]+?)\s*;/g))
    vars[d[1] ?? ''] = (d[2] ?? '').trim();
  blocks[sel] = { ...blocks[sel], ...vars };
}
const norm = (v: string) => v.replace(/\s+/g, ' ').toLowerCase();
const expectSame = (actual: VarMap | undefined, expected: VarMap) => {
  expect(actual).toBeDefined();
  for (const [k, v] of Object.entries(expected))
    expect(norm(actual?.[k] ?? '(缺少)'), `--${k}`).toBe(norm(v));
};

describe('tokens.css 與 v14 設計稿一致', () => {
  it(':root 字型與框架尺寸', () => expectSame(blocks[':root'], fixture.root));
  it('淺色', () => expectSame(blocks['html[data-m=light]'], fixture.light));
  it('深色', () => expectSame(blocks['html[data-m=dark]'], fixture.dark));
  it('文字色與滑過底色', () => expectSame(blocks['html'], fixture.semantic));
  for (const [key, vars] of Object.entries(fixture.accent)) {
    const [a, m] = key.split('.');
    it(`主色 ${key}`, () => expectSame(blocks[`html[data-accent=${a}][data-m=${m}]`], vars));
  }
  it('一律方角', () => {
    for (const k of ['r-xs', 'r-sm', 'r', 'r-lg', 'r-xl']) expect(blocks[':root']?.[k], `--${k}`).toBe('0px');
  });
  it('字型使用 fontsource 名稱', () => {
    expect(blocks[':root']?.font).toContain('"Geist Variable"');
    expect(blocks[':root']?.font).toContain('"Noto Sans TC Variable"');
    expect(blocks[':root']?.disp).toContain('"Barlow Condensed"');
  });
});
