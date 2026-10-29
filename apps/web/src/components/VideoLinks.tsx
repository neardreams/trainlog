// 訓練影片連結：每筆紀錄的「影片」按鈕（列出當天影片中這個動作的各段，點了從那一段開始播），以及整天影片的按鈕
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import { dayVideo, entryVideo, fmtClock, md, youtubeUrl, type DateStr, type Entry } from '@trainlog/core';
import { Count } from './ui';
import { Icon } from '@/lib/icons';
import { PEEK_ATTR } from '@/lib/peek';
import { useDs } from '@/lib/useDs';

const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' } as const;

/** compact：只顯示圖示與段數（放在欄寬自動的表格日期欄時，不會把欄位撐寬） */
export function VideoButton({ entry, compact }: { entry: Entry; compact?: boolean }) {
  const ds = useDs();
  const ev = entryVideo(ds, entry);
  if (!ev) return null;
  const name = ds.exerciseById.get(entry.exerciseId)?.name ?? '';
  const { video, segments } = ev;
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
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
        >
          <div className="menu-head">
            {md(entry.date)} · {name}
          </div>
          {segments.map((s) => (
            <DropdownMenu.Item key={s.start} asChild>
              <a className="menu-item" href={youtubeUrl(video.youtubeId, s.start)} {...NEW_TAB}>
                <Icon name="play" />
                <span className="vm-label">{s.label}</span>
                <em>{fmtClock(s.start)}</em>
              </a>
            </DropdownMenu.Item>
          ))}
          <div className="menu-sep" />
          <DropdownMenu.Item asChild>
            <a className="menu-item" href={youtubeUrl(video.youtubeId)} {...NEW_TAB}>
              <Icon name="play" />
              <span className="vm-label">當天整支影片</span>
              <em>{fmtClock(video.durationSec)}</em>
            </a>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** 訓練紀錄頁標題旁：開啟當天的整支影片 */
export function DayVideoLink({ date }: { date: DateStr }) {
  const ds = useDs();
  const v = dayVideo(ds, date);
  if (!v) return null;
  return (
    <a className="btn" href={youtubeUrl(v.youtubeId)} title={v.title} {...NEW_TAB}>
      <Icon name="play" />
      當天影片
      <span className="na">{fmtClock(v.durationSec)}</span>
    </a>
  );
}
