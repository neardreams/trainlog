"""用 ffprobe 量每支原檔的格式 → local-media/training/_catalog/probe.json

用法：python scripts/videos/probe.py [--force]
只量新增或大小有變的檔案；檔案換了資料夾只更新 folder。需要 ffprobe（ffmpeg 套件）。
"""
import argparse
import concurrent.futures
import json
import os
import subprocess

from _common import PROBE_JSON, TRAINING, iter_clips, load, save

ap = argparse.ArgumentParser()
ap.add_argument("--force", action="store_true", help="全部重新量")
ap.add_argument("--workers", type=int, default=12)
a = ap.parse_args()


def probe(path):
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", path],
        capture_output=True, text=True, encoding="utf-8",
    )
    if r.returncode != 0:
        return {"error": r.stderr.strip()[:300]}
    j = json.loads(r.stdout)
    v = next((s for s in j["streams"] if s.get("codec_type") == "video"), {})
    rot = 0
    for sd in v.get("side_data_list") or []:
        if "rotation" in sd:
            rot = int(sd["rotation"])
    w, h = v.get("width"), v.get("height")
    if rot in (90, -90, 270, -270):
        w, h = h, w
    n, d = (v.get("avg_frame_rate") or "0/1").split("/")
    tags = j["format"].get("tags", {})
    return {
        "codec": v.get("codec_name"),
        "w": w,
        "h": h,
        "rot": rot,
        "fps": round(int(n) / int(d), 2) if int(d) else 0,
        "transfer": v.get("color_transfer"),
        "audio": [s.get("codec_name") for s in j["streams"] if s.get("codec_type") == "audio"],
        "dur": round(float(j["format"].get("duration", 0)), 2),
        "created": tags.get("com.apple.quicktime.creationdate") or tags.get("creation_time"),
        # 只有 iPhone 相機寫的時間可靠；從其他 App 存下來的檔案只有容器時間（可能是存檔時間）
        "createdSource": "apple" if tags.get("com.apple.quicktime.creationdate") else
                         "container" if tags.get("creation_time") else None,
        "bytes": int(j["format"].get("size", 0)),
    }


old = {} if a.force else {(p["date"], p["file"]): p for p in load(PROBE_JSON, [])}
rows, todo = [], []
for date, folder, f in iter_clips():
    size = os.path.getsize(os.path.join(TRAINING, date, folder, f))
    p = old.get((date, f))
    if p and p.get("bytes") == size and "error" not in p:
        rows.append({**p, "folder": folder})
    else:
        todo.append({"date": date, "folder": folder, "file": f})

with concurrent.futures.ThreadPoolExecutor(a.workers) as ex:
    for t, res in zip(todo, ex.map(lambda t: probe(os.path.join(TRAINING, t["date"], t["folder"], t["file"])), todo)):
        rows.append({**t, **res})

rows.sort(key=lambda p: (p["date"], p["folder"], p["file"]))
save(PROBE_JSON, rows, indent=0)
errors = [p for p in rows if "error" in p]
removed = len(set(old) - {(p["date"], p["file"]) for p in rows})
print(f"{PROBE_JSON}：{len(rows)} 支（新量 {len(todo)} 支，移除 {removed} 支已不存在的）")
for p in errors:
    print(f"  無法讀取：{p['date']}/{p['folder']}/{p['file']}：{p['error']}")
