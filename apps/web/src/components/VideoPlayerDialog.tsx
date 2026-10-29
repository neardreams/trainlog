// 網站內嵌的訓練影片播放器：從選的那一段開始播，旁邊（窄螢幕在下方）列出各段可以直接跳過去；
// 單一動作時可以切到「所有日期」，看同一個動作在其他天的影片
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import clsx from 'clsx';
import * as Dialog from '@radix-ui/react-dialog';
import {
  YOUTUBE_EMBED_ORIGIN,
  dowOf,
  exerciseVideos,
  fmtClock,
  isPortrait,
  md,
  segmentAt,
  segmentsByExercise,
  segmentsOf,
  slash,
  youtubeEmbedUrl,
  youtubeUrl,
  type DayVideo,
  type VideoSegment,
} from '@trainlog/core';
import { GDot, Seg } from './ui';
import { Icon } from '@/lib/icons';
import { PEEK_ATTR } from '@/lib/peek';
import { usePlayer, type VideoTarget } from '@/lib/player';
import { useDs } from '@/lib/useDs';

/** AppShell 掛一個：任何地方呼叫 openVideo() 就會開啟 */
export function VideoPlayerHost() {
  const { target, returnTo, n, close } = usePlayer();
  return target ? <VideoPlayerDialog key={n} target={target} onClose={close} returnTo={returnTo} /> : null;
}

const PLAYING = 1;
const BUFFERING = 3;

/**
 * 和內嵌播放器溝通（YouTube 播放器的訊息介面）：跳段、播放、換影片，並回報播放到第幾秒。
 * 點段落時在同一個播放器裡跳過去繼續播，不重新載入（重新載入的播放器常被瀏覽器擋下自動播放，要再按一次播放）。
 * 開啟時瀏覽器不允許有聲音的自動播放，就改成靜音播放，並顯示「開啟聲音」。
 */
function useYouTube(frame: RefObject<HTMLIFrameElement | null>) {
  const ready = useRef(false);
  const state = useRef<number>(undefined);
  const listen = useRef<number>(undefined);
  const [time, setTime] = useState<number>();
  const [autoMuted, setAutoMuted] = useState(false);

  const post = useCallback(
    (msg: object) => {
      frame.current?.contentWindow?.postMessage(JSON.stringify(msg), YOUTUBE_EMBED_ORIGIN);
    },
    [frame],
  );
  const send = useCallback(
    (func: string, ...args: unknown[]) => post({ event: 'command', func, args, id: 1, channel: 'widget' }),
    [post],
  );

  useEffect(() => {
    let check: number | undefined;
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== YOUTUBE_EMBED_ORIGIN || e.source !== frame.current?.contentWindow) return;
      if (typeof e.data !== 'string') return;
      let m: { event?: unknown; info?: unknown };
      try {
        m = JSON.parse(e.data) as typeof m;
      } catch {
        return;
      }
      if (m.event === 'onReady' && !ready.current) {
        ready.current = true;
        send('playVideo');
        check = window.setTimeout(() => {
          if (state.current === PLAYING || state.current === BUFFERING) return;
          send('mute');
          send('playVideo');
          setAutoMuted(true);
        }, 1500);
      } else if (m.event === 'infoDelivery' && m.info && typeof m.info === 'object') {
        const info = m.info as { currentTime?: unknown; playerState?: unknown; muted?: unknown };
        if (typeof info.playerState === 'number') state.current = info.playerState;
        if (typeof info.currentTime === 'number') setTime(info.currentTime);
        if (info.muted === false) setAutoMuted(false);
      } else if (m.event === 'onStateChange' && typeof m.info === 'number') state.current = m.info;
    };
    addEventListener('message', onMsg);
    return () => {
      removeEventListener('message', onMsg);
      clearTimeout(check);
      clearInterval(listen.current);
    };
  }, [frame, send]);

  /** iframe 載入後要先訂閱，播放器才會回報；收到 onReady 前每 250ms 送一次（最多 10 秒） */
  const onLoad = useCallback(() => {
    ready.current = false;
    state.current = undefined;
    clearInterval(listen.current);
    let i = 0;
    listen.current = window.setInterval(() => {
      if (ready.current || ++i > 40) clearInterval(listen.current);
      else post({ event: 'listening', id: 1, channel: 'widget' });
    }, 250);
  }, [post]);

  return {
    onLoad,
    time,
    autoMuted,
    isReady: () => ready.current,
    seek: (sec: number) => {
      send('seekTo', sec, true);
      send('playVideo');
      setTime(sec);
    },
    load: (youtubeId: string, sec: number) => {
      send('loadVideoById', { videoId: youtubeId, startSeconds: sec });
      setTime(sec);
    },
    unmute: () => {
      send('unMute');
      send('playVideo');
      setAutoMuted(false);
    },
  };
}

interface Group {
  key: string;
  video: DayVideo;
  segments: VideoSegment[];
  /** 依動作分組時的動作；所有日期時是 undefined（標題顯示日期） */
  exerciseId?: string;
}

export function VideoPlayerDialog({
  target,
  onClose,
  returnTo,
}: {
  target: VideoTarget;
  onClose: () => void;
  returnTo?: HTMLElement | null;
}) {
  const ds = useDs();
  const { exerciseId } = target;
  const ex = exerciseId ? ds.exerciseById.get(exerciseId) : undefined;
  const days = useMemo(() => (exerciseId ? exerciseVideos(ds, exerciseId) : []), [ds, exerciseId]);
  const [allDays, setAllDays] = useState(Boolean(target.allDays) && days.length > 1);
  const [video, setVideo] = useState(target.video);
  // iframe 的網址只在第一次或播放器沒回應時改（換 n 重新掛上），其他時候用訊息跳段
  const [mount, setMount] = useState({ id: target.video.youtubeId, start: target.start, n: 0 });
  const frame = useRef<HTMLIFrameElement>(null);
  const yt = useYouTube(frame);
  const side = useRef<HTMLElement>(null);

  const groups: Group[] = allDays
    ? days.map((d) => ({ key: d.video.date, video: d.video, segments: d.segments }))
    : exerciseId
      ? [{ key: exerciseId, video, segments: segmentsOf(video, exerciseId), exerciseId }]
      : segmentsByExercise(video).map((g) => ({ key: g.exerciseId, video, ...g }));
  const cur = segmentAt(video.segments, yt.time ?? mount.start);
  const date = `${slash(video.date)}（${dowOf(video.date)}）`;
  const title = ex ? `${date}${ex.name}` : video.title;
  const nSeg = groups.reduce((n, g) => n + g.segments.length, 0);
  const sub = allDays
    ? `${days.length} 天的影片 · ${nSeg} 段`
    : ex
      ? `${nSeg} 段 · 整支影片 ${fmtClock(video.durationSec)}`
      : `${groups.length} 個動作 · ${nSeg} 段 · ${fmtClock(video.durationSec)}`;

  const jump = (v: DayVideo, sec: number) => {
    // 窄螢幕清單在播放器下方：點了下面的段落，捲回看得到播放器的位置
    frame.current?.parentElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (!yt.isReady()) {
      // 播放器沒有回應（例如還在載入）：重新載入，從這一段開始
      setVideo(v);
      setMount((m) => ({ id: v.youtubeId, start: sec, n: m.n + 1 }));
    } else if (v.youtubeId === video.youtubeId) yt.seek(sec);
    else {
      setVideo(v);
      yt.load(v.youtubeId, sec);
    }
  };

  // 所有日期的清單很長：打開或切換時，清單（可以捲動時）捲到正在播的那一段
  useEffect(() => {
    const box = side.current;
    const on = box?.querySelector<HTMLElement>('.vp-seg.on');
    if (box && on && box.scrollHeight > box.clientHeight)
      box.scrollTop = on.offsetTop - box.clientHeight / 2 + on.offsetHeight / 2;
    // 只在切換「這一天／所有日期」時捲動，播放中換段不捲
  }, [allDays]);

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
              if (!returnTo?.isConnected) return;
              e.preventDefault();
              returnTo.focus();
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
                href={youtubeUrl(video.youtubeId, yt.time ?? mount.start)}
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
                    key={mount.n}
                    ref={frame}
                    src={youtubeEmbedUrl(mount.id, mount.start, location.origin)}
                    title={`訓練影片：${title}`}
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    referrerPolicy="strict-origin-when-cross-origin"
                    onLoad={yt.onLoad}
                  />
                </div>
                {yt.autoMuted && (
                  <button type="button" className="btn vp-unmute" onClick={yt.unmute}>
                    <Icon name="volume" />
                    目前靜音播放，點這裡開啟聲音
                  </button>
                )}
              </div>
              <nav className="vp-side" aria-label="影片段落" ref={side}>
                {exerciseId && days.length > 1 && (
                  <Seg
                    className="vp-scope"
                    label="影片範圍"
                    value={allDays ? 'all' : 'day'}
                    options={[
                      ['day', '這一天'],
                      ['all', `所有 ${days.length} 天`],
                    ]}
                    onChange={(v) => setAllDays(v === 'all')}
                  />
                )}
                {groups.map((g) => {
                  const gx = g.exerciseId ? ds.exerciseById.get(g.exerciseId) : undefined;
                  const heading = allDays ? (
                    <h3 className="vp-sec">
                      <span className="vp-sec-name">
                        {md(g.video.date)}（{dowOf(g.video.date)}）
                      </span>
                      <em>{g.segments.length} 段</em>
                    </h3>
                  ) : !ex ? (
                    <h3 className="vp-sec">
                      {gx && <GDot group={gx.group} />}
                      <span className="vp-sec-name">{gx?.name ?? g.exerciseId}</span>
                      <em>{g.segments.length} 段</em>
                    </h3>
                  ) : null;
                  return (
                    <section key={g.key} className="vp-group">
                      {heading}
                      <ol className="vp-list">
                        {g.segments.map((s) => {
                          const on = g.video.date === video.date && s === cur;
                          return (
                            <li key={s.start}>
                              <button
                                type="button"
                                className={clsx('vp-seg', on && 'on')}
                                aria-current={on ? 'true' : undefined}
                                title={`從 ${fmtClock(s.start)} 開始播放`}
                                onClick={() => jump(g.video, s.start)}
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
