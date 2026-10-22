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
  setBlocks,
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

/** 組數：每組一格（日曆頁樣式）——上方色帶寫重量（越深越重）、下方大字寫次數、左上小字是組號 */
export function Sets({ entry, ex }: { entry: Entry; ex: Exercise }) {
  const r = setBlocks(entry, ex);
  if (r.kind === 'text')
    return (
      <div className="sets">
        <span className="set text">{r.text}</span>
      </div>
    );
  if (r.kind === 'none') return <span className="na">—</span>;
  if (r.kind === 'practice') return <span className="na">動作練習</span>;
  return (
    <div className="setcards">
      {r.blocks.map((b) => {
        const w = b.zeroLabel ?? (b.weightKg == null ? null : fmtN(b.weightKg));
        const reps = b.reps == null ? '？' : Number.isInteger(b.reps) ? String(b.reps) : b.reps.toFixed(1);
        const unit = b.unit ?? '下';
        const tip = `第 ${b.no} 組 · ${w == null ? '' : b.zeroLabel ? `${w} · ` : `${w} kg × `}${reps} ${unit}`;
        return (
          <span key={b.no} className={clsx('setcard', `lv${b.level}`)} title={tip}>
            <span className="sc-w">
              {w == null ? '—' : w}
              {w != null && !b.zeroLabel && <small>kg</small>}
            </span>
            <span className="sc-r">
              <span className="sc-no">{b.no}</span>
              {reps}
              {b.unit && <small>{b.unit}</small>}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function DateCell({
  date,
  onOpen,
  children,
}: {
  date: string;
  onOpen?: () => void;
  children?: ReactNode;
}) {
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
      {children}
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
