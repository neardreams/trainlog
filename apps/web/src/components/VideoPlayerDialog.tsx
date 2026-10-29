// 網站內嵌的訓練影片播放器：從選的那一段開始播，旁邊（窄螢幕在下方）列出各段可以直接跳過去
import { useState, type CSSProperties, type RefObject } from 'react';
import clsx from 'clsx';
import * as Dialog from '@radix-ui/react-dialog';
import {
  dowOf,
  fmtClock,
  isPortrait,
  segmentAt,
  segmentsByExercise,
  segmentsOf,
  slash,
  youtubeEmbedUrl,
  youtubeUrl,
  type DayVideo,
} from '@trainlog/core';
import { GDot } from './ui';
import { Icon } from '@/lib/icons';
import { PEEK_ATTR } from '@/lib/peek';
import { useDs } from '@/lib/useDs';

/** 要播的影片：有 exerciseId 時只列這個動作的各段，沒有時列出當天所有段落（依動作分組）；start 為開始秒數 */
export interface VideoTarget {
  video: DayVideo;
  exerciseId?: string;
  start: number;
}

/**
 * 由父元件在要播放時才掛上、關閉時卸載（iframe 跟著卸載，播放就停止）。
 * returnFocus：關閉後把焦點還給開啟它的按鈕。
 */
export function VideoPlayerDialog({
  target,
  onClose,
  returnFocus,
}: {
  target: VideoTarget;
  onClose: () => void;
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const ds = useDs();
  const { video, exerciseId } = target;
  // n：每次跳段都加 1，iframe 換 key 重新載入（點同一段也會從頭播那一段）
  const [pos, setPos] = useState({ start: target.start, n: 0 });
  const ex = exerciseId ? ds.exerciseById.get(exerciseId) : undefined;
  const groups = exerciseId
    ? [{ exerciseId, segments: segmentsOf(video, exerciseId) }]
    : segmentsByExercise(video);
  const cur = segmentAt(video.segments, pos.start);
  const date = `${slash(video.date)}（${dowOf(video.date)}）`;
  const title = ex ? `${date}${ex.name}` : video.title;
  const nSeg = groups.reduce((n, g) => n + g.segments.length, 0);
  const sub = ex
    ? `${nSeg} 段 · 整支影片 ${fmtClock(video.durationSec)}`
    : `${groups.length} 個動作 · ${nSeg} 段 · ${fmtClock(video.durationSec)}`;

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="vp-overlay"
          // 在歷史側欄裡打開時，點這裡不要關掉側欄；React 的事件也不要傳到列（列點了會開側欄）
          {...{ [PEEK_ATTR]: '' }}
          onClick={(e) => e.stopPropagation()}
        >
          <Dialog.Content
            className={clsx('vp-box', isPortrait(video) ? 'is-portrait' : 'is-landscape')}
            style={{ '--ar': video.width / video.height } as CSSProperties}
            aria-describedby={undefined}
            onCloseAutoFocus={(e) => {
              if (!returnFocus?.current) return;
              e.preventDefault();
              returnFocus.current.focus();
            }}
          >
            <div className="sheet-head vp-head">
              {ex && <GDot group={ex.group} />}
              <div className="sheet-tt">
                <Dialog.Title className="vp-title">{title}</Dialog.Title>
                <div className="sheet-sub">{sub}</div>
              </div>
              <a
                className="btn btn-ghost vp-yt"
                href={youtubeUrl(video.youtubeId, pos.start)}
                target="_blank"
                rel="noopener noreferrer"
                title="在 YouTube 開啟（新分頁）"
                aria-label="在 YouTube 開啟"
              >
                <Icon name="external" />
                <span className="vp-yt-l">在 YouTube 開啟</span>
              </a>
              <Dialog.Close className="btn btn-icon btn-ghost" aria-label="關閉">
                <Icon name="x" />
              </Dialog.Close>
            </div>
            <div className="vp-body">
              <div className="vp-stage">
                <div className="vp-frame">
                  <iframe
                    key={pos.n}
                    src={youtubeEmbedUrl(video.youtubeId, pos.start)}
                    title={`訓練影片：${title}`}
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>
              </div>
              <nav className="vp-side" aria-label="影片段落">
                {groups.map((g) => {
                  const gx = ds.exerciseById.get(g.exerciseId);
                  return (
                    <section key={g.exerciseId} className="vp-group">
                      {!ex && (
                        <h3 className="vp-sec">
                          {gx && <GDot group={gx.group} />}
                          <span className="vp-sec-name">{gx?.name ?? g.exerciseId}</span>
                          <em>{g.segments.length} 段</em>
                        </h3>
                      )}
                      <ol className="vp-list">
                        {g.segments.map((s) => {
                          const on = s === cur;
                          return (
                            <li key={s.start}>
                              <button
                                type="button"
                                className={clsx('vp-seg', on && 'on')}
                                aria-current={on ? 'true' : undefined}
                                title={`從 ${fmtClock(s.start)} 開始播放`}
                                onClick={() => setPos((p) => ({ start: s.start, n: p.n + 1 }))}
                              >
                                <span className="vp-ic">
                                  <Icon name="play" />
                                </span>
                                <span className="vp-label">{s.label}</span>
                                <em>{fmtClock(s.start)}</em>
                              </button>
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  );
                })}
              </nav>
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
