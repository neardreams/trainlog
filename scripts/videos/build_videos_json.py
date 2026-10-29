"""合併影片的章節資料＋YouTube 上傳紀錄 → data/videos.json

用法：python scripts/videos/build_videos_json.py [--render-dir DIR] [--data-dir DIR]
讀取：
  <render-dir>/<YYYY-MM-DD>.json      合併影片的章節與各段時間（render.py 產生）
  <render-dir>/upload/results.json    已上傳的影片 ID（[{"date", "videoId", ...}]，上傳者寫入）
只收已經有 YouTube ID 的日子；寫完請執行 pnpm validate:data。
"""
import argparse
import os
import sys

from _common import DATA, RENDER, load, save

ap = argparse.ArgumentParser()
ap.add_argument("--render-dir", default=RENDER)
ap.add_argument("--data-dir", default=DATA)
a = ap.parse_args()

uploaded = {r["date"]: r["videoId"] for r in load(os.path.join(a.render_dir, "upload", "results.json"), [])
            if r.get("videoId")}

videos, warnings = [], []
for date in sorted(uploaded):
    day = load(os.path.join(a.render_dir, f"{date}.json"))
    if day is None:
        warnings.append(f"{date}：有上傳紀錄，但找不到 {date}.json")
        continue
    clips = {c["file"]: c for c in day["clips"]}
    segments = []
    for ch in day["chapters"]:
        members = [clips[f] for f in ch["files"]]
        ids = {c["exerciseId"] for c in members}
        if len(ids) != 1:
            warnings.append(f"{date} {ch['title']}：一段裡有不同動作 {sorted(ids)}，略過")
            continue
        sets = {c.get("set") for c in members}
        sides = {c.get("side") for c in members}
        seg = {"exercise_id": ids.pop(), "start": round(ch["start"], 3), "end": round(ch["end"], 3),
               "label": ch["title"].split("｜", 1)[-1]}
        if len(sets) == 1 and None not in sets:
            seg["set"] = sets.pop()
        if len(sides) == 1 and None not in sides:
            seg["side"] = sides.pop()
        segments.append(seg)
    videos.append({"date": date, "youtube_id": uploaded[date], "duration_sec": round(day["durationSec"], 3),
                   "title": day["title"], "segments": segments})

out = os.path.join(a.data_dir, "videos.json")
save(out, {"videos": videos}, indent=2)
print(f"寫入 {out}：{len(videos)} 支影片、{sum(len(v['segments']) for v in videos)} 段")
for w in warnings:
    print("注意：" + w, file=sys.stderr)
