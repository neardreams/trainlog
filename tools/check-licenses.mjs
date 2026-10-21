#!/usr/bin/env node
// 授權檢查：會打包進網頁／App 的套件（prod）只允許白名單；開發工具（dev）另有已審核的例外清單。
// 新增例外前必須先取得使用者同意（CLAUDE.md §7）。
// 用法：node tools/check-licenses.mjs [--out third-party-licenses.txt]
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const ALLOW = new Set([
  'MIT',
  'MIT-0',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'OFL-1.1',
  'CC0-1.0',
  'Unlicense',
]);

// 已審核的開發工具例外（只出現在建置／檢查工具，不會打包進產品）：license → 允許的套件名稱
const DEV_EXCEPTIONS = {
  'MPL-2.0': ['lightningcss', /^lightningcss-/],
  'CC-BY-4.0': ['caniuse-lite'],
  'Python-2.0': ['argparse'],
  'BlueOak-1.0.0': [
    'jackspeak',
    'path-scurry',
    'lru-cache',
    'package-json-from-dist',
    'minimatch',
    'glob',
    'sax',
  ],
  'CC-BY-3.0': ['spdx-exceptions'],
};

const listLicenses = (prod) => {
  const cmd = `pnpm licenses list --json -r${prod ? ' --prod' : ''}`;
  const out = execSync(cmd, { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out || '{}');
};

// 解析 SPDX 運算式：OR 只要其中一個允許，AND 需要全部允許
const allowed = (expr, ok) => {
  const e = String(expr).replace(/[()]/g, ' ').trim();
  if (/\sOR\s/i.test(e)) return e.split(/\s+OR\s+/i).some((x) => allowed(x, ok));
  if (/\sAND\s/i.test(e)) return e.split(/\s+AND\s+/i).every((x) => allowed(x, ok));
  return ok(e.trim());
};
const isException = (license, name) =>
  (DEV_EXCEPTIONS[license] || []).some((p) => (p instanceof RegExp ? p.test(name) : p === name));

const problems = [];
const prod = listLicenses(true);
const prodPkgs = [];
for (const [license, pkgs] of Object.entries(prod)) {
  for (const p of pkgs) {
    prodPkgs.push({ name: p.name, versions: p.versions || [p.version], license });
    if (!allowed(license, (l) => ALLOW.has(l))) problems.push(`[prod] ${p.name} — ${license}`);
  }
}
const all = listLicenses(false);
for (const [license, pkgs] of Object.entries(all)) {
  for (const p of pkgs) {
    if (!allowed(license, (l) => ALLOW.has(l) || isException(l, p.name)))
      problems.push(`[dev] ${p.name} — ${license}`);
  }
}

const outIdx = process.argv.indexOf('--out');
if (outIdx > 0) {
  const lines = prodPkgs
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => `${p.name}@${p.versions.join(',')}  ${p.license}`);
  writeFileSync(process.argv[outIdx + 1], `TrainLog 第三方套件授權清單\n\n${lines.join('\n')}\n`);
}

if (problems.length) {
  console.error('授權檢查失敗：以下套件不在允許清單或例外清單中（新增例外前請先詢問使用者）');
  for (const p of [...new Set(problems)]) console.error('  ' + p);
  process.exit(1);
}
console.log(`授權檢查通過：prod ${prodPkgs.length} 個套件、全部依賴都在允許範圍內。`);
