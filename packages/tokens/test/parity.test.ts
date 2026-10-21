// 確認產生的 tokens.css 與 v9 設計稿（fixture 快照）的每一個值一致
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type VarMap = Record<string, string>;
const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(resolve(here, 'fixtures/v9-tokens.json'), 'utf8')) as {
  root: VarMap;
  light: VarMap;
  dark: VarMap;
  semantic: VarMap;
  compact: VarMap;
  collapsed: VarMap;
  accent: Record<string, VarMap>;
  accentFgOverride: VarMap;
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
const expectSame = (actual: VarMap | undefined, expected: VarMap, skip: string[] = []) => {
  expect(actual).toBeDefined();
  for (const [k, v] of Object.entries(expected)) {
    if (skip.includes(k)) continue;
    expect(norm(actual?.[k] ?? '(缺少)'), `--${k}`).toBe(norm(v));
  }
};

describe('tokens.css 與 v9 design.css 一致', () => {
  // 字型名稱刻意改成 fontsource 的 "Geist Variable" 等，故略過
  it(':root（字型除外）', () => expectSame(blocks[':root'], fixture.root, ['font', 'mono']));
  it('淺色', () => expectSame(blocks['html[data-m=light]'], fixture.light));
  it('深色', () => expectSame(blocks['html[data-m=dark]'], fixture.dark));
  it('語意層', () => expectSame(blocks['html'], fixture.semantic));
  it('緊湊密度', () => expectSame(blocks['html[data-density=compact]'], fixture.compact));
  it('側欄收合', () => expectSame(blocks['html.sb-collapsed'], fixture.collapsed));
  it('深色青綠的 accent-fg 例外', () =>
    expectSame(blocks['html[data-m=dark][data-accent=teal]'], fixture.accentFgOverride));
  for (const [key, vars] of Object.entries(fixture.accent)) {
    const [a, m] = key.split('.');
    it(`主色 ${key}`, () => expectSame(blocks[`html[data-accent=${a}][data-m=${m}]`], vars));
  }
  it('字型使用 fontsource 名稱', () => {
    expect(blocks[':root']?.font).toContain('"Geist Variable"');
    expect(blocks[':root']?.font).toContain('"Noto Sans TC Variable"');
  });
});
