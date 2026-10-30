// 設計規格頁（v14）：顏色、字型、按鈕與表單的狀態、影片入口、組數標記、徽章、回饋；全部用實際元件與真實資料
import type { ReactNode } from 'react';
import clsx from 'clsx';
import {
  calcVolume,
  dayEntries,
  entryVideo,
  exerciseVideos,
  fmtN,
  prEvents,
  type Entry,
} from '@trainlog/core';
import { ObjIcon, ObjectHeader } from '@/components/ObjectHeader';
import { Delta, Empty, ExhBadge, Panel, PartTile, Seg, Sets, Status } from '@/components/ui';
import {
  DayVideoAction,
  DayVideoButton,
  DayVideoTag,
  EntryVideoBadge,
  EntryVideoButton,
  EntryVideoTile,
  ExerciseVideosButton,
  PlayCircle,
} from '@/components/VideoLinks';
import { useCrumbs } from '@/lib/chrome';
import { Icon } from '@/lib/icons';
import { useDs } from '@/lib/useDs';

/** 色票：一列一種用途；滑過去顯示變數名稱 */
const SW: [string, [string, string][]][] = [
  [
    '主色',
    [
      ['--a', '實色'],
      ['--a-hover', '滑過'],
      ['--a-line', '邊線'],
      ['--a-soft', '淡底'],
      ['--a-text', '文字'],
    ],
  ],
  [
    '墨色與底色',
    [
      ['--ink', '墨色'],
      ['--shell', '頂部列'],
      ['--canvas', '頁面底'],
      ['--panel', '面板'],
      ['--head', '標題列'],
      ['--line', '分隔線'],
    ],
  ],
  [
    '影片',
    [
      ['--vid', '影片按鈕'],
      ['--vid-2', '滑過'],
      ['--vid-ol', '外框'],
    ],
  ],
  [
    '狀態',
    [
      ['--green-9', '成功'],
      ['--amber-9', '警示'],
      ['--red-9', '危險'],
      ['--green-11', '成功文字'],
      ['--red-11', '危險文字'],
    ],
  ],
  [
    '熱度',
    [
      ['--h1', '1'],
      ['--h2', '2'],
      ['--h3', '3'],
      ['--h4', '4'],
    ],
  ],
];

const TYPE: [string, string, ReactNode][] = [
  [
    '頁面標題',
    '22 / 800',
    <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.02em' }}>2026/10/24（週六）</span>,
  ],
  [
    '數據大字',
    '窄體斜體 42',
    <span className="kpi-v">
      8,001<span className="u">kg</span>
    </span>,
  ],
  [
    '屬性數字',
    '窄體斜體 23',
    <span className="at">
      <span className="v">
        27<span className="u">組</span>
      </span>
    </span>,
  ],
  ['區塊標題', '13.5 / 800', <span style={{ fontSize: 13.5, fontWeight: 800 }}>每週訓練量</span>],
  ['內文', '13.5 / 400', <span style={{ fontSize: 13.5 }}>左腳先、對側手持 15kg；RIR 2–3</span>],
  ['等寬數字', '12.5 等寬', <span className="mono">10/24 · 1,350 kg · 9:21</span>],
  [
    '輔助說明',
    '12 / 500',
    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>近 26 週 · 點長條看那一週</span>,
  ],
];

const STATES = ['預設', '滑過', '鍵盤焦點', '停用'];
const STATE_CLS = ['', 'is-hover', 'is-focus', 'is-disabled'];

/** 按鈕的四種狀態一列 */
function StateRow({ label, mk }: { label: string; mk: (c: string, disabled: boolean) => ReactNode }) {
  return (
    <>
      <span className="st-l">{label}</span>
      {STATE_CLS.map((c) => (
        <div key={c || 'default'}>{mk(c, c === 'is-disabled')}</div>
      ))}
    </>
  );
}

/** 左邊標籤、右邊範例的一列 */
const Line = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="sp-line">
    <span className="st-l">{label}</span>
    <div>{children}</div>
  </div>
);

export function SpecPage() {
  const ds = useDs();
  useCrumbs([{ label: '首頁', to: '/' }, { label: '系統' }, { label: '設計規格' }]);

  // 示範用的真實資料：最近一支影片的那天、最近一個沒有影片的訓練日、有影片／沒影片／破紀錄／文字組數的紀錄
  const days = [...ds.trainingDates].reverse();
  const vDate = days.find((d) => ds.videosByDate.has(d));
  const nDate = days.find((d) => !ds.videosByDate.has(d));
  const vEntry = vDate ? dayEntries(ds, vDate).find((e) => entryVideo(ds, e)) : undefined;
  const nEntry = nDate ? dayEntries(ds, nDate).find((e) => e.sets.length) : undefined;
  const pr = prEvents(ds)[0];
  const prEntry = pr ? ds.entriesByExercise.get(pr.exerciseId)?.find((h) => h.date === pr.date) : undefined;
  const all = days.flatMap((d) => dayEntries(ds, d));
  const txtEntry = all.find((e) => e.setsDisplay);
  const noneEntry = all.find((e) => !e.sets.length && !e.setsDisplay && !e.minutes);
  const exOf = (e: Entry) => ds.exerciseById.get(e.exerciseId)!;
  const noVidEx = ds.exercises.find((e) => exerciseVideos(ds, e.id).length === 0);
  const tableRows = (vDate ? dayEntries(ds, vDate) : []).slice(0, 3);

  return (
    <>
      <ObjectHeader
        av={<ObjIcon name="spec" />}
        title="設計規格"
        tags={<span className="tag">v14</span>}
        sub="顏色、字型與每個元件的樣子；右上角可以切換深淺色與密度。"
      />
      <div className="content">
        <div className="grid spec">
          <Panel className="c12" title="顏色" meta="主色只用在重點；狀態色只表示狀態，而且一定搭配文字">
            <div className="sw-rows">
              {SW.map(([label, items]) => (
                <div className="sw-row" key={label}>
                  <span className="st-l">{label}</span>
                  <div className="sw-list">
                    {items.map(([v, t]) => (
                      <span className="swc" key={v} data-tip={v}>
                        <i style={{ background: `var(${v})` }} />
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <div className="sw-row">
                <span className="st-l">部位（固定）</span>
                <div className="sw-list">
                  {ds.groupOrder.map((g) => (
                    <span className="sw-part" key={g}>
                      <PartTile group={g} />
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <Panel className="c12" title="按鈕" meta="直角；滑過換底色與邊框，鍵盤焦點用主色外框">
            <div className="states sp-states">
              <span />
              {STATES.map((s) => (
                <span key={s} className="st-h">
                  {s}
                </span>
              ))}
              <StateRow
                label="主要"
                mk={(c, d) => (
                  <button type="button" className={clsx('btn pri', c)} disabled={d}>
                    <Icon name="download" />
                    匯出 CSV
                  </button>
                )}
              />
              <StateRow
                label="次要"
                mk={(c, d) => (
                  <button type="button" className={clsx('btn', c)} disabled={d}>
                    <Icon name="calendar" />
                    最近一次訓練
                  </button>
                )}
              />
              <StateRow
                label="小"
                mk={(c, d) => (
                  <button type="button" className={clsx('btn sm', c)} disabled={d}>
                    <Icon name="history" />
                    歷史
                  </button>
                )}
              />
              <StateRow
                label="圖示"
                mk={(c, d) => (
                  <button type="button" className={clsx('btn icon', c)} disabled={d} aria-label="上一個">
                    <Icon name="left" />
                  </button>
                )}
              />
            </div>
            <div className="sp-pad">
              <Line label="影片">
                <button type="button" className="btn vid">
                  <PlayCircle />
                  播放當天影片<span className="mono">9:21</span>
                </button>
                <button type="button" className="btn vid alt">
                  <PlayCircle />
                  前一支影片<span className="mono">10/22</span>
                </button>
              </Line>
              <Line label="文字連結">
                <button type="button" className="lk">
                  查看全部歷程
                  <Icon name="arrow" />
                </button>
              </Line>
            </div>
          </Panel>

          <Panel className="c6" title="字型" meta="數字用窄體斜體；日期、時間、表格數字用等寬">
            <div className="ty-rows">
              {TYPE.map(([a, b, c]) => (
                <div className="ty-row" key={a}>
                  <span className="st-l">
                    {a}
                    <small>{b}</small>
                  </span>
                  {c}
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="c6" title="表單" meta="輸入框、下拉選單、分段控制、核取">
            <div className="sp-pad">
              <Line label="輸入框">
                <label className="inp" style={{ width: 220 }}>
                  <Icon name="search" />
                  <input placeholder="搜尋動作名稱…" aria-label="範例輸入框" />
                </label>
                <label className="inp is-focus" style={{ width: 160 }}>
                  <Icon name="search" />
                  <input defaultValue="臥推" aria-label="範例輸入框（焦點）" />
                </label>
              </Line>
              <Line label="下拉選單">
                <label className="sel">
                  <em>排序</em>
                  <select aria-label="範例下拉選單">
                    <option>依部位分組</option>
                    <option>最近訓練優先</option>
                  </select>
                </label>
                <button type="button" className="sel">
                  <Icon name="filter" />
                  部位<span className="n">2</span>
                  <Icon name="down" />
                </button>
              </Line>
              <Line label="分段控制">
                <Seg
                  label="範例分段控制"
                  value="30"
                  options={[
                    ['7', '近 7 天'],
                    ['30', '近 30 天'],
                    ['90', '近 90 天'],
                  ]}
                  onChange={() => {}}
                />
              </Line>
              <Line label="核取">
                <span className="dd-content sp-menu">
                  <span className="menu-item on">
                    <span className="ck">
                      <Icon name="check" />
                    </span>
                    已選取
                  </span>
                  <span className="menu-item">
                    <span className="ck">
                      <Icon name="check" />
                    </span>
                    未選取
                  </span>
                </span>
              </Line>
            </div>
          </Panel>

          <Panel
            className="c6"
            title="影片入口"
            meta="深色＋主色播放鍵＝可以點；虛線淡色＝沒有影片（同位置、同大小）"
          >
            <div className="sp-pad">
              {vDate && nDate && (
                <Line label="當天">
                  <DayVideoTag date={vDate} />
                  <DayVideoTag date={nDate} />
                  <DayVideoAction date={vDate} />
                  <DayVideoAction date={nDate} />
                </Line>
              )}
              {vEntry && (
                <Line label="單一動作">
                  <EntryVideoBadge entry={vEntry} />
                  <ExerciseVideosButton exerciseId={vEntry.exerciseId} variant="btn" />
                  <ExerciseVideosButton exerciseId={vEntry.exerciseId} variant="w" />
                  {noVidEx && <ExerciseVideosButton exerciseId={noVidEx.id} variant="w" />}
                </Line>
              )}
              {vEntry && nEntry && (
                <Line label="縮圖">
                  <EntryVideoTile entry={vEntry} />
                  <EntryVideoTile entry={nEntry} />
                </Line>
              )}
              {vEntry && nEntry && vDate && nDate && (
                <Line label="表格內">
                  <EntryVideoButton entry={vEntry} />
                  <EntryVideoButton entry={nEntry} />
                  <DayVideoButton date={vDate} variant="icon" />
                  <DayVideoButton date={nDate} variant="icon" />
                </Line>
              )}
            </div>
          </Panel>

          <Panel
            className="c6"
            title="組數標記"
            meta="墨色＝最重的一組；綠色＝破紀錄；右上角播放記號＝這組有影片，點了直接播"
          >
            <div className="sp-pad">
              {vEntry && (
                <Line label="有影片">
                  <Sets entry={vEntry} ex={exOf(vEntry)} />
                </Line>
              )}
              {prEntry && (
                <Line label="破紀錄">
                  <Sets entry={prEntry} ex={exOf(prEntry)} />
                </Line>
              )}
              {vEntry && (
                <Line label="表格內（小）">
                  <Sets entry={vEntry} ex={exOf(vEntry)} mini />
                </Line>
              )}
              {txtEntry && (
                <Line label="文字紀錄">
                  <Sets entry={txtEntry} ex={exOf(txtEntry)} />
                </Line>
              )}
              {noneEntry && (
                <Line label="沒有組數">
                  <Sets entry={noneEntry} ex={exOf(noneEntry)} />
                </Line>
              )}
            </div>
          </Panel>

          <Panel className="c6" title="徽章與狀態" meta="淺底＋同色邊＋深色字；增減用斜切標籤加三角形">
            <div className="sp-pad">
              <Line label="力竭">
                {['輕鬆', '普通', '吃力', '力竭'].map((v) => (
                  <ExhBadge key={v} value={v} />
                ))}
                <ExhBadge value="普通" count={6} />
              </Line>
              <Line label="上次訓練">
                <Status days={2} />
                <Status days={6} />
                <Status days={96} />
              </Line>
              <Line label="增減">
                <Delta dir="up" value={15} pct />
                <Delta dir="down" value={960} unit="kg" />
                <Delta dir="flat" value={0} />
                <span className="dtx up">7.5</span>
                <span className="dtx dn">5</span>
              </Line>
              <Line label="其他">
                <span className="bdg ok">
                  <Icon name="trophy" />
                  破紀錄 +5 kg
                </span>
                <span className="tag">第 173 個訓練日</span>
                <span className="cnt">34</span>
                <kbd>Ctrl K</kbd>
              </Line>
            </div>
          </Panel>

          <Panel className="c6" title="表格與回饋" meta="表頭灰底、欄線；提示框、通知、空狀態">
            <table className="dg">
              <thead>
                <tr>
                  <th>動作</th>
                  <th className="r">組數</th>
                  <th className="r">容量 kg</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <span className="cn">
                        <PartTile group={exOf(e).group} small />
                        <span>{exOf(e).name}</span>
                      </span>
                    </td>
                    <td className="r num">{e.sets.length}</td>
                    <td className="r num b">{fmtN(calcVolume(e.sets) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="sp-pad sp-fb">
              <div className="spark-tooltip sp-tip">
                2026/10/24（週六）· 27 組{'\n'}腿部、背部、肩部{'\n'}有影片
              </div>
              <div className="toast on" style={{ position: 'static', transform: 'none' }}>
                <Icon name="check" />
                <span>已匯出 114 個動作</span>
              </div>
            </div>
            <Empty title="找不到符合條件的動作">試試其他關鍵字，或清除篩選條件。</Empty>
          </Panel>
        </div>
      </div>
    </>
  );
}
