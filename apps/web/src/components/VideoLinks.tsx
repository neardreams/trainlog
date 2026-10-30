// 訓練影片入口：每筆紀錄的「影片」按鈕（這個動作在當天影片中的各段）、當天影片的動作清單、
// 破紀錄那一組、動作的所有影片、訓練紀錄詳細資料欄的影片區塊。點了都在網站內的播放器播放（openVideo）。
// 按鈕一律顯示：沒有影片時換成「沒有影片」的樣式（NoVideo），版面不會因為有沒有影片而跳動
import { createContext, useContext, useRef, type ReactNode } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import {
  dayVideo,
  dowOf,
  entryVideo,
  exerciseVideos,
  fmtClock,
  md,
  rangeDates,
  segmentsByExercise,
  topSetSegment,
  type DateStr,
  type Entry,
} from '@trainlog/core';
import { Count, GDot } from './ui';
import { Icon } from '@/lib/icons';
import { PEEK_ATTR } from '@/lib/peek';
import { openVideo, type VideoTarget } from '@/lib/player';
import { useDs } from '@/lib/useDs';

/** 選單裡的項目用來開啟播放器（由 VideoMenu 提供：記下要把焦點還給哪個按鈕） */
const OpenCtx = createContext<(t: VideoTarget) => void>(openVideo);

/** 影片選單：列在按鈕下方；列（或標頭）本身可以點，按鈕和選單的點擊、按鍵都不要傳上去 */
function VideoMenu({
  trigger,
  head,
  children,
}: {
  trigger: (ref: React.RefObject<HTMLButtonElement | null>) => ReactNode;
  head: ReactNode;
  children: ReactNode;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  // 從選單打開播放器時，選單關閉後不要把焦點拉回按鈕（焦點要留在播放器裡，播放器關閉後再還給按鈕）
  const opening = useRef(false);
  const open = (t: VideoTarget) => {
    opening.current = true;
    openVideo(t, btnRef.current);
  };
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>{trigger(btnRef)}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="dd-content video-menu"
          align="start"
          sideOffset={6}
          {...{ [PEEK_ATTR]: '' }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onCloseAutoFocus={(e) => {
            if (!opening.current) return;
            opening.current = false;
            e.preventDefault();
          }}
        >
          <div className="menu-head">{head}</div>
          <OpenCtx.Provider value={open}>{children}</OpenCtx.Provider>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * 沒有影片時的按鈕：和有影片的按鈕同一個位置、同樣大小，虛線框＋淡色＋「沒有影片」圖示；
 * 不能點也不能用 Tab 停留（點了不會觸發列本身），滑過去顯示原因
 */
function NoVideo({
  className,
  title,
  children,
}: {
  className?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={clsx('btn video-btn is-empty', className)}
      aria-disabled="true"
      tabIndex={-1}
      title={title}
      aria-label={title}
      onClick={stop}
      onKeyDown={stop}
    >
      <Icon name="novideo" />
      {children}
    </button>
  );
}

/** 選單中的一項：在網站內的播放器播放 */
function PlayItem({ target, children }: { target: VideoTarget; children: ReactNode }) {
  const open = useContext(OpenCtx);
  return (
    <DropdownMenu.Item asChild onSelect={() => open(target)}>
      <button type="button" className="menu-item">
        {children}
      </button>
    </DropdownMenu.Item>
  );
}

/** 每筆紀錄的「影片」：列出這個動作在當天影片中的各段；compact 只顯示圖示與段數（放在欄寬自動的表格日期欄時，不會把欄位撐寬） */
export function VideoButton({ entry, compact }: { entry: Entry; compact?: boolean }) {
  const ds = useDs();
  const ev = entryVideo(ds, entry);
  const name = ds.exerciseById.get(entry.exerciseId)?.name ?? '';
  if (!ev)
    return (
      <NoVideo
        className={clsx('hist-btn', compact && 'compact')}
        title={
          dayVideo(ds, entry.date)
            ? `${md(entry.date)} 的影片沒有拍到「${name}」`
            : `${md(entry.date)} 沒有拍影片`
        }
      >
        {!compact && '無影片'}
      </NoVideo>
    );
  const { video, segments } = ev;
  const nDays = exerciseVideos(ds, entry.exerciseId).length;
  return (
    <VideoMenu
      trigger={(ref) => (
        <button
          ref={ref}
          className={clsx('btn btn-soft hist-btn video-btn', compact && 'compact')}
          title={`觀看「${name}」的影片`}
          aria-label={`觀看「${name}」的影片（${segments.length} 段）`}
          onClick={stop}
          onKeyDown={stop}
        >
          <Icon name="play" />
          {!compact && '影片'}
          <Count n={segments.length} />
        </button>
      )}
      head={
        <>
          {md(entry.date)} · {name}
        </>
      }
    >
      {segments.map((s) => (
        <PlayItem key={s.start} target={{ video, exerciseId: entry.exerciseId, start: s.start }}>
          <Icon name="play" />
          <span className="vm-label">{s.label}</span>
          <em>{fmtClock(s.start)}</em>
        </PlayItem>
      ))}
      <div className="menu-sep" />
      {nDays > 1 && (
        <PlayItem
          target={{ video, exerciseId: entry.exerciseId, start: segments[0]?.start ?? 0, allDays: true }}
        >
          <Icon name="calendar" />
          <span className="vm-label">這個動作的所有影片</span>
          <em>{nDays} 天</em>
        </PlayItem>
      )}
      <PlayItem target={{ video, start: 0 }}>
        <Icon name="play" />
        <span className="vm-label">當天整支影片</span>
        <em>{fmtClock(video.durationSec)}</em>
      </PlayItem>
    </VideoMenu>
  );
}

/**
 * 當天影片：選單列出當天影片裡的動作（依影片中的順序），點了從那個動作開始播，也可以從頭播整支。
 * head：訓練紀錄頁標題旁的大按鈕；compact：只顯示圖示與影片長度（列表、標頭裡）
 */
export function DayVideoButton({ date, variant }: { date: DateStr; variant?: 'head' | 'compact' }) {
  const ds = useDs();
  const v = dayVideo(ds, date);
  if (!v) {
    const title = `${md(date)}（${dowOf(date)}）沒有拍影片`;
    return variant === 'head' ? (
      <NoVideo title={title}>沒有影片</NoVideo>
    ) : (
      <NoVideo className={clsx('hist-btn day-video-btn', variant === 'compact' && 'compact')} title={title}>
        {variant !== 'compact' && '無影片'}
      </NoVideo>
    );
  }
  const groups = segmentsByExercise(v);
  const label = `${md(date)}（${dowOf(date)}）的影片（${groups.length} 個動作 · ${fmtClock(v.durationSec)}）`;
  return (
    <VideoMenu
      trigger={(ref) =>
        variant === 'head' ? (
          <button
            ref={ref}
            className="btn"
            title={v.title}
            aria-label={label}
            onClick={stop}
            onKeyDown={stop}
          >
            <Icon name="play" />
            當天影片
            <span className="na">{fmtClock(v.durationSec)}</span>
            <Icon name="down" />
          </button>
        ) : (
          <button
            ref={ref}
            className={clsx(
              'btn btn-soft hist-btn video-btn day-video-btn',
              variant === 'compact' && 'compact',
            )}
            title={label}
            aria-label={label}
            onClick={stop}
            onKeyDown={stop}
          >
            <Icon name="play" />
            {variant !== 'compact' && '影片'}
            <span className="vb-dur">{fmtClock(v.durationSec)}</span>
          </button>
        )
      }
      head={
        <>
          {md(date)}（{dowOf(date)}）· 當天影片的動作
        </>
      }
    >
      {groups.map((g) => {
        const ex = ds.exerciseById.get(g.exerciseId);
        const first = g.segments[0]?.start ?? 0;
        return (
          <PlayItem key={g.exerciseId} target={{ video: v, start: first }}>
            <GDot group={ex?.group ?? ''} />
            <span className="vm-label">
              {ex?.name ?? g.exerciseId}
              <span className="vm-sub">{g.segments.length} 段</span>
            </span>
            <em>{fmtClock(first)}</em>
          </PlayItem>
        );
      })}
      <div className="menu-sep" />
      <PlayItem target={{ video: v, start: 0 }}>
        <Icon name="play" />
        <span className="vm-label">從頭播放整支影片</span>
        <em>{fmtClock(v.durationSec)}</em>
      </PlayItem>
    </VideoMenu>
  );
}

/** 破紀錄那一組：直接從最重那一組開始播（列本身點了會換頁，按鈕的點擊不要傳上去） */
export function TopSetButton({ entry }: { entry: Entry }) {
  const ds = useDs();
  const ev = entryVideo(ds, entry);
  const seg = ev && topSetSegment(entry, ev.segments);
  const name = ds.exerciseById.get(entry.exerciseId)?.name ?? '';
  if (!ev || !seg)
    return <NoVideo className="icon-video-btn" title={`沒有拍到「${name}」這次破紀錄的影片`} />;
  return (
    <button
      className="btn btn-soft video-btn icon-video-btn"
      title={`觀看「${name}」破紀錄那一組（${seg.label}）`}
      aria-label={`觀看「${name}」破紀錄那一組（${seg.label}）`}
      onClick={(e) => {
        e.stopPropagation();
        openVideo({ video: ev.video, exerciseId: entry.exerciseId, start: seg.start }, e.currentTarget);
      }}
      onKeyDown={stop}
    >
      <Icon name="play" />
    </button>
  );
}

/** 動作的所有影片：從最近一次開始播，播放器旁列出所有拍了影片的日子 */
export function ExerciseVideosButton({ exerciseId }: { exerciseId: string }) {
  const ds = useDs();
  const days = exerciseVideos(ds, exerciseId);
  const latest = days[0];
  if (!latest) return <NoVideo title="這個動作還沒有拍過影片">沒有影片</NoVideo>;
  return (
    <button
      className="btn btn-ghost"
      title="從最近一次開始播，旁邊列出所有拍了影片的日子"
      onClick={(e) =>
        openVideo(
          {
            video: latest.video,
            exerciseId,
            start: latest.segments[0]?.start ?? 0,
            allDays: days.length > 1,
          },
          e.currentTarget,
        )
      }
    >
      <Icon name="play" />
      所有影片
      <Count n={days.length} />
    </button>
  );
}

/**
 * 訓練紀錄詳細資料欄的影片區塊：單日列出當天影片裡的動作（點了從那個動作開始播）；
 * 日期範圍列出範圍內有影片的日子（點了從頭播那天的影片）
 */
export function RailVideos({ date, range }: { date: DateStr; range: number }) {
  const ds = useDs();
  if (range === 0) {
    const v = dayVideo(ds, date);
    if (!v) return null;
    const groups = segmentsByExercise(v);
    return (
      <section className="panel rail-video">
        <div className="panel-head">
          <span className="panel-title">
            當天影片<span className="meta">{fmtClock(v.durationSec)}</span>
          </span>
          <button
            className="link"
            style={{ fontSize: 12.5 }}
            onClick={(e) => openVideo({ video: v, start: 0 }, e.currentTarget)}
          >
            從頭播放
          </button>
        </div>
        <ul className="rail-vids" aria-label="當天影片的動作">
          {groups.map((g) => {
            const ex = ds.exerciseById.get(g.exerciseId);
            const first = g.segments[0]?.start ?? 0;
            return (
              <li key={g.exerciseId}>
                <button
                  type="button"
                  className="rail-vid"
                  title={`從 ${fmtClock(first)} 開始播放`}
                  onClick={(e) => openVideo({ video: v, start: first }, e.currentTarget)}
                >
                  <span className="vp-ic">
                    <Icon name="play" />
                  </span>
                  <GDot group={ex?.group ?? ''} />
                  <span className="rv-name">{ex?.name ?? g.exerciseId}</span>
                  <span className="rv-n">{g.segments.length} 段</span>
                  <em>{fmtClock(first)}</em>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
  const vids = rangeDates(date, range)
    .map((d) => dayVideo(ds, d))
    .filter((v) => v != null)
    .reverse();
  if (!vids.length) return null;
  return (
    <section className="panel rail-video">
      <div className="panel-head">
        <span className="panel-title">
          期間影片<span className="meta">{vids.length} 天</span>
        </span>
      </div>
      <ul className="rail-vids" aria-label="期間影片">
        {vids.map((v) => (
          <li key={v.date}>
            <button
              type="button"
              className="rail-vid"
              title={v.title}
              onClick={(e) => openVideo({ video: v, start: 0 }, e.currentTarget)}
            >
              <span className="vp-ic">
                <Icon name="play" />
              </span>
              <span className="rv-date">
                {md(v.date)}
                <span className="rv-n">週{dowOf(v.date)}</span>
              </span>
              <span className="rv-name rv-sub">
                {segmentsByExercise(v)
                  .map((g) => ds.exerciseById.get(g.exerciseId)?.name ?? g.exerciseId)
                  .join('、')}
              </span>
              <em>{fmtClock(v.durationSec)}</em>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
