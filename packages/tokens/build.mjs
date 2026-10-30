// 由 src/tokens.json 產生所有平台用的 token 檔（不使用第三方套件，方便 AI 直接閱讀與修改）
//   dist/tokens.css             網頁執行期 CSS 變數（html[data-m]、html[data-accent]；主色是 --a、--a-text…，見 v14 設計稿）
//   dist/theme.css              Tailwind v4 @theme：把語意 token 對應成 utility（bg-surface、text-fg-2…）
//   dist/nativewind.css         NativeWind（App）用：:root 淺色＋prefers-color-scheme 深色，值已解析
//   dist/tailwind-v3-preset.cjs NativeWind 用的 Tailwind v3 preset
//   dist/tokens.ts              TS 物件（RN 或程式中需要實際色值時使用）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const t = JSON.parse(readFileSync(resolve(here, 'src/tokens.json'), 'utf8'));
const out = resolve(here, 'dist');
mkdirSync(out, { recursive: true });

const ACCENTS = Object.keys(t.accent);
const MODES = ['light', 'dark'];
const decl = (obj, prefix = '') =>
  Object.entries(obj)
    .map(([k, v]) => `  --${prefix}${k}: ${v};`)
    .join('\n');
const modeVars = (m) => {
  const x = t.mode[m];
  return {
    ...Object.fromEntries(Object.entries(x.gray).map(([k, v]) => [`gray-${k}`, v])),
    ...Object.fromEntries(Object.entries(x.green).map(([k, v]) => [`green-${k}`, v])),
    ...Object.fromEntries(Object.entries(x.amber).map(([k, v]) => [`amber-${k}`, v])),
    ...Object.fromEntries(Object.entries(x.red).map(([k, v]) => [`red-${k}`, v])),
    ...x.group,
    ...x.surface,
  };
};
const accVars = (a, m) => ({ ...t.accent[a][m] });
const header = '/* 自動產生，請勿手改。來源：packages/tokens/src/tokens.json */\n';

// ── 1. tokens.css ──
let css = header + `:root {\n${decl(t.base)}\n}\n`;
for (const m of MODES) css += `html[data-m='${m}'] {\n  color-scheme: ${m};\n${decl(modeVars(m))}\n}\n`;
for (const a of ACCENTS)
  for (const m of MODES) css += `html[data-accent='${a}'][data-m='${m}'] {\n${decl(accVars(a, m))}\n}\n`;
css += `html {\n${decl(t.semantic)}\n}\n`;
for (const [key, v] of Object.entries(t.accentFgOverride ?? {})) {
  const [m, a] = key.split('.');
  css += `html[data-m='${m}'][data-accent='${a}'] {\n  --accent-fg: ${v};\n}\n`;
}
css += `html[data-density='compact'] {\n${decl(t.density.compact)}\n}\n`;
css += `html.sb-collapsed {\n${decl(t.sidebarCollapsed)}\n}\n`;
writeFileSync(resolve(out, 'tokens.css'), css);

// ── 2. theme.css（Tailwind v4）──
// 文字色用 fg 前綴，避免 text-text 這種寫法：text → fg、text-2 → fg-2…
const semanticColorNames = Object.keys(t.semantic).filter((k) => k !== 'chev');
const colorAlias = (k) => (k === 'text' ? 'fg' : k.startsWith('text-') ? `fg-${k.slice(5)}` : k);
const colorLines = [
  '  --color-*: initial;',
  '  --color-transparent: transparent;',
  '  --color-current: currentColor;',
  '  --color-white: #fff;',
  '  --color-black: #000;',
  ...['page', 'surface', 'surface-raised', 'sidebar'].map((k) => `  --color-${k}: var(--${k});`),
  ...semanticColorNames.map((k) => `  --color-${colorAlias(k)}: var(--${k});`),
  ...Object.keys(modeVars('light'))
    .filter((k) => /^(gray|green|amber|red)-\d+$/.test(k) || /^g\d$/.test(k))
    .map((k) => `  --color-${k}: var(--${k});`),
  ...Object.keys(accVars(ACCENTS[0], 'light')).map((k) => `  --color-${k}: var(--${k});`),
  ...['canvas', 'panel', 'head', 'th', 'nav', 'line', 'line-2', 'ctl', 'ink', 'ink-fg', 'empty'].map(
    (k) => `  --color-${k}: var(--${k});`,
  ),
];
const theme =
  header +
  `@theme inline {\n${colorLines.join('\n')}\n` +
  `  --font-sans: var(--font);\n  --font-mono: var(--mono);\n  --font-disp: var(--disp);\n` +
  `  --radius-xs: var(--r-xs);\n  --radius-sm: var(--r-sm);\n  --radius-md: var(--r);\n  --radius-lg: var(--r-lg);\n  --radius-xl: var(--r-xl);\n` +
  ['xs', 'sm', 'md', 'lg'].map((s) => `  --shadow-${s}: var(--shadow-${s});`).join('\n') +
  `\n  --ease-out: var(--ease);\n}\n`;
writeFileSync(resolve(out, 'theme.css'), theme);

// ── 3. 解析成實際值（RN 不支援 CSS 變數）──
const resolveAll = (m, a) => {
  const vars = { ...t.base, ...modeVars(m), ...accVars(a, m), ...t.semantic };
  const ov = t.accentFgOverride?.[`${m}.${a}`];
  if (ov) vars['accent-fg'] = ov;
  const res = (v, depth = 0) =>
    depth > 10
      ? v
      : v.replace(/var\(--([\w-]+)\)/g, (_, n) => (n in vars ? res(vars[n], depth + 1) : `var(--${n})`));
  return Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, res(v)]));
};
const resolved = {};
for (const a of ACCENTS) for (const m of MODES) resolved[`${a}.${m}`] = resolveAll(m, a);

// ── 4. nativewind.css ──
const da = t.defaultAccent;
const rnDecl = (o) =>
  Object.entries(o)
    .filter(([, v]) => !/color-mix|url\(|cubic-bezier/.test(v))
    .map(([k, v]) => `    --${k}: ${v};`)
    .join('\n');
writeFileSync(
  resolve(out, 'nativewind.css'),
  header +
    `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n` +
    `:root {\n${rnDecl(resolved[`${da}.light`]).replace(/^ {4}/gm, '  ')}\n}\n` +
    `@media (prefers-color-scheme: dark) {\n  :root {\n${rnDecl(resolved[`${da}.dark`])}\n  }\n}\n`,
);

// ── 5. tailwind-v3-preset.cjs ──
const v3colors = Object.fromEntries(
  colorLines
    .map((l) => l.match(/--color-([\w-]+): (.+);/))
    .filter((x) => x && x[1] !== '*')
    .map(([, n, v]) => [n, v]),
);
writeFileSync(
  resolve(out, 'tailwind-v3-preset.cjs'),
  header.replace('/*', '//').replace(' */', '') +
    `module.exports = ${JSON.stringify(
      {
        theme: {
          colors: v3colors,
          extend: {
            fontFamily: { sans: ['var(--font)'], mono: ['var(--mono)'], disp: ['var(--disp)'] },
            // v14 一律方角
            borderRadius: { xs: '0px', sm: '0px', md: '0px', lg: '0px', xl: '0px' },
          },
        },
      },
      null,
      2,
    )};\n`,
);

// ── 6. tokens.ts ──
writeFileSync(
  resolve(out, 'tokens.ts'),
  header +
    `export const accents = ${JSON.stringify(ACCENTS)} as const;\n` +
    `export type Accent = (typeof accents)[number];\nexport type Mode = 'light' | 'dark';\n` +
    `export const defaultAccent: Accent = ${JSON.stringify(da)};\n` +
    `/** 依主色與深淺模式解析後的實際值（key 為 CSS 變數名稱，不含 --） */\n` +
    `export const resolvedTokens: Record<\`\${Accent}.\${Mode}\`, Record<string, string>> = ${JSON.stringify(resolved, null, 2)};\n` +
    `/** 部位色 token 名稱（依 meta.group_order 對應，見 CLAUDE.md §5） */\n` +
    `export const groupToken: Record<string, string> = ${JSON.stringify({ 腿部: 'g0', 背部: 'g2', 胸部: 'g1', 肩部: 'g6', 手臂: 'g4', 核心: 'g3', 髖部: 'g5', 有氧: 'g7' })};\n`,
);
console.log(
  'tokens 產生完成：',
  ['tokens.css', 'theme.css', 'nativewind.css', 'tailwind-v3-preset.cjs', 'tokens.ts'].join('、'),
);
