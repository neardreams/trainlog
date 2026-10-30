// 訓練紀錄（v14）：物件標頭（日期塊、影片、上一個／下一個訓練日、屬性列、分頁）、當天影片面板、
// 訓練整理（每個動作一張明細卡）、日期比較（多天並排）、原始日誌、右側當日日誌（≥1600）、動作下鑽
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Navigate, useNavigate } from '@tanstack/react-router';
import {
  EXHAUSTION_ORDER,
  calcVolume,
  compareColumns,
  dayEntries,
  dowOf,
  entryNo,
  entryPr,
  entryVideo,
  exerciseOf,
  exercisesOnDates,
  fmtN,
  getMaxWeight,
  groupRangeEntries,
  isCardio,
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
  topSetIndex,
  trainingDayNo,
  type DateStr,
  type Entry,
  type Exercise,
  type RangeGroup,
  type RangeGroupBy,
  type RangeSortKey,
} from '@trainlog/core';
import { HistorySheet, PEEK_ATTR } from '@/components/HistorySheet';
import { AttrNum, ObjDate, ObjectHeader, ObjIcon, OTab, type Attr } from '@/components/ObjectHeader';
import { RecordPanel } from '@/components/RecordPanel';
import { Empty, ExhBadge, Panel, PartTile, Seg, Sets } from '@/components/ui';
import {
  DayVideoAction,
  DayVideoButton,
  DayVideoPanel,
  DayVideoTag,
  EntryVideoBadge,
  EntryVideoButton,
  EntryVideoTile,
  ExerciseVideosButton,
} from '@/components/VideoLinks';
import { gColor, PART_CHAR, PART_DARK, useCrumbs, type Crumb } from '@/lib/chrome';
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
  [3, '±3'],
  [7, '±7'],
  [14, '±14'],
  [30, '±30 天'],
];
const pad2 = (n: number) => String(n).padStart(2, '0');

/** 力竭標籤（屬性列）：依程度、附筆數 */
function ExhTags({ counts }: { counts: Record<string, number> }) {
  return (
    <div className="tags">
      {EXHAUSTION_ORDER.filter((k) => counts[k]).map((k) => (
        <ExhBadge key={k} value={k} count={counts[k]} />
      ))}
    </div>
  );
}

/** 一個動作的明細卡：序號格（部位色）、名稱＋影片段數、統計、組數格、感受／力竭／提示、影片縮圖 */
function LineItem({
  e,
  ix,
  showDate,
  peeked,
  onPeek,
}: {
  e: Entry;
  ix: number;
  showDate: boolean;
  peeked: boolean;
  onPeek: (e: Entry) => void;
}) {
  const ds = useDs();
  const ex = exerciseOf(ds, e);
  const pr = entryPr(ds, e);
  const max = getMaxWeight(e.sets);
  const vol = calcVolume(e.sets);
  const stats = isCardio(ex) ? (
    <>
      {e.minutes != null && (
        <span>
          時間<b>{fmtN(e.minutes)}</b>分
        </span>
      )}
      {e.distanceKm != null && (
        <span>
          距離<b>{fmtN(e.distanceKm)}</b>km
        </span>
      )}
    </>
  ) : (
    <>
      {max != null && (
        <span>
          最高<b>{fmtN(max)}</b>kg
        </span>
      )}
      {vol != null && (
        <span>
          容量<b>{fmtN(vol)}</b>kg
        </span>
      )}
    </>
  );
  const hasStats = isCardio(ex) ? e.minutes != null || e.distanceKm != null : max != null || vol != null;
  const notes = [
    e.feel && (
      <>
        <dt>感受</dt>
        <dd>{e.feel}</dd>
      </>
    ),
    e.exhaustion && e.exhaustion !== '—' && (
      <>
        <dt>力竭</dt>
        <dd>
          <ExhBadge value={e.exhaustion} />
        </dd>
      </>
    ),
    e.condition && e.condition !== '正常' && (
      <>
        <dt>身心狀態</dt>
        <dd>{e.condition}</dd>
      </>
    ),
    e.cue && (
      <>
        <dt>動作提示</dt>
        <dd>
          <div className="cue">{e.cue}</div>
        </dd>
      </>
    ),
  ].filter(Boolean);
  const peek = () => onPeek(e);
  return (
    <article className={clsx('li', peeked && 'on')} {...{ [PEEK_ATTR]: '' }}>
      <header className="li-h">
        <span
          className={clsx('ix', PART_DARK.has(ex.group) && 'dk')}
          style={{ ['--g' as string]: gColor(ex.group) }}
          data-tip={ex.group}
        >
          <b>{pad2(ix)}</b>
          <small>{PART_CHAR[ex.group] ?? ex.group.slice(0, 1)}</small>
        </span>
        <div className="li-t">
          <h3
            role="button"
            tabIndex={0}
            onClick={peek}
            onKeyDown={(k) => k.key === 'Enter' && peek()}
            data-tip="看這個動作的歷史紀錄"
          >
            {ex.name}
          </h3>
          <EntryVideoBadge entry={e} />
          <span className="m">
            {ex.group} · 第 {entryNo(ds, e)} 次{showDate && ` · ${md(e.date)} 週${dowOf(e.date)}`}
          </span>
          {pr && (
            <span className="bdg ok" data-tip={`原紀錄 ${fmtN(pr.from)} kg`}>
              <Icon name="trophy" />
              破紀錄 +{fmtN(pr.to - pr.from)} kg
            </span>
          )}
        </div>
        <span className="sp" />
        {hasStats && <div className="li-kv">{stats}</div>}
        <div className="li-a">
          <ExerciseVideosButton exerciseId={ex.id} variant="alt" />
          <button
            type="button"
            className={clsx('btn sm', peeked && 'on')}
            aria-pressed={peeked}
            onClick={peek}
            data-tip={`「${ex.name}」的歷史紀錄`}
          >
            <Icon name="history" />
            歷史
          </button>
        </div>
      </header>
      <div className="li-b">
        <div className="li-sets">
          <Sets entry={e} ex={ex} />
        </div>
        <dl className="dl">
          {notes.length ? (
            notes.map((n, i) => <Frag key={i}>{n}</Frag>)
          ) : (
            <>
              <dt>備註</dt>
              <dd className="na">—</dd>
            </>
          )}
        </dl>
        <div className="li-v">
          <EntryVideoTile entry={e} />
        </div>
      </div>
    </article>
  );
}
const Frag = ({ children }: { children: React.ReactNode }) => <>{children}</>;

/** 分組標頭（日期範圍或依日期／部位分組時） */
function GroupHead({ g, closed, onToggle }: { g: RangeGroup; closed: boolean; onToggle: () => void }) {
  const ds = useDs();
  const ex = g.kind === 'exercise' ? ds.exerciseById.get(g.id) : undefined;
  const color =
    g.kind === 'exercise' ? gColor(ex?.group ?? '') : g.kind === 'group' ? gColor(g.id) : 'var(--ink)';
  return (
    <div
      className={clsx('lgrp', closed && 'closed')}
      style={{ ['--g' as string]: color }}
      role="button"
      tabIndex={0}
      aria-expanded={!closed}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <span className="chev">
        <Icon name="down" />
      </span>
      {g.kind === 'exercise' && ex && <PartTile group={ex.group} />}
      {g.kind === 'group' && <PartTile group={g.id} />}
      <b>{g.kind === 'exercise' ? ex?.name : g.kind === 'date' ? `${md(g.id)} 週${dowOf(g.id)}` : g.id}</b>
      <span className="cnt">{g.entries.length}</span>
      {g.kind === 'date' && <DayVideoButton date={g.id} variant="icon" />}
      <span className="m">
        {g.maxWeight > 0 && (
          <>
            最高 <b>{fmtN(g.maxWeight)}</b> kg
          </>
        )}
        {g.maxWeight > 0 && g.volume > 0 && ' · '}
        {g.volume > 0 && (
          <>
            容量 <b>{fmtN(g.volume)}</b> kg
          </>
        )}
      </span>
    </div>
  );
}

function RangeList({
  date,
  range,
  groupBy,
  sortBy,
  peekId,
  onPeek,
}: {
  date: DateStr;
  range: number;
  groupBy: RangeGroupBy;
  sortBy: RangeSortKey;
  peekId: string | undefined;
  onPeek: (e: Entry) => void;
}) {
  const ds = useDs();
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const groups = useMemo(
    () => groupRangeEntries(ds, rangeEntries(ds, date, range, sortBy), groupBy, sortBy),
    [ds, date, range, groupBy, sortBy],
  );
  if (!groups.length)
    return (
      <section className="pn">
        <Empty title={range ? '這個範圍內沒有訓練紀錄' : '這天沒有訓練紀錄'}>
          可以放大日期範圍，或從左側月曆選其他日子。
        </Empty>
      </section>
    );
  // 單日依動作：每組只有一筆，直接列明細卡，不需要分組標頭
  const flat = range === 0 && groupBy === 'exercise';
  // 每組第一筆的編號（收合的組也照算，編號不跳）
  const starts = groups.map((_, i) => groups.slice(0, i).reduce((n, x) => n + x.entries.length, 0));
  return (
    <div className="day-list">
      {groups.map((g, gi) => {
        const c = closed.has(g.key);
        const items = c
          ? null
          : g.entries.map((e, j) => (
              <LineItem
                key={e.id}
                e={e}
                ix={(starts[gi] ?? 0) + j + 1}
                showDate={range > 0 && g.kind !== 'date'}
                peeked={e.id === peekId}
                onPeek={onPeek}
              />
            ));
        if (flat) return items;
        return (
          <div className="day-grp" key={g.key}>
            <GroupHead
              g={g}
              closed={c}
              onToggle={() =>
                setClosed((s) => {
                  const n = new Set(s);
                  if (n.has(g.key)) n.delete(g.key);
                  else n.add(g.key);
                  return n;
                })
              }
            />
            {items}
          </div>
        );
      })}
    </div>
  );
}

/** 日期比較的一格：最重那一組「重量 × 次數 / 組數」＋這天這個動作的影片 */
function CmpCell({ e, ex }: { e: Entry; ex: Exercise }) {
  const ds = useDs();
  let body: React.ReactNode;
  if (e.setsDisplay)
    body = (
      <span className="mono cmp-txt" data-tip={e.setsDisplay}>
        {e.setsDisplay}
      </span>
    );
  else if (isCardio(ex))
    body = (
      <span className="mono">
        {[e.minutes != null && `${fmtN(e.minutes)} 分`, e.distanceKm != null && `${fmtN(e.distanceKm)} km`]
          .filter(Boolean)
          .join(' · ') || '有做'}
      </span>
    );
  else {
    const i = topSetIndex(e.sets);
    const s = i >= 0 ? e.sets[i] : e.sets[0];
    body = !s ? (
      <span className="mono" style={{ color: 'var(--text-3)' }}>
        有做
      </span>
    ) : (
      <span className="mono">
        <b>{s.weightKg === 0 && ex.zeroLabel ? ex.zeroLabel : s.weightKg == null ? '—' : fmtN(s.weightKg)}</b>
        {s.weightKg != null && s.weightKg > 0 && <small>kg</small>} × {s.reps ?? '？'}
        {ex.repUnit && <small>{ex.repUnit}</small>}{' '}
        <span style={{ color: 'var(--text-3)' }}>/ {e.sets.length} 組</span>
      </span>
    );
  }
  return (
    <span className="cmpc">
      {body}
      {entryVideo(ds, e) && <EntryVideoButton entry={e} xs />}
    </span>
  );
}

function ComparePanel({
  date,
  range,
  onDrill,
}: {
  date: DateStr;
  range: number;
  onDrill: (id: string, d: DateStr) => void;
}) {
  const ds = useDs();
  const cols = useMemo(() => compareColumns(ds, date, range), [ds, date, range]);
  const ids = useMemo(() => exercisesOnDates(ds, cols), [ds, cols]);
  const cell = (d: DateStr, id: string) => dayEntries(ds, d).find((e) => e.exerciseId === id);
  if (!ids.length)
    return <Empty title="這幾天沒有訓練紀錄">可以放大日期範圍，或從左側月曆選其他日子。</Empty>;
  return (
    <div className="cmp-wrap">
      <table className="dg cmp">
        <thead>
          <tr>
            <th>動作</th>
            {cols.map((d) => (
              <th key={d} className={clsx(d === date && 'on')}>
                <span className="cmph">
                  <span>
                    <span className="mono">{md(d)}</span> 週{dowOf(d)}
                  </span>
                  <DayVideoButton date={d} variant="icon" />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const ex = ds.exerciseById.get(id);
            if (!ex) return null;
            return (
              <tr key={id}>
                <td>
                  <button
                    type="button"
                    className="cn cmp-name"
                    onClick={() => onDrill(id, date)}
                    data-tip="看這個動作的完整歷程"
                  >
                    <PartTile group={ex.group} />
                    <span>{ex.name}</span>
                  </button>
                </td>
                {cols.map((d) => {
                  const e = cell(d, id);
                  return (
                    <td key={d} className={clsx(d === date && 'on')}>
                      {e ? <CmpCell e={e} ex={ex} /> : <span className="e mono">—</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RawPanels({ date, range }: { date: DateStr; range: number }) {
  const ds = useDs();
  const dates = rangeDates(date, range)
    .filter((d) => ds.journals.has(d))
    .sort((x, y) => y.localeCompare(x));
  if (!dates.length)
    return (
      <section className="pn">
        <Empty title={range ? '這個範圍內沒有日誌' : '這天沒有日誌'} />
      </section>
    );
  return (
    <div className="day-list">
      {dates.map((d) => {
        const text = stripJournalHeading(ds.journals.get(d) ?? '');
        return (
          <Panel
            key={d}
            title={range ? `${longDate(d)}（週${dowOf(d)}）` : '原始日誌'}
            meta={`${text.length} 字`}
            right={<DayVideoButton date={d} variant="label" />}
          >
            <div className="pn-b journal-b">
              <div className="journal">{text}</div>
            </div>
          </Panel>
        );
      })}
    </div>
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

  // 範圍、分組、分頁等用 replace；換日期與下鑽用 push（瀏覽器返回鍵可回上一步）
  const setSearch = (patch: Partial<DaySearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  const openDay = (d: DateStr) =>
    void navigate({
      to: '/days/$date',
      params: { date: d },
      search: (prev) => ({ groupBy: prev.groupBy, sortBy: prev.sortBy, tab: prev.tab, range: prev.range }),
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
  // 點「歷史」：右側滑出該動作的歷史紀錄（不換頁）；側欄內「完整歷程」才下鑽
  const [peek, setPeek] = useState<Entry>();
  const peekEx = peek ? ds.exerciseById.get(peek.exerciseId) : undefined;
  const key = `${date}|${range}|${tab}|${search.ex ?? ''}`;
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setPeek(undefined);
  }
  const goBack = () => void navigate({ search: (prev) => ({ ...prev, ex: undefined, at: undefined }) });
  const setTab = (k: DayTab) =>
    void navigate({
      search: (prev) => ({ ...prev, ex: undefined, at: undefined, tab: k === 'range' ? undefined : k }),
      replace: true,
    });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [date, search.ex]);

  const s = useMemo(() => rangeStats(ds, date, range), [ds, date, range]);
  const dates = rangeDates(date, range);
  const base: Crumb[] = [
    { label: '首頁', to: '/' },
    { label: '訓練紀錄', to: '/days/$date', params: { date } },
  ];
  let crumbs: Crumb[];
  let title: string;
  if (drillEx) {
    title = drillEx.name;
    crumbs = [...base, { label: md(date), to: '/days/$date', params: { date } }, { label: drillEx.name }];
  } else if (range > 0) {
    title = `${slash(dates[0] ?? date)} – ${md(dates[dates.length - 1] ?? date)}`;
    crumbs = [...base, { label: `${md(date)} ±${range} 天` }];
  } else {
    title = `${slash(date)}（週${dowOf(date)}）`;
    crumbs = [...base, { label: slash(date) }];
  }
  useCrumbs(crumbs);

  const p = prevTrainingDate(ds, date);
  const n = nextTrainingDate(ds, date);
  const nth = trainingDayNo(ds, date);
  const journal = range === 0 ? ds.journals.get(date) : undefined;
  const totalSets = Math.max(1, s.sets);

  const attrs: Attr[] | undefined = drillEx
    ? undefined
    : [
        ...(range > 0
          ? [{ label: '訓練日', value: <AttrNum v={s.trainingDays} u={`/ ${dates.length} 天`} /> }]
          : []),
        { label: '動作', value: <AttrNum v={s.entries} u={range > 0 ? '筆' : '個'} /> },
        { label: '組數', value: <AttrNum v={s.sets} u="組" /> },
        {
          label: '容量',
          value: <AttrNum v={s.volume ? fmtN(s.volume) : '—'} u={s.volume ? 'kg' : undefined} />,
        },
        ...(s.groups.length
          ? [
              {
                label: '部位',
                wide: true,
                value: (
                  <>
                    <div className="stk">
                      {s.groups.map((g) => (
                        <i
                          key={g}
                          style={{ flex: s.setsByGroup[g], background: gColor(g) }}
                          data-tip={`${g} ${s.setsByGroup[g]} 組（${Math.round(((s.setsByGroup[g] ?? 0) / totalSets) * 100)}%）`}
                        />
                      ))}
                    </div>
                    <div className="lg">
                      {s.groups.map((g) => (
                        <span key={g}>
                          <i style={{ background: gColor(g) }} />
                          {g}
                          <b>{s.setsByGroup[g]}</b>
                        </span>
                      ))}
                    </div>
                  </>
                ),
              },
            ]
          : []),
        ...(s.entries ? [{ label: '力竭', wide: true, value: <ExhTags counts={s.exhaustion} /> }] : []),
        {
          label: '身心狀態',
          wide: true,
          value: <div className="t">{s.conditions.length ? s.conditions.join('、') : '正常'}</div>,
        },
      ];

  const dnav = (
    <div className="dnav">
      <button
        type="button"
        disabled={!p}
        onClick={() => p && openDay(p)}
        data-tip={p ? `上一個訓練日 ${md(p)}` : '沒有更早的訓練日'}
        aria-label="上一個訓練日"
      >
        <Icon name="left" />
      </button>
      <label className="d" data-tip="跳到日期">
        <Icon name="calendar" />
        {slash(date)}
        <input
          type="date"
          value={date}
          min={ds.trainingDates[0]}
          max={ds.trainingDates[ds.trainingDates.length - 1]}
          onClick={(e) => e.currentTarget.showPicker?.()}
          onChange={(e) => e.target.value && openDay(e.target.value)}
          aria-label="跳到日期"
        />
      </label>
      <button
        type="button"
        disabled={!n}
        onClick={() => n && openDay(n)}
        data-tip={n ? `下一個訓練日 ${md(n)}` : '沒有更晚的訓練日'}
        aria-label="下一個訓練日"
      >
        <Icon name="right" />
      </button>
    </div>
  );

  return (
    <>
      <ObjectHeader
        av={
          drillEx ? (
            <ObjIcon name="history" />
          ) : range > 0 ? (
            <ObjIcon name="calendar" />
          ) : (
            <ObjDate date={date} />
          )
        }
        title={title}
        tags={
          drillEx ? (
            <span className="tag">{drillEx.group}</span>
          ) : range > 0 ? (
            <span className="tag">以 {md(date)} 為中心</span>
          ) : (
            <>
              {nth != null && <span className="tag">第 {nth} 個訓練日</span>}
              <DayVideoTag date={date} />
            </>
          )
        }
        actions={
          <>
            {drillEx ? (
              <button type="button" className="btn" onClick={goBack}>
                <Icon name="back" />
                返回 {md(date)}
              </button>
            ) : (
              range === 0 && <DayVideoAction date={date} />
            )}
            {dnav}
            <button type="button" className="btn" onClick={() => openDay(TODAY)}>
              今天
            </button>
          </>
        }
        attrs={attrs}
        tabs={
          <>
            <OTab on={tab === 'range'} icon="chart" count={s.entries} onClick={() => setTab('range')}>
              訓練整理
            </OTab>
            <OTab on={tab === 'compare'} icon="compare" onClick={() => setTab('compare')}>
              日期比較
            </OTab>
            <OTab on={tab === 'raw'} icon="doc" onClick={() => setTab('raw')}>
              原始日誌
            </OTab>
          </>
        }
      />
      <div className="content">
        <div className={clsx('day-grid', journal && !drillEx && 'has-aside')}>
          <div>
            {!drillEx && <DayVideoPanel date={date} range={range} />}
            {tab === 'range' &&
              (search.ex ? (
                drillEx ? (
                  <RecordPanel
                    key={drillEx.id}
                    ex={drillEx}
                    initialTab="hist"
                    focus={search.at ?? date}
                    inDay
                  />
                ) : (
                  <section className="pn">
                    <Empty title="找不到這個動作" />
                  </section>
                )
              ) : (
                <>
                  <section className="pn day-cmd">
                    <div className="cmd">
                      <Seg
                        label="日期範圍"
                        value={range}
                        options={RANGES}
                        onChange={(v) => setSearch({ range: v === 0 ? undefined : (v as Range) })}
                      />
                      <span className="vr" />
                      <label className="sel">
                        <em>分組</em>
                        <select
                          value={groupBy}
                          onChange={(e) =>
                            setSearch({
                              groupBy:
                                e.target.value === 'exercise' ? undefined : (e.target.value as RangeGroupBy),
                            })
                          }
                        >
                          <option value="exercise">依動作</option>
                          <option value="date">依日期</option>
                          <option value="group">依部位</option>
                        </select>
                        <Icon name="down" />
                      </label>
                      <label className="sel">
                        <em>排序</em>
                        <select
                          value={sortBy}
                          onChange={(e) =>
                            setSearch({
                              sortBy:
                                e.target.value === 'date-desc' ? undefined : (e.target.value as RangeSortKey),
                            })
                          }
                        >
                          <option value="date-desc">新到舊</option>
                          <option value="date-asc">舊到新</option>
                          <option value="vol-desc">容量高到低</option>
                          <option value="wt-desc">重量高到低</option>
                          <option value="name">名稱</option>
                        </select>
                        <Icon name="down" />
                      </label>
                      <span className="sp" />
                      <span className="m">
                        <b>{s.entries}</b> {range ? '筆' : '個動作'} · <b>{s.sets}</b> 組 · 有影片{' '}
                        <b>
                          {dates.flatMap((d) => dayEntries(ds, d)).filter((e) => entryVideo(ds, e)).length}
                        </b>{' '}
                        {range ? '筆' : '個'}
                      </span>
                    </div>
                  </section>
                  <RangeList
                    date={date}
                    range={range}
                    groupBy={groupBy}
                    sortBy={sortBy}
                    peekId={peek?.id}
                    onPeek={setPeek}
                  />
                </>
              ))}
            {tab === 'compare' && (
              <section className="pn">
                <div className="cmd">
                  <Seg
                    label="日期範圍"
                    value={range}
                    options={RANGES}
                    onChange={(v) => setSearch({ range: v === 0 ? undefined : (v as Range) })}
                  />
                  <span className="sp" />
                  <span className="m">
                    {range ? '範圍內的訓練日並排' : '前 3 個訓練日、這天、後 1 個訓練日並排'} · 這天以主色標示
                    · 點動作看完整歷程
                  </span>
                </div>
                <ComparePanel date={date} range={range} onDrill={drill} />
              </section>
            )}
            {tab === 'raw' && <RawPanels date={date} range={range} />}
          </div>
          {journal && !drillEx && (
            <aside className="aside">
              <Panel
                title="當日日誌"
                meta={`${stripJournalHeading(journal).length} 字`}
                right={
                  <button type="button" className="lk" onClick={() => setTab('raw')}>
                    分頁開啟
                    <Icon name="arrow" />
                  </button>
                }
              >
                <div className="pn-b">
                  <div className="journal">{stripJournalHeading(journal)}</div>
                </div>
              </Panel>
            </aside>
          )}
        </div>
      </div>
      {peek && peekEx && (
        <HistorySheet
          ex={peekEx}
          focus={peek.date}
          onClose={() => setPeek(undefined)}
          onOpenFull={() => drill(peek.exerciseId, peek.date)}
        />
      )}
    </>
  );
}
