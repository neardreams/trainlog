#!/usr/bin/env node
// 從 redesign/v9/design.css 擷取所有 token（CSS 變數），產生：
//   packages/tokens/src/tokens.json             ← token 的唯一來源（之後直接維護這份）
//   packages/tokens/test/fixtures/v9-tokens.json ← v9 原始值快照，比對測試用（redesign/ 未納入版控）
// 只需執行一次；之後改 token 請直接改 tokens.json。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(resolve(root, 'redesign/v9/design.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// 解析「選擇器{...}」中的 --變數
const blocks = {};
for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const sel = m[1].trim();
  const vars = {};
  for (const d of m[2].matchAll(/--([\w-]+)\s*:\s*([^;]+?)\s*(?:;|$)/g)) vars[d[1]] = d[2].trim();
  if (Object.keys(vars).length) blocks[sel] = { ...(blocks[sel] || {}), ...vars };
}
const pick = (sel) => {
  if (!blocks[sel]) throw new Error(`design.css 找不到區塊：${sel}`);
  return blocks[sel];
};

const fixture = {
  root: pick(':root'),
  light: pick('html[data-m=light]'),
  dark: pick('html[data-m=dark]'),
  semantic: pick('html'),
  compact: pick('html[data-density=compact]'),
  collapsed: pick('html.sb-collapsed'),
  accent: {},
  accentFgOverride: pick('html[data-m=dark][data-accent=teal]'),
};
for (const a of ['indigo', 'teal', 'blue'])
  for (const m of ['light', 'dark'])
    fixture.accent[`${a}.${m}`] = pick(`html[data-accent=${a}][data-m=${m}]`);

// 分類成結構化的 tokens.json
const scale = (vars, name) =>
  Object.fromEntries(
    Object.entries(vars)
      .filter(([k]) => k.startsWith(`${name}-`) && /^\d+$/.test(k.slice(name.length + 1)))
      .map(([k, v]) => [k.slice(name.length + 1), v]),
  );
const modeTokens = (vars) => {
  const out = {
    gray: scale(vars, 'gray'),
    green: scale(vars, 'green'),
    amber: scale(vars, 'amber'),
    red: scale(vars, 'red'),
  };
  out.group = Object.fromEntries(Object.entries(vars).filter(([k]) => /^g\d$/.test(k)));
  out.surface = Object.fromEntries(
    Object.entries(vars).filter(([k]) => !/^(gray|green|amber|red)-\d+$/.test(k) && !/^g\d$/.test(k)),
  );
  return out;
};
const tokens = {
  $comment: '設計 token 唯一來源（移植自 redesign/v9/design.css）。改完執行 pnpm build:tokens。',
  base: fixture.root,
  mode: { light: modeTokens(fixture.light), dark: modeTokens(fixture.dark) },
  accent: Object.fromEntries(
    ['indigo', 'teal', 'blue'].map((a) => [
      a,
      { light: scale(fixture.accent[`${a}.light`], 'acc'), dark: scale(fixture.accent[`${a}.dark`], 'acc') },
    ]),
  ),
  accentFgOverride: { 'dark.teal': fixture.accentFgOverride['accent-fg'] },
  semantic: fixture.semantic,
  density: { compact: fixture.compact },
  sidebarCollapsed: fixture.collapsed,
  defaultAccent: 'indigo',
};

const write = (rel, obj) => {
  const p = resolve(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
  console.log('寫入', rel);
};
write('packages/tokens/test/fixtures/v9-tokens.json', fixture);
write('packages/tokens/src/tokens.json', tokens);
