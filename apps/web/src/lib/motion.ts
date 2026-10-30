// 進頁動態（v14）：換頁時長條長出來、指標數字跑表；點選與切換不重播；系統設定「減少動態」時完全不播
import { useEffect, useState } from 'react';

const reduced = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 進頁後的 1.4 秒內為 true：頁面根元素加上 .enter，CSS 動畫只在這段時間播 */
export function useEnter(ms = 1400): boolean {
  const [on, setOn] = useState(() => !reduced());
  useEffect(() => {
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return on;
}

/** 數字跑表：第一次出現時從 0 跑到 value（0.65 秒、減速），之後數值改變直接顯示 */
export function useCountUp(value: number, dp: number): string {
  const fmt = (v: number) =>
    v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const [shown, setShown] = useState<number | null>(() => (reduced() ? null : 0));
  useEffect(() => {
    if (shown == null) return;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 650);
      if (p < 1) {
        setShown(value * (1 - (1 - p) ** 3));
        raf = requestAnimationFrame(step);
      } else setShown(null);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // 只在第一次出現時播
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return fmt(shown ?? value);
}
