// 圖表（移植自 v9 手繪 SVG）：趨勢線、迷你趨勢、指標卡小圖、每週長條圖、全年熱度圖
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  addDays,
  avgExcludingCurrent,
  dayGroups,
  daysBetween,
  daySets,
  dowOf,
  fmtN,
  heatLevel,
  md,
  mondayOf,
  niceTicks,
  slash,
  type DateStr,
  type WeekStat,
} from '@trainlog/core';
import { hideTip, showTip } from '@/lib/tip';
import { useDs } from '@/lib/useDs';

/** 量測容器寬度（隨視窗與側欄收合更新） */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** 趨勢卡的折線（含十字線與提示框） */
export function Sparkline({
  data,
  unit,
  height = 56,
}: {
  data: [DateStr, number][];
  unit: string;
  height?: number;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const uid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;
  const vals = data.map(([, v]) => v);
  const trend = n ? (vals[n - 1] ?? 0) - (vals[0] ?? 0) : 0;
  const H = height;
  const pX = 4;
  const pY = 7;
  const vmin = Math.min(...vals);
  const vmax = Math.max(...vals);
  const vr = vmax === vmin ? 1 : vmax - vmin;
  const xs = data.map((_, i) => pX + (i * (W - pX * 2)) / Math.max(1, n - 1));
  const ys = vals.map((v) => H - pY - ((v - vmin) / vr) * (H - pY * 2));
  const pts = xs.map((x, i) => `${x.toFixed(1)},${(ys[i] ?? 0).toFixed(1)}`).join(' ');
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const mx = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let ni = 0;
    let nd = Infinity;
    xs.forEach((x, i) => {
      const d = Math.abs(x - mx);
      if (d < nd) {
        nd = d;
        ni = i;
      }
    });
    setHover(ni);
    const p = data[ni];
    if (p) showTip([slash(p[0]), `**${fmtN(p[1])}** ${unit}`], e);
  };
  return (
    <div
      ref={ref}
      className={clsx('spark-js', trend > 0 && 'is-up', trend < 0 && 'is-down')}
      style={{ height: H }}
    >
      {W > 0 && n >= 2 && (
        <svg
          width={W}
          height={H}
          role="img"
          aria-label="趨勢"
          onPointerMove={move}
          onPointerDown={move}
          onPointerLeave={() => (setHover(null), hideTip())}
        >
          <defs>
            <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity=".22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line className="grid" x1="0" x2={W} y1={H / 2} y2={H / 2} />
          <polygon points={`${pX},${H} ${pts} ${(xs[n - 1] ?? 0).toFixed(1)},${H}`} fill={`url(#${uid})`} />
          <polyline
            points={pts}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {hover != null && (
            <>
              <line className="xh" x1={xs[hover]} x2={xs[hover]} y1="0" y2={H} />
              <circle className="pt" r="4" cx={xs[hover]} cy={ys[hover]} />
            </>
          )}
          <circle className="pt" cx={xs[n - 1]} cy={ys[n - 1]} r="3" />
          <rect x="0" y="0" width={W} height={H} fill="transparent" />
        </svg>
      )}
    </div>
  );
}

/** 動作庫的迷你趨勢線 */
export function MiniTrend({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="na">—</span>;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const rg = mx - mn || 1;
  const d = (values[values.length - 1] ?? 0) - (values[0] ?? 0);
  const pts = values
    .map(
      (y, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(22 - ((y - mn) / rg) * 20).toFixed(1)}`,
    )
    .join(' ');
  return (
    <svg
      className={clsx('mini', d > 0 && 'is-up', d < 0 && 'is-down')}
      viewBox="0 0 100 24"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon className="area" points={`0,24 ${pts} 100,24`} />
      <polyline points={pts} />
    </svg>
  );
}

/** 指標卡右下的 12 週小圖 */
export function KSpark({ values }: { values: number[] }) {
  const mx = Math.max(1, ...values);
  const pts = values
    .map(
      (y, i) =>
        `${((i / Math.max(1, values.length - 1)) * 100).toFixed(1)},${(26 - (y / mx) * 22).toFixed(1)}`,
    )
    .join(' ');
  return (
    <svg className="kspark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <polygon className="area" points={`0,28 ${pts} 100,28`} />
      <polyline points={pts} />
    </svg>
  );
}

export type WeekMetric = 'vol' | 'days' | 'sets';

/** 每週訓練量長條圖（26 週，平均線，點長條開啟該週最後一個訓練日） */
export function WeekChart({
  weeks,
  metric,
  onOpenWeek,
}: {
  weeks: WeekStat[];
  metric: WeekMetric;
  onOpenWeek: (w: WeekStat) => void;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [hov, setHov] = useState<number | null>(null);
  const H = 220;
  const L = 44;
  const R = 8;
  const T = 10;
  const B = 24;
  const N = weeks.length;
  const vals = weeks.map((w) => w[metric]);
  const avg = avgExcludingCurrent(vals);
  const { max, ticks } = niceTicks(Math.max(1, ...vals));
  const fa = (v: number) => (metric === 'vol' ? (v >= 1000 ? `${fmtN(v / 1000)}k` : fmtN(v)) : fmtN(v));
  const bw = (W - L - R) / Math.max(1, N);
  const Y = (v: number) => T + (H - T - B) * (1 - v / max);
  return (
    <div ref={ref} className="chart">
      {W > 0 && (
        <svg width={W} height={H} role="img" aria-label="每週訓練量">
          {ticks.map((v, i) => (
            <g key={v}>
              <line className={clsx('gl', i === 0 && 'base')} x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} />
              <text x={L - 8} y={Y(v) + 4} textAnchor="end">
                {fa(v)}
              </text>
            </g>
          ))}
          <g className={clsx('bars', hov != null && 'hover')}>
            {weeks.map((x, i) => {
              const v = x[metric];
              if (v <= 0) return null;
              const bx = L + i * bw + bw * 0.18;
              const w = bw * 0.64;
              const top = Y(v);
              const h = H - B - top;
              const r = Math.min(3, w / 2, h);
              return (
                <path
                  key={x.w}
                  className={clsx('bar', i === N - 1 && 'cur', hov === i && 'hov')}
                  d={`M${bx},${H - B}V${top + r}Q${bx},${top} ${bx + r},${top}H${bx + w - r}Q${bx + w},${top} ${bx + w},${top + r}V${H - B}Z`}
                />
              );
            })}
          </g>
          <line className="avg" x1={L} x2={W - R} y1={Y(avg)} y2={Y(avg)} />
          <text className="avg-l" x={W - R} y={Y(avg) - 5} textAnchor="end">
            平均 {fa(avg)}
          </text>
          {weeks.map((x, i) =>
            i % 4 === 1 || i === N - 1 ? (
              <text key={`l${x.w}`} x={L + i * bw + bw / 2} y={H - 6} textAnchor="middle">
                {i === N - 1 ? '本週' : md(x.w)}
              </text>
            ) : null,
          )}
          {weeks.map((x, i) => (
            <rect
              key={`h${x.w}`}
              className="hit"
              x={L + i * bw}
              y={T}
              width={bw}
              height={H - T - B}
              onPointerMove={(e) => {
                setHov(i);
                showTip(
                  [
                    `${md(x.w)} – ${md(addDays(x.w, 6))}`,
                    `**${fmtN(x.vol)}** kg · ${x.days} 天 · ${x.sets} 組`,
                  ],
                  e,
                );
              }}
              onPointerLeave={() => (setHov(null), hideTip())}
              onClick={() => onOpenWeek(x)}
            />
          ))}
        </svg>
      )}
    </div>
  );
}

/** 全年熱度圖（每日組數） */
export function Heatmap({ today, onOpenDay }: { today: DateStr; onOpenDay: (d: DateStr) => void }) {
  const ds = useDs();
  const [ref, W] = useWidth<HTMLDivElement>();
  useEffect(() => hideTip, []);
  const yr = today.slice(0, 4);
  const start = mondayOf(`${yr}-01-01`);
  // 與 v9 相同：週數無條件進位再多留一欄
  const weeks = Math.ceil(daysBetween(start, today) / 7) + 1;
  const L = 22;
  const T = 18;
  const gap = 3;
  const cell = Math.max(7, Math.min(18, (W - L) / weeks - gap));
  const H = T + 7 * (cell + gap);
  const cells: { d: DateStr; x: number; y: number; n: number }[] = [];
  const months: { x: number; label: string }[] = [];
  let lastM = -1;
  for (let w = 0; w < weeks; w++) {
    const wsd = addDays(start, w * 7);
    const m = Number(wsd.slice(5, 7)) - 1;
    if (m !== lastM && wsd.slice(0, 4) === yr) {
      months.push({ x: L + w * (cell + gap), label: `${m + 1}月` });
      lastM = m;
    }
    for (let d = 0; d < 7; d++) {
      const day = addDays(wsd, d);
      if (day > today || day < `${yr}-01-01`) continue;
      cells.push({
        d: day,
        x: L + w * (cell + gap),
        y: T + d * (cell + gap),
        n: ds.entriesByDate.has(day) ? daySets(ds, day) : 0,
      });
    }
  }
  return (
    <div ref={ref} className="chart heat">
      {W > 0 && (
        <svg width={W} height={H} role="img" aria-label={`${yr} 年訓練熱度`}>
          {['一', '三', '五'].map((d, i) => (
            <text key={d} x="0" y={T + i * 2 * (cell + gap) + cell - 1}>
              {d}
            </text>
          ))}
          {months.map((m) => (
            <text key={m.label} x={m.x} y="11">
              {m.label}
            </text>
          ))}
          {cells.map((c) => (
            <rect
              key={c.d}
              className={clsx(`h${heatLevel(c.n)}`, c.n > 0 && 'd', c.d === today && 'today')}
              x={c.x}
              y={c.y}
              width={cell}
              height={cell}
              rx="2"
              onPointerMove={(e) =>
                showTip(
                  [
                    `${slash(c.d)}（${dowOf(c.d)}）`,
                    c.n ? `**${c.n}** 組 · ${dayGroups(ds, c.d).join('、')}` : '休息',
                    ...(ds.videosByDate.has(c.d) ? ['有影片'] : []),
                  ],
                  e,
                )
              }
              onPointerLeave={hideTip}
              onClick={c.n ? () => onOpenDay(c.d) : undefined}
            />
          ))}
        </svg>
      )}
    </div>
  );
}
