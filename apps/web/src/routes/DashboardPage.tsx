// 總覽（v14）：物件標頭（統計期間）、5 張指標磚、每週訓練量、部位分布、最近訓練、最近破紀錄、全年熱度、久未練動作、力竭分布
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  EXHAUSTION_ORDER,
  addDays,
  dashboardStats,
  dayEntries,
  dayGroups,
  daySets,
  dayVol,
  daysAgo,
  daysLabel,
  deltaOf,
  dowOf,
  entriesOf,
  fmtN,
  inRange,
  lastDate,
  md,
  prEvents,
  slash,
  weekSeries,
  type Period,
  type WeekStat,
} from '@trainlog/core';
import { Heatmap, KpiSpark, WeekChart, type WeekMetric } from '@/components/charts';
import { ObjectHeader, ObjIcon } from '@/components/ObjectHeader';
import { Delta, Panel, PartTile, PartTiles, Seg, Status } from '@/components/ui';
import { DayVideoButton, ExerciseVideosButton, TopSetButton } from '@/components/VideoLinks';
import { gColor, useCrumbs } from '@/lib/chrome';
import { Icon } from '@/lib/icons';
import { useCountUp, useEnter } from '@/lib/motion';
import { TODAY } from '@/lib/today';
import { useDs } from '@/lib/useDs';
import { dashboardRoute } from '@/router';

/** 力竭分布的顏色類名 */
const EXC: Record<string, string> = {
  輕鬆: 'x-light',
  普通: 'x-norm',
  吃力: 'x-hard',
  力竭: 'x-fail',
  '—': 'x-none',
};

function KpiTile({
  hero,
  label,
  tag,
  value,
  dp = 0,
  unit,
  spark,
  streak,
  foot,
  onOpen,
}: {
  hero?: boolean;
  label: string;
  tag: string;
  value: number;
  dp?: number;
  unit: string;
  spark: number[];
  streak?: boolean;
  foot: React.ReactNode;
  onOpen: () => void;
}) {
  const shown = useCountUp(value, dp);
  return (
    <div
      className={clsx('kpi', hero && 'hero')}
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
    >
      <div className="kpi-h">
        <span>{label}</span>
        <em>{tag}</em>
      </div>
      <div className="kpi-m">
        <div className="kpi-v" aria-label={`${fmtN(value, dp)} ${unit}`}>
          {shown}
          <span className="u">{unit}</span>
        </div>
        <KpiSpark values={spark} unit={unit} streak={streak} />
      </div>
      <div className="kpi-f">{foot}</div>
    </div>
  );
}

export function DashboardPage() {
  const ds = useDs();
  const navigate = useNavigate();
  const enter = useEnter();
  const { period = 30 } = dashboardRoute.useSearch();
  const P = period as Period;
  const per = `近 ${P} 天`;
  const [metric, setMetric] = useState<WeekMetric>('vol');
  const s = useMemo(() => dashboardStats(ds, TODAY, P), [ds, P]);
  const weeks = useMemo(() => weekSeries(ds, TODAY, 26), [ds]);
  // 最近破紀錄不限期間（與 v9 相同）
  const allPrs = useMemo(() => prEvents(ds), [ds]);
  useCrumbs([{ label: '首頁', to: '/' }, { label: '總覽' }]);

  const dataLast = ds.trainingDates[ds.trainingDates.length - 1];
  const last = ds.trainingDates.filter((d) => d <= TODAY).pop();
  const yr = TODAY.slice(0, 4);
  const ys = ds.trainingDates.filter((d) => d.startsWith(`${yr}-`) && d <= TODAY);
  const ysVideo = ys.filter((d) => ds.videosByDate.has(d)).length;
  const openDay = (d: string) => void navigate({ to: '/days/$date', params: { date: d } });
  const openLatest = () => (last ? openDay(last) : void navigate({ to: '/days' }));
  const openEx = (id: string) => void navigate({ to: '/exercises', search: { ex: id } });
  const openWeek = (w: WeekStat) => {
    const d = ds.trainingDates.filter((x) => inRange(x, w.w, addDays(w.w, 6))).pop();
    if (d) openDay(d);
  };
  const dW = deltaOf(s.wk, s.lwk);
  const dD = deltaOf(s.cur.length, s.prev.length);
  const dV = deltaOf(s.vC, s.vP, true);
  const dP = deltaOf(s.prC.length, s.prP);
  const balTotal = s.bal.reduce((a, b) => a + b.n, 0);
  const balMax = Math.max(1, ...s.bal.map((b) => b.n));
  const staleList = s.neg.slice(0, 7);

  return (
    <>
      <ObjectHeader
        av={<ObjIcon name="grid" />}
        title="訓練總覽"
        tags={
          <span className="tag">
            <i className="sq ok" />
            資料至 {dataLast ? md(dataLast) : '—'}
          </span>
        }
        sub={`${slash(TODAY)} 週${dowOf(TODAY)}${last ? ` · 上次訓練 ${md(last)}（${daysLabel(daysAgo(last, TODAY))}）` : ''}`}
        actions={
          <>
            <span className="lbl">統計期間</span>
            <Seg
              label="統計期間"
              value={P}
              options={[
                [7, '近 7 天'],
                [30, '近 30 天'],
                [90, '近 90 天'],
              ]}
              onChange={(p) => void navigate({ to: '/', search: p === 30 ? {} : { period: p } })}
            />
          </>
        }
      />
      <div className={clsx('content', enter && 'enter')}>
        <div className="kpis">
          <KpiTile
            hero
            label="本週訓練"
            tag="週一至今"
            value={s.wk}
            unit="天"
            spark={s.kspark.days}
            onOpen={openLatest}
            foot={
              <>
                <Delta {...dW} />
                <span>上週同期 {s.lwk} 天</span>
              </>
            }
          />
          <KpiTile
            label="訓練日"
            tag={per}
            value={s.cur.length}
            unit="天"
            spark={s.kspark.days}
            onOpen={openLatest}
            foot={
              <>
                <Delta {...dD} />
                <span>
                  前 {P} 天 {s.prev.length} 天
                </span>
              </>
            }
          />
          <KpiTile
            label="總容量"
            tag={per}
            value={Math.round(s.vC / 100) / 10}
            dp={1}
            unit="噸"
            spark={s.kspark.vol.map((v) => v / 1000)}
            onOpen={openLatest}
            foot={
              <>
                {s.vP ? <Delta {...dV} pct /> : null}
                <span>
                  前 {P} 天 {fmtN(s.vP / 1000)} 噸
                </span>
              </>
            }
          />
          <KpiTile
            label="破紀錄"
            tag={per}
            value={s.prC.length}
            unit="次"
            spark={s.kspark.pr}
            onOpen={() => void navigate({ to: '/exercises', search: { sort: 'progress' } })}
            foot={
              <>
                <Delta {...dP} />
                <span>
                  {s.prC[0]
                    ? `最近 ${ds.exerciseById.get(s.prC[0].exerciseId)?.name ?? ''}`
                    : `前 ${P} 天 ${s.prP} 次`}
                </span>
              </>
            }
          />
          <KpiTile
            label="連續訓練"
            tag="連續"
            value={s.streak}
            unit="週"
            spark={s.kspark.days}
            streak
            onOpen={openLatest}
            foot={<span>每週至少練 1 天</span>}
          />
        </div>

        <div className="grid">
          <Panel
            className="c8"
            title="每週訓練量"
            meta="近 26 週 · 點長條看那一週"
            right={
              <Seg
                label="指標"
                className="sm"
                value={metric}
                options={
                  [
                    ['vol', '容量'],
                    ['days', '天數'],
                    ['sets', '組數'],
                  ] as const
                }
                onChange={setMetric}
              />
            }
          >
            <div className="pn-b">
              <WeekChart weeks={weeks} metric={metric} onOpenWeek={openWeek} />
            </div>
          </Panel>

          <Panel
            className="c4"
            title="部位分布"
            meta={per}
            right={
              <Link className="lk" to="/exercises">
                動作庫
                <Icon name="arrow" />
              </Link>
            }
          >
            <div className="pn-b" style={{ paddingBottom: 10, flex: 'none' }}>
              <div className="ptop">
                <b>{balTotal}</b>
                <span>組 · {s.bal.filter((b) => b.n).length} 個部位</span>
              </div>
              <div className="stk">
                {s.bal
                  .filter((b) => b.n)
                  .map((b) => (
                    <i
                      key={b.g}
                      style={{ flex: b.n, background: gColor(b.g) }}
                      data-tip={`${b.g} ${b.n} 組（${Math.round((b.n / Math.max(1, balTotal)) * 100)}%）`}
                    />
                  ))}
              </div>
            </div>
            <table className="dg sm">
              <thead>
                <tr>
                  <th>部位</th>
                  <th>分布</th>
                  <th className="r">組數</th>
                  <th className="r">距上次</th>
                </tr>
              </thead>
              <tbody>
                {s.bal.map((b) => (
                  <tr key={b.g}>
                    <td>
                      <div className="cn">
                        <PartTile group={b.g} />
                        <span>{b.g}</span>
                      </div>
                    </td>
                    <td className="fill">
                      <div className="bartrack">
                        <i style={{ width: `${(b.n / balMax) * 100}%`, background: gColor(b.g) }} />
                      </div>
                    </td>
                    <td className="r num b">{b.n || '—'}</td>
                    <td className="r num">
                      {b.since == null ? <span className="na">—</span> : <Status days={b.since} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel
            className="c7"
            title="最近訓練"
            meta="點一列看當天"
            right={
              <Link className="lk" to="/days">
                所有紀錄
                <Icon name="arrow" />
              </Link>
            }
          >
            <table className="dg">
              <thead>
                <tr>
                  <th>日期</th>
                  <th className="mh">星期</th>
                  <th>訓練內容</th>
                  <th className="r">組數</th>
                  <th className="r">容量 kg</th>
                  <th className="c mh">影片</th>
                </tr>
              </thead>
              <tbody>
                {s.recent.map((d) => {
                  const es = dayEntries(ds, d);
                  const v = dayVol(ds, d);
                  return (
                    <tr key={d} className="click" onClick={() => openDay(d)}>
                      <td className="num b">{md(d)}</td>
                      <td className="mh mute">週{dowOf(d)}</td>
                      <td className="fill">
                        <div className="cn">
                          <PartTiles groups={dayGroups(ds, d)} />
                          <span>{es.map((e) => ds.exerciseById.get(e.exerciseId)?.name).join('、')}</span>
                        </div>
                      </td>
                      <td className="r num">{daySets(ds, d)}</td>
                      <td className="r num b">{v ? fmtN(v) : <span className="na">—</span>}</td>
                      <td className="mh">
                        <div className="vbc">
                          <DayVideoButton date={d} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>

          <Panel
            className="c5"
            title="最近破紀錄"
            meta="最高重量超越先前"
            right={
              <Link className="lk" to="/exercises" search={{ sort: 'progress' }}>
                動作庫
                <Icon name="arrow" />
              </Link>
            }
          >
            <table className="dg">
              <thead>
                <tr>
                  <th>動作</th>
                  <th className="mh">日期</th>
                  <th className="r">新紀錄</th>
                  <th className="r">增幅</th>
                  <th className="c">影片</th>
                </tr>
              </thead>
              <tbody>
                {allPrs.slice(0, 6).map((p) => {
                  const ex = ds.exerciseById.get(p.exerciseId);
                  if (!ex) return null;
                  const entry = ds.entriesByDate.get(p.date)?.find((e) => e.exerciseId === p.exerciseId);
                  return (
                    <tr key={`${p.exerciseId}${p.date}`} className="click" onClick={() => openEx(ex.id)}>
                      <td className="fill">
                        <div className="cn">
                          <PartTile group={ex.group} />
                          <span>{ex.name}</span>
                        </div>
                      </td>
                      <td className="num mute mh">{md(p.date)}</td>
                      <td className="r num b" data-tip={`原紀錄 ${fmtN(p.from)} kg`}>
                        {fmtN(p.to)}
                        <small>kg</small>
                      </td>
                      <td className="r">
                        <Delta dir="up" value={p.to - p.from} />
                      </td>
                      <td>
                        <div className="vbc">{entry && <TopSetButton entry={entry} />}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>

          <Panel
            className="c12"
            title="訓練熱度"
            meta={`${yr} 年每天的組數 · 點格子看當天`}
            right={
              <div className="leg" aria-hidden>
                <span>少</span>
                <i style={{ background: 'var(--empty)' }} />
                <i className="hc l1" />
                <i className="hc l2" />
                <i className="hc l3" />
                <i className="hc l4" />
                <span>多</span>
                <i className="hc l2 v" style={{ marginLeft: 10 }} />
                <span>有影片</span>
              </div>
            }
            foot={
              <div className="kvs">
                <div>
                  <span>今年訓練日</span>
                  <b>
                    {ys.length}
                    <small>天</small>
                  </b>
                </div>
                <div>
                  <span>平均每週</span>
                  <b>
                    {fmtN(ys.length / s.wks)}
                    <small>天</small>
                  </b>
                </div>
                <div>
                  <span>有影片</span>
                  <b>
                    {ysVideo}
                    <small>天</small>
                  </b>
                </div>
                <div>
                  <span>最長連續</span>
                  <b>
                    {s.best}
                    <small>天</small>
                  </b>
                </div>
                <div>
                  <span>今年總組數</span>
                  <b>
                    {fmtN(ys.reduce((a, d) => a + daySets(ds, d), 0))}
                    <small>組</small>
                  </b>
                </div>
              </div>
            }
          >
            <div className="pn-b">
              <Heatmap today={TODAY} onOpenDay={openDay} />
            </div>
          </Panel>

          <Panel
            className="c8"
            title="久未練動作"
            meta="練過 3 次以上、超過 3 週沒練"
            right={
              <Link className="lk" to="/exercises" search={{ status: 'old' }}>
                在動作庫篩選
                <Icon name="arrow" />
              </Link>
            }
            foot={
              <>
                <span>
                  共 <b>{s.neg.length}</b> 筆，顯示前 <b>{staleList.length}</b> 筆
                </span>
                <span>超過 60 天紅色</span>
              </>
            }
          >
            <table className="dg">
              <thead>
                <tr>
                  <th>動作</th>
                  <th className="mh">部位</th>
                  <th className="r mh">次數</th>
                  <th className="r">上次</th>
                  <th className="r">未練</th>
                  <th className="c">影片</th>
                </tr>
              </thead>
              <tbody>
                {staleList.map((id) => {
                  const ex = ds.exerciseById.get(id);
                  if (!ex) return null;
                  const ld = lastDate(ds, id);
                  const ago = daysAgo(ld, TODAY);
                  return (
                    <tr key={id} className="click" onClick={() => openEx(id)}>
                      <td className="fill">
                        <div className="cn">
                          <PartTile group={ex.group} />
                          <span>{ex.name}</span>
                        </div>
                      </td>
                      <td className="mh mute">{ex.group}</td>
                      <td className="r num mh">{entriesOf(ds, id).length}</td>
                      <td className="r num mute">{md(ld)}</td>
                      <td className="r">
                        <span className={clsx('stale-d', ago > 60 ? 'bad' : 'warn')}>{ago}</span>{' '}
                        <small>天</small>
                      </td>
                      <td>
                        <div className="vbc">
                          <ExerciseVideosButton exerciseId={id} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>

          <Panel
            className="c4"
            title="力竭分布"
            meta={per}
            foot={
              <span>
                合計 <b>{s.exTot}</b> 筆
              </span>
            }
          >
            <div className="pn-b" style={{ flex: 'none', paddingBottom: 12 }}>
              <div className="estk">
                {EXHAUSTION_ORDER.filter((k) => s.ex[k]).map((k) => (
                  <i
                    key={k}
                    className={EXC[k]}
                    style={{ flex: s.ex[k] }}
                    data-tip={`${k === '—' ? '未標示' : k} ${s.ex[k]} 筆（${Math.round(((s.ex[k] ?? 0) / s.exTot) * 100)}%）`}
                  />
                ))}
              </div>
            </div>
            <table className="dg">
              <thead>
                <tr>
                  <th>程度</th>
                  <th className="r">筆數</th>
                  <th className="r">佔比</th>
                </tr>
              </thead>
              <tbody>
                {EXHAUSTION_ORDER.map((k) => (
                  <tr key={k}>
                    <td>
                      <div className="cn">
                        <span className={clsx('sw', EXC[k])} />
                        <span>{k === '—' ? '未標示' : k}</span>
                      </div>
                    </td>
                    <td className="r num b">{s.ex[k] ?? 0}</td>
                    <td className="r num mute">{Math.round(((s.ex[k] ?? 0) / s.exTot) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </>
  );
}
