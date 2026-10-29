// 訓練影片入口：每筆紀錄的「影片」按鈕（列出當天影片中這個動作的各段，點了在網站內從那一段開始播），以及整天影片的按鈕
import { useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import { dayVideo, entryVideo, fmtClock, md, type DateStr, type Entry } from '@trainlog/core';
import { Count } from './ui';
import { VideoPlayerDialog, type VideoTarget } from './VideoPlayerDialog';
import { Icon } from '@/lib/icons';
import { PEEK_ATTR } from '@/lib/peek';
import { useDs } from '@/lib/useDs';

/** compact：只顯示圖示與段數（放在欄寬自動的表格日期欄時，不會把欄位撐寬） */
export function VideoButton({ entry, compact }: { entry: Entry; compact?: boolean }) {
  const ds = useDs();
  const [play, setPlay] = useState<VideoTarget>();
  const btnRef = useRef<HTMLButtonElement>(null);
  // 從選單打開播放器時，選單關閉後不要把焦點拉回按鈕（焦點要留在播放器裡）
  const opening = useRef(false);
  const ev = entryVideo(ds, entry);
  if (!ev) return null;
  const name = ds.exerciseById.get(entry.exerciseId)?.name ?? '';
  const { video, segments } = ev;
  const open = (t: VideoTarget) => {
    opening.current = true;
    setPlay(t);
  };
  return (
    <>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <button
            ref={btnRef}
            className={clsx('btn btn-soft hist-btn video-btn', compact && 'compact')}
            title={`觀看「${name}」的影片`}
            aria-label={`觀看「${name}」的影片（${segments.length} 段）`}
            // 列本身點了會開歷史側欄，按鈕的點擊不要傳上去
            onClick={(e) => e.stopPropagation()}
          >
            <Icon name="play" />
            {!compact && '影片'}
            <Count n={segments.length} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="dd-content video-menu"
            align="start"
            sideOffset={6}
            {...{ [PEEK_ATTR]: '' }}
            onClick={(e) => e.stopPropagation()}
            onCloseAutoFocus={(e) => {
              if (!opening.current) return;
              opening.current = false;
              e.preventDefault();
            }}
          >
            <div className="menu-head">
              {md(entry.date)} · {name}
            </div>
            {segments.map((s) => (
              <DropdownMenu.Item
                key={s.start}
                asChild
                onSelect={() => open({ video, exerciseId: entry.exerciseId, start: s.start })}
              >
                <button type="button" className="menu-item">
                  <Icon name="play" />
                  <span className="vm-label">{s.label}</span>
                  <em>{fmtClock(s.start)}</em>
                </button>
              </DropdownMenu.Item>
            ))}
            <div className="menu-sep" />
            <DropdownMenu.Item asChild onSelect={() => open({ video, start: 0 })}>
              <button type="button" className="menu-item">
                <Icon name="play" />
                <span className="vm-label">當天整支影片</span>
                <em>{fmtClock(video.durationSec)}</em>
              </button>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {play && <VideoPlayerDialog target={play} onClose={() => setPlay(undefined)} returnFocus={btnRef} />}
    </>
  );
}

/** 訓練紀錄頁標題旁：在網站內從頭播當天的整支影片 */
export function DayVideoLink({ date }: { date: DateStr }) {
  const ds = useDs();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const v = dayVideo(ds, date);
  if (!v) return null;
  return (
    <>
      <button
        ref={btnRef}
        className="btn"
        title={v.title}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Icon name="play" />
        當天影片
        <span className="na">{fmtClock(v.durationSec)}</span>
      </button>
      {open && (
        <VideoPlayerDialog
          target={{ video: v, start: 0 }}
          onClose={() => setOpen(false)}
          returnFocus={btnRef}
        />
      )}
    </>
  );
}
