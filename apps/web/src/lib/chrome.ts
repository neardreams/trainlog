// 外框（頁首麵包屑、手機側欄、指令面板、通知）的共用狀態
import { useEffect } from 'react';
import { create } from 'zustand';
import { groupToken } from '@trainlog/tokens';

export type Crumb = {
  label: string;
  to?: string;
  search?: Record<string, unknown>;
  params?: Record<string, string>;
};

interface Chrome {
  crumbs: Crumb[];
  sidebarOpen: boolean;
  paletteOpen: boolean;
  toast: { id: number; text: string } | null;
  /** 動作庫目前捲動到的部位（側欄高亮用） */
  activeGroup: string | null;
  /** 側欄點了部位，動作庫載入後要捲到這裡（每次點擊都是新物件，重複點同一個部位也會捲動） */
  pendingGroup: { g: string } | null;
  setActiveGroup: (g: string | null) => void;
  setPendingGroup: (g: string | null) => void;
  setCrumbs: (c: Crumb[]) => void;
  setSidebarOpen: (o: boolean) => void;
  setPaletteOpen: (o: boolean) => void;
  showToast: (text: string) => void;
}

export const useChrome = create<Chrome>()((set) => ({
  crumbs: [],
  sidebarOpen: false,
  paletteOpen: false,
  toast: null,
  activeGroup: null,
  pendingGroup: null,
  setActiveGroup: (activeGroup) => set({ activeGroup }),
  setPendingGroup: (g) => set({ pendingGroup: g ? { g } : null }),
  setCrumbs: (crumbs) => set({ crumbs }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  showToast: (text) => set({ toast: { id: Date.now(), text } }),
}));

/** 頁面宣告自己的麵包屑 */
export function useCrumbs(crumbs: Crumb[]) {
  const set = useChrome((s) => s.setCrumbs);
  const key = JSON.stringify(crumbs);
  useEffect(() => {
    set(JSON.parse(key) as Crumb[]);
  }, [key, set]);
}

/** 部位色：CSS 變數（例如 var(--g0)） */
export const gColor = (g: string) => `var(--${groupToken[g] ?? 'gray-8'})`;
/** 部位字塊上的字（部位名稱裡最能代表的那個字） */
export const PART_CHAR: Record<string, string> = {
  腿部: '腿',
  背部: '背',
  胸部: '胸',
  肩部: '肩',
  手臂: '臂',
  核心: '核',
  髖部: '髖',
  有氧: '氧',
};
/** 淺色部位（背部、手臂、核心）的字塊用深色字 */
export const PART_DARK = new Set(['背部', '手臂', '核心']);
