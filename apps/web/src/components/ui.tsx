// 小型共用元件（對應 v9 的 badge、status、delta、組數標記、空狀態、分段控制）
import type { ReactNode } from 'react';
import clsx from 'clsx';
import {
  daysLabel,
  daysTone,
  dowOf,
  exhTone,
  fmtN,
  md,
  setRuns,
  type Entry,
  type Exercise,
} from '@trainlog/core';
import { gColor } from '@/lib/chrome';
import { Icon, type IconName } from '@/lib/icons';

export const GDot = ({ group, className }: { group: string; className?: string }) => (
  <i className={clsx('gdot', className)} style={{ ['--c' as string]: gColor(group) }} title={group} />
);

export function Status({ days }: { days: number }) {
  return (
    <span className={clsx('status', daysTone(days))}>
      <i />
      {daysLabel(days)}
    </span>
  );
}

export function ExhBadge({ value, count }: { value: string | undefined; count?: number }) {
  const v = value || '—';
  const tone = count != null && v === '—' ? 'tone-mute' : exhTone(v);
  return (
    <span className={clsx('badge', tone)}>
      <i />
      {count != null && v === '—' ? '未標示' : v}
      {count != null && <b>{count}</b>}
    </span>
  );
}

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
  const sign = dir === 'up' ? '+' : dir === 'down' ? '−' : '±';
  return (
    <span className={clsx('delta', dir)}>
      {sign}
      {fmtN(value)}
      {pct ? '%' : unit}
    </span>
  );
}
/** 由兩個數值算增減 */
export const deltaDir = (d: number): 'up' | 'down' | 'flat' => (d > 0 ? 'up' : d < 0 ? 'down' : 'flat');

export function Sets({ entry, ex }: { entry: Entry; ex: Exercise }) {
  const runs = setRuns(entry, ex);
  const first = runs[0];
  if (first?.kind === 'text')
    return (
      <div className="sets">
        <span className="set text">{first.text}</span>
      </div>
    );
  if (first?.kind === 'none') return <span className="na">—</span>;
  if (first?.kind === 'practice') return <span className="na">動作練習</span>;
  return (
    <div className="sets">
      {runs.map((r, i) =>
        r.kind !== 'run' ? null : (
          <span className="set" key={i}>
            {r.weightKg == null ? null : r.zeroLabel ? (
              `${r.zeroLabel} · `
            ) : (
              <>
                {fmtN(r.weightKg)}
                <small>kg</small> ×{' '}
              </>
            )}
            {r.reps == null ? '？' : Number.isInteger(r.reps) ? r.reps : r.reps.toFixed(1)}
            {r.unit && <small>{r.unit}</small>}
            {r.count > 1 && <em>×{r.count}</em>}
          </span>
        ),
      )}
    </div>
  );
}

export function DateCell({ date, onOpen }: { date: string; onOpen?: () => void }) {
  return (
    <td className="c-date">
      <a
        className="link"
        onClick={(e) => {
          e.stopPropagation();
          onOpen?.();
        }}
      >
        {md(date)}
      </a>
      <span className="dow">週{dowOf(date)}</span>
    </td>
  );
}

export const Count = ({ n, hidden }: { n: number | string; hidden?: boolean }) =>
  hidden ? null : <span className="count">{n}</span>;

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

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export const Num = ({ v, unit, dp }: { v: number | null | undefined; unit?: string; dp?: number }) =>
  v == null || v === 0 ? (
    <span className="na">—</span>
  ) : (
    <>
      {fmtN(v, dp)}
      {unit && <small>{unit}</small>}
    </>
  );
