import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { legacyUrlToPath } from '@trainlog/core';
import { StaticJsonSource } from '@trainlog/data-client';
import './styles/app.css';

// 舊網址（v6 的 ?date=…，以及 2026-11 以前的 #/days/… hash 路由）先轉成路徑網址，再建立 router
const legacy = legacyUrlToPath(location.search, location.hash);
if (legacy) history.replaceState(null, '', legacy);

const [{ createAppRouter }, { App }, { registerWebMcp }, { pageTitle }] = await Promise.all([
  import('./router'),
  import('./App'),
  import('./lib/webmcp'),
  import('./lib/meta'),
]);
const router = createAppRouter();
router.subscribe('onResolved', ({ toLocation }) => {
  document.title = pageTitle(toLocation.pathname);
});
const queryClient = new QueryClient();
const source = new StaticJsonSource('/data/');

// 先載入資料再渲染：頁面已有建置時預先渲染的 HTML，不要先被「資料載入中」蓋掉。
// 載入失敗時不在這裡處理，AppShell 會重試並顯示錯誤。
try {
  queryClient.setQueryData(['dataset'], await source.getDataset());
} catch {
  /* 交給 AppShell */
}
await router.load();

// 用 createRoot 整個換掉預先渲染的內容（不用 hydrate）：「今天」、深淺色、密度在瀏覽器才知道，
// 和建置時的 HTML 不一定相同。
createRoot(document.getElementById('root') as HTMLElement).render(
  <App router={router} queryClient={queryClient} source={source} />,
);

registerWebMcp(source, router);
