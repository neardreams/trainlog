// 側欄月曆（≥1024 與抽屜）與手機週條（≤760）
import { useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import {
  addDays,
  daysBetween,
  md,
  mondayOf,
  monthsBetween,
  parseDate,
  toDateStr,
  type DateStr,
} from '@trainlog/core';
import { DayCell } from './DayCell';
import { Icon } from '@/lib/icons';
import { TODAY } from '@/lib/today';
import { useDs } from '@/lib/useDs';

/** 目前選取的日期（訓練紀錄頁的日期） */
export function useSelectedDate(): DateStr | null {
  return useRouterState({
    select: (s) => {
      const m = s.matches.find((x) => x.routeId === '/days/$date');
      return (m?.params as { date?: string } | undefined)?.date ?? null;
    },
  });
}

export function MonthCalendar() {
  const ds = useDs();
  const selected = useSelectedDate();
  const [offset, setOffset] = useState(() => (selected ? monthsBetween(TODAY, selected) : 0));
  // 選到別的月份的日期時，月曆跟著跳到那個月
  const [prevSelected, setPrevSelected] = useState(selected);
  if (selected !== prevSelected) {
    setPrevSelected(selected);
    if (selected) setOffset(monthsBetween(TODAY, selected));
  }
  const t = parseDate(TODAY);
  const first = new Date(t.getFullYear(), t.getMonth() + offset, 1);
  const y = first.getFullYear();
  const mo = first.getMonth();
  const lead = (first.getDay() + 6) % 7;
  const nd = new Date(y, mo + 1, 0).getDate();
  const total = Math.ceil((lead + nd) / 7) * 7;
  const cells = [...Array(total)].map((_, i) => {
    const d = new Date(y, mo, 1 - lead + i);
    return { date: toDateStr(d), out: d.getMonth() !== mo };
  });
  const inMonth = cells.filter((c) => !c.out);
  const trained = inMonth.filter((c) => ds.entriesByDate.has(c.date)).length;
  const withVideo = inMonth.filter((c) => ds.videosByDate.has(c.date)).length;
  return (
    <div className="cal">
      <div className="cal-h">
        <b>
          {y}/{String(mo + 1).padStart(2, '0')}
        </b>
        <button onClick={() => setOffset((o) => o - 1)} title="上個月" aria-label="上個月">
          <Icon name="left" />
        </button>
        <button className="td" onClick={() => setOffset(0)}>
          今天
        </button>
        <button onClick={() => setOffset((o) => o + 1)} title="下個月" aria-label="下個月">
          <Icon name="right" />
        </button>
      </div>
      <div className="cal-g">
        {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
          <div key={d} className="cal-w">
            {d}
          </div>
        ))}
        {cells.map((c) => (
          <DayCell key={c.date} date={c.date} out={c.out} selected={c.date === selected} />
        ))}
      </div>
      <div className="cal-f">
        <span>
          本月 <b>{trained}</b> 天
        </span>
        <span>
          <i className="vflag" />
          有影片 <b>{withVideo}</b> 天
        </span>
      </div>
    </div>
  );
}

/** 手機的本週（週一到週日），可前後翻週；選了別週的日期時跟著跳過去 */
export function MobileWeek() {
  const selected = useSelectedDate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const base = selected ?? TODAY;
  const [off, setOff] = useState(0);
  const [prevBase, setPrevBase] = useState(base);
  if (base !== prevBase) {
    setPrevBase(base);
    setOff(0);
  }
  // 同設計稿：只在總覽與訓練紀錄顯示
  if (!(path === '/' || path.startsWith('/days'))) return null;
  const mon = addDays(mondayOf(base), off * 7);
  const days = [...Array(7)].map((_, i) => addDays(mon, i));
  const thisWeek = mon === mondayOf(TODAY);
  return (
    <div className="mweek">
      <div className="mweek-h">
        <b>
          {thisWeek ? '本週' : '那一週'}
          <span>
            {md(days[0] ?? mon)}–{md(days[6] ?? mon)}
          </span>
        </b>
        <div className="bgrp">
          <button
            className="btn sm icon"
            onClick={() => setOff((o) => o - 1)}
            aria-label="前一週"
            title="前一週"
          >
            <Icon name="left" />
          </button>
          <button
            className="btn sm"
            onClick={() => setOff(Math.round(daysBetween(mondayOf(base), mondayOf(TODAY)) / 7))}
          >
            今天
          </button>
          <button
            className="btn sm icon"
            onClick={() => setOff((o) => o + 1)}
            aria-label="後一週"
            title="後一週"
          >
            <Icon name="right" />
          </button>
        </div>
      </div>
      <div className="mweek-g">
        {days.map((d) => (
          <DayCell key={d} date={d} week selected={d === selected} />
        ))}
      </div>
    </div>
  );
}
