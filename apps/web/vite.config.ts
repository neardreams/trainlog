import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DATA_DIR = resolve(import.meta.dirname, '../../data');
/** 只公開這些檔案；.sync_hashes.json、.pending_updates.json 絕不能被讀到或複製 */
const PUBLIC_DATA = ['training_data.json', 'journals_raw.json'];
/** 可選的公開檔案：存在才提供／複製（還沒有影片時沒有 videos.json） */
const OPTIONAL_DATA = ['videos.json'];

/** 開發時把 /data/*.json 對應到 repo 的 data/；建置時複製到 dist/data/ */
function trainlogData(): Plugin {
  let outDir = 'dist';
  return {
    name: 'trainlog-data',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/^\/data\/([^?#]+)/);
        if (!m) return next();
        const file = decodeURIComponent(m[1] ?? '');
        const optional = OPTIONAL_DATA.includes(file);
        if (!(PUBLIC_DATA.includes(file) || (optional && existsSync(resolve(DATA_DIR, file))))) {
          res.statusCode = 404;
          return res.end('Not found');
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(readFileSync(resolve(DATA_DIR, file)));
      });
    },
    closeBundle() {
      mkdirSync(resolve(outDir, 'data'), { recursive: true });
      for (const f of PUBLIC_DATA) copyFileSync(resolve(DATA_DIR, f), resolve(outDir, 'data', f));
      for (const f of OPTIONAL_DATA)
        if (existsSync(resolve(DATA_DIR, f))) copyFileSync(resolve(DATA_DIR, f), resolve(outDir, 'data', f));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), trainlogData()],
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  server: { port: 5180, strictPort: true },
  build: { chunkSizeWarningLimit: 900 },
});
