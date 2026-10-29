// 總覽：期間切換、指標卡、每週訓練量、部位分布、熱度圖、破紀錄、最近訓練、久未練、力竭分布
import { useMemo, useState } from 'react';
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
import { Heatmap, KSpark, WeekChart, type WeekMetric } from '@/components/charts';
import { Delta, GDot, PageHead, Seg, Status } from '@/components/ui';
import { DayVideoButton, TopSetButton } from '@/components/VideoLinks';
import { gColor, useCrumbs } from '@/lib/chrome';
import { Icon, type IconName } from '@/lib/icons';
import { TODAY } from '@/lib/today';
import { useDs } from '@/lib/useDs';
import { dashboardRoute } from '@/router';

const EXC: Record<string, string> = {
  輕鬆: 'var(--green-9)',
  普通: 'var(--gray-8)',
  吃力: 'var(--amber-9)',
  力竭: 'var(--red-9)',
  '—': 'var(--gray-5)',
};

function StatCard({
  label,
  icon,
  value,
  unit,
  sub,
  spark,
}: {
  label: string;
  icon: IconName;
  value: string | number;
  unit: string;
  sub: React.ReactNode;
  spark?: number[];
}) {
  return (
    <div className="stat-card">
      <div className="k">
        {label}
        <span className="ic">
          <Icon name={icon} />
        </span>
      </div>
      {spark && <KSpark values={spark} />}
      <div className="v">
        {value}
        <small>{unit}</small>
      </div>
      <div className="s">{sub}</div>
    </div>
  );
}

export function DashboardPage() {
  const ds = useDs();
  const navigate = useNavigate();
  const { period = 30 } = dashboardRoute.useSearch();
  const P = period as Period;
  const [metric, setMetric] = useState<WeekMetric>('vol');
  const s = useMemo(() => dashboardStats(ds, TODAY, P), [ds, P]);
  const weeks = useMemo(() => weekSeries(ds, TODAY, 26), [ds]);
  useCrumbs([{ label: 'TrainLog', to: '/' }, { label: '總覽' }]);

  const last = ds.trainingDates.filter((d) => d <= TODAY).pop();
  const yr = TODAY.slice(0, 4);
  const ys = ds.trainingDates.filter((d) => d.startsWith(`${yr}-`) && d <= TODAY);
  const bmx = Math.max(1, ...s.bal.map((b) => b.n));
  const openDay = (d: string) => void navigate({ to: '/days/$date', params: { date: d } });
  const openEx = (id: string) => void navigate({ to: '/exercises', search: { ex: id } });
  const openWeek = (w: WeekStat) => {
    const d = ds.trainingDates.filter((x) => inRange(x, w.w, addDays(w.w, 6))).pop();
    if (d) openDay(d);
  };
  const dW = deltaOf(s.wk, s.lwk);
  const dD = deltaOf(s.cur.length, s.prev.length);
  const dV = deltaOf(s.vC, s.vP, true);
  const dP = deltaOf(s.prC.length, s.prP);
  const prs = useMemo(() => s.prC, [s]);
  // 最近破紀錄不限期間（與 v9 相同）
  const allPrs = useMemo(() => prEvents(ds), [ds]);

  return (
    <section className="view active">
      <PageHead
        title="總覽"
        sub={`資料更新至 ${slash(ds.trainingDates[ds.trainingDates.length - 1] ?? TODAY)}${last ? ` · 上次訓練 ${daysLabel(daysAgo(last, TODAY))}` : ''}`}
        actions={
          <>
            <span className="field">統計期間</span>
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
      <div className="dash">
        <div className="kpi-row">
          <StatCard
            label="本週訓練"
            icon="calendar"
            value={s.wk}
            unit="天"
            spark={s.kspark.days}
            sub={
              <>
                <Delta {...dW} unit=" 天" />
                上週同期 {s.lwk} 天
              </>
            }
          />
          <StatCard
            label={`近 ${P} 天訓練日`}
            icon="clock"
            value={s.cur.length}
            unit="天"
            sub={
              <>
                <Delta {...dD} unit=" 天" />前 {P} 天 {s.prev.length} 天
              </>
            }
          />
          <StatCard
            label={`近 ${P} 天總容量`}
            icon="weight"
            value={fmtN(s.vC / 1000)}
            unit="噸"
            spark={s.kspark.vol}
            sub={
              <>
                {s.vP ? <Delta {...dV} pct /> : null}前 {P} 天 {fmtN(s.vP / 1000)} 噸
              </>
            }
          />
          <StatCard
            label={`近 ${P} 天破紀錄`}
            icon="trophy"
            value={s.prC.length}
            unit="次"
            spark={s.kspark.pr}
            sub={
              <>
                <Delta {...dP} unit=" 次" />
                {prs[0] ? ds.exerciseById.get(prs[0].exerciseId)?.name : '—'}
              </>
            }
          />
          <StatCard label="連續訓練" icon="flame" value={s.streak} unit="週" sub="每週至少練 1 天" />
        </div>
        <div className="dash-grid">
          <section className="dcard span-8">
            <div className="dcard-h">
              <div>
                <div className="dcard-t">每週訓練量</div>
                <div className="dcard-s">近 26 週 · 虛線為平均 · 點長條查看該週</div>
              </div>
              <Seg
                label="指標"
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
            </div>
            <div className="dcard-b">
              <WeekChart weeks={weeks} metric={metric} onOpenWeek={openWeek} />
            </div>
          </section>
          <section className="dcard span-4">
            <div className="dcard-h">
              <div>
                <div className="dcard-t">部位分布</div>
                <div className="dcard-s">近 {P} 天組數 · 距上次訓練</div>
              </div>
            </div>
            <div className="dcard-b">
              <div className="bal">
                {s.bal.map((b) => (
                  <div className="bal-row" key={b.g}>
                    <span>{b.g}</span>
                    <span className="dist-bar">
                      <i style={{ ['--c' as string]: gColor(b.g), width: `${(b.n / bmx) * 100}%` }} />
                    </span>
                    <span className="n">{b.n}</span>
                    <span className="ago">
                      {b.since == null ? <span className="na">—</span> : <Status days={b.since} />}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="dcard span-8">
            <div className="dcard-h">
              <div>
                <div className="dcard-t">訓練熱度</div>
                <div className="dcard-s">{yr} 年每日組數 · 點格子查看當天</div>
              </div>
              <div className="heat-legend">
                少<i className="lg0" />
                <i className="lg1" />
                <i className="lg2" />
                <i className="lg3" />
                <i className="lg4" />多
              </div>
            </div>
            <div className="dcard-b">
              <Heatmap today={TODAY} onOpenDay={openDay} />
              <div className="heat-sum">
                <div>
                  <span>今年訓練日</span>
                  <b>{ys.length}</b>
                </div>
                <div>
                  <span>平均每週</span>
                  <b>{fmtN(ys.length / s.wks)} 天</b>
                </div>
                <div>
                  <span>最長連續</span>
                  <b>{s.best} 天</b>
                </div>
                <div>
                  <span>今年總組數</span>
                  <b>{fmtN(ys.reduce((a, d) => a + daySets(ds, d), 0))}</b>
                </div>
              </div>
            </div>
          </section>
          <section className="dcard span-4">
            <div className="dcard-h">
              <div>
                <div className="dcard-t">最近破紀錄</div>
                <div className="dcard-s">最高重量超越先前紀錄</div>
              </div>
              <Link className="link" style={{ fontSize: 12.5 }} to="/exercises" search={{ sort: 'progress' }}>
                查看動作庫
              </Link>
            </div>
            <div className="dcard-b">
              {allPrs.slice(0, 6).map((p) => {
                const ex = ds.exerciseById.get(p.exerciseId);
                if (!ex) return null;
                const entry = ds.entriesByDate.get(p.date)?.find((e) => e.exerciseId === p.exerciseId);
                return (
                  <div className="drow" key={`${p.exerciseId}${p.date}`} onClick={() => openEx(ex.id)}>
                    <GDot group={ex.group} />
                    <div className="dmain">
                      <div className="dn">{ex.name}</div>
                      <div className="ds">
                        {md(p.date)} · {daysLabel(daysAgo(p.date, TODAY))} · 原紀錄 {fmtN(p.from)} kg
                      </div>
                    </div>
                    {entry && <TopSetButton entry={entry} />}
                    <div className="dv">
                      {fmtN(p.to)}
                      <small>kg</small>
                      <span className="delta up">+{fmtN(p.to - p.from)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="dcard span-6">
            <div className="dcard-h">
              <div>
                <div className="dcard-t">最近訓練</div>
                <div className="dcard-s">點選查看當天內容</div>
              </div>
              <Link className="link" style={{ fontSize: 12.5 }} to="/days">
                所有訓練紀錄
              </Link>
            </div>
            <div className="dcard-b">
              {s.recent.map((d) => {
                const es = dayEntries(ds, d);
                const v = dayVol(ds, d);
                return (
                  <div className="drow" key={d} onClick={() => openDay(d)}>
                    <div className="sess-date">
                      <b>{md(d)}</b>
                      <span>週{dowOf(d)}</span>
                    </div>
                    <div className="dmain">
                      <div className="dn">
                        {es.map((e) => ds.exerciseById.get(e.exerciseId)?.name).join('、')}
                      </div>
                      <div className="gchips" style={{ marginTop: 3 }}>
                        {dayGroups(ds, d).map((g) => (
                          <span key={g}>
                            <GDot group={g} />
                            {g}
                          </span>
                        ))}
                      </div>
                    </div>
                    <DayVideoButton date={d} variant="compact" />
                    <div className="dv">
                      {v ? (
                        <>
                          {fmtN(v)}
                          <small>kg</small>
                        </>
                      ) : (
                        <span className="na">—</span>
                      )}
                      <div className="ds">
                        {es.length} 動作 · {daySets(ds, d)} 組
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="dcard span-3">
            <div className="dcard-h">
              <div>
                <div className="dcard-t">久未練動作</div>
                <div className="dcard-s">練過 3 次以上、超過 3 週</div>
              </div>
            </div>
            <div className="dcard-b">
              {s.neg.map((id) => {
                const ex = ds.exerciseById.get(id);
                if (!ex) return null;
                const ld = lastDate(ds, id);
                return (
                  <div className="drow" key={id} onClick={() => openEx(id)}>
                    <GDot group={ex.group} />
                    <div className="dmain">
                      <div className="dn">{ex.name}</div>
                      <div className="ds">
                        {entriesOf(ds, id).length} 次 · 上次 {md(ld)}
                      </div>
                    </div>
                    <span className="status tone-bad">
                      <i />
                      {daysAgo(ld, TODAY)} 天
                    </span>
                  </div>
                );
              })}
              <div style={{ marginTop: 10 }}>
                <Link className="link" style={{ fontSize: 12.5 }} to="/exercises" search={{ status: 'old' }}>
                  篩選 30 天以上未練 →
                </Link>
              </div>
            </div>
          </section>
          <section className="dcard span-3">
            <div className="dcard-h">
              <div>
                <div className="dcard-t">力竭分布</div>
                <div className="dcard-s">
                  近 {P} 天 · {s.exTot} 筆動作
                </div>
              </div>
            </div>
            <div className="dcard-b">
              <div className="stack">
                {EXHAUSTION_ORDER.filter((k) => s.ex[k]).map((k) => (
                  <i
                    key={k}
                    style={{ width: `${((s.ex[k] ?? 0) / s.exTot) * 100}%`, background: EXC[k] }}
                    title={`${k} ${s.ex[k]}`}
                  />
                ))}
              </div>
              <div className="stack-legend">
                {EXHAUSTION_ORDER.filter((k) => s.ex[k]).map((k) => (
                  <span key={k}>
                    <i style={{ background: EXC[k] }} />
                    {k === '—' ? '未標示' : k}
                    <b>{s.ex[k]}</b>
                    <em>{Math.round(((s.ex[k] ?? 0) / s.exTot) * 100)}%</em>
                  </span>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
