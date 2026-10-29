// 日期格：側欄月曆與窄螢幕 14 天時間軸共用
import clsx from 'clsx';
import { useNavigate } from '@tanstack/react-router';
import { dayGroups, dowOf, slash, type DateStr } from '@trainlog/core';
import { gColor } from '@/lib/chrome';
import { TODAY } from '@/lib/today';
import { useDs } from '@/lib/useDs';

export function DayCell({
  date,
  out,
  showDow,
  selected,
}: {
  date: DateStr;
  out?: boolean;
  showDow?: boolean;
  selected?: boolean;
}) {
  const ds = useDs();
  const navigate = useNavigate();
  const trained = ds.entriesByDate.has(date);
  const clickable = trained || ds.journals.has(date);
  const groups = trained ? dayGroups(ds, date) : [];
  const isToday = date === TODAY;
  const open = () => void navigate({ to: '/days/$date', params: { date } });
  return (
    <div
      className={clsx(
        'day-cell',
        trained ? 'trained' : 'rest',
        isToday && 'today',
        date > TODAY && 'future',
        out && 'out',
        clickable && 'clickable',
        selected && 'active-sel',
      )}
      data-date={date}
      title={`${slash(date)}（${dowOf(date)}）${groups.length ? ` · ${groups.join('、')}` : ''}${ds.videosByDate.has(date) ? ' · 有影片' : ''}`}
      {...(clickable
        ? {
            role: 'button',
            tabIndex: 0,
            onClick: open,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
              }
            },
          }
        : {})}
    >
      {showDow && <span className="day-dow">{isToday ? '今天' : dowOf(date)}</span>}
      <span className="day-num">{Number(date.slice(8))}</span>
      <span className="day-dots">
        {groups.slice(0, 4).map((g) => (
          <span key={g} className="day-dot" style={{ ['--c' as string]: gColor(g) }} />
        ))}
      </span>
    </div>
  );
}
