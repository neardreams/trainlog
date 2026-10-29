// 動作紀錄面板：概覽／歷程／動作要點（動作庫展開列與訓練紀錄下鑽共用）
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useNavigate } from '@tanstack/react-router';
import {
  calcVolume,
  daysLabel,
  daysAgo,
  entriesOf,
  fmtN,
  isCardio,
  md,
  summarize,
  trendSeries,
  type DateStr,
  type Entry,
  type Exercise,
} from '@trainlog/core';
import { Sparkline } from './charts';
import { Count, DateCell, Empty, ExhBadge, Sets } from './ui';
import { ExerciseVideosButton, VideoButton } from './VideoLinks';
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
      {fmtN(v)} <span className="na">kg</span>
    </>
  ) : (
    <span className="na">—</span>
  );
}

export function HistTable({
  ex,
  rows,
  focus,
  maxHeight,
}: {
  ex: Exercise;
  rows: Entry[];
  focus?: DateStr;
  maxHeight?: number;
}) {
  const navigate = useNavigate();
  const focusRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: 'nearest' });
  }, [focus]);
  return (
    <div className="table-wrap" style={maxHeight ? { maxHeight } : undefined}>
      <table className="tbl">
        <thead>
          <tr>
            <th>日期</th>
            <th>重量 / 組次</th>
            <th className="r">{isCardio(ex) ? '時間 / 距離' : '總容量'}</th>
            <th>感受度</th>
            <th>力竭</th>
            <th>身心狀態</th>
            <th>動作提示</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr
              key={h.id}
              className={clsx(h.date === focus && 'tr-focus')}
              ref={h.date === focus ? focusRef : undefined}
            >
              <DateCell
                date={h.date}
                onOpen={() => void navigate({ to: '/days/$date', params: { date: h.date } })}
              >
                <VideoButton entry={h} compact />
              </DateCell>
              <td className="c-sets">
                <Sets entry={h} ex={ex} />
              </td>
              <td className="c-vol">
                <VolCell ex={ex} h={h} />
              </td>
              <td className="c-feel">{h.feel ?? ''}</td>
              <td className="c-exh">
                <ExhBadge value={h.exhaustion} />
              </td>
              <td className="c-cond">{h.condition ?? ''}</td>
              <td className="c-cue">{h.cue ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendCard({ label, data, unit }: { label: string; data: [DateStr, number][]; unit: string }) {
  const first = data[0]?.[1] ?? 0;
  const last = data[data.length - 1]?.[1] ?? 0;
  const delta = last - first;
  const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  return (
    <div className="trend-card">
      <div className="tc-head">
        <span>{label}</span>
        <span className={clsx('delta', cls)}>
          {delta > 0 ? '+' : delta < 0 ? '−' : '±'}
          {fmtN(Math.abs(delta))} {unit}
        </span>
      </div>
      <div className="tc-value">
        {fmtN(last)}
        <small>{unit} · 最新</small>
      </div>
      <Sparkline data={data} unit={unit} />
      <div className="tc-foot">
        <span>
          首次 {fmtN(first)} {unit}
        </span>
        <span>
          {md(data[0]?.[0] ?? TODAY)} – {md(data[data.length - 1]?.[0] ?? TODAY)} · {data.length} 筆
        </span>
      </div>
    </div>
  );
}

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
  const series = trendSeries(ds, ex);
  const recent = [...hist].reverse().slice(0, 5);
  const desc = [...hist].reverse();
  const last = s.lastDate;
  const tabs: [RecTab, string, number | null][] = [
    ['ov', '概覽', null],
    ['hist', '歷程', hist.length],
    ['notes', '動作要點', ex.notes.length],
  ];
  return (
    <div className="rec">
      <div className="rec-tabs" role="tablist">
        {tabs.map(([k, l, c]) => (
          <button
            key={k}
            className={clsx('rec-tab', tab === k && 'active')}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
          >
            {l}
            {c != null && <Count n={c} />}
          </button>
        ))}
        <span className="rec-act">
          <ExerciseVideosButton exerciseId={ex.id} />
          {!inDay && last && (
            <button
              className="btn btn-ghost"
              onClick={() => void navigate({ to: '/days/$date', params: { date: last } })}
            >
              <Icon name="calendar" />
              最近一次訓練
            </button>
          )}
        </span>
      </div>
      {tab === 'ov' && (
        <div className="rec-pane active">
          <div className="kpis">
            <div className="kpi">
              <div className="k">訓練次數</div>
              <div className="v">
                {hist.length}
                <small>次</small>
              </div>
            </div>
            {cardio ? (
              <>
                <div className="kpi">
                  <div className="k">累計時間</div>
                  <div className="v">
                    {s.cardio.mins ? fmtN(s.cardio.mins) : '—'}
                    <small>{s.cardio.mins ? '分' : ''}</small>
                  </div>
                </div>
                <div className="kpi">
                  <div className="k">累計距離</div>
                  <div className="v">
                    {s.cardio.km ? fmtN(s.cardio.km) : '—'}
                    <small>{s.cardio.km ? 'km' : ''}</small>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="kpi">
                  <div className="k">最高重量</div>
                  <div className="v">
                    {s.maxWeight ? fmtN(s.maxWeight) : '—'}
                    <small>{s.maxWeight ? 'kg' : ''}</small>
                  </div>
                </div>
                <div className="kpi">
                  <div className="k">累計容量</div>
                  <div className="v">
                    {s.totalVolume ? fmtN(s.totalVolume) : '—'}
                    <small>{s.totalVolume ? 'kg' : ''}</small>
                  </div>
                </div>
              </>
            )}
            <div className="kpi">
              <div className="k">上次訓練</div>
              <div className="v">
                {last ? md(last) : '—'}
                <small>{last ? daysLabel(daysAgo(last, TODAY)) : ''}</small>
              </div>
            </div>
          </div>
          <div className="ov-grid">
            {series.primary.length >= 2 && (
              <TrendCard
                label={cardio ? '時間趨勢' : '總容量趨勢'}
                data={series.primary}
                unit={cardio ? '分' : 'kg'}
              />
            )}
            {series.secondary.length >= 2 && (
              <TrendCard
                label={cardio ? '距離趨勢' : '最高重量趨勢'}
                data={series.secondary}
                unit={cardio ? 'km' : 'kg'}
              />
            )}
            <div className="box">
              <div className="box-h">
                最近 {recent.length} 次
                <a className="link" onClick={() => setTab('hist')}>
                  查看全部 {hist.length} 筆
                </a>
              </div>
              <HistTable ex={ex} rows={recent} {...(focus ? { focus } : {})} />
            </div>
          </div>
        </div>
      )}
      {tab === 'hist' && (
        <div className="rec-pane active">
          <div className="box">
            <HistTable ex={ex} rows={desc} maxHeight={560} {...(focus ? { focus } : {})} />
          </div>
        </div>
      )}
      {tab === 'notes' && (
        <div className="rec-pane active">
          <div className="box">
            <div className="box-b">
              {ex.notes.length ? (
                <ol className="notes">
                  {ex.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ol>
              ) : (
                <Empty title="還沒有動作要點" icon="doc">
                  同步日誌時，教練提醒會自動整理進來。
                </Empty>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
