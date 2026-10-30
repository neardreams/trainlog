// 訓練影片入口（v14）：影片一律是「深色畫面＋圓形播放鈕」，一眼看得出是影片、點了就播（openVideo，網站內的播放器）。
// 主色圓鈕＝這一天的影片；外框＋墨色圓鈕（alt）＝這個動作在其他天的影片；淡色占位＝沒有影片（同位置，滑過說明原因）。
// 播放器裡有章節清單，所以入口不再先跳選單，點了直接播
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useNavigate } from '@tanstack/react-router';
import {
  dayVideo,
  dowOf,
  entryVideo,
  exerciseVideos,
  fmtClock,
  md,
  otherExerciseVideo,
  prevDayVideo,
  rangeDates,
  segmentsByExercise,
  topSetSegment,
  type DateStr,
  type DayVideo,
  type Entry,
} from '@trainlog/core';
import { gColor } from '@/lib/chrome';
import { Icon } from '@/lib/icons';
import { openVideo, type VideoTarget } from '@/lib/player';
import { useDs } from '@/lib/useDs';

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** 圓形播放鈕：主色圓＋深色三角（外框款由 CSS 換成墨色圓）；方角設計裡唯一的圓形，刻意的 */
export const PlayCircle = ({ size = 16 }: { size?: number }) => (
  <svg className="pc" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <circle cx="12" cy="12" r="12" fill="var(--a)" />
    <path d="M9.6 7.2v9.6l7.6-4.8z" fill="var(--a-fg)" />
  </svg>
);

/** 點了開播放器（列本身可點時，點擊不要傳上去） */
const play = (t: VideoTarget) => (e: React.MouseEvent<HTMLElement>) => {
  e.stopPropagation();
  openVideo(t, e.currentTarget);
};

type VbOpts = { ic?: boolean; w?: boolean; alt?: boolean; xs?: boolean };
const vbCls = (o: VbOpts, extra?: string) =>
  clsx('vb', o.ic && 'ic', o.w && 'w', o.alt && 'alt', o.xs && 'xs', extra);

/** 深色影片按鈕 */
function Vb({
  target,
  title,
  children,
  ...o
}: VbOpts & { target: VideoTarget; title: string; children?: ReactNode }) {
  return (
    <button
      type="button"
      className={vbCls(o)}
      data-tip={title}
      aria-label={title}
      onClick={play(target)}
      onKeyDown={stop}
    >
      <PlayCircle size={o.xs ? 14 : 16} />
      {!o.ic && children != null && <span>{children}</span>}
    </button>
  );
}

/** 沒有影片：同位置、同大小的淡色占位，不能點，滑過顯示原因；label 時是虛線框＋文字 */
export function NoVideo({ title, label, ...o }: VbOpts & { title: string; label?: string }) {
  return (
    <span
      className={vbCls(o, clsx('none', label && 'lbl-none'))}
      data-tip={title}
      aria-label={title}
      role="note"
    >
      {label ?? '—'}
    </span>
  );
}

/* ───────────── 某筆紀錄（某天的某個動作） ───────────── */

/** 明細列標頭的「影片 N 段」：從這個動作的第一段開始播 */
export function EntryVideoBadge({ entry }: { entry: Entry }) {
  const ds = useDs();
  const ev = entryVideo(ds, entry);
  if (!ev) return null;
  const n = ev.segments.length;
  return (
    <button
      type="button"
      className="vbadge"
      data-tip={`播放這個動作的 ${n} 段`}
      onClick={play({ video: ev.video, exerciseId: entry.exerciseId, start: ev.segments[0]?.start ?? 0 })}
      onKeyDown={stop}
    >
      <PlayCircle />
      影片 {n} 段
    </button>
  );
}

/**
 * 明細列的影片縮圖：當天拍到這個動作＝深色縮圖（從這個動作的第一段開始播，底部主色條是它在整支影片裡的位置）；
 * 當天沒拍、其他天拍過＝「MM/DD 的影片」（白色圓鈕）；從來沒拍過才是虛線占位
 */
export function EntryVideoTile({ entry }: { entry: Entry }) {
  const ds = useDs();
  const ev = entryVideo(ds, entry);
  if (ev) {
    const { video, segments } = ev;
    const dur = segments.reduce((a, s) => a + s.end - s.start, 0);
    const first = segments[0]?.start ?? 0;
    return (
      <VideoTile
        top={`影片 · ${segments.length} 段`}
        bot={fmtClock(dur)}
        bar={segments.map((s) => [(s.start / video.durationSec) * 100, (s.end / video.durationSec) * 100])}
        title={`播放這個動作在當天影片的 ${segments.length} 段\n${fmtClock(first)} 開始，共 ${fmtClock(dur)}`}
        target={{ video, exerciseId: entry.exerciseId, start: first }}
      />
    );
  }
  const other = otherExerciseVideo(ds, entry.exerciseId, entry.date);
  if (other) {
    const d = md(other.video.date);
    return (
      <VideoTile
        alt
        top={`${d} 的影片`}
        bot={`${other.segments.length} 段`}
        title={`這天沒拍到這個動作\n播放 ${d} 的 ${other.segments.length} 段`}
        target={{
          video: other.video,
          exerciseId: entry.exerciseId,
          start: other.segments[0]?.start ?? 0,
          allDays: exerciseVideos(ds, entry.exerciseId).length > 1,
        }}
      />
    );
  }
  return (
    <span className="vtile none" data-tip="這個動作還沒有錄過影片" role="note">
      <Icon name="novideo" />
      <span>沒有影片</span>
    </span>
  );
}

/** 影片縮圖 */
export function VideoTile({
  top,
  bot,
  bar,
  title,
  target,
  alt,
  big,
}: {
  top: string;
  bot?: string;
  bar?: [number, number][];
  title: string;
  target: VideoTarget;
  alt?: boolean;
  big?: boolean;
}) {
  return (
    <button
      type="button"
      className={clsx('vtile', alt && 'alt', big && 'big')}
      data-tip={title}
      aria-label={title.replace('\n', '，')}
      onClick={play(target)}
      onKeyDown={stop}
    >
      <span className="vt-l">{top}</span>
      <PlayCircle size={big ? 40 : 26} />
      {bot && <span className="vt-r">{bot}</span>}
      {bar && (
        <span className="vt-bar">
          {bar.map(([a, b]) => (
            <i key={a} style={{ left: `${a.toFixed(1)}%`, width: `${Math.max(b - a, 0.8).toFixed(1)}%` }} />
          ))}
        </span>
      )}
    </button>
  );
}

/** 某筆紀錄的影片小圓鈕（表格裡）：從這個動作的第一段開始播 */
export function EntryVideoButton({ entry, xs }: { entry: Entry; xs?: boolean }) {
  const ds = useDs();
  const ev = entryVideo(ds, entry);
  if (!ev)
    return (
      <NoVideo
        ic
        xs={xs}
        title={
          dayVideo(ds, entry.date) ? `${md(entry.date)} 的影片沒有拍到這個動作` : `${md(entry.date)} 沒有錄影`
        }
      />
    );
  return (
    <Vb
      ic
      xs={xs}
      title={`播放 ${md(entry.date)} 的這個動作（${ev.segments.length} 段）`}
      target={{ video: ev.video, exerciseId: entry.exerciseId, start: ev.segments[0]?.start ?? 0 }}
    />
  );
}

/** 破紀錄那一組：直接從最重那一組開始播 */
export function TopSetButton({ entry }: { entry: Entry }) {
  const ds = useDs();
  const ev = entryVideo(ds, entry);
  const seg = ev && topSetSegment(entry, ev.segments);
  if (!ev || !seg) return <NoVideo ic title="這天沒有拍到這一次" />;
  return (
    <Vb
      ic
      title={`從最重那一組開始播（${seg.label}）`}
      target={{ video: ev.video, exerciseId: entry.exerciseId, start: seg.start }}
    />
  );
}

/* ───────────── 某個動作的所有影片 ───────────── */

/**
 * 動作的所有影片：從最近一次開始播，播放器旁列出所有拍了影片的日子。
 * w：表格欄裡的「N 天」；alt：明細列標頭的外框款「所有影片 N 天」（2 天以上才出現）；btn：展開列標題的按鈕
 */
export function ExerciseVideosButton({
  exerciseId,
  variant = 'w',
}: {
  exerciseId: string;
  variant?: 'w' | 'alt' | 'btn';
}) {
  const ds = useDs();
  const days = exerciseVideos(ds, exerciseId);
  const latest = days[0];
  if (variant === 'alt' && days.length < 2) return null;
  if (!latest)
    return variant === 'btn' ? (
      <NoVideo title="這個動作還沒有錄過影片" label="沒有錄過影片" />
    ) : (
      <NoVideo w title="這個動作還沒有錄過影片" />
    );
  const target: VideoTarget = {
    video: latest.video,
    exerciseId,
    start: latest.segments[0]?.start ?? 0,
    allDays: days.length > 1,
  };
  const title = `這個動作所有的影片（${days.length} 天），從最近一次（${md(latest.video.date)}）開始播`;
  if (variant === 'btn')
    return (
      <button type="button" className="btn sm vid" data-tip={title} onClick={play(target)} onKeyDown={stop}>
        <PlayCircle />
        所有影片<span className="mono">{days.length} 天</span>
      </button>
    );
  return (
    <Vb w={variant === 'w'} alt={variant === 'alt'} title={title} target={target}>
      {variant === 'alt' ? `所有影片 ${days.length} 天` : `${days.length} 天`}
    </Vb>
  );
}

/* ───────────── 某一天的影片 ───────────── */

/**
 * 當天影片（從頭播；播放器裡有各動作的章節）。
 * w：表格欄裡的「9:21」；icon：日期比較欄標題的小圓鈕；label：「當天影片 9:21」
 */
export function DayVideoButton({ date, variant = 'w' }: { date: DateStr; variant?: 'w' | 'icon' | 'label' }) {
  const ds = useDs();
  const v = dayVideo(ds, date);
  const day = `${md(date)}（週${dowOf(date)}）`;
  if (!v)
    return variant === 'label' ? (
      <NoVideo title={`${day}沒有錄影`} label="這天沒有錄影" />
    ) : (
      <NoVideo w={variant === 'w'} ic={variant === 'icon'} xs={variant === 'icon'} title={`${day}沒有錄影`} />
    );
  const title = `播放${day}的影片（${segmentsByExercise(v).length} 個動作 · ${fmtClock(v.durationSec)}）`;
  return (
    <Vb
      w={variant === 'w'}
      ic={variant === 'icon'}
      xs={variant === 'icon'}
      title={title}
      target={{ video: v, start: 0 }}
    >
      {variant === 'label' ? `當天影片 ${fmtClock(v.durationSec)}` : fmtClock(v.durationSec)}
    </Vb>
  );
}

/** 物件標頭的標籤：深色「有影片 · N 段」（點了從頭播）／「無影片」 */
export function DayVideoTag({ date }: { date: DateStr }) {
  const ds = useDs();
  const v = dayVideo(ds, date);
  if (!v) return <span className="tag">無影片</span>;
  return (
    <button type="button" className="tag vid" data-tip="播放當天影片" onClick={play({ video: v, start: 0 })}>
      <PlayCircle />
      有影片 · {v.segments.length} 段
    </button>
  );
}

/** 物件標頭右上角：深色「播放當天影片 9:21」；這天沒錄影時改成外框「前一支影片 MM/DD」（跳到那天） */
export function DayVideoAction({ date }: { date: DateStr }) {
  const ds = useDs();
  const navigate = useNavigate();
  const v = dayVideo(ds, date);
  if (v)
    return (
      <button
        type="button"
        className="btn vid"
        data-tip={`播放當天整支影片（${v.segments.length} 段）`}
        onClick={play({ video: v, start: 0 })}
      >
        <PlayCircle size={18} />
        <span className="vt">播放當天影片</span>
        <span className="mono">{fmtClock(v.durationSec)}</span>
      </button>
    );
  const prev = prevDayVideo(ds, date);
  if (!prev) return null;
  return (
    <button
      type="button"
      className="btn vid alt"
      data-tip="這天沒有錄影，跳到前一個有影片的訓練日"
      onClick={() => void navigate({ to: '/days/$date', params: { date: prev.date } })}
    >
      <PlayCircle size={18} />
      <span className="vt">前一支影片</span>
      <span className="mono">{md(prev.date)}</span>
    </button>
  );
}

/**
 * 訓練紀錄最上面的「當天影片」：大縮圖（從頭播）＋時間軸（依動作的部位色，點了跳過去）＋每個動作一顆章節鈕。
 * 沒錄影的日子縮成一條：播放前一支影片、看那天的紀錄、這些動作以前的影片。
 * 日期範圍時，下面多一排範圍內其他有影片的日子
 */
export function DayVideoPanel({ date, range = 0 }: { date: DateStr; range?: number }) {
  const ds = useDs();
  const navigate = useNavigate();
  const v = dayVideo(ds, date);
  const others: DayVideo[] =
    range > 0
      ? rangeDates(date, range)
          .filter((d) => d !== date)
          .map((d) => dayVideo(ds, d))
          .filter((x): x is DayVideo => x != null)
      : [];
  const otherDays =
    others.length > 0 ? (
      <div className="vp-rel">
        <span>期間其他影片</span>
        {others.map((o) => (
          <Vb
            key={o.date}
            alt
            title={`播放 ${md(o.date)}（週${dowOf(o.date)}）的影片`}
            target={{ video: o, start: 0 }}
          >
            {md(o.date)} · {fmtClock(o.durationSec)}
          </Vb>
        ))}
      </div>
    ) : null;

  if (!v) {
    const prev = prevDayVideo(ds, date);
    const rel = (ds.entriesByDate.get(date) ?? [])
      .map((e) => ({ e, o: otherExerciseVideo(ds, e.exerciseId, date) }))
      .filter((x) => x.o != null);
    return (
      <section className="pn vpanel off" aria-label="當天影片">
        <div className="vp-off">
          <span className="ico">
            <Icon name="novideo" />
          </span>
          <div>
            <b>這天沒有錄影</b>
            <small>
              {prev
                ? `最近一支：${md(prev.date)}（週${dowOf(prev.date)}）· ${fmtClock(prev.durationSec)} · ${prev.segments.length} 段`
                : '還沒有任何影片'}
            </small>
          </div>
        </div>
        {prev && (
          <>
            <button
              type="button"
              className="btn vid"
              data-tip={`播放 ${md(prev.date)} 的整支影片（${prev.segments.length} 段）`}
              onClick={play({ video: prev, start: 0 })}
            >
              <PlayCircle size={18} />
              播放 {md(prev.date)} 影片<span className="mono">{fmtClock(prev.durationSec)}</span>
            </button>
            <button
              type="button"
              className="lk"
              onClick={() => void navigate({ to: '/days/$date', params: { date: prev.date } })}
            >
              看那天的紀錄
              <Icon name="arrow" />
            </button>
          </>
        )}
        {rel.length > 0 && (
          <>
            <span className="vr" />
            <div className="vp-rel">
              <span>這些動作以前有影片</span>
              {rel.map(({ e, o }) => {
                const name = ds.exerciseById.get(e.exerciseId)?.name ?? e.exerciseId;
                return (
                  <Vb
                    key={e.exerciseId}
                    alt
                    title={`播放 ${md(o!.video.date)} 的${name}（${o!.segments.length} 段）`}
                    target={{ video: o!.video, exerciseId: e.exerciseId, start: o!.segments[0]?.start ?? 0 }}
                  >
                    {name} · {md(o!.video.date)}
                  </Vb>
                );
              })}
            </div>
          </>
        )}
        {otherDays}
      </section>
    );
  }

  const groups = segmentsByExercise(v);
  const groupOf = (id: string) => ds.exerciseById.get(id)?.group ?? '';
  const nameOf = (id: string) => ds.exerciseById.get(id)?.name ?? id;
  return (
    <section className="pn vpanel" aria-label="當天影片">
      <VideoTile
        big
        top={`當天影片 · ${v.segments.length} 段`}
        bot={fmtClock(v.durationSec)}
        title="從頭播放當天整支影片"
        target={{ video: v, start: 0 }}
      />
      <div className="vp-b">
        <div className="vp-h">
          <h2>當天影片</h2>
          <span className="m">
            {fmtClock(v.durationSec)} · {v.segments.length} 段 · {groups.length} 個動作 ·
            點動作或時間軸直接跳到那裡
          </span>
        </div>
        <div className="vp-tl">
          {v.segments.map((s) => (
            <i
              key={s.start}
              role="button"
              tabIndex={-1}
              style={{ flex: Math.max(s.end - s.start, 1), background: gColor(groupOf(s.exerciseId)) }}
              data-tip={`${fmtClock(s.start)} ${nameOf(s.exerciseId)}\n${s.label}`}
              onClick={play({ video: v, start: s.start })}
            />
          ))}
        </div>
        <div className="vp-ch">
          {groups.map((g) => {
            const first = g.segments[0]?.start ?? 0;
            const dur = g.segments.reduce((a, s) => a + s.end - s.start, 0);
            return (
              <button
                key={g.exerciseId}
                type="button"
                className="vch"
                style={{ ['--g' as string]: gColor(groupOf(g.exerciseId)) }}
                data-tip={`從 ${fmtClock(first)} 開始播${nameOf(g.exerciseId)}\n${g.segments.length} 段，共 ${fmtClock(dur)}`}
                onClick={play({ video: v, start: first })}
              >
                <PlayCircle />
                <b>{nameOf(g.exerciseId)}</b>
                <em>{g.segments.length} 段</em>
                <span className="mono">{fmtClock(first)}</span>
              </button>
            );
          })}
        </div>
        {otherDays}
      </div>
    </section>
  );
}
