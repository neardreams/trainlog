// 日期格（v14）：側欄月曆（.cd）與手機週條（.mw）共用；部位色帶、今天墨色框、選取主色、有影片右上角播放記號
import clsx from 'clsx';
import { useNavigate } from '@tanstack/react-router';
import { dayGroups, daySets, dowOf, slash, type DateStr } from '@trainlog/core';
import { gColor } from '@/lib/chrome';
import { TODAY } from '@/lib/today';
import { useDs } from '@/lib/useDs';

export function DayCell({
  date,
  out,
  week,
  selected,
}: {
  date: DateStr;
  out?: boolean;
  /** 手機週條的格子（多一行星期） */
  week?: boolean;
  selected?: boolean;
}) {
  const ds = useDs();
  const navigate = useNavigate();
  const trained = ds.entriesByDate.has(date);
  const clickable = trained || ds.journals.has(date);
  const groups = trained ? dayGroups(ds, date) : [];
  const video = ds.videosByDate.has(date);
  const isToday = date === TODAY;
  const open = () => void navigate({ to: '/days/$date', params: { date } });
  const lines = [
    `${slash(date)}（週${dowOf(date)}）${trained ? ` · ${daySets(ds, date)} 組` : ''}`,
    groups.join('、'),
    video ? '有影片' : '',
  ].filter(Boolean);
  const title = lines.join('\n');
  return (
    <div
      className={clsx(
        week ? 'mw' : 'cd',
        !out && 'in',
        trained && 't',
        clickable && 'go',
        video && 'v',
        isToday && 'today',
        selected && 'sel',
      )}
      data-date={date}
      data-tip={title}
      aria-label={lines.join('，')}
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
      {week && <small>{isToday ? '今天' : dowOf(date)}</small>}
      {Number(date.slice(8))}
      {groups.length > 0 && (
        <span className="bar">
          {groups.slice(0, 4).map((g) => (
            <i key={g} style={{ background: gColor(g) }} />
          ))}
        </span>
      )}
    </div>
  );
}
