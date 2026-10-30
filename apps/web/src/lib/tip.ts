// 提示框：圖表用 showTip（.spark-tooltip）；其他元素加 data-tip 屬性，由 useDataTips 統一顯示（#tip）。兩者外觀相同（v14 墨色底）
import { useEffect } from 'react';
let el: HTMLDivElement | null = null;

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/** lines：每行一段文字；用 **粗體** 標記數值 */
export function showTip(lines: string[], e: { clientX: number; clientY: number }) {
  if (!el) {
    el = document.createElement('div');
    el.className = 'spark-tooltip';
    document.body.appendChild(el);
    addEventListener('scroll', hideTip, { passive: true });
  }
  el.innerHTML = lines.map((l) => esc(l).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')).join('<br>');
  el.style.display = 'block';
  el.style.left = `${Math.min(innerWidth - el.offsetWidth - 8, e.clientX + 14)}px`;
  el.style.top = `${Math.max(8, e.clientY - el.offsetHeight - 12)}px`;
}

export function hideTip() {
  if (el) el.style.display = 'none';
}

/** 全站的 data-tip 提示框：滑過帶 data-tip 的元素就顯示（可換行）；AppShell 掛一次 */
export function useDataTips() {
  useEffect(() => {
    const tip = document.createElement('div');
    tip.id = 'tip';
    tip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tip);
    let cur: HTMLElement | null = null;
    const hide = () => {
      cur = null;
      tip.classList.remove('on');
    };
    const move = (e: MouseEvent) => {
      const t = (e.target as Element | null)?.closest?.<HTMLElement>('[data-tip]') ?? null;
      const text = t?.dataset.tip;
      if (!t || !text) return hide();
      if (t !== cur || tip.textContent !== text) {
        cur = t;
        tip.textContent = text;
      }
      tip.classList.add('on');
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      tip.style.left = `${Math.min(innerWidth - w - 8, Math.max(8, e.clientX - w / 2))}px`;
      tip.style.top = `${e.clientY - h - 12 < 4 ? e.clientY + 18 : e.clientY - h - 12}px`;
    };
    addEventListener('mousemove', move, { passive: true });
    addEventListener('mousedown', hide);
    addEventListener('scroll', hide, { passive: true, capture: true });
    return () => {
      removeEventListener('mousemove', move);
      removeEventListener('mousedown', hide);
      removeEventListener('scroll', hide, { capture: true });
      tip.remove();
    };
  }, []);
}
