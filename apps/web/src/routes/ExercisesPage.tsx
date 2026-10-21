// 動作庫：資料表格（搜尋、部位多選、狀態、排序、分組、展開紀錄、匯出 CSV）
import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useNavigate } from '@tanstack/react-router';
import {
  SORT_LABELS,
  daysAgo,
  filterExercises,
  fmtN,
  isCardio,
  md,
  miniTrendValues,
  slash,
  summarize,
  lastDate,
  type Exercise,
  type ExerciseFilter,
  type SortKey,
} from '@trainlog/core';
import { MiniTrend } from '@/components/charts';
import { RecordPanel } from '@/components/RecordPanel';
import { Count, Empty, GDot, PageHead, Seg, Status } from '@/components/ui';
import { useChrome, useCrumbs } from '@/lib/chrome';
import { Icon } from '@/lib/icons';
import { usePrefs } from '@/lib/prefs';
import { TODAY } from '@/lib/today';
import { useDs } from '@/lib/useDs';
import { exercisesRoute, type ExercisesSearch, type ExerciseStatusFilter } from '@/router';
import { runExportCsv } from './exercises-actions';

const without = (s: Set<string>, k: string) => {
  const n = new Set(s);
  n.delete(k);
  return n;
};
/** 畫面更新後捲到元素（扣掉頂部列高度與間距） */
function scrollToEl(id: string, gap: number) {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    const top = document.querySelector<HTMLElement>('.topbar')?.offsetHeight ?? 56;
    if (el)
      window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - top - gap, behavior: 'smooth' });
  });
}

/** 表頭欄位 → 對應的排序（「上次訓練」再點一次反向） */
const SORT_COL: Record<string, SortKey[]> = {
  name: ['name'],
  group: ['group'],
  last: ['recent', 'overdue'],
  max: ['maxwt'],
  tot: ['volume'],
  trend: ['progress'],
  n: ['sessions'],
};
const STATUS_LABEL: Record<Exclude<ExerciseStatusFilter, 'all'>, string> = {
  '7': '近 7 天',
  '30': '8–30 天',
  old: '30 天以上',
};

function Th({
  label,
  col,
  cls,
  sort,
  onSort,
}: {
  label: string;
  col?: string;
  cls?: string;
  sort: SortKey;
  onSort: (col: string) => void;
}) {
  const keys = col ? SORT_COL[col] : undefined;
  if (!col || !keys) return <span className={clsx('th', cls)}>{label}</span>;
  const on = keys.includes(sort);
  return (
    <button
      className={clsx('th sortable', on && 'sorted', cls)}
      onClick={() => onSort(col)}
      title={`依「${label}」排序`}
    >
      {label}
      {on && <Icon name={sort === 'overdue' || sort === 'name' ? 'arrowup' : 'arrowdown'} />}
    </button>
  );
}

function ExerciseRow({ ex, open, onToggle }: { ex: Exercise; open: boolean; onToggle: () => void }) {
  const ds = useDs();
  const s = summarize(ds, ex, TODAY);
  const cardio = isCardio(ex);
  const na = <span className="na">—</span>;
  const lq = s.latestQualified;
  const aside = lq && lq.date !== s.lastDate ? <span className="aside">{md(lq.date)}</span> : null;
  const last = s.lastEntry;
  const wt = cardio ? (
    last?.minutes != null ? (
      <>
        {fmtN(last.minutes)}
        <small>分</small>
      </>
    ) : (
      na
    )
  ) : s.latestWeight ? (
    <>
      {fmtN(s.latestWeight)}
      <small>kg</small>
      {aside}
    </>
  ) : (
    na
  );
  const vol = cardio ? (
    last?.distanceKm != null ? (
      <>
        {fmtN(last.distanceKm)}
        <small>km</small>
      </>
    ) : (
      na
    )
  ) : s.latestVolume ? (
    <>
      {fmtN(s.latestVolume)}
      <small>kg</small>
    </>
  ) : (
    na
  );
  const maxMin = Math.max(0, ...ds.entriesByExercise.get(ex.id)!.map((h) => h.minutes ?? 0));
  const mx = cardio ? (
    maxMin ? (
      <>
        {fmtN(maxMin)}
        <small>分</small>
      </>
    ) : (
      na
    )
  ) : s.maxWeight ? (
    <>
      {fmtN(s.maxWeight)}
      <small>kg</small>
    </>
  ) : (
    na
  );
  const tot = cardio ? (
    s.cardio.mins ? (
      <>
        {fmtN(s.cardio.mins)}
        <small>分</small>
      </>
    ) : (
      na
    )
  ) : s.totalVolume ? (
    <>
      {fmtN(s.totalVolume)}
      <small>kg</small>
    </>
  ) : (
    na
  );
  const metaM = [
    ex.group,
    cardio
      ? last?.minutes != null
        ? `${fmtN(last.minutes)} 分`
        : ''
      : s.latestWeight
        ? `${fmtN(s.latestWeight)} kg`
        : '',
    `${s.sessions} 次`,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className={clsx('card', open && 'is-open')} id={`card-${ex.id}`}>
      <div
        className="card-header"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <span className="chev">
          <Icon name="right" />
        </span>
        <div className="ex-name">
          <GDot group={ex.group} />
          <div className="ex-text">
            <span className="nm">{ex.name}</span>
            <span className="ex-meta-m">{metaM}</span>
          </div>
        </div>
        <div className="c-group">
          <span className="gtag">{ex.group}</span>
        </div>
        <div className="c-last">{s.daysAgo != null ? <Status days={s.daysAgo} /> : na}</div>
        <div className="cell-num c-wt">{wt}</div>
        <div className="cell-num c-vol">{vol}</div>
        <div className="cell-num c-max">{mx}</div>
        <div className="cell-num c-tot">{tot}</div>
        <div className="c-trend">
          <MiniTrend values={miniTrendValues(ds, ex)} />
        </div>
        <div className="cell-num c-n">{s.sessions}</div>
      </div>
      <div className={clsx('card-body', open && 'open')}>{open && <RecordPanel ex={ex} />}</div>
    </div>
  );
}

export function ExercisesPage() {
  const ds = useDs();
  const navigate = useNavigate({ from: '/exercises' });
  const search = exercisesRoute.useSearch();
  const sort: SortKey = search.sort ?? 'group';
  const status: ExerciseStatusFilter = search.status ?? 'all';
  const groups = useMemo(() => new Set(search.groups ?? []), [search.groups]);
  const { density, setDensity } = usePrefs();
  const { showToast, pendingGroup, setPendingGroup, setActiveGroup } = useChrome();
  const [qInput, setQInput] = useState(search.q ?? '');
  const [open, setOpen] = useState<Set<string>>(() => new Set(search.ex ? [search.ex] : []));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useCrumbs([{ label: 'TrainLog', to: '/' }, { label: '動作庫' }]);

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
    if (handledEx) scrollToEl(`card-${handledEx}`, 48);
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
    scrollToEl(`sec-${handledGroup.g}`, 44);
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
      const off = (document.querySelector<HTMLElement>('.topbar')?.offsetHeight ?? 56) + 60;
      let cur: string | null = null;
      document.querySelectorAll<HTMLElement>('.grp-row').forEach((r) => {
        if (r.getBoundingClientRect().top <= off) cur = r.dataset.g ?? null;
      });
      setActiveGroup(cur ?? document.querySelector<HTMLElement>('.grp-row')?.dataset.g ?? null);
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
    const next = keys.length > 1 && sort === keys[0] ? keys[1] : keys[0];
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

  const openCount = rows.filter((r) => open.has(r.id)).length;
  const groupedRows = useMemo(() => {
    if (!grouped) return null;
    return ds.groupOrder
      .map((g) => ({ g, list: rows.filter((r) => r.group === g) }))
      .filter((x) => x.list.length);
  }, [grouped, rows, ds]);
  const chips: React.ReactNode[] = [];
  if (search.q)
    chips.push(
      <span className="fchip" key="q">
        搜尋：{search.q}
        <button onClick={() => (setQInput(''), setSearch({ q: undefined }))} aria-label="移除">
          <Icon name="x" />
        </button>
      </span>,
    );
  for (const g of groups)
    chips.push(
      <span className="fchip" key={g}>
        <GDot group={g} />
        {g}
        <button onClick={() => toggleGroupFilter(g)} aria-label="移除">
          <Icon name="x" />
        </button>
      </span>,
    );
  if (status !== 'all')
    chips.push(
      <span className="fchip" key="status">
        上次訓練：{STATUS_LABEL[status]}
        <button onClick={() => setSearch({ status: undefined })} aria-label="移除">
          <Icon name="x" />
        </button>
      </span>,
    );

  return (
    <section className="view active">
      <PageHead
        title="動作庫"
        sub={`${ds.exercises.length} 個動作 · ${ds.groupOrder.length} 個部位 · 點選列可展開紀錄`}
        actions={
          <>
            <button className="btn" onClick={() => expandAll(true)}>
              <Icon name="expand" />
              展開全部
            </button>
            <button className="btn" onClick={() => expandAll(false)}>
              <Icon name="collapse" />
              收合全部
            </button>
            <button className="btn" onClick={() => showToast(runExportCsv(ds, TODAY, sort, filter))}>
              <Icon name="download" />
              匯出 CSV
            </button>
          </>
        }
      />
      <div className="grid-card">
        <div className="grid-toolbar">
          <label className="input">
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
              <button className="btn">
                <Icon name="filter" />
                部位
                <Count n={groups.size} hidden={!groups.size} />
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
                  <button className="btn btn-ghost" onClick={() => setSearch({ groups: undefined })}>
                    清除
                  </button>
                  <DropdownMenu.Item asChild>
                    <button className="btn btn-primary">完成</button>
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
          <span className="spacer" />
          <span className="lbl">排序</span>
          <select
            className="select"
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
          <div className="seg icons" role="group" aria-label="列高">
            <button
              className={clsx(density === 'comfortable' && 'active')}
              title="標準列高"
              onClick={() => setDensity('comfortable')}
            >
              <Icon name="rows" />
            </button>
            <button
              className={clsx(density === 'compact' && 'active')}
              title="緊湊列高"
              onClick={() => setDensity('compact')}
            >
              <Icon name="rows2" />
            </button>
          </div>
        </div>
        {chips.length > 0 && (
          <div className="chips-row">
            <span className="lbl">篩選條件</span>
            {chips}
            <button className="link" style={{ marginLeft: 6, fontSize: 12.5 }} onClick={clearFilters}>
              全部清除
            </button>
          </div>
        )}
        <div className={clsx('grid', grouped && 'is-grouped')}>
          <div className="grid-head">
            <span />
            <Th label="動作" col="name" sort={sort} onSort={sortBy} />
            <Th label="部位" col="group" cls="c-group" sort={sort} onSort={sortBy} />
            <Th label="上次訓練" col="last" sort={sort} onSort={sortBy} />
            <span className="th r c-wt">最新重量</span>
            <span className="th r c-vol">最新容量</span>
            <Th label="最高重量" col="max" cls="r c-max" sort={sort} onSort={sortBy} />
            <Th label="累計容量" col="tot" cls="r c-tot" sort={sort} onSort={sortBy} />
            <Th label="趨勢" col="trend" cls="r c-trend" sort={sort} onSort={sortBy} />
            <Th label="次數" col="n" cls="r c-n" sort={sort} onSort={sortBy} />
          </div>
          {rows.length === 0 ? (
            <Empty
              title="找不到符合條件的動作"
              action={
                <button className="btn" onClick={clearFilters}>
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
              return (
                <div key={g}>
                  <button
                    className={clsx('grp-row', c && 'collapsed')}
                    id={`sec-${g}`}
                    data-g={g}
                    onClick={() => toggleGroup(g)}
                    aria-expanded={!c}
                  >
                    <span className="chev">
                      <Icon name="right" />
                    </span>
                    <GDot group={g} />
                    {g}
                    <Count n={list.length} />
                    <span className="grp-meta">
                      最近訓練 {recent <= 0 ? '今天' : recent === 1 ? '昨天' : `${recent} 天前`}
                    </span>
                  </button>
                  {!c &&
                    list.map((ex) => (
                      <ExerciseRow
                        key={ex.id}
                        ex={ex}
                        open={open.has(ex.id)}
                        onToggle={() => toggleOpen(ex.id)}
                      />
                    ))}
                </div>
              );
            })
          ) : (
            rows.map((ex) => (
              <ExerciseRow key={ex.id} ex={ex} open={open.has(ex.id)} onToggle={() => toggleOpen(ex.id)} />
            ))
          )}
        </div>
        <div className="grid-foot">
          <span>
            顯示 {rows.length} / {ds.exercises.length} 個動作{openCount ? ` · 已展開 ${openCount} 個` : ''}
          </span>
          <span>資料更新至 {slash(ds.trainingDates[ds.trainingDates.length - 1] ?? TODAY)}</span>
        </div>
      </div>
    </section>
  );
}
