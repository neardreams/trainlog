// 小型共用元件（v14）：部位字塊、距今、力竭徽章、增減標籤、組數格、空狀態、分段控制
import type { CSSProperties, ReactNode } from 'react';
import clsx from 'clsx';
import {
  daysLabel,
  daysTone,
  entryPerSide,
  entryPr,
  entryVideo,
  exhTone,
  fmtClock,
  fmtN,
  segmentsBySet,
  setBlocks,
  warmupBlocks,
  topSetIndex,
  weightUnit,
  type Entry,
  type Exercise,
  type SetBlock,
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

/** 一格的文字：重量、次數，以及重量要不要標單位（0 或沒有重量時不標） */
function chipText(b: SetBlock) {
  return {
    w: b.zeroLabel ?? (b.weightKg == null ? '—' : fmtN(b.weightKg)),
    reps: b.reps == null ? '？' : Number.isInteger(b.reps) ? String(b.reps) : b.reps.toFixed(1),
    kg: b.weightKg != null && b.weightKg > 0,
  };
}

/**
 * 字串在組數字型（窄體斜體、等寬數字）裡的寬度，單位 ch。ch 是照一般的「0」算的，等寬數字比它寬，
 * 實測（2026-11-27）：數字 1.1ch、小數點 0.49ch、破折號 1.31ch、中文／全形問號 2.28ch；最後多留 0.05ch 避免捨入撐寬
 */
const chWidth = (s: string) =>
  [...s].reduce((n, c) => n + (c >= '0' && c <= '9' ? 1.1 : c === '.' ? 0.5 : c === '—' ? 1.35 : 2.3), 0.05);

/**
 * 組數格等寬：同一張卡（熱身、當天、前兩次）或同一個歷史面板裡，重量和次數各留最長那筆的寬度，
 * 重量靠右、次數靠左，格子就一樣寬、數字上下對齊。回傳要放在外層容器的 CSS 變數
 */
export function setSlotVars(items: readonly { entry: Entry; ex: Exercise }[]): CSSProperties {
  let w = 0;
  let r = 0;
  let kg = false;
  for (const { entry, ex } of items) {
    const sb = setBlocks(entry, ex);
    for (const b of [...warmupBlocks(entry, ex), ...(sb.kind === 'blocks' ? sb.blocks : [])]) {
      const t = chipText(b);
      w = Math.max(w, chWidth(t.w));
      r = Math.max(r, chWidth(t.reps));
      kg ||= t.kg;
    }
  }
  const ch = (n: number) => `${Math.round(n * 100) / 100}ch`;
  return { '--sw': ch(w), '--sr': ch(r), '--sph': kg ? 'inline' : 'none' } as CSSProperties;
}

/**
 * 格子內容：左上角淡色組號＋「重量 單位 × 次數 單位」。
 * 重量 0／沒有重量的格子放一個看不見的單位佔位，和同一張卡裡有單位的格子一樣寬
 */
function ChipBody({ b, kg }: { b: SetBlock; kg: string }) {
  const t = chipText(b);
  return (
    <>
      <span className="n" aria-hidden="true">
        {b.no}
      </span>
      <span className="v">
        <span className="w">{t.w}</span>
        {t.kg ? (
          <small>{kg}</small>
        ) : (
          <small className="ph" aria-hidden="true">
            {kg}
          </small>
        )}
        <span className="x">×</span>
        <span className="r">{t.reps}</span>
        {b.unit && <small>{b.unit}</small>}
      </span>
    </>
  );
}

/**
 * 組數格（v14）：每組一格「重量 × 次數」，一行高；熱身組、正式組、前兩次（SetsBrief）都是同樣大小的格子，
 * 左上角有淡色的組號。外層有 setSlotVars 時同一張卡的格子等寬。最重的組（重量不同時）墨色實心；
 * 破紀錄那一組綠色；影片拍到的組右上角有播放記號，點了從那一組開始播。mini 是表格裡的小格（不顯示組號）。
 * 有熱身組時，熱身組另起一列放在正式組上面（小尺寸不顯示熱身組）
 */
export function Sets({ entry, ex, mini }: { entry: Entry; ex: Exercise; mini?: boolean }) {
  const main = <WorkSets entry={entry} ex={ex} mini={mini} />;
  const wb = mini ? [] : warmupBlocks(entry, ex);
  if (!wb.length) return main;
  const kg = weightUnit(entryPerSide(entry, ex));
  return (
    <div className="sets-w">
      <div className="sets wu" aria-label="熱身組（不算進組數與容量）">
        <span className="wu-l">熱身</span>
        {wb.map((b) => {
          const { w, reps } = chipText(b);
          return (
            <span
              key={b.no}
              className="set wu"
              title={`熱身第 ${b.no} 組 · ${b.zeroLabel || b.weightKg == null ? `${w} · ` : `${w} kg × `}${reps} ${b.unit ?? '下'}（不算進組數與容量）`}
            >
              <ChipBody b={b} kg={kg} />
            </span>
          );
        })}
      </div>
      {main}
    </div>
  );
}

/**
 * 前兩次的組數（訓練紀錄卡最下方）：和當天的組數同樣的一行格子、一組一格不合併，
 * 第 N 組和當天的第 N 組上下對齊；顏色較淡、不標最重。文字紀錄（有氧等）只顯示一行
 */
export function SetsBrief({ entry, ex }: { entry: Entry; ex: Exercise }) {
  const r = setBlocks(entry, ex);
  if (r.kind === 'text')
    return (
      <span className="sets-brief-t" title={r.text}>
        {r.text}
      </span>
    );
  if (r.kind !== 'blocks') return <span className="na">{r.kind === 'practice' ? '動作練習' : '—'}</span>;
  const ps = entryPerSide(entry, ex);
  const kg = weightUnit(ps);
  return (
    <div className="sets brief">
      {r.blocks.map((b) => {
        const { w, reps } = chipText(b);
        const tip = `第 ${b.no} 組 · ${b.zeroLabel ? `${w} · ` : b.weightKg == null ? '' : `${ps ? '每邊 ' : ''}${w} kg × `}${reps} ${b.unit ?? '下'}`;
        return (
          <span key={b.no} className="set" title={tip}>
            <ChipBody b={b} kg={kg} />
          </span>
        );
      })}
      {r.note && <span className="sets-brief-t">{r.note}</span>}
    </div>
  );
}

function WorkSets({ entry, ex, mini }: { entry: Entry; ex: Exercise; mini?: boolean | undefined }) {
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
  // 每邊的重量（一手／一腳／一側）標「kg/邊」，提示寫「每邊」，避免和兩邊合計弄混
  const ps = entryPerSide(entry, ex);
  const kg = weightUnit(ps);
  const chips = (
    <div className={clsx('sets', mini && 'mini')}>
      {r.blocks.map((b, i) => {
        const { w, reps } = chipText(b);
        const pr = i === prIdx;
        const cls = clsx('set', pr ? 'pr' : b.level === 3 && 'heavy');
        const body = <ChipBody b={b} kg={kg} />;
        const tip = `第 ${b.no} 組 · ${b.zeroLabel ? `${w} · ` : b.weightKg == null ? '' : `${ps ? '每邊 ' : ''}${w} kg × `}${reps} ${b.unit ?? '下'}${pr ? ' · 破紀錄' : ''}`;
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
  if (!r.note) return chips;
  // 包一層：不論外層是不是 flex，補充說明都在格子下面
  return (
    <div className="sets-w">
      {chips}
      <div className={clsx('sets-note', mini && 'mini')}>{r.note}</div>
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
