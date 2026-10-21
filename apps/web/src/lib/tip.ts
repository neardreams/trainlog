// 圖表提示框：全頁共用一個 .spark-tooltip（外觀同 v9）
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
