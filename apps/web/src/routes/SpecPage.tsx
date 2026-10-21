// 設計規格頁：色階、字級、每個元件的五種狀態（對照 v9 ?view=spec）
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { miniTrendValues, slash, type Entry } from '@trainlog/core';
import { MiniTrend } from '@/components/charts';
import { ExhBadge, PageHead, Sets } from '@/components/ui';
import { useCrumbs } from '@/lib/chrome';
import { Icon } from '@/lib/icons';
import { TODAY } from '@/lib/today';
import { useDs } from '@/lib/useDs';

const STATES = ['預設', 'Hover', '按下', 'Focus', '停用'];
const STATE_CLS = ['', 'is-hover', 'is-active', 'is-focus', 'is-disabled'];
const colCls = (i: number) => clsx(i > 2 && 'x45', i === 2 && 'x3');
const SEM_STEPS = [2, 3, 4, 6, 7, 9, 11, 12];
const Pad = ({ n }: { n: number }) => (
  <>
    {Array.from({ length: n }, (_, i) => (
      <span key={i} />
    ))}
  </>
);

function Section({
  title,
  sub,
  children,
  bodyStyle,
}: {
  title: string;
  sub: string;
  children: ReactNode;
  bodyStyle?: React.CSSProperties;
}) {
  return (
    <section className="spec-sec">
      <div className="spec-h">
        <b>{title}</b>
        <span>{sub}</span>
      </div>
      <div className="spec-b" style={bodyStyle}>
        {children}
      </div>
    </section>
  );
}

const Head = () => (
  <>
    <span />
    {STATES.map((t, i) => (
      <span key={t} className={clsx('col', colCls(i))}>
        {t}
      </span>
    ))}
  </>
);
const Row = ({ label, mk }: { label: string; mk: (c: string) => ReactNode }) => (
  <>
    <span className="lab">{label}</span>
    {STATE_CLS.map((c, i) => (
      <div key={c || 'default'} className={colCls(i)}>
        {mk(c)}
      </div>
    ))}
  </>
);
const Swatches = ({ name, pre }: { name: string; pre: string }) => (
  <>
    <span className="lab">{name}</span>
    {Array.from({ length: 12 }, (_, i) => (
      <span
        key={i}
        className="sw"
        style={{ background: `var(--${pre}-${i + 1})` }}
        title={`${pre}-${i + 1}`}
      />
    ))}
  </>
);
const SemSwatches = ({ name, pre }: { name: string; pre: string }) => (
  <>
    <span className="lab">{name}</span>
    {SEM_STEPS.map((i) => (
      <span key={i} className="sw" style={{ background: `var(--${pre}-${i})` }} title={`${pre}-${i}`} />
    ))}
    <Pad n={4} />
  </>
);
const LineLabel = ({ children }: { children: ReactNode }) => (
  <span className="lab" style={{ width: 110, fontSize: 12, color: 'var(--text-3)' }}>
    {children}
  </span>
);
const line: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' };

const TYPE_ROWS: [string, string, ReactNode][] = [
  [
    '頁面標題',
    '22 / 600 / -2.5%',
    <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.025em' }}>訓練進度總覽 2026</span>,
  ],
  [
    '數據大字',
    '28 / 600 / -3%',
    <span
      style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums' }}
    >
      87.7<small style={{ fontSize: 13, color: 'var(--text-4)', marginLeft: 4 }}>噸</small>
    </span>,
  ],
  ['區塊標題', '14 / 600', <span style={{ fontSize: 14, fontWeight: 600 }}>每週訓練量</span>],
  ['內文', '14 / 400', <span>熱身 20×5、60×4、80×3；最後一下感覺蹲很深</span>],
  ['表格', '13 / 400–500', <span style={{ fontSize: 13 }}>背槓深蹲 · 90 kg × 6 × 2</span>],
  [
    '輔助說明',
    '12 / 500',
    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>近 26 週 · 虛線為平均</span>,
  ],
  [
    '標籤',
    '11 / 600 / +4%',
    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', letterSpacing: '.04em' }}>
      工作區
    </span>,
  ],
];

export function SpecPage() {
  const ds = useDs();
  useCrumbs([{ label: 'TrainLog', to: '/' }, { label: '設計規格' }]);
  const ex = ds.exerciseById.get('back_squat') ?? ds.exercises[0];
  const demoEntry: Entry | null = ex
    ? {
        id: 'spec',
        exerciseId: ex.id,
        date: TODAY,
        sets: [
          { weightKg: 90, reps: 6 },
          { weightKg: 90, reps: 6 },
        ],
      }
    : null;
  const lastDate = ds.trainingDates[ds.trainingDates.length - 1] ?? TODAY;
  return (
    <section className="view active">
      <PageHead title="設計規格" sub="色階、字級與每個元件的狀態。右上角可切換深淺色。" />
      <div className="spec">
        <Section title="色階" sub="12 階；1–2 背景、3–5 元件底／hover／選取、6–8 邊框、9–10 實色、11–12 文字">
          <div className="swatches">
            <span />
            {Array.from({ length: 12 }, (_, i) => (
              <span key={i} className="n">
                {i + 1}
              </span>
            ))}
            <Swatches name="灰階" pre="gray" />
            <Swatches name="主色" pre="acc" />
          </div>
          <div className="swatches" style={{ marginTop: 14 }}>
            <span />
            {SEM_STEPS.map((i) => (
              <span key={i} className="n">
                {i}
              </span>
            ))}
            <Pad n={4} />
            <SemSwatches name="成功" pre="green" />
            <SemSwatches name="警示" pre="amber" />
            <SemSwatches name="危險" pre="red" />
          </div>
        </Section>

        <Section title="字級" sub="Geist（英數）＋ Noto Sans TC（中文），數字一律等寬">
          {TYPE_ROWS.map(([a, b, c]) => (
            <div className="type-row" key={a}>
              <span className="meta">
                {a}
                <br />
                {b}
              </span>
              {c}
            </div>
          ))}
        </Section>

        <Section title="按鈕" sub="主要／次要／淡色／幽靈；每種都有 5 個狀態">
          <div className="spec-grid">
            <Head />
            <Row
              label="主要"
              mk={(c) => (
                <button className={clsx('btn btn-primary', c)}>
                  <Icon name="download" />
                  匯出 CSV
                </button>
              )}
            />
            <Row
              label="次要"
              mk={(c) => (
                <button className={clsx('btn', c)}>
                  <Icon name="expand" />
                  展開全部
                </button>
              )}
            />
            <Row
              label="淡色"
              mk={(c) => (
                <button className={clsx('btn btn-soft', c)}>
                  <Icon name="calendar" />
                  最近一次
                </button>
              )}
            />
            <Row
              label="幽靈"
              mk={(c) => (
                <button className={clsx('btn btn-ghost', c)}>
                  <Icon name="calendar" />
                  最近一次
                </button>
              )}
            />
            <Row
              label="圖示"
              mk={(c) => (
                <button className={clsx('btn btn-icon', c)} aria-label="上一個">
                  <Icon name="left" />
                </button>
              )}
            />
          </div>
        </Section>

        <Section title="表單" sub="輸入框、下拉選單、分段控制">
          <div className="spec-grid">
            <Head />
            <Row
              label="輸入框"
              mk={(c) => (
                <label className={clsx('input', c)}>
                  <Icon name="search" />
                  <input placeholder="搜尋動作名稱…" disabled={c === 'is-disabled'} aria-label="範例輸入框" />
                </label>
              )}
            />
            <span className="lab">下拉選單</span>
            <div>
              <select className="select" aria-label="範例下拉選單">
                <option>依部位分組</option>
              </select>
            </div>
            <div className="x3" />
            <div className="x45" />
            <div className="x45" />
            <div />
            <span className="lab">分段控制</span>
            <div style={{ gridColumn: 'span 3' }}>
              <div className="seg">
                <button className="active">近 7 天</button>
                <button>近 30 天</button>
                <button>近 90 天</button>
              </div>
            </div>
            <div className="x45" />
            <div className="x45" />
            <span className="lab">核取</span>
            <div style={{ gridColumn: 'span 3', display: 'flex', gap: 6 }}>
              <span className="menu-item on" style={{ width: 'auto', background: 'none' }}>
                <span className="ck">
                  <Icon name="check" />
                </span>
                已選取
              </span>
              <span className="menu-item" style={{ width: 'auto', background: 'none' }}>
                <span className="ck">
                  <Icon name="check" />
                </span>
                未選取
              </span>
            </div>
          </div>
        </Section>

        <Section
          title="徽章與狀態"
          sub="語意色只用在狀態，永遠搭配文字"
          bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <div style={line}>
            <LineLabel>力竭</LineLabel>
            {['輕鬆', '普通', '吃力', '力竭', '—'].map((v) => (
              <ExhBadge key={v} value={v} />
            ))}
          </div>
          <div style={{ ...line, gap: 16 }}>
            <LineLabel>上次訓練</LineLabel>
            <span className="status tone-ok">
              <i />2 天前
            </span>
            <span className="status tone-warn">
              <i />6 天前
            </span>
            <span className="status tone-bad">
              <i />
              96 天前
            </span>
          </div>
          <div style={line}>
            <LineLabel>增減</LineLabel>
            <span className="delta up">+15%</span>
            <span className="delta down">−960 kg</span>
            <span className="delta flat">±0</span>
          </div>
          <div style={line}>
            <LineLabel>其他</LineLabel>
            <span className="fchip">
              <i className="gdot" style={{ ['--c' as string]: 'var(--g0)' }} />
              腿部
              <button aria-label="移除">
                <Icon name="x" />
              </button>
            </span>
            <span className="count">34</span>
            <span className="gtag">腿部</span>
            {ex && demoEntry && <Sets entry={demoEntry} ex={ex} />}
            <span className="sync-pill">
              <i />
              資料更新至 {slash(lastDate)}
            </span>
            <kbd>Ctrl K</kbd>
          </div>
        </Section>

        <Section title="表格列" sub="預設、hover、展開／選取">
          <div className="spec-rows grid is-grouped">
            {ex &&
              ['', 'is-hover', 'is-selected'].map((c, i) => (
                <div key={c || 'default'} className={clsx('card-header', c)} style={{ cursor: 'default' }}>
                  <span
                    className="chev"
                    style={i === 2 ? { transform: 'rotate(90deg)', color: 'var(--accent-text)' } : undefined}
                  >
                    <Icon name="right" />
                  </span>
                  <div className="ex-name">
                    <span className="gdot" style={{ ['--c' as string]: 'var(--g0)' }} />
                    <div className="ex-text">
                      <span className="nm">{ex.name}</span>
                    </div>
                  </div>
                  <div>
                    <span className="status tone-ok">
                      <i />2 天前
                    </span>
                  </div>
                  <div className="cell-num">
                    90<small>kg</small>
                  </div>
                  <div className="cell-num c-vol">
                    1,080<small>kg</small>
                  </div>
                  <div className="cell-num c-max">
                    120<small>kg</small>
                  </div>
                  <div className="cell-num c-tot">
                    35,595<small>kg</small>
                  </div>
                  <div className="c-trend">
                    <MiniTrend values={miniTrendValues(ds, ex)} />
                  </div>
                  <div className="cell-num">
                    <span className="tag">{['預設', 'hover', '選取'][i]}</span>
                  </div>
                </div>
              ))}
          </div>
        </Section>

        <Section
          title="回饋"
          sub="提示框、通知、空狀態"
          bodyStyle={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}
        >
          <div className="spark-tooltip" style={{ position: 'static', display: 'block' }}>
            2026/10/19
            <br />
            <b>90</b> kg
          </div>
          <div className="toast on" style={{ position: 'static', transform: 'none' }}>
            <Icon name="check" />
            <span>已匯出 108 個動作</span>
          </div>
          <div className="box" style={{ flex: 1, minWidth: 260 }}>
            <div className="empty" style={{ padding: '28px 16px' }}>
              <div className="empty-ic">
                <Icon name="search" />
              </div>
              <b>找不到符合條件的動作</b>
              試試其他關鍵字，或清除篩選條件。
            </div>
          </div>
        </Section>
      </div>
    </section>
  );
}
