// 小型共用元件（v14）：部位字塊、距今、力竭徽章、增減標籤、組數格、空狀態、分段控制
import type { ReactNode } from 'react';
import clsx from 'clsx';
import {
  daysLabel,
  daysTone,
  entryPr,
  entryVideo,
  exhTone,
  fmtClock,
  fmtN,
  segmentsBySet,
  setBlocks,
  topSetIndex,
  type Entry,
  type Exercise,
  type Tone,
} from '@trainlog/core';
import { gColor, PART_CHAR, PART_DARK } from '@/lib/chrome';
import { Icon, type IconName } from '@/lib/icons';
import { openVideo } from '@/lib/player';
import { useDs } from '@/lib/useDs';

/** core 的狀態色 → v14 的類名（ok／warn／bad／n） */
const TONE: Record<Tone, string> = {
  'tone-ok': 'ok',
  'tone-warn': 'warn',
  'tone-bad': 'bad',
  'tone-mute': 'n',
  'tone-none': 'n',
};
export const toneCls = (t: Tone) => TONE[t];

export const GDot = ({ group, className }: { group: string; className?: string }) => (
  <i className={clsx('gdot', className)} style={{ ['--c' as string]: gColor(group) }} title={group} />
);

/** 部位字塊（v14）：部位色方塊＋代表字 */
export const PartTile = ({ group, small }: { group: string; small?: boolean }) => (
  <i
    className={clsx('ptile', small && 's', PART_DARK.has(group) && 'dk')}
    style={{ ['--g' as string]: gColor(group) }}
    data-tip={group}
    aria-hidden
  >
    {PART_CHAR[group] ?? group.slice(0, 1)}
  </i>
);

/** 一排部位字塊（最多 5 個） */
export const PartTiles = ({ groups }: { groups: string[] }) => (
  <span className="ptiles">
    {groups.slice(0, 5).map((g) => (
      <PartTile key={g} group={g} small />
    ))}
  </span>
);

export function Status({ days }: { days: number }) {
  return (
    <span className="ago">
      <i className={clsx('sq', toneCls(daysTone(days)))} />
      {daysLabel(days)}
    </span>
  );
}

export function ExhBadge({ value, count }: { value: string | undefined; count?: number }) {
  const v = value || '—';
  if (count == null && v === '—') return <span className="na">—</span>;
  return (
    <span className={clsx('bdg', toneCls(exhTone(v)))}>
      {count != null && v === '—' ? '未標示' : v}
      {count != null && <span className="mono">{count}</span>}
    </span>
  );
}

/** 增減：斜切實心標籤，三角形表示方向（數字不帶正負號） */
export function Delta({
  dir,
  value,
  unit = '',
  pct,
}: {
  dir: 'up' | 'down' | 'flat';
  value: number;
  unit?: string;
  pct?: boolean;
}) {
  const sign = dir === 'up' ? '增加' : dir === 'down' ? '減少' : '';
  const txt = `${fmtN(Math.abs(value))}${pct ? '%' : unit}`;
  return (
    <span
      className={clsx('dt', dir === 'down' ? 'dn' : dir)}
      aria-label={dir === 'flat' ? '持平' : `${sign} ${txt}`}
    >
      {dir === 'flat' ? '持平' : txt}
    </span>
  );
}

/**
 * 組數格（v14）：每組一格「重量 × 次數」。最重的組（重量不同時）墨色實心；破紀錄那一組綠色；
 * 影片拍到的組右上角有播放記號，點了從那一組開始播。mini 是表格裡的小格（不顯示組號）
 */
export function Sets({ entry, ex, mini }: { entry: Entry; ex: Exercise; mini?: boolean }) {
  const ds = useDs();
  const r = setBlocks(entry, ex);
  if (r.kind === 'text') return <div className="sets-txt">{r.text}</div>;
  if (r.kind === 'none')
    return mini ? (
      <span className="na">—</span>
    ) : (
      <div className="sets-none">
        <Icon name="info" />
        沒有記錄組數
      </div>
    );
  if (r.kind === 'practice')
    return mini ? <span className="na">動作練習</span> : <div className="sets-none">動作練習</div>;
  // 小尺寸（表格內）不標影片：那一列有自己的影片欄
  const ev = mini ? undefined : entryVideo(ds, entry);
  const bySet = ev ? segmentsBySet(ev.segments) : undefined;
  const prIdx = entryPr(ds, entry) ? topSetIndex(entry.sets) : -1;
  return (
    <div className={clsx('sets', mini && 'mini')}>
      {r.blocks.map((b, i) => {
        const w = b.zeroLabel ?? (b.weightKg == null ? '—' : fmtN(b.weightKg));
        const reps = b.reps == null ? '？' : Number.isInteger(b.reps) ? String(b.reps) : b.reps.toFixed(1);
        const pr = i === prIdx;
        const cls = clsx('set', pr ? 'pr' : b.level === 3 && 'heavy');
        const no = String(b.no).padStart(2, '0');
        const body = (
          <>
            <span className="n">
              {no}
              {pr && ' · 破紀錄'}
            </span>
            <span className="v">
              {w}
              {b.weightKg != null && b.weightKg > 0 && <small>kg</small>}
              <span className="x">×</span>
              {reps}
              {b.unit && <small>{b.unit}</small>}
            </span>
          </>
        );
        const tip = `第 ${b.no} 組 · ${b.zeroLabel ? `${w} · ` : b.weightKg == null ? '' : `${w} kg × `}${reps} ${b.unit ?? '下'}${pr ? ' · 破紀錄' : ''}`;
        const segs = bySet?.get(b.no);
        if (!ev || !segs?.length)
          return (
            <span key={b.no} className={cls} title={tip}>
              {body}
            </span>
          );
        const first = segs[0];
        return (
          <button
            key={b.no}
            type="button"
            className={clsx(cls, 'hv')}
            title={`${tip}\n從第 ${b.no} 組開始播（${segs.map((x) => `${x.side ? `${x.side} ` : ''}${fmtClock(x.start)}`).join('、')}）`}
            aria-label={`播放第 ${b.no} 組的影片`}
            onClick={(e) => {
              e.stopPropagation();
              openVideo(
                { video: ev.video, exerciseId: entry.exerciseId, start: first?.start ?? 0 },
                e.currentTarget,
              );
            }}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

export function Empty({
  title,
  children,
  icon = 'search',
  action,
}: {
  title: string;
  children?: ReactNode;
  icon?: IconName;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-ic">
        <Icon name={icon} />
      </div>
      <b>{title}</b>
      {children}
      {action && (
        <>
          <br />
          {action}
        </>
      )}
    </div>
  );
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: readonly (readonly [T, ReactNode])[];
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={clsx('seg', className)} role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button
          key={String(v)}
          type="button"
          className={clsx(v === value && 'active')}
          aria-pressed={v === value}
          onClick={() => onChange(v)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** 面板（v14）：灰色標題列（主色斜切小標＋標題＋說明＋右側操作）、內容、底部統計 */
export function Panel({
  className,
  title,
  meta,
  right,
  foot,
  children,
}: {
  className?: string;
  title: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
  foot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={clsx('pn', className)}>
      <header className="pn-h">
        <h2>{title}</h2>
        {meta && <span className="m">{meta}</span>}
        <span className="sp" />
        {right}
      </header>
      {children}
      {foot && <footer className="pn-f">{foot}</footer>}
    </section>
  );
}
