// 瀏覽器（main.tsx）與建置時預先渲染（entry-server.tsx）共用的根元件
import { StrictMode } from 'react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import type { DataSource } from '@trainlog/core';
import { DataSourceProvider } from '@trainlog/data-client';
import type { createAppRouter } from './router';

export function App({
  router,
  queryClient,
  source,
}: {
  router: ReturnType<typeof createAppRouter>;
  queryClient: QueryClient;
  source: DataSource;
}) {
  return (
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <DataSourceProvider source={source}>
          <RouterProvider router={router} />
        </DataSourceProvider>
      </QueryClientProvider>
    </StrictMode>
  );
}
