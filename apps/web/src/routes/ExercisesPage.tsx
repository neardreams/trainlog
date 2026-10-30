// 動作庫（v14）：物件標頭（統計屬性列）、篩選列（搜尋、部位多選、狀態、排序）、可排序表頭、
// 依部位分組可收合、每列影片欄、展開明細（紀錄面板）、匯出 CSV
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useNavigate } from '@tanstack/react-router';
import {
  SORT_LABELS,
  daysAgo,
  exerciseVideos,
  filterExercises,
  fmtN,
  isCardio,
  lastDate,
  md,
  miniTrendValues,
  progressOf,
  statusOf,
  summarize,
  topSetIndex,
  type Exercise,
  type ExerciseFilter,
  type SortKey,
} from '@trainlog/core';
import { MiniTrend } from '@/components/charts';
import { AttrNum, ObjIcon, ObjectHeader } from '@/components/ObjectHeader';
import { RecordPanel } from '@/components/RecordPanel';
import { Empty, GDot, PartTile, Seg, Status } from '@/components/ui';
import { ExerciseVideosButton } from '@/components/VideoLinks';
import { gColor, useChrome, useCrumbs } from '@/lib/chrome';
import { Icon } from '@/lib/icons';
import { TODAY } from '@/lib/today';
import { useDs } from '@/lib/useDs';
import { exercisesRoute, type ExercisesSearch, type ExerciseStatusFilter } from '@/router';
import { runExportCsv } from './exercises-actions';

const without = (s: Set<string>, k: string) => {
  const n = new Set(s);
  n.delete(k);
  return n;
};
/** 畫面更新後捲到元素（扣掉頂部列、吸頂表頭與 extra） */
function scrollToEl(id: string, extra: number) {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const top =
      (document.querySelector<HTMLElement>('.shell')?.offsetHeight ?? 48) +
      (document.querySelector<HTMLElement>('.lhead')?.offsetHeight ?? 0);
    window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - top - extra, behavior: 'smooth' });
  });
}

/** 表頭欄位 → 對應的排序（再點一次反向） */
const SORT_COL: Record<string, SortKey[]> = {
  name: ['name'],
  ago: ['recent', 'overdue'],
  max: ['maxwt'],
  prog: ['progress'],
  n: ['sessions'],
};
/** 由小到大的排序（箭頭朝上） */
const ASC = new Set<SortKey>(['name', 'recent']);
const STATUS_LABEL: Record<Exclude<ExerciseStatusFilter, 'all'>, string> = {
  '7': '近 7 天',
  '30': '8–30 天',
  old: '30 天以上',
};
const onKey = (fn: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
};

function Hd({
  label,
  col,
  cls,
  sort,
  onSort,
}: {
  label: string;
  col: string;
  cls?: string;
  sort: SortKey;
  onSort: (col: string) => void;
}) {
  const on = (SORT_COL[col] ?? []).includes(sort);
  return (
    <div
      className={clsx('s', on && 'on', cls)}
      role="button"
      tabIndex={0}
      data-tip={`依「${label}」排序`}
      onClick={() => onSort(col)}
      onKeyDown={onKey(() => onSort(col))}
    >
      {label}
      <Icon name={on ? (ASC.has(sort) ? 'arrowup' : 'arrowdown') : 'sort'} />
    </div>
  );
}

const NA = () => <span className="na">—</span>;

function LibRow({ ex, open, onToggle }: { ex: Exercise; open: boolean; onToggle: () => void }) {
  const ds = useDs();
  const s = summarize(ds, ex, TODAY);
  const cardio = isCardio(ex);
  const last = s.lastEntry;
  const lq = s.latestQualified;
  // 最近一次：最重那一組（有氧用分鐘）；最近一次沒有完整重量時改用更早一次，並在提示說明
  let top: React.ReactNode = <NA />;
  let topTip: string | undefined;
  if (cardio) {
    if (last?.minutes != null)
      top = (
        <span className="num">
          {fmtN(last.minutes)}
          <small>分</small>
        </span>
      );
  } else if (lq) {
    const t = lq.sets[Math.max(0, topSetIndex(lq.sets))];
    if (t)
      top = (
        <span className="num">
          {t.weightKg ? (
            <>
              {fmtN(t.weightKg)}
              <small>kg</small>
            </>
          ) : (
            (ex.zeroLabel ?? '0')
          )}
          <span className="x">×</span>
          {t.reps ?? '？'}
          {ex.repUnit && <small>{ex.repUnit}</small>}
        </span>
      );
    if (lq.date !== s.lastDate)
      topTip = `${md(lq.date)} 的紀錄（${md(s.lastDate ?? lq.date)} 沒有完整的重量）`;
  }
  const maxMin = cardio ? Math.max(0, ...ds.entriesByExercise.get(ex.id)!.map((h) => h.minutes ?? 0)) : 0;
  const best = cardio ? (
    maxMin ? (
      <>
        {fmtN(maxMin)}
        <small>分</small>
      </>
    ) : (
      <NA />
    )
  ) : s.maxWeight ? (
    <>
      {fmtN(s.maxWeight)}
      <small>kg</small>
    </>
  ) : (
    <NA />
  );
  const vol = cardio ? (
    last?.distanceKm != null ? (
      <>
        {fmtN(last.distanceKm)}
        <small>km</small>
      </>
    ) : (
      <NA />
    )
  ) : s.latestVolume ? (
    <>
      {fmtN(s.latestVolume)}
      <small>kg</small>
    </>
  ) : (
    <NA />
  );
  const pg = cardio ? null : progressOf(ds, ex.id);
  const prog =
    pg == null ? (
      <span className="dtx flat">—</span>
    ) : (
      <span
        className={clsx('dtx', pg.delta > 0 ? 'up' : pg.delta < 0 ? 'dn' : 'flat')}
        data-tip={`第一次最高 ${fmtN(pg.first)} kg → 最近 ${fmtN(pg.last)} kg`}
      >
        {fmtN(Math.abs(pg.delta))}
      </span>
    );
  return (
    <>
      <div
        className={clsx('lr lrow', open && 'open')}
        style={{ ['--g' as string]: gColor(ex.group) }}
        id={`card-${ex.id}`}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={onKey(onToggle)}
      >
        <div className="chev">
          <Icon name="right" />
        </div>
        <div className="lname">
          <PartTile group={ex.group} />
          <b>{ex.name}</b>
          {ex.zeroLabel && <span className="tag">{ex.zeroLabel}</span>}
        </div>
        <div className="dte">{s.lastDate ? md(s.lastDate) : '—'}</div>
        <div>{s.daysAgo != null ? <Status days={s.daysAgo} /> : <NA />}</div>
        <div className={clsx('r', topTip && 'old')} data-tip={topTip}>
          {top}
        </div>
        <div className="r num">{best}</div>
        <div className="r num">{vol}</div>
        <div className="r spk-c">
          <MiniTrend values={miniTrendValues(ds, ex)} />
        </div>
        <div className="r">{prog}</div>
        <div className="r num">{s.sessions}</div>
        <div className="vbc">
          <ExerciseVideosButton exerciseId={ex.id} variant="w" />
        </div>
      </div>
      {open && (
        <div className="xp" style={{ ['--g' as string]: gColor(ex.group) }}>
          <RecordPanel ex={ex} />
        </div>
      )}
    </>
  );
}

export function ExercisesPage() {
  const ds = useDs();
  const navigate = useNavigate({ from: '/exercises' });
  const search = exercisesRoute.useSearch();
  const sort: SortKey = search.sort ?? 'group';
  const status: ExerciseStatusFilter = search.status ?? 'all';
  const groups = useMemo(() => new Set(search.groups ?? []), [search.groups]);
  const { showToast, pendingGroup, setPendingGroup, setActiveGroup } = useChrome();
  const [qInput, setQInput] = useState(search.q ?? '');
  const [open, setOpen] = useState<Set<string>>(() => new Set(search.ex ? [search.ex] : []));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useCrumbs([{ label: '首頁', to: '/' }, { label: '動作庫' }]);

  const setSearch = (patch: Partial<ExercisesSearch>) =>
    void navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  // 搜尋框輸入 120ms 後才更新網址
  useEffect(() => {
    const t = setTimeout(() => {
      if ((search.q ?? '') !== qInput) setSearch({ q: qInput || undefined });
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qInput]);
  const [prevQ, setPrevQ] = useState(search.q);
  if (search.q !== prevQ) {
    setPrevQ(search.q);
    setQInput(search.q ?? '');
  }

  const filter: ExerciseFilter = { q: search.q ?? '', groups, status };
  const rows = useMemo(() => filterExercises(ds, sort, filter, TODAY), [ds, sort, search.q, groups, status]); // eslint-disable-line react-hooks/exhaustive-deps
  const grouped = sort === 'group';

  // ?ex=：展開該動作（所在部位也展開），畫面更新後捲過去
  const [handledEx, setHandledEx] = useState<string | null>(null);
  const exTarget = search.ex ? ds.exerciseById.get(search.ex) : undefined;
  if (exTarget && exTarget.id !== handledEx) {
    setHandledEx(exTarget.id);
    setOpen((o) => new Set(o).add(exTarget.id));
    setCollapsed((c) => without(c, exTarget.group));
  }
  useEffect(() => {
    if (handledEx) scrollToEl(`card-${handledEx}`, grouped ? 44 : 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handledEx]);

  // 側欄點部位：展開該部位並捲過去
  const [handledGroup, setHandledGroup] = useState<{ g: string } | null>(null);
  if (pendingGroup && grouped && pendingGroup !== handledGroup) {
    setHandledGroup(pendingGroup);
    setCollapsed((c) => without(c, pendingGroup.g));
  }
  useEffect(() => {
    if (!handledGroup) return;
    setPendingGroup(null);
    scrollToEl(`sec-${handledGroup.g}`, 0);
  }, [handledGroup, setPendingGroup]);

  // 捲動時標出目前所在的部位（側欄高亮）
  useEffect(() => {
    if (!grouped) {
      setActiveGroup(null);
      return;
    }
    let raf = 0;
    const spy = () => {
      raf = 0;
      const off =
        (document.querySelector<HTMLElement>('.shell')?.offsetHeight ?? 48) +
        (document.querySelector<HTMLElement>('.lhead')?.offsetHeight ?? 0) +
        40;
      let cur: string | null = null;
      document.querySelectorAll<HTMLElement>('.lgrp[data-g]').forEach((r) => {
        if (r.getBoundingClientRect().top <= off) cur = r.dataset.g ?? null;
      });
      setActiveGroup(cur ?? document.querySelector<HTMLElement>('.lgrp[data-g]')?.dataset.g ?? null);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(spy);
    };
    spy();
    addEventListener('scroll', onScroll, { passive: true });
    return () => {
      removeEventListener('scroll', onScroll);
      setActiveGroup(null);
    };
  }, [grouped, rows, setActiveGroup]);

  const toggleOpen = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleGroup = (g: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });
  const expandAll = (o: boolean) => {
    if (o) setCollapsed(new Set());
    setOpen(o ? new Set(rows.map((r) => r.id)) : new Set());
    showToast(o ? `已展開 ${rows.length} 個動作` : '已全部收合');
  };
  const sortBy = (col: string) => {
    const keys = SORT_COL[col] ?? ['group'];
    const next = keys.length > 1 && sort === keys[0] ? keys[1]! : keys[0]!;
    setSearch({ sort: next === 'group' ? undefined : next });
  };
  const toggleGroupFilter = (g: string) => {
    const n = new Set(groups);
    if (n.has(g)) n.delete(g);
    else n.add(g);
    setSearch({ groups: n.size ? [...n] : undefined });
  };
  const clearFilters = () => {
    setQInput('');
    setSearch({ q: undefined, groups: undefined, status: undefined });
  };

  // 標頭屬性列：整個動作庫的統計（不受篩選影響）
  const stats = useMemo(() => {
    const st = ds.exercises.map((e) => statusOf(ds, e.id, TODAY));
    return {
      b7: st.filter((x) => x === '7').length,
      b30: st.filter((x) => x === '30').length,
      old: st.filter((x) => x === 'old').length,
      vids: ds.exercises.filter((e) => exerciseVideos(ds, e.id).length > 0).length,
    };
  }, [ds]);

  const openCount = rows.filter((r) => open.has(r.id)).length;
  const groupedRows = useMemo(() => {
    if (!grouped) return null;
    return ds.groupOrder
      .map((g) => ({ g, list: rows.filter((r) => r.group === g) }))
      .filter((x) => x.list.length);
  }, [grouped, rows, ds]);
  const chips: React.ReactNode[] = [];
  const chip = (key: string, label: React.ReactNode, onRemove: () => void) =>
    chips.push(
      <span className="fc" key={key}>
        {label}
        <button type="button" onClick={onRemove} aria-label="移除這個條件">
          <Icon name="x" />
        </button>
      </span>,
    );
  if (search.q) chip('q', `搜尋：${search.q}`, () => (setQInput(''), setSearch({ q: undefined })));
  for (const g of groups)
    chip(
      g,
      <>
        <PartTile group={g} small />
        {g}
      </>,
      () => toggleGroupFilter(g),
    );
  if (status !== 'all')
    chip('status', `上次訓練：${STATUS_LABEL[status]}`, () => setSearch({ status: undefined }));

  const row = (ex: Exercise) => (
    <LibRow key={ex.id} ex={ex} open={open.has(ex.id)} onToggle={() => toggleOpen(ex.id)} />
  );

  return (
    <>
      <ObjectHeader
        av={<ObjIcon name="weight" />}
        title="動作庫"
        tags={<span className="tag">{ds.exercises.length} 個動作</span>}
        actions={
          <>
            <div className="bgrp">
              <button
                type="button"
                className="btn icon"
                data-tip="展開全部"
                aria-label="展開全部"
                onClick={() => expandAll(true)}
              >
                <Icon name="expand" />
              </button>
              <button
                type="button"
                className="btn icon"
                data-tip="收合全部"
                aria-label="收合全部"
                onClick={() => expandAll(false)}
              >
                <Icon name="collapse" />
              </button>
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => showToast(runExportCsv(ds, TODAY, sort, filter))}
            >
              <Icon name="download" />
              匯出 CSV
            </button>
          </>
        }
        attrs={[
          { label: '動作', value: <AttrNum v={ds.exercises.length} u="個" /> },
          { label: '部位', value: <AttrNum v={ds.groupOrder.length} u="個" /> },
          {
            label: '7 天內練過',
            value: <AttrNum v={stats.b7} u="個" style={{ color: 'var(--green-11)' }} />,
          },
          { label: '8–30 天', value: <AttrNum v={stats.b30} u="個" /> },
          { label: '超過 30 天', value: <AttrNum v={stats.old} u="個" style={{ color: 'var(--red-11)' }} /> },
          { label: '有影片', value: <AttrNum v={stats.vids} u="個" style={{ color: 'var(--a-text)' }} /> },
        ]}
      />
      <div className="content">
        <section className="pn lib">
          <div className="fbar">
            <label className="inp">
              <Icon name="search" />
              <input
                type="search"
                placeholder="搜尋動作名稱…"
                autoComplete="off"
                aria-label="搜尋動作"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
              />
            </label>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button type="button" className="sel">
                  <Icon name="filter" />
                  部位
                  {groups.size > 0 && <span className="n">{groups.size}</span>}
                  <Icon name="down" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="dd-content" align="start" sideOffset={6}>
                  {ds.groupOrder.map((g) => (
                    <DropdownMenu.CheckboxItem
                      key={g}
                      className={clsx('menu-item', groups.has(g) && 'on')}
                      checked={groups.has(g)}
                      onCheckedChange={() => toggleGroupFilter(g)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      <span className="ck">
                        <Icon name="check" />
                      </span>
                      <GDot group={g} />
                      {g}
                      <em>{ds.exercises.filter((e) => e.group === g).length}</em>
                    </DropdownMenu.CheckboxItem>
                  ))}
                  <div className="menu-sep" />
                  <div className="menu-foot">
                    <button type="button" className="btn sm" onClick={() => setSearch({ groups: undefined })}>
                      清除
                    </button>
                    <DropdownMenu.Item asChild>
                      <button type="button" className="btn sm pri">
                        完成
                      </button>
                    </DropdownMenu.Item>
                  </div>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <Seg
              label="上次訓練"
              value={status}
              options={
                [
                  ['all', '全部'],
                  ['7', '近 7 天'],
                  ['30', '8–30 天'],
                  ['old', '30 天以上'],
                ] as const
              }
              onChange={(v) => setSearch({ status: v === 'all' ? undefined : v })}
            />
            <span className="sp" />
            <label className="sel">
              <em>排序</em>
              <select
                aria-label="排序方式"
                value={sort}
                onChange={(e) =>
                  setSearch({ sort: e.target.value === 'group' ? undefined : (e.target.value as SortKey) })
                }
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {chips.length > 0 && (
            <div className="fchips">
              <span className="lbl">篩選條件</span>
              {chips}
              <button type="button" className="lk" onClick={clearFilters}>
                全部清除
              </button>
            </div>
          )}
          <div className="lr lhead">
            <div />
            <Hd label="動作" col="name" sort={sort} onSort={sortBy} />
            <div>上次訓練</div>
            <Hd label="距今" col="ago" sort={sort} onSort={sortBy} />
            <div className="r">最近一次</div>
            <Hd label="最高" col="max" cls="r" sort={sort} onSort={sortBy} />
            <div className="r">最近容量</div>
            <div className="r">趨勢</div>
            <Hd label="進步" col="prog" cls="r" sort={sort} onSort={sortBy} />
            <Hd label="次數" col="n" cls="r" sort={sort} onSort={sortBy} />
            <div className="c">影片</div>
          </div>
          {rows.length === 0 ? (
            <Empty
              title="找不到符合條件的動作"
              action={
                <button type="button" className="btn" onClick={clearFilters}>
                  清除篩選
                </button>
              }
            >
              試試其他關鍵字，或清除篩選條件。
            </Empty>
          ) : groupedRows ? (
            groupedRows.map(({ g, list }) => {
              const c = collapsed.has(g);
              const recent = Math.min(...list.map((e) => daysAgo(lastDate(ds, e.id), TODAY)));
              const vids = list.filter((e) => exerciseVideos(ds, e.id).length > 0).length;
              return (
                <div key={g}>
                  <div
                    className={clsx('lgrp', c && 'closed')}
                    id={`sec-${g}`}
                    data-g={g}
                    style={{ ['--g' as string]: gColor(g) }}
                    role="button"
                    tabIndex={0}
                    aria-expanded={!c}
                    onClick={() => toggleGroup(g)}
                    onKeyDown={onKey(() => toggleGroup(g))}
                  >
                    <span className="chev">
                      <Icon name="down" />
                    </span>
                    <PartTile group={g} />
                    <b>{g}</b>
                    <span className="cnt">{list.length}</span>
                    <span className="m">
                      有影片 <b>{vids}</b> 個 · 最近訓練{' '}
                      {recent <= 0 ? (
                        <b>今天</b>
                      ) : recent === 1 ? (
                        <b>昨天</b>
                      ) : (
                        <>
                          <b>{recent}</b> 天前
                        </>
                      )}
                    </span>
                  </div>
                  {!c && list.map(row)}
                </div>
              );
            })
          ) : (
            rows.map(row)
          )}
          <footer className="pn-f">
            <span>
              顯示 <b>{rows.length}</b> / <b>{ds.exercises.length}</b> 個動作
              {groupedRows ? ` · ${groupedRows.length} 個部位` : ''}
              {openCount ? ` · 已展開 ${openCount} 個` : ''}
            </span>
            <span className="lib-lg">
              <span>
                <i className="sq ok" /> 3 天內
              </span>
              <span>
                <i className="sq warn" /> 7 天內
              </span>
              <span>
                <i className="sq bad" /> 超過 7 天
              </span>
            </span>
          </footer>
        </section>
      </div>
    </>
  );
}
