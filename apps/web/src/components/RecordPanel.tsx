// 動作紀錄面板（v14）：標題列分頁（概覽／歷程／動作要點）＋影片；概覽是欄位格＋趨勢圖＋動作要點，右邊最近 5 次
// 動作庫展開列與訓練紀錄下鑽共用
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useNavigate } from '@tanstack/react-router';
import {
  calcVolume,
  daysAgo,
  dowOf,
  entriesOf,
  exerciseVideos,
  fmtN,
  isCardio,
  md,
  progressOf,
  summarize,
  trendPoints,
  type DateStr,
  type Entry,
  type Exercise,
} from '@trainlog/core';
import { TrendChart } from './charts';
import { Empty, ExhBadge, PartTile, Sets } from './ui';
import { EntryVideoButton, ExerciseVideosButton } from './VideoLinks';
import { Icon } from '@/lib/icons';
import { TODAY } from '@/lib/today';
import { useDs } from '@/lib/useDs';

export function VolCell({ ex, h }: { ex: Exercise; h: Entry }) {
  if (isCardio(ex)) {
    const b = [
      h.minutes != null ? `${fmtN(h.minutes)} 分` : '',
      h.distanceKm != null ? `${fmtN(h.distanceKm)} km` : '',
    ].filter(Boolean);
    return <>{b.length ? b.join(' · ') : <span className="na">—</span>}</>;
  }
  const v = calcVolume(h.sets);
  return v != null ? (
    <>
      {fmtN(v)}
      <small>kg</small>
    </>
  ) : (
    <span className="na">—</span>
  );
}

/** 紀錄表：日期（點了到那天的訓練紀錄）、組數＋感受、容量、力竭、影片；full 時另列身心狀態與動作提示 */
export function HistTable({
  ex,
  rows,
  focus,
  full,
}: {
  ex: Exercise;
  rows: Entry[];
  focus?: DateStr;
  full?: boolean;
}) {
  const navigate = useNavigate();
  const focusRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: 'nearest' });
  }, [focus]);
  return (
    <table className={clsx('dg rtab', full && 'full')}>
      <thead>
        <tr>
          <th>日期</th>
          <th>{isCardio(ex) ? '紀錄' : '組數（重量 × 次數）'}</th>
          <th className="r rv">{isCardio(ex) ? '時間 / 距離' : '容量'}</th>
          <th>力竭</th>
          <th className="c">影片</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => (
          <tr
            key={h.id}
            className={clsx(h.date === focus && 'on')}
            ref={h.date === focus ? focusRef : undefined}
          >
            <td className="num">
              <button
                type="button"
                className="rt-d"
                data-tip={`看 ${md(h.date)} 的訓練紀錄`}
                onClick={() => void navigate({ to: '/days/$date', params: { date: h.date } })}
              >
                {md(h.date)}
              </button>
              <div className="rt-w">週{dowOf(h.date)}</div>
            </td>
            <td className="fill">
              <Sets entry={h} ex={ex} mini />
              {h.feel && <div className="fl">{h.feel}</div>}
              {full && h.condition && h.condition !== '正常' && (
                <div className="fl">
                  <em>身心狀態</em>
                  {h.condition}
                </div>
              )}
              {full && h.cue && (
                <div className="fl cue">
                  <em>動作提示</em>
                  {h.cue}
                </div>
              )}
            </td>
            <td className="r num b rv">
              <VolCell ex={ex} h={h} />
            </td>
            <td>
              <ExhBadge value={h.exhaustion} />
            </td>
            <td className="c">
              <div className="vbc">
                <EntryVideoButton entry={h} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 欄位格的一格 */
const F = ({ k, children, style }: { k: string; children: React.ReactNode; style?: React.CSSProperties }) => (
  <div>
    <span>{k}</span>
    <b style={style}>{children}</b>
  </div>
);
const U = ({ u }: { u: string }) => <small>{u}</small>;
const NA = () => <span className="na">—</span>;

export type RecTab = 'ov' | 'hist' | 'notes';

export function RecordPanel({
  ex,
  initialTab = 'ov',
  focus,
  inDay,
}: {
  ex: Exercise;
  initialTab?: RecTab;
  focus?: DateStr;
  inDay?: boolean;
}) {
  const ds = useDs();
  const navigate = useNavigate();
  const [tab, setTab] = useState<RecTab>(initialTab);
  const hist = entriesOf(ds, ex.id);
  const s = summarize(ds, ex, TODAY);
  const cardio = isCardio(ex);
  const points = trendPoints(ds, ex);
  const pg = progressOf(ds, ex.id);
  const videoDays = exerciseVideos(ds, ex.id).length;
  const desc = [...hist].reverse();
  const recent = desc.slice(0, 5);
  const last = s.lastDate;
  const maxMin = Math.max(0, ...hist.map((h) => h.minutes ?? 0));
  const first = hist[0];
  const tabs: [RecTab, string, number | null][] = [
    ['ov', '概覽', null],
    ['hist', '歷程', hist.length],
    ['notes', '動作要點', ex.notes.length],
  ];
  return (
    <section className="pn rec">
      <header className="pn-h" role="tablist">
        {tabs.map(([k, l, c]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={clsx('xtab', tab === k && 'on')}
            onClick={() => setTab(k)}
          >
            {l}
            {c != null && <span className="cnt">{c}</span>}
          </button>
        ))}
        <span className="sp" />
        <div className="acts">
          <ExerciseVideosButton exerciseId={ex.id} variant="btn" />
          {!inDay && last && (
            <button
              type="button"
              className="btn sm"
              onClick={() => void navigate({ to: '/days/$date', params: { date: last } })}
            >
              <Icon name="calendar" />
              最近一次訓練
            </button>
          )}
        </div>
      </header>
      {tab === 'ov' && (
        <div className="xp-g">
          <div>
            <div className="fg">
              <F k="部位">
                <span className="fg-g">
                  <PartTile group={ex.group} />
                  {ex.group}
                </span>
              </F>
              <F k="訓練次數">
                {hist.length}
                <U u="次" />
              </F>
              <F k="影片">
                {videoDays}
                <U u="天" />
              </F>
              {cardio ? (
                <>
                  <F k="累計時間">
                    {s.cardio.mins ? fmtN(s.cardio.mins) : <NA />}
                    {s.cardio.mins > 0 && <U u="分" />}
                  </F>
                  <F k="累計距離">
                    {s.cardio.km ? fmtN(s.cardio.km) : <NA />}
                    {s.cardio.km > 0 && <U u="km" />}
                  </F>
                  <F k="最長時間">
                    {maxMin ? fmtN(maxMin) : <NA />}
                    {maxMin > 0 && <U u="分" />}
                  </F>
                  <F k="第一次">{first ? md(first.date) : <NA />}</F>
                </>
              ) : (
                <>
                  <F k="最高重量">
                    {s.maxWeight ? fmtN(s.maxWeight) : <NA />}
                    {s.maxWeight > 0 && <U u="kg" />}
                  </F>
                  <F
                    k="進步（首次→最近）"
                    style={
                      pg && pg.delta
                        ? { color: pg.delta > 0 ? 'var(--green-11)' : 'var(--red-11)' }
                        : undefined
                    }
                  >
                    {pg ? (
                      <>
                        {pg.delta > 0 ? '+' : pg.delta < 0 ? '−' : ''}
                        {fmtN(Math.abs(pg.delta))}
                        <U u="kg" />
                      </>
                    ) : (
                      <NA />
                    )}
                  </F>
                  <F k="累計容量">
                    {s.totalVolume ? fmtN(Math.round(s.totalVolume)) : <NA />}
                    {s.totalVolume > 0 && <U u="kg" />}
                  </F>
                  <F k="首次最高">
                    {pg ? fmtN(pg.first) : <NA />}
                    {pg && <U u="kg" />}
                  </F>
                </>
              )}
              <F k="上次訓練">{last ? md(last) : <NA />}</F>
              <F k="距今">
                {last ? daysAgo(last, TODAY) : <NA />}
                {last && <U u="天" />}
              </F>
            </div>
            {points.length >= 2 && (
              <>
                <TrendChart points={points} unit={cardio ? '分' : 'kg'} />
                <div className="trend-f">
                  <span>
                    {cardio ? '每次時間' : '每次最高重量'} · 共 {points.length} 次
                  </span>
                  <span className="lg">
                    <span>
                      <i style={{ background: 'var(--g)' }} />
                      {cardio ? '時間' : '每次最高'}
                    </span>
                    {!cardio && (
                      <span>
                        <i style={{ background: 'var(--green-9)' }} />
                        破紀錄
                      </span>
                    )}
                  </span>
                </div>
              </>
            )}
            {ex.notes.length > 0 && (
              <>
                <div className="notes-h">
                  <span>動作要點</span>
                  <button type="button" className="lk" onClick={() => setTab('notes')}>
                    全部 {ex.notes.length} 條
                    <Icon name="arrow" />
                  </button>
                </div>
                <ol className="notes-ol">
                  {ex.notes.slice(0, 3).map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ol>
              </>
            )}
          </div>
          <div>
            <HistTable ex={ex} rows={recent} {...(focus ? { focus } : {})} />
            <div className="pn-f">
              <span>
                最近 {recent.length} 次，共 <b>{hist.length}</b> 筆
              </span>
              <button type="button" className="lk" onClick={() => setTab('hist')}>
                查看全部歷程
                <Icon name="arrow" />
              </button>
            </div>
          </div>
        </div>
      )}
      {tab === 'hist' && (
        <div className="rec-hist">
          <HistTable ex={ex} rows={desc} full {...(focus ? { focus } : {})} />
        </div>
      )}
      {tab === 'notes' &&
        (ex.notes.length ? (
          <ol className="notes-ol all">
            {ex.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ol>
        ) : (
          <Empty title="還沒有動作要點" icon="doc">
            同步日誌時，教練提醒會自動整理進來。
          </Empty>
        ))}
    </section>
  );
}
