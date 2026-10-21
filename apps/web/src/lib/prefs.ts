// 介面偏好（深淺色、密度、側欄收合），存在 localStorage（讀寫失敗時不影響使用）
// 儲存格式需與 index.html 的開頁腳本一致：{ state: { mode, density, collapsed } }
import { useEffect } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export type Mode = 'light' | 'dark';
export type Density = 'comfortable' | 'compact';

interface Prefs {
  mode: Mode;
  density: Density;
  collapsed: boolean;
  toggleMode: () => void;
  setDensity: (d: Density) => void;
  toggleCollapsed: () => void;
}

const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* 私密瀏覽等情況無法儲存，忽略 */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* 忽略 */
    }
  },
};

const initialMode = (): Mode => (document.documentElement.dataset.m === 'dark' ? 'dark' : 'light');

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      mode: initialMode(),
      density: 'comfortable',
      collapsed: false,
      toggleMode: () => set((s) => ({ mode: s.mode === 'dark' ? 'light' : 'dark' })),
      setDensity: (density) => set({ density }),
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
    }),
    {
      name: 'tl-prefs',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ mode: s.mode, density: s.density, collapsed: s.collapsed }),
    },
  ),
);

/** 把偏好同步到 <html> 的屬性（CSS 依此切換） */
export function usePrefsEffect() {
  const { mode, density, collapsed } = usePrefs();
  useEffect(() => {
    const R = document.documentElement;
    R.dataset.m = mode;
    R.dataset.density = density;
    R.classList.toggle('sb-collapsed', collapsed);
  }, [mode, density, collapsed]);
}
