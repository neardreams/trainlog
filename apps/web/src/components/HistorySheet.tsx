// 動作歷史側欄：在訓練紀錄點動作即可從右側滑出，查看該動作全部歷程，不離開目前的頁面
import { useEffect, useMemo, useRef } from 'react';
import clsx from 'clsx';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from '@tanstack/react-router';
import {
  daysAgo,
  daysLabel,
  dowOf,
  entriesOf,
  fmtN,
  isCardio,
  md,
  prEvents,
  summarize,
  type DateStr,
  type Exercise,
} from '@trainlog/core';
import { VolCell } from './RecordPanel';
import { ExhBadge, GDot, Sets } from './ui';
import { Icon } from '@/lib/icons';
import { TODAY } from '@/lib/today';
import { useDs } from '@/lib/useDs';

/** 點這些元素（訓練紀錄的動作列）時不關閉側欄，直接換成新的動作 */
export const PEEK_ATTR = 'data-peek';

export function HistorySheet({
  ex,
  focus,
  onClose,
  onOpenFull,
}: {
  ex: Exercise;
  focus: DateStr;
  onClose: () => void;
  onOpenFull: () => void;
}) {
  const ds = useDs();
  const navigate = useNavigate();
  const desc = useMemo(() => [...entriesOf(ds, ex.id)].reverse(), [ds, ex.id]);
  const prs = useMemo(
    () =>
      new Set(
        prEvents(ds)
          .filter((p) => p.exerciseId === ex.id)
          .map((p) => p.date),
      ),
    [ds, ex.id],
  );
  const s = summarize(ds, ex, TODAY);
  const cardio = isCardio(ex);
  const focusRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: 'center' });
  }, [ex.id, focus]);

  return (
    <Dialog.Root modal={false} open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Content
          className="sheet"
          aria-describedby={undefined}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            const t = e.target as Element | null;
            if (t?.closest(`[${PEEK_ATTR}]`)) e.preventDefault();
          }}
        >
          <div className="sheet-head">
            <GDot group={ex.group} />
            <div className="sheet-tt">
              <Dialog.Title className="sheet-title">{ex.name}</Dialog.Title>
              <div className="sheet-sub">
                {ex.group} · {desc.length} 筆紀錄
              </div>
            </div>
            <button className="btn btn-ghost" onClick={onOpenFull}>
              <Icon name="chart" />
              完整歷程
            </button>
            <Dialog.Close className="btn btn-icon btn-ghost" aria-label="關閉">
              <Icon name="x" />
            </Dialog.Close>
          </div>
          <dl className="sheet-sum">
            {cardio ? (
              <>
                <div>
                  <dt>累計時間</dt>
                  <dd>{s.cardio.mins ? `${fmtN(s.cardio.mins)} 分` : '—'}</dd>
                </div>
                <div>
                  <dt>累計距離</dt>
                  <dd>{s.cardio.km ? `${fmtN(s.cardio.km)} km` : '—'}</dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt>最高重量</dt>
                  <dd>{s.maxWeight ? `${fmtN(s.maxWeight)} kg` : '—'}</dd>
                </div>
                <div>
                  <dt>累計容量</dt>
                  <dd>{s.totalVolume ? `${fmtN(s.totalVolume)} kg` : '—'}</dd>
                </div>
              </>
            )}
            <div>
              <dt>上次訓練</dt>
              <dd>{s.lastDate ? `${md(s.lastDate)} · ${daysLabel(daysAgo(s.lastDate, TODAY))}` : '—'}</dd>
            </div>
          </dl>
          <ol className="sheet-list">
            {desc.map((h) => {
              const f = h.date === focus;
              const note = [h.condition, h.cue].filter(Boolean).join('；');
              return (
                <li key={h.id} className={clsx('sh-item', f && 'is-focus')} ref={f ? focusRef : undefined}>
                  <div className="sh-top">
                    <a
                      className="link sh-date"
                      onClick={() => void navigate({ to: '/days/$date', params: { date: h.date } })}
                    >
                      {md(h.date)}
                    </a>
                    <span className="sh-dow">
                      週{dowOf(h.date)} · {daysLabel(daysAgo(h.date, TODAY))}
                    </span>
                    {f && <span className="sh-here">目前查看</span>}
                    <span className="sh-badges">
                      {prs.has(h.date) && (
                        <span className="badge tone-ok">
                          <Icon name="trophy" />
                          破紀錄
                        </span>
                      )}
                      <ExhBadge value={h.exhaustion} />
                    </span>
                  </div>
                  <Sets entry={h} ex={ex} />
                  <div className="sh-meta">
                    <span className="num">
                      <VolCell ex={ex} h={h} />
                    </span>
                    {h.feel && <span>{h.feel}</span>}
                  </div>
                  {note && <div className="sh-note">{note}</div>}
                </li>
              );
            })}
          </ol>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
