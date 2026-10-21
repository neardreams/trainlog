// 側欄整月月曆（≥1024）與 14 天時間軸（<1024）
import { useEffect, useRef, useState } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { addDays, md, monthsBetween, parseDate, toDateStr, type DateStr } from '@trainlog/core';
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
  const trained = cells.filter((c) => !c.out && ds.entriesByDate.has(c.date)).length;
  return (
    <div className="cal">
      <div className="cal-head">
        <div className="t">
          <b>
            {y} 年 {mo + 1} 月
          </b>
          <span>{trained} 個訓練日</span>
        </div>
        <button
          className="icon-btn"
          onClick={() => setOffset((o) => o - 1)}
          title="上個月"
          aria-label="上個月"
        >
          <Icon name="left" />
        </button>
        <button className="btn" onClick={() => setOffset(0)}>
          今天
        </button>
        <button
          className="icon-btn"
          onClick={() => setOffset((o) => o + 1)}
          title="下個月"
          aria-label="下個月"
        >
          <Icon name="right" />
        </button>
      </div>
      <div className="cal-grid">
        {['一', '二', '三', '四', '五', '六', '日'].map((d) => (
          <span key={d} className="cal-h">
            {d}
          </span>
        ))}
        {cells.map((c) => (
          <DayCell key={c.date} date={c.date} out={c.out} selected={c.date === selected} />
        ))}
      </div>
    </div>
  );
}

export function WeekStrip() {
  const selected = useSelectedDate();
  const [off, setOff] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const days = [...Array(14)].map((_, i) => addDays(TODAY, off - 6 + i));
  // 只橫向捲到今天，不帶動整頁捲動（修正 v6 的問題）
  useEffect(() => {
    const el = strip.current;
    const t = el?.querySelector<HTMLElement>('.today');
    if (el && t) el.scrollLeft = t.offsetLeft - el.clientWidth / 2 + t.clientWidth / 2;
  }, [off]);
  return (
    <section className="panel week-panel">
      <div className="panel-head">
        <div className="panel-title">
          近 14 天<span className="meta">{`${md(days[0] ?? TODAY)} – ${md(days[13] ?? TODAY)}`}</span>
        </div>
        <div className="btn-group">
          <button
            className="btn btn-icon"
            onClick={() => setOff((o) => o - 7)}
            aria-label="前一週"
            title="前一週"
          >
            <Icon name="left" />
          </button>
          <button className="btn" onClick={() => setOff(0)}>
            今天
          </button>
          <button
            className="btn btn-icon"
            onClick={() => setOff((o) => o + 7)}
            aria-label="後一週"
            title="後一週"
          >
            <Icon name="right" />
          </button>
        </div>
      </div>
      <div className="week-strip" ref={strip}>
        {days.map((d) => (
          <DayCell key={d} date={d} showDow selected={d === selected} />
        ))}
      </div>
    </section>
  );
}
