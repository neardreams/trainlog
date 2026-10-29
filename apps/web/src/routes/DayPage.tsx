// 訓練紀錄：單日／範圍整理、日期比較、原始日誌、右側詳細資料欄、動作下鑽
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Navigate, useNavigate } from '@tanstack/react-router';
import {
  EXHAUSTION_ORDER,
  addDays,
  compareDays,
  dayGroups,
  dowOf,
  exerciseOf,
  exhTone,
  fmtN,
  groupRangeEntries,
  latestTrainingDate,
  longDate,
  md,
  nextTrainingDate,
  prevTrainingDate,
  rangeDates,
  rangeEntries,
  rangeStats,
  slash,
  stripJournalHeading,
  type CompareRow,
  type DateStr,
  type Entry,
  type RangeGroup,
  type RangeGroupBy,
  type RangeSortKey,
} from '@trainlog/core';
import { HistorySheet, PEEK_ATTR } from '@/components/HistorySheet';
import { RecordPanel, VolCell } from '@/components/RecordPanel';
import { DateCell, Empty, ExhBadge, GDot, PageHead, Seg, Sets } from '@/components/ui';
import { DayVideoButton, RailVideos, VideoButton } from '@/components/VideoLinks';
import { gColor, useCrumbs, type Crumb } from '@/lib/chrome';
import { Icon } from '@/lib/icons';
import { TODAY } from '@/lib/today';
import { useDs } from '@/lib/useDs';
import { dayRoute, type DaySearch, type DayTab } from '@/router';

/** /days：轉到今天以前最近一個訓練日 */
export function DaysIndex() {
  const ds = useDs();
  const d = latestTrainingDate(ds, TODAY) ?? TODAY;
  return <Navigate to="/days/$date" params={{ date: d }} replace />;
}

type Range = NonNullable<DaySearch['range']>;
const RANGES: readonly (readonly [Range | 0, string])[] = [
  [0, '當天'],
  [3, '±3 天'],
  [7, '±7 天'],
  [14, '±14 天'],
  [30, '±30 天'],
];
const COL_W: Record<string, string> = {
  日期: 'w-date',
  動作: 'w-name',
  '重量 / 組次': 'w-sets',
  總容量: 'w-vol r',
  感受度: '',
  力竭: 'w-exh',
  動作提示: '',
};
const TABS: [DayTab, string, 'chart' | 'compare' | 'doc'][] = [
  ['range', '訓練整理', 'chart'],
  ['compare', '日期比較', 'compare'],
  ['raw', '原始日誌', 'doc'],
];

function RangeTable({
  cols,
  entries,
  showDate,
  showName,
  peekId,
  onDrill,
  onOpenDay,
}: {
  cols: string[];
  entries: Entry[];
  showDate: boolean;
  showName: boolean;
  peekId: string | undefined;
  onDrill: (e: Entry) => void;
  onOpenDay: (d: DateStr) => void;
}) {
  const ds = useDs();
  return (
    <div className="table-wrap">
      <table className="tbl fixed">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} className={COL_W[c]}>
                {c}
              </th>
            ))}
            <th className="w-go" />
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const ex = exerciseOf(ds, e);
            const on = e.id === peekId;
            const hist = (
              <button
                className={clsx('btn btn-soft hist-btn', on && 'on')}
                aria-pressed={on}
                title={`查看「${ex.name}」的歷史紀錄`}
                onClick={(ev) => {
                  ev.stopPropagation();
                  onDrill(e);
                }}
              >
                <Icon name="clock" />
                歷史
              </button>
            );
            return (
              <tr
                key={e.id}
                className={clsx('clickable', on && 'tr-focus')}
                {...{ [PEEK_ATTR]: '' }}
                onClick={() => onDrill(e)}
              >
                {showDate && (
                  <DateCell date={e.date} onOpen={() => onOpenDay(e.date)}>
                    <span className="row-acts">
                      {hist}
                      <VideoButton entry={e} />
                    </span>
                  </DateCell>
                )}
                {showName && (
                  <td className="c-name">
                    <GDot group={ex.group} className="tw:mr-2" />
                    {ex.name}
                    {!showDate && (
                      <span className="row-acts">
                        {hist}
                        <VideoButton entry={e} />
                      </span>
                    )}
                  </td>
                )}
                <td className="c-sets">
                  <Sets entry={e} ex={ex} />
                </td>
                <td className="c-vol">
                  <VolCell ex={ex} h={e} />
                </td>
                <td className="c-feel">{e.feel ?? ''}</td>
                <td className="c-exh">
                  <ExhBadge value={e.exhaustion} />
                </td>
                <td className="c-cue">{e.cue ?? ''}</td>
                <td className="c-go">
                  <Icon name="right" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const Metrics = ({ g }: { g: RangeGroup }) => (
  <span className="rg-metrics">
    {g.maxWeight > 0 && (
      <span>
        最高 <b>{fmtN(g.maxWeight)}</b> kg
      </span>
    )}
    {g.volume > 0 && (
      <span>
        容量 <b>{fmtN(g.volume)}</b> kg
      </span>
    )}
  </span>
);

function RangePanel({
  date,
  range,
  groupBy,
  sortBy,
  peekId,
  onDrill,
  onOpenDay,
}: {
  date: DateStr;
  range: number;
  groupBy: RangeGroupBy;
  sortBy: RangeSortKey;
  peekId: string | undefined;
  onDrill: (e: Entry) => void;
  onOpenDay: (d: DateStr) => void;
}) {
  const ds = useDs();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const groups = useMemo(() => {
    const entries = rangeEntries(ds, date, range, sortBy);
    return groupRangeEntries(ds, entries, groupBy, sortBy);
  }, [ds, date, range, groupBy, sortBy]);
  if (!groups.length)
    return <Empty title="這個範圍內沒有訓練紀錄">可以放大日期範圍，或從左側月曆選其他日子。</Empty>;
  const toggle = (k: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  return (
    <>
      {groups.map((g) => {
        let head: ReactNode;
        let cols: string[];
        let showDate = true;
        let showName = false;
        if (g.kind === 'exercise') {
          const ex = ds.exerciseById.get(g.id);
          head = (
            <>
              <GDot group={ex?.group ?? ''} />
              <span className="rg-name">{ex?.name}</span>
              <span className="rg-meta">
                {ex?.group} · {g.entries.length} 次
              </span>
            </>
          );
          cols = ['日期', '重量 / 組次', '總容量', '感受度', '力竭', '動作提示'];
        } else if (g.kind === 'date') {
          head = (
            <>
              <span className="rg-name">{md(g.id)}</span>
              <span className="rg-meta">
                週{dowOf(g.id)} · {g.entries.length} 個動作
              </span>
              <DayVideoButton date={g.id} variant="compact" />
            </>
          );
          cols = ['動作', '重量 / 組次', '總容量', '感受度', '力竭', '動作提示'];
          showDate = false;
          showName = true;
        } else {
          head = (
            <>
              <GDot group={g.id} />
              <span className="rg-name">{g.id}</span>
              <span className="rg-meta">{g.entries.length} 筆</span>
            </>
          );
          cols = ['日期', '動作', '重量 / 組次', '總容量', '感受度', '力竭', '動作提示'];
          showName = true;
        }
        const c = collapsed.has(g.key);
        return (
          <div key={g.key}>
            <div
              className={clsx('range-group-header', c && 'collapsed')}
              role="button"
              tabIndex={0}
              aria-expanded={!c}
              onClick={() => toggle(g.key)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle(g.key);
                }
              }}
            >
              <span className="chev">
                <Icon name="right" />
              </span>
              {head}
              <Metrics g={g} />
            </div>
            {!c && (
              <div className="range-group-body">
                <RangeTable
                  cols={cols}
                  entries={g.entries}
                  showDate={showDate}
                  showName={showName}
                  peekId={peekId}
                  onDrill={onDrill}
                  onOpenDay={onOpenDay}
                />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function DeltaKg({ d }: { d: number }) {
  return (
    <span className={clsx('delta', d > 0 ? 'up' : d < 0 ? 'down' : 'flat')}>
      {d > 0 ? '+' : d < 0 ? '−' : '±'}
      {fmtN(Math.abs(d))} kg
    </span>
  );
}

function CompareCol({
  rows,
  date,
  onDrill,
}: {
  rows: CompareRow[];
  date: DateStr;
  onDrill: (id: string, d: DateStr) => void;
}) {
  const ds = useDs();
  if (!rows.length) return <div className="empty">這天沒有訓練紀錄</div>;
  return (
    <>
      {rows.map(({ entry: h, volume, maxWeight, other: o }) => {
        const ex = exerciseOf(ds, h);
        return (
          <div
            key={h.id}
            className={clsx('compare-ex-row', o ? 'compare-match' : 'compare-only')}
            onClick={() => onDrill(ex.id, date)}
          >
            <div className="cx-top">
              <GDot group={ex.group} />
              <span className="cx-name">{ex.name}</span>
              <VideoButton entry={h} compact />
              {o && o.maxWeight != null && maxWeight != null && <DeltaKg d={maxWeight - o.maxWeight} />}
              {o && o.volume != null && volume != null && (
                <>
                  <span className="muted">容量</span>
                  <DeltaKg d={volume - o.volume} />
                </>
              )}
            </div>
            <div className="cx-meta">
              <Sets entry={h} ex={ex} />
              {volume != null && <span className="num">{fmtN(volume)} kg</span>}
              <ExhBadge value={h.exhaustion} />
            </div>
            {h.feel && h.feel !== '正常訓練' && <div className="cx-feel">{h.feel}</div>}
          </div>
        );
      })}
    </>
  );
}

function ComparePanel({
  date,
  cmp,
  onCommit,
  onDrill,
}: {
  date: DateStr;
  cmp: DateStr;
  onCommit: (b: DateStr) => void;
  onDrill: (id: string, d: DateStr) => void;
}) {
  const ds = useDs();
  const [a, setA] = useState(date);
  const [b, setB] = useState(cmp);
  const [shown, setShown] = useState<[DateStr, DateStr]>([date, cmp]);
  // 換了頁面日期：兩個日期都回到預設（當天 vs 7 天前）
  const [prevDate, setPrevDate] = useState(date);
  if (date !== prevDate) {
    setPrevDate(date);
    setA(date);
    setB(cmp);
    setShown([date, cmp]);
  }
  const [dA, dB] = shown;
  const r = useMemo(() => compareDays(ds, dA, dB), [ds, dA, dB]);
  const diff = r.totalA - r.totalB;
  return (
    <>
      <div className="compare-pickers">
        <div className="compare-picker-group">
          <label htmlFor="cmp-date-a">日期 A</label>
          <input
            type="date"
            className="date-input"
            id="cmp-date-a"
            value={a}
            onChange={(e) => setA(e.target.value)}
          />
        </div>
        <div className="compare-picker-group">
          <label htmlFor="cmp-date-b">日期 B</label>
          <input
            type="date"
            className="date-input"
            id="cmp-date-b"
            value={b}
            onChange={(e) => setB(e.target.value)}
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            if (!a || !b) return;
            setShown([a, b]);
            onCommit(b);
          }}
        >
          比較
        </button>
      </div>
      <div className="cmp-summary">
        <div className="cmp-stat">
          <div className="k">
            A · {md(dA)}（{dowOf(dA)}）
          </div>
          <div className="v">
            {fmtN(r.totalA)}
            <small>kg</small>
          </div>
          <div className="s">{r.a.length} 個動作</div>
        </div>
        <div className="cmp-stat">
          <div className="k">
            B · {md(dB)}（{dowOf(dB)}）
          </div>
          <div className="v">
            {fmtN(r.totalB)}
            <small>kg</small>
          </div>
          <div className="s">{r.b.length} 個動作</div>
        </div>
        <div className="cmp-stat">
          <div className="k">容量差（A − B）</div>
          <div
            className={clsx(
              'v',
              diff > 0 ? 'compare-delta-pos' : diff < 0 ? 'compare-delta-neg' : 'compare-delta-zero',
            )}
          >
            {diff > 0 ? '+' : diff < 0 ? '−' : ''}
            {fmtN(Math.abs(diff))}
            <small>kg</small>
          </div>
          <div className="s">{r.common} 個共同動作</div>
        </div>
      </div>
      <div className="cmp-legend">
        <span>
          <i style={{ ['--mk' as string]: 'var(--pos)' }} />
          兩天都有
        </span>
        <span>
          <i style={{ ['--mk' as string]: 'var(--warn)' }} />
          只有這天
        </span>
      </div>
      <div className="compare-grid">
        <div className="compare-col">
          <div className="compare-col-header">
            A · {slash(dA)}
            <DayVideoButton date={dA} variant="compact" />
          </div>
          <CompareCol rows={r.a} date={dA} onDrill={onDrill} />
        </div>
        <div className="compare-col">
          <div className="compare-col-header">
            B · {slash(dB)}
            <DayVideoButton date={dB} variant="compact" />
          </div>
          <CompareCol rows={r.b} date={dB} onDrill={onDrill} />
        </div>
      </div>
    </>
  );
}

function RawPanel({ date, range }: { date: DateStr; range: number }) {
  const ds = useDs();
  const dates = rangeDates(date, range)
    .filter((d) => ds.journals.has(d))
    .sort((x, y) => y.localeCompare(x));
  if (!dates.length) return <Empty title="這個範圍內沒有日誌" />;
  return (
    <>
      {dates.map((d) => (
        <article className="journal" key={d}>
          <div className="journal-h">
            <b>{longDate(d)}</b>
            <span>星期{dowOf(d)}</span>
            <DayVideoButton date={d} />
          </div>
          <div className="raw-journal">{stripJournalHeading(ds.journals.get(d) ?? '')}</div>
        </article>
      ))}
    </>
  );
}

function DayRail({ date, range, onOpenRaw }: { date: DateStr; range: number; onOpenRaw: () => void }) {
  const ds = useDs();
  const single = range === 0;
  const dates = rangeDates(date, range);
  const s = useMemo(() => rangeStats(ds, date, range), [ds, date, range]);
  const mx = Math.max(1, ...Object.values(s.setsByGroup));
  const jr = single ? ds.journals.get(date) : undefined;
  return (
    <aside className="day-rail" aria-label="詳細資料">
      <section className="panel">
        <div className="panel-head">
          <span className="panel-title">詳細資料</span>
          <span className="panel-title">
            <span className="meta">
              {single ? md(date) : `${md(dates[0] ?? date)} – ${md(dates[dates.length - 1] ?? date)}`}
            </span>
          </span>
        </div>
        <dl className="props">
          <div>
            <dt>{single ? '日期' : '期間'}</dt>
            <dd>
              {single
                ? `${slash(date)}（${dowOf(date)}）`
                : `${dates.length} 天 · ${s.trainingDays} 個訓練日`}
            </dd>
          </div>
          <div>
            <dt>動作</dt>
            <dd>
              {s.entries} {single ? '個' : '筆'}
            </dd>
          </div>
          <div>
            <dt>總組數</dt>
            <dd>{s.sets} 組</dd>
          </div>
          <div>
            <dt>總容量</dt>
            <dd>{s.volume ? `${fmtN(s.volume)} kg` : '—'}</dd>
          </div>
          <div>
            <dt>部位</dt>
            <dd>
              {s.groups.length ? (
                <span className="gchips">
                  {s.groups.map((g) => (
                    <span key={g}>
                      <i className="gdot" style={{ ['--c' as string]: gColor(g) }} />
                      {g}
                    </span>
                  ))}
                </span>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt>身心狀態</dt>
            <dd>{s.conditions.length ? s.conditions.join('；') : '正常'}</dd>
          </div>
        </dl>
        {s.groups.length > 0 && (
          <div className="rail-sec">
            <div className="rail-sub">部位分布（組數）</div>
            <div className="dist">
              {s.groups.map((g) => (
                <div className="dist-row" key={g}>
                  <span>{g}</span>
                  <span className="dist-bar">
                    <i
                      style={{
                        ['--c' as string]: gColor(g),
                        width: `${((s.setsByGroup[g] ?? 0) / mx) * 100}%`,
                      }}
                    />
                  </span>
                  <span className="n">{s.setsByGroup[g]}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {s.entries > 0 && (
          <div className="rail-sec">
            <div className="rail-sub">力竭分布</div>
            <div className="exh-list">
              {EXHAUSTION_ORDER.filter((k) => s.exhaustion[k]).map((k) => (
                <span key={k} className={clsx('badge', k === '—' ? 'tone-mute' : exhTone(k))}>
                  <i />
                  {k === '—' ? '未標示' : k}
                  <b>{s.exhaustion[k]}</b>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>
      <RailVideos date={date} range={range} />
      {jr && (
        <section className="panel">
          <div className="panel-head">
            <span className="panel-title">當日日誌</span>
            <a className="link" style={{ fontSize: 12.5 }} onClick={onOpenRaw}>
              在分頁中開啟
            </a>
          </div>
          <div className="rail-journal">{stripJournalHeading(jr)}</div>
        </section>
      )}
    </aside>
  );
}

export function DayPage() {
  const ds = useDs();
  const { date } = dayRoute.useParams();
  const search = dayRoute.useSearch();
  const navigate = useNavigate({ from: '/days/$date' });
  const range = search.range ?? 0;
  const groupBy = search.groupBy ?? 'exercise';
  const sortBy = search.sortBy ?? 'date-desc';
  const tab: DayTab = search.ex ? 'range' : (search.tab ?? 'range');
  const drillEx = search.ex ? ds.exerciseById.get(search.ex) : undefined;
  const cmp = search.cmp ?? addDays(date, -7);

  // 範圍、分組、分頁等用 replace；換日期與下鑽用 push（瀏覽器返回鍵可回上一步）
  const setSearch = (patch: Partial<DaySearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const openDay = (d: DateStr) =>
    void navigate({
      to: '/days/$date',
      params: { date: d },
      search: (prev) => ({ groupBy: prev.groupBy, sortBy: prev.sortBy }),
    });
  const drill = (exId: string, at: DateStr) =>
    void navigate({
      search: (prev) => ({
        ...prev,
        tab: undefined,
        ex: exId,
        ...(at !== date ? { at } : { at: undefined }),
      }),
    });
  // 點動作列：右側滑出該動作的歷史紀錄（不換頁）；側欄內「完整歷程」才下鑽
  const [peek, setPeek] = useState<Entry>();
  const peekEx = peek ? ds.exerciseById.get(peek.exerciseId) : undefined;
  const [prevKey, setPrevKey] = useState(`${date}|${range}|${tab}|${search.ex ?? ''}`);
  const key = `${date}|${range}|${tab}|${search.ex ?? ''}`;
  if (key !== prevKey) {
    setPrevKey(key);
    setPeek(undefined);
  }
  const goBack = () => void navigate({ search: (prev) => ({ ...prev, ex: undefined, at: undefined }) });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [date, search.ex]);

  const base: Crumb[] = [
    { label: 'TrainLog', to: '/' },
    { label: '訓練紀錄', to: '/days/$date', params: { date } },
  ];
  let title: string;
  let sub: string;
  let crumbs: Crumb[];
  if (drillEx) {
    title = drillEx.name;
    sub = `${drillEx.group} · ${ds.entriesByExercise.get(drillEx.id)?.length ?? 0} 筆紀錄 · 從 ${slash(date)} 進入`;
    crumbs = [...base, { label: md(date), to: '/days/$date', params: { date } }, { label: drillEx.name }];
  } else if (range > 0) {
    const k = rangeDates(date, range).filter((d) => ds.entriesByDate.has(d)).length;
    title = `${slash(addDays(date, -range))} – ${slash(addDays(date, range))}`;
    sub = `${range * 2 + 1} 天 · ${k} 個訓練日 · 以 ${md(date)} 為中心`;
    crumbs = [...base, { label: `${md(date)} ±${range} 天` }];
  } else {
    const n = ds.entriesByDate.get(date)?.length ?? 0;
    title = longDate(date);
    sub = `星期${dowOf(date)} · ${n ? `${n} 個動作 · ${dayGroups(ds, date).join('、')}` : '沒有訓練紀錄'}`;
    crumbs = [...base, { label: slash(date) }];
  }
  useCrumbs(crumbs);

  const p = prevTrainingDate(ds, date);
  const n = nextTrainingDate(ds, date);
  const first = ds.trainingDates[0];
  const last = ds.trainingDates[ds.trainingDates.length - 1];

  return (
    <section className="view active">
      <PageHead
        title={title}
        sub={sub}
        actions={
          <>
            {drillEx && (
              <button className="btn" onClick={goBack}>
                <Icon name="back" />
                返回 {md(date)}
              </button>
            )}
            {!drillEx && range === 0 && <DayVideoButton date={date} variant="head" />}
            <div className="btn-group">
              <button
                className="btn btn-icon"
                disabled={!p}
                onClick={() => p && openDay(p)}
                title={p ? `上一個訓練日 ${md(p)}` : undefined}
                aria-label="上一個訓練日"
              >
                <Icon name="left" />
              </button>
              <button
                className="btn btn-icon"
                disabled={!n}
                onClick={() => n && openDay(n)}
                title={n ? `下一個訓練日 ${md(n)}` : undefined}
                aria-label="下一個訓練日"
              >
                <Icon name="right" />
              </button>
            </div>
            <input
              type="date"
              className="date-input"
              value={date}
              min={first}
              max={last}
              onChange={(e) => e.target.value && openDay(e.target.value)}
              aria-label="跳到日期"
            />
          </>
        }
      />
      <div className="day-layout">
        <div className="day-shell">
          <div className="modal-tabs" role="tablist">
            {TABS.map(([k, l, ic]) => (
              <button
                key={k}
                className={clsx('modal-tab', tab === k && 'active')}
                role="tab"
                aria-selected={tab === k}
                onClick={() =>
                  void navigate({
                    search: (prev) => ({
                      ...prev,
                      ex: undefined,
                      at: undefined,
                      tab: k === 'range' ? undefined : k,
                    }),
                    replace: true,
                  })
                }
              >
                <Icon name={ic} />
                {l}
              </button>
            ))}
          </div>
          {tab === 'range' && !drillEx && (
            <div className="modal-range-bar">
              <Seg
                label="日期範圍"
                value={range}
                options={RANGES}
                onChange={(v) => setSearch({ range: v === 0 ? undefined : (v as Range) })}
              />
              <div className="list-ctrl">
                <label className="field">
                  分組
                  <select
                    className="select"
                    value={groupBy}
                    onChange={(e) =>
                      setSearch({
                        groupBy: e.target.value === 'exercise' ? undefined : (e.target.value as RangeGroupBy),
                      })
                    }
                  >
                    <option value="exercise">依動作</option>
                    <option value="date">依日期</option>
                    <option value="group">依部位</option>
                  </select>
                </label>
                <label className="field">
                  排序
                  <select
                    className="select"
                    value={sortBy}
                    onChange={(e) =>
                      setSearch({
                        sortBy: e.target.value === 'date-desc' ? undefined : (e.target.value as RangeSortKey),
                      })
                    }
                  >
                    <option value="date-desc">時間：新到舊</option>
                    <option value="date-asc">時間：舊到新</option>
                    <option value="vol-desc">容量：高到低</option>
                    <option value="wt-desc">重量：高到低</option>
                    <option value="name">名稱</option>
                  </select>
                </label>
              </div>
            </div>
          )}
          <div className="modal-content">
            {tab === 'range' && (
              <div className="modal-panel active">
                {search.ex ? (
                  drillEx ? (
                    <div className="drill">
                      <RecordPanel
                        key={drillEx.id}
                        ex={drillEx}
                        initialTab="hist"
                        focus={search.at ?? date}
                        inDay
                      />
                    </div>
                  ) : (
                    <Empty title="找不到這個動作" />
                  )
                ) : (
                  <RangePanel
                    date={date}
                    range={range}
                    groupBy={groupBy}
                    sortBy={sortBy}
                    peekId={peek?.id}
                    onDrill={setPeek}
                    onOpenDay={openDay}
                  />
                )}
              </div>
            )}
            {tab === 'compare' && (
              <div className="modal-panel active">
                <ComparePanel
                  date={date}
                  cmp={cmp}
                  onCommit={(b) => setSearch({ cmp: b === addDays(date, -7) ? undefined : b })}
                  onDrill={drill}
                />
              </div>
            )}
            {tab === 'raw' && (
              <div className="modal-panel active">
                <RawPanel date={date} range={range} />
              </div>
            )}
          </div>
        </div>
        <DayRail
          date={date}
          range={range}
          onOpenRaw={() => setSearch({ tab: 'raw', ex: undefined, at: undefined })}
        />
      </div>
      {peek && peekEx && (
        <HistorySheet
          ex={peekEx}
          focus={peek.date}
          onClose={() => setPeek(undefined)}
          onOpenFull={() => drill(peek.exerciseId, peek.date)}
        />
      )}
    </section>
  );
}
