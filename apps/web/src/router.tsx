// 路由（TanStack Router、hash 路由：靜態主機不需要額外設定）
// 網址參數都有型別；非法值一律回到預設值
import { createHashHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import {
  DATE_RE,
  PERIODS,
  SORT_KEYS,
  type Period,
  type RangeGroupBy,
  type RangeSortKey,
  type SortKey,
} from '@trainlog/core';
import { AppShell } from '@/components/AppShell';
import { DashboardPage } from '@/routes/DashboardPage';
import { ExercisesPage } from '@/routes/ExercisesPage';
import { DayPage, DaysIndex } from '@/routes/DayPage';
import { SpecPage } from '@/routes/SpecPage';

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const oneOf = <T extends string | number>(v: unknown, list: readonly T[]) =>
  list.find((x) => String(x) === String(v));

export type ExerciseStatusFilter = 'all' | '7' | '30' | 'old';
export interface ExercisesSearch {
  q?: string;
  groups?: string[];
  status?: ExerciseStatusFilter;
  sort?: SortKey;
  /** 打開並捲動到這個動作 */
  ex?: string;
}
export type DayTab = 'range' | 'compare' | 'raw';
export interface DaySearch {
  range?: 0 | 3 | 7 | 14 | 30;
  groupBy?: RangeGroupBy;
  sortBy?: RangeSortKey;
  tab?: DayTab;
  /** 下鑽：顯示這個動作的全歷程 */
  ex?: string;
  /** 下鑽時要標出的來源日期（預設為頁面日期） */
  at?: string;
  /** 比較的另一天 */
  cmp?: string;
}

const rootRoute = createRootRoute({ component: AppShell });

export const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (s: Record<string, unknown>): { period?: Period } => {
    const p = oneOf(Number(s.period), PERIODS);
    return p && p !== 30 ? { period: p } : {};
  },
  component: DashboardPage,
});

export const exercisesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/exercises',
  validateSearch: (s: Record<string, unknown>): ExercisesSearch => {
    const groups = Array.isArray(s.groups)
      ? s.groups.filter((g): g is string => typeof g === 'string')
      : undefined;
    const status = oneOf(s.status, ['all', '7', '30', 'old'] as const);
    const sort = oneOf(s.sort, SORT_KEYS);
    return {
      ...(str(s.q) ? { q: str(s.q) } : {}),
      ...(groups?.length ? { groups } : {}),
      ...(status && status !== 'all' ? { status } : {}),
      ...(sort && sort !== 'group' ? { sort } : {}),
      ...(str(s.ex) ? { ex: str(s.ex) } : {}),
    };
  },
  component: ExercisesPage,
});

export const daysIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/days',
  component: DaysIndex,
});

export const dayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/days/$date',
  validateSearch: (s: Record<string, unknown>): DaySearch => {
    const range = oneOf(Number(s.range), [0, 3, 7, 14, 30] as const);
    const groupBy = oneOf(s.groupBy, ['exercise', 'date', 'group'] as const);
    const sortBy = oneOf(s.sortBy, ['date-desc', 'date-asc', 'vol-desc', 'wt-desc', 'name'] as const);
    const tab = oneOf(s.tab, ['range', 'compare', 'raw'] as const);
    const cmp = str(s.cmp);
    const at = str(s.at);
    return {
      ...(range ? { range } : {}),
      ...(groupBy && groupBy !== 'exercise' ? { groupBy } : {}),
      ...(sortBy && sortBy !== 'date-desc' ? { sortBy } : {}),
      ...(tab && tab !== 'range' ? { tab } : {}),
      ...(str(s.ex) ? { ex: str(s.ex) } : {}),
      ...(at && DATE_RE.test(at) ? { at } : {}),
      ...(cmp && DATE_RE.test(cmp) ? { cmp } : {}),
    };
  },
  component: DayPage,
});

export const specRoute = createRoute({ getParentRoute: () => rootRoute, path: '/spec', component: SpecPage });

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  exercisesRoute,
  daysIndexRoute,
  dayRoute,
  specRoute,
]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: false,
  scrollRestoration: true,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
