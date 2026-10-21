import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { legacyUrlToHash } from '@trainlog/core';
import { DataSourceProvider, StaticJsonSource } from '@trainlog/data-client';
import './styles/app.css';

// 舊網址（?date=、?exercise=、?view=）先轉成新的 hash 路由，再建立 router
const legacy = legacyUrlToHash(location.search);
if (legacy) history.replaceState(null, '', location.pathname + legacy);

const { router } = await import('./router');
const queryClient = new QueryClient();
const source = new StaticJsonSource(`${import.meta.env.BASE_URL}data/`);

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <DataSourceProvider source={source}>
        <RouterProvider router={router} />
      </DataSourceProvider>
    </QueryClientProvider>
  </StrictMode>,
);
