"""每個訓練日合併成一支影片（1080p、30fps、SDR、H.264/AAC），並產生章節。

用法：
  python scripts/videos/render.py --dry-run                 # 只列出每天的畫面方向與章節
  python scripts/videos/render.py [--dates 2026-11-02,...]  # 轉檔；已有成品的日子跳過
  python scripts/videos/render.py --dates 2026-11-02 --redo # 重新串接（例如章節標籤改了；分段檔沿用）
讀 _catalog/probe.json、_catalog/review.json；輸出 _render/<日期>.mp4 與 <日期>.json（標題、說明欄章節、各段時間）。
每支原檔先轉成當天畫面大小的分段檔（_render/_parts/），再無損串接；章節時間用分段檔的實際長度。
需要 ffmpeg；有 NVIDIA 顯示卡時用 NVENC。
"""
import argparse
import collections
import concurrent.futures
import datetime as dt
import os
import subprocess
import threading

from _common import (
    PROBE_JSON, RENDER, REVIEW_JSON, TONEMAP, WEEK, clip_path, ex_name, exercise_names, load, parse_dates,
    recorded_at, renders_this, save,
)

ap = argparse.ArgumentParser()
ap.add_argument("--dates", help="逗號分隔；不給就是全部")
ap.add_argument("--dry-run", action="store_true")
ap.add_argument("--redo", action="store_true", help="刪掉這些日子的成品重新串接")
ap.add_argument("--workers", type=int, default=3)
a = ap.parse_args()

names = exercise_names()
probe = {(p["date"], p["file"]): p for p in load(PROBE_JSON, [])}
review = load(REVIEW_JSON, [])
only = set(parse_dates(a.dates))
parts_root = os.path.join(RENDER, "_parts")

days = collections.defaultdict(list)
for r in review:
    if not renders_this(r) or (only and r["date"] not in only):
        continue
    p = probe.get((r["date"], r["file"]))
    if p is None or "error" in p:
        raise SystemExit(f"probe.json 沒有 {r['date']} {r['file']}，先跑 probe.py")
    days[r["date"]].append({**r, "p": p, "t": recorded_at(p)})

plans = []
for date in sorted(days):
    clips = sorted(days[date], key=lambda c: c["t"])
    total = sum(c["p"]["dur"] for c in clips)
    portrait = sum(c["p"]["h"] > c["p"]["w"] for c in clips) >= len(clips) / 2
    # 直式而且 3 分鐘以內的影片會被 YouTube 當成 Shorts（手機上沒有章節、不能跳時間），改用橫式
    if portrait and total <= 180:
        portrait = False
    W, H = (1080, 1920) if portrait else (1920, 1080)
    # 章節標題：確定組數的用檢查結果的標籤；其他是「片段 N」，N 是這支在當天這個動作中的順序
    seq = collections.Counter()
    for c in clips:
        seq[c["exerciseId"]] += 1
        label = c.get("label") or ""
        if label.startswith("片段") or not label or label == "—":
            side = f"（{c['side']}）" if c.get("side") in ("左", "右") else ""
            label = f"片段 {seq[c['exerciseId']]}{side}"
        c["chapter"] = f"{ex_name(c['exerciseId'], names)}｜{label}"
    plans.append({"date": date, "clips": clips, "W": W, "H": H, "total": total})

print(f"{len(plans)} 天、{sum(len(p['clips']) for p in plans)} 支；畫面 "
      f"{dict(collections.Counter(f'{p[chr(87)]}x{p[chr(72)]}' for p in plans))}")
if a.dry_run:
    for p in plans:
        print(p["date"], f"{p['W']}x{p['H']}", f"{p['total']:.0f}s", [c["chapter"] for c in p["clips"]])
    raise SystemExit
if a.redo:
    for p in plans:
        for ext in (".mp4", ".json"):
            f = os.path.join(RENDER, p["date"] + ext)
            if os.path.exists(f):
                os.remove(f)

log_lock = threading.Lock()
os.makedirs(parts_root, exist_ok=True)


def log(msg):
    with log_lock, open(os.path.join(RENDER, "render-log.txt"), "a", encoding="utf-8") as f:
        f.write(f"{dt.datetime.now():%Y-%m-%d %H:%M:%S} {msg}\n")


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if p.returncode != 0:
        raise RuntimeError(p.stderr[-800:])
    return p.stdout


def part_path(plan, c):
    return os.path.join(parts_root, plan["date"], f"{os.path.splitext(c['file'])[0]}-{plan['W']}x{plan['H']}.mp4")


def make_part(plan, c):
    dst = part_path(plan, c)
    if os.path.exists(dst):
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    W, H, p = plan["W"], plan["H"], c["p"]
    tm = TONEMAP if p.get("transfer") == "arib-std-b67" else ""
    pre = f"fps=30,scale={W}:{H}:force_original_aspect_ratio=decrease,{tm}setsar=1"
    if (p["h"] > p["w"]) == (H > W):
        vf = f"[0:v]{pre},pad={W}:{H}:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v]"
    else:
        # 方向不同：放在中間，兩側用放大、模糊的同一個畫面補滿
        vf = (f"[0:v]{pre},split[f][b];[b]scale={W // 8}:{H // 8}:force_original_aspect_ratio=increase,"
              f"crop={W // 8}:{H // 8},boxblur=6:2,scale={W}:{H}[bg];[bg][f]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]")
    # 第一條能解碼的音軌（有些 iPhone 影片第一條是空間音訊 apple_apac，ffmpeg 不能解）；都沒有就補靜音
    tracks = p.get("audio") or []
    usable = [k for k, codec in enumerate(tracks) if codec != "apple_apac"]
    extra, a_in = ([], f"[0:a:{usable[0]}]") if usable else (["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"], "[1:a]")
    af = f"{a_in}aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:{p['dur']:.3f}[a]"
    tmp = dst + ".tmp.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-hwaccel", "cuda", "-i", clip_path(p), *extra, "-filter_complex", f"{vf};{af}",
         "-map", "[v]", "-map", "[a]", "-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "23",
         "-b:v", "8M", "-maxrate", "12M", "-bufsize", "16M", "-g", "60", "-c:a", "aac", "-b:a", "160k",
         "-ar", "48000", "-t", f"{p['dur']:.3f}", tmp])
    os.replace(tmp, dst)


def duration(path):
    return float(run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).strip())


def ts(sec):
    s = int(sec)
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}" if s >= 3600 else f"{s // 60}:{s % 60:02d}"


def finish_day(plan):
    date = plan["date"]
    out, meta_out = os.path.join(RENDER, f"{date}.mp4"), os.path.join(RENDER, f"{date}.json")
    if os.path.exists(out) and os.path.exists(meta_out):
        return
    t, clips = 0.0, []
    for c in plan["clips"]:
        d = duration(part_path(plan, c))
        clips.append({"file": c["file"], "start": round(t, 3), "end": round(t + d, 3), "exerciseId": c["exerciseId"],
                      "set": c.get("set") if c.get("setConfidence") in ("high", "medium") else None,
                      "side": c.get("side") if c.get("side") in ("左", "右") else None,
                      "role": c.get("role"), "chapter": c["chapter"]})
        t += d
    # 章節：相鄰同名的合併；不到 10 秒的併進鄰近的章節（YouTube 規定每段至少 10 秒、第一段從 0:00 開始）
    chapters = []
    for c in clips:
        if chapters and chapters[-1]["title"] == c["chapter"]:
            chapters[-1]["end"] = c["end"]
            chapters[-1]["files"].append(c["file"])
        else:
            chapters.append({"title": c["chapter"], "start": c["start"], "end": c["end"], "files": [c["file"]]})
    i = 0
    while i < len(chapters):
        ch = chapters[i]
        if ch["end"] - ch["start"] < 10 and len(chapters) > 1:
            j = i - 1 if i > 0 else i + 1
            nb = chapters[j]
            nb["start"], nb["end"] = min(nb["start"], ch["start"]), max(nb["end"], ch["end"])
            nb["files"] = nb["files"] + ch["files"] if j < i else ch["files"] + nb["files"]
            chapters.pop(i)
            i = max(i - 1, 0)
            continue
        i += 1
    chapters[0]["start"] = 0.0

    y, m, d_ = date.split("-")
    wd = WEEK[dt.date(int(y), int(m), int(d_)).weekday()]
    title = f"{y}/{m}/{d_}（{wd}）{'、'.join(dict.fromkeys(ex_name(c['exerciseId'], names) for c in plan['clips']))}"
    if len(title) > 100:
        title = title[:99] + "…"
    desc = f"{y}/{m}/{d_}（{wd}）訓練影片\n\n" + "\n".join(f"{ts(ch['start'])} {ch['title']}" for ch in chapters)

    day_parts = os.path.join(parts_root, date)
    lst, ffmeta = os.path.join(day_parts, "list.txt"), os.path.join(day_parts, "chapters.ffmeta")
    with open(lst, "w", encoding="utf-8") as f:
        f.writelines(f"file '{part_path(plan, c)}'\n" for c in plan["clips"])
    with open(ffmeta, "w", encoding="utf-8") as f:
        f.write(f";FFMETADATA1\ntitle={title}\n")
        for ch in chapters:
            f.write(f"[CHAPTER]\nTIMEBASE=1/1000\nSTART={int(ch['start'] * 1000)}\nEND={int(ch['end'] * 1000)}\ntitle={ch['title']}\n")
    tmp = out + ".tmp.mp4"
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-i", ffmeta, "-map", "0",
         "-map_metadata", "1", "-map_chapters", "1", "-c", "copy", "-movflags", "+faststart", tmp])
    os.replace(tmp, out)
    save(meta_out, {"date": date, "file": f"{date}.mp4", "durationSec": round(t, 3), "canvas": f"{plan['W']}x{plan['H']}",
                    "title": title, "description": desc, "chapters": chapters, "clips": clips})
    log(f"DONE {date} {len(clips)} clips {t:.0f}s {plan['W']}x{plan['H']} {os.path.getsize(out) / 1e6:.0f}MB")


pending = {p["date"]: len(p["clips"]) for p in plans}
lock = threading.Lock()
errors = []


def job(plan, c):
    try:
        make_part(plan, c)
    except Exception as e:
        errors.append(f"{plan['date']} {c['file']}：{e}")
        log(f"ERROR part {plan['date']} {c['file']}: {e}")
        return
    with lock:
        pending[plan["date"]] -= 1
        ready = pending[plan["date"]] == 0
    if ready:
        try:
            finish_day(plan)
        except Exception as e:
            errors.append(f"{plan['date']} 串接：{e}")
            log(f"ERROR day {plan['date']}: {e}")


log(f"START {len(plans)} days")
with concurrent.futures.ThreadPoolExecutor(a.workers) as ex:
    list(ex.map(lambda pc: job(*pc), [(p, c) for p in plans for c in p["clips"]]))
log(f"END errors {len(errors)}")
print(f"完成，錯誤 {len(errors)} 個。下一步：verify_render.py")
for e in errors:
    print("  " + e)
