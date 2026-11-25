// 建置時預先渲染（SSR）：用 apps/web/dist-server/entry-server.js 把每一頁渲染成 HTML 寫進 apps/web/dist/，
// 另外產生 sitemap.xml、robots.txt、llms.txt。由 apps/web 的 build 指令在 vite build 之後執行。
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const WEB = resolve(ROOT, 'apps/web');
const DIST = resolve(WEB, 'dist');
const SERVER = resolve(WEB, 'dist-server');
const DATA = resolve(ROOT, 'data');

const readJson = (f, optional = false) => {
  try {
    return JSON.parse(readFileSync(resolve(DATA, f), 'utf8'));
  } catch (e) {
    if (optional && e.code === 'ENOENT') return undefined;
    throw e;
  }
};

const ssr = await import(pathToFileURL(resolve(SERVER, 'entry-server.js')).href);
const ds = ssr.loadDataset(
  readJson('training_data.json'),
  readJson('journals_raw.json'),
  readJson('videos.json', true),
);

const template = readFileSync(resolve(DIST, 'index.html'), 'utf8');
if (!template.includes('<div id="root"></div>'))
  throw new Error('dist/index.html 找不到 <div id="root"></div>');
if (!/<title>[^<]*<\/title>/.test(template)) throw new Error('dist/index.html 找不到 <title>');

const write = (rel, text) => {
  const file = resolve(DIST, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};

// 網址 /days/2026-11-24 → days/2026-11-24.html（Cloudflare 靜態資產會自動對應，不需要結尾斜線）
const fileOf = (path) => (path === '/' ? 'index.html' : `${path.slice(1)}.html`);

const list = ssr.pages(ds);
const t0 = Date.now();
for (const p of list) {
  const app = await ssr.render(p.path, ds);
  if (!app || app.length < 200) throw new Error(`${p.path} 渲染結果太短，可能出錯：${app}`);
  const html = template
    .replace(/<title>[^<]*<\/title>/, ssr.headTags(p))
    .replace('<div id="root"></div>', `<div id="root">${app}</div>`);
  write(fileOf(p.path), html);
}
write('sitemap.xml', ssr.sitemapXml(list));
write('robots.txt', ssr.robotsTxt());
write('llms.txt', ssr.llmsTxt(ds));
rmSync(SERVER, { recursive: true, force: true });
console.log(`預先渲染 ${list.length} 頁（${Date.now() - t0} ms），另產生 sitemap.xml、robots.txt、llms.txt`);
