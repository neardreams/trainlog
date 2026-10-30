// 圖表：趨勢線、迷你趨勢（SVG）；指標磚小長條、每週訓練量、全年熱度（v14，HTML 格子，提示框用 data-tip）
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
import { useDs } from '@/lib/useDs';

/** 動作庫展開列的趨勢圖：每次的最高重量（有氧為分鐘），破紀錄的點用綠色 */
export function TrendChart({
  points,
  unit,
}: {
  points: { date: DateStr; value: number; pr: boolean }[];
  unit: string;
}) {
  const vals = points.map((p) => p.value);
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const span = mx - mn;
  const step = span <= 10 ? 2 : span <= 30 ? 5 : 10;
  const lo = Math.max(0, Math.floor((mn - step / 2) / step) * step);
  const hi = Math.ceil((mx + step / 2) / step) * step;
  const rg = hi - lo || 1;
  const y = (v: number) => (1 - (v - lo) / rg) * 100;
  const pts = points.map((p, i) => ({
    ...p,
    x: points.length > 1 ? (i / (points.length - 1)) * 100 : 50,
    y: y(p.value),
  }));
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join('');
  return (
    <div className="trend">
      {[hi, (hi + lo) / 2, lo].map((v) => (
        <div key={v} className="gl" style={{ top: `${y(v)}%` }}>
          <span>{fmtN(v)}</span>
        </div>
      ))}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path className="ar" d={`${d}L100 100L0 100Z`} />
        <path className="tl" d={d} />
      </svg>
      {pts.map((p, i) => (
        <span
          key={i}
          className={clsx('pt', p.pr && 'pr')}
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
          data-tip={`${slash(p.date)}（週${dowOf(p.date)}）\n${fmtN(p.value)} ${unit}${p.pr ? ' · 破紀錄' : ''}`}
        />
      ))}
    </div>
  );
}

/** 動作庫每一列的迷你趨勢線：部位色折線＋最後一點方塊 */
export function MiniTrend({ values, w = 88, h = 24 }: { values: number[]; w?: number; h?: number }) {
  if (values.length < 2) return <span className="na">—</span>;
  const mn = Math.min(...values);
  const rg = Math.max(...values) - mn || 1;
  const pts = values.map(
    (v, i) => [(i / (values.length - 1)) * (w - 6) + 1, h - 4 - ((v - mn) / rg) * (h - 8)] as const,
  );
  const [lx, ly] = pts[pts.length - 1]!;
  return (
    <svg className="spk" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')} />
      <rect x={lx - 2.5} y={ly - 2.5} width="5" height="5" />
    </svg>
  );
}

/** 指標磚右邊的 12 週小長條：最後一根是本週（斜紋＝進行中）；連續週數是 12 格有練／沒練 */
export function KpiSpark({ values, unit, streak }: { values: number[]; unit: string; streak?: boolean }) {
  const n = values.length;
  if (streak)
    return (
      <div className="spark streak" aria-hidden>
        {values.map((v, i) => (
          <i
            key={i}
            className={clsx(v > 0 && 'on', i === n - 1 && 'cur')}
            style={{ ['--i' as string]: i }}
            data-tip={`${i === n - 1 ? '本週' : `${n - 1 - i} 週前`}：${v > 0 ? '有練' : '沒有練'}`}
          />
        ))}
      </div>
    );
  const max = Math.max(1, ...values);
  return (
    <div className="spark" aria-hidden>
      {values.map((v, i) => (
        <i
          key={i}
          className={clsx(i === n - 1 ? 'cur' : i === n - 2 && 'last')}
          style={{ height: `${Math.max(7, (v / max) * 100)}%`, ['--i' as string]: i }}
          data-tip={`${i === n - 1 ? '本週（進行中）' : `${n - 1 - i} 週前`}：${fmtN(v)} ${unit}`}
        />
      ))}
    </div>
  );
}

export type WeekMetric = 'vol' | 'days' | 'sets';
const METRIC_UNIT: Record<WeekMetric, string> = { vol: 'kg', days: '天', sets: '組' };

/** 每週訓練量（26 週）：本週斜紋＋呼吸點表示進行中、平均線（不含本週）、點長條開啟該週最後一個訓練日 */
export function WeekChart({
  weeks,
  metric,
  onOpenWeek,
}: {
  weeks: WeekStat[];
  metric: WeekMetric;
  onOpenWeek: (w: WeekStat) => void;
}) {
  const N = weeks.length;
  const vals = weeks.map((w) => w[metric]);
  const avg = avgExcludingCurrent(vals);
  const { max, ticks } = niceTicks(Math.max(1, ...vals));
  const fa = (v: number) => (metric === 'vol' ? (v >= 1000 ? `${fmtN(v / 1000)}k` : fmtN(v, 0)) : fmtN(v));
  const cur = weeks[N - 1];
  return (
    <>
      <div className="wk-read">
        <b>
          {fmtN(cur?.[metric] ?? 0, 0)}
          <span className="u">{METRIC_UNIT[metric]}</span>
        </b>
        <span>
          <i className="live" />
          本週（進行中）· 已完成週平均 {fa(avg)}
        </span>
      </div>
      <div className="chart" role="img" aria-label={`每週訓練量，近 ${N} 週，平均 ${fa(avg)}`}>
        {ticks.map((v, i) => (
          <div key={v} className={clsx('gl', i === 0 && 'base')} style={{ bottom: `${(v / max) * 100}%` }}>
            <span>{fa(v)}</span>
          </div>
        ))}
        <div className="avg" style={{ bottom: `${(avg / max) * 100}%` }}>
          <span>平均 {fa(avg)}</span>
        </div>
        <div className="bars">
          {weeks.map((w, i) => {
            const v = w[metric];
            return (
              <div
                key={w.w}
                className={clsx('wb', i === N - 1 && 'cur', !v && 'zero')}
                data-tip={`${md(w.w)} – ${md(addDays(w.w, 6))}${i === N - 1 ? '（進行中）' : ''}\n容量 ${fmtN(w.vol, 0)} kg · ${w.days} 天 · ${w.sets} 組`}
                onClick={() => onOpenWeek(w)}
              >
                <i style={{ height: `${v ? (v / max) * 100 : 0}%`, ['--i' as string]: i }} />
              </div>
            );
          })}
        </div>
      </div>
      <div className="xax" aria-hidden>
        {weeks.map((w, i) =>
          i % 4 === 1 || i === N - 1 ? (
            <span
              key={w.w}
              className={clsx(i === N - 1 && 'now')}
              style={{ left: `${((i + 0.5) / N) * 100}%` }}
            >
              {i === N - 1 ? '本週' : md(w.w)}
            </span>
          ) : null,
        )}
      </div>
    </>
  );
}

/** 全年熱度（每天的組數）：有影片的日子格子中間一個播放三角；點有訓練的格子開啟當天 */
export function Heatmap({ today, onOpenDay }: { today: DateStr; onOpenDay: (d: DateStr) => void }) {
  const ds = useDs();
  const yr = today.slice(0, 4);
  const start = mondayOf(`${yr}-01-01`);
  const end = addDays(mondayOf(`${yr}-12-31`), 6);
  const weeks = Math.round(daysBetween(start, end) / 7) + 1;
  const cols = { gridTemplateColumns: `repeat(${weeks},minmax(0,1fr))` };
  const cells = [...Array(weeks * 7)].map((_, i) => {
    const d = addDays(start, i);
    if (!d.startsWith(`${yr}-`)) return <div key={d} className="hc pad" />;
    const n = ds.entriesByDate.has(d) ? daySets(ds, d) : 0;
    const v = n > 0 && ds.videosByDate.has(d);
    const fut = d > today;
    const tip = fut
      ? undefined
      : `${md(d)} 週${dowOf(d)}\n${n ? `${n} 組${v ? ' · 有影片' : ''}\n${dayGroups(ds, d).join('、')}` : '沒有訓練'}`;
    return (
      <div
        key={d}
        className={clsx('hc', n > 0 && `l${heatLevel(n)}`, v && 'v', fut && 'fut', d === today && 'today')}
        data-tip={tip}
        onClick={n ? () => onOpenDay(d) : undefined}
      />
    );
  });
  const months = [...Array(12)].map((_, m) => {
    const col = Math.floor(daysBetween(start, `${yr}-${String(m + 1).padStart(2, '0')}-01`) / 7) + 1;
    return (
      <span key={m} style={{ gridColumn: `${col} / span 4` }}>
        {String(m + 1).padStart(2, '0')}
      </span>
    );
  });
  return (
    <div className="hm-wrap">
      <div className="hm" role="img" aria-label={`${yr} 年每天的訓練組數`}>
        <span />
        <div className="hm-mo" style={cols}>
          {months}
        </div>
        <div className="hm-dw" aria-hidden>
          {['一', '', '三', '', '五', '', '日'].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="hm-g" style={cols}>
          {cells}
        </div>
      </div>
    </div>
  );
}
