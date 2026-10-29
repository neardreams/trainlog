// 網站內嵌影片播放器的共用狀態：任何地方都能叫出播放器，AppShell 只掛一個（VideoPlayerHost）
import { create } from 'zustand';
import type { DayVideo } from '@trainlog/core';

/**
 * 要播的影片：有 exerciseId 時只列這個動作的各段，沒有時列出當天所有段落（依動作分組）；start 為開始秒數。
 * allDays（搭配 exerciseId）：列出這個動作所有拍了影片的日子，可以直接換到其他天
 */
export interface VideoTarget {
  video: DayVideo;
  exerciseId?: string;
  start: number;
  allDays?: boolean;
}

interface Player {
  target: VideoTarget | null;
  /** 關閉後把焦點還給這個元素（開啟播放器的按鈕） */
  returnTo: HTMLElement | null;
  /** 每次開啟都換號，播放器重新掛上 */
  n: number;
  open: (target: VideoTarget, returnTo?: HTMLElement | null) => void;
  close: () => void;
}

export const usePlayer = create<Player>()((set) => ({
  target: null,
  returnTo: null,
  n: 0,
  open: (target, returnTo = null) => set((s) => ({ target, returnTo, n: s.n + 1 })),
  close: () => set({ target: null }),
}));

export const openVideo = (target: VideoTarget, returnTo?: HTMLElement | null) =>
  usePlayer.getState().open(target, returnTo);
