"""準備逐支檢查：每支原檔抽 6 格拼成預覽圖，並依日期分批附上當天日誌與訓練紀錄。

用法：
  python scripts/videos/review_prepare.py                 # 還沒有檢查結果的日子
  python scripts/videos/review_prepare.py --dates 2026-11-02,2026-11-04
輸出（local-media/training/_review/）：
  sheets/<日期>_<檔名>.jpg       預覽圖（同一支影片平均抽 6 格，由左到右）
  batches/batch-N.json           每批約 90 支：clips（時間順序、間隔）、trainingEntries、journal
  batches/library.json           動作庫（id、name、group）
接著把每個 batch 交給 AI 依 scripts/videos/review-prompt.md 檢查，結果寫成 batches/result-N.json。
先跑 probe.py。需要 ffmpeg。
"""
import argparse
import collections
import concurrent.futures
import glob
import os
import subprocess

from _common import (
    NEEDS_REVIEW, NON_TRAINING, PROBE_JSON, REVIEW_DIR, REVIEW_JSON, TONEMAP,
    clip_path, journals, load, parse_dates, recorded_at, save, training_data,
)

ap = argparse.ArgumentParser()
ap.add_argument("--dates", help="逗號分隔；不給就是還沒有檢查結果的日子")
ap.add_argument("--batch-size", type=int, default=90)
a = ap.parse_args()

probe = load(PROBE_JSON)
if not probe:
    raise SystemExit(f"找不到 {PROBE_JSON}，先跑 probe.py")
reviewed = {(r["date"], r["file"]) for r in load(REVIEW_JSON, [])}
dates = parse_dates(a.dates) or sorted({p["date"] for p in probe if (p["date"], p["file"]) not in reviewed})
if not dates:
    raise SystemExit("沒有需要檢查的日子")

td = training_data()
names = {e["name"]: e["id"] for e in td["exercises"]}
entries = collections.defaultdict(list)
for e in td["exercises"]:
    for h in e["history"]:
        x = {"exerciseId": e["id"], "name": e["name"], "sets": h["sets"]}
        for k in ("sets_display", "feel", "exhaustion", "cue", "minutes", "distance_km"):
            if h.get(k) not in (None, ""):
                x[k] = h[k]
        entries[h["date"]].append(x)
jr = journals()
sheets_dir = os.path.join(REVIEW_DIR, "sheets")
os.makedirs(sheets_dir, exist_ok=True)


def sheet_path(p):
    return os.path.join(sheets_dir, f"{p['date']}_{os.path.splitext(p['file'])[0]}.jpg")


def make_sheet(p, n=6):
    dst = sheet_path(p)
    if os.path.exists(dst):
        return None
    scale = "scale=-2:400" if p["h"] > p["w"] else "scale=400:-2"
    tm = TONEMAP if p.get("transfer") == "arib-std-b67" else ""
    # 直接跳到 n 個時間點各取一格，不必整支解碼
    inputs = []
    for k in range(n):
        inputs += ["-ss", f"{(k + 0.5) / n * p['dur']:.2f}", "-i", clip_path(p)]
    fc = ";".join(f"[{k}:v]{scale},{tm}setsar=1,trim=end_frame=1[f{k}]" for k in range(n))
    fc += ";" + "".join(f"[f{k}]" for k in range(n)) + f"hstack=inputs={n}"
    cmd = ["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", fc, "-frames:v", "1", "-q:v", "4", dst]
    if subprocess.run(cmd, capture_output=True).returncode == 0 and os.path.exists(dst):
        return None
    # 極短的片段跳點會失敗，改成整支解碼平均取格
    vf = f"fps={n}/{max(p['dur'], 0.1):.2f},{scale},{tm}tile={n}x1"
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", clip_path(p), "-vf", vf, "-frames:v", "1", "-q:v", "4", dst],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    return None if r.returncode == 0 else f"{p['date']}/{p['folder']}/{p['file']}：{r.stderr[-200:]}"


targets = [p for p in probe if p["date"] in dates and "error" not in p]
with concurrent.futures.ThreadPoolExecutor(6) as ex:
    errors = [e for e in ex.map(make_sheet, targets) if e]


def current_id(folder):
    if folder == NEEDS_REVIEW:
        return "needs_review"
    if folder == NON_TRAINING:
        return "non_training"
    return names.get(folder) or f"new:{folder}"


days = []
by_date = collections.defaultdict(list)
for p in targets:
    by_date[p["date"]].append(p)
for d in sorted(by_date):
    clips, prev = [], None
    for p in sorted(by_date[d], key=recorded_at):
        t = recorded_at(p)
        gap = None if prev is None else round(((t - recorded_at(prev)).total_seconds() - prev["dur"]) / 60, 1)
        clips.append({
            "file": p["file"],
            "sheet": sheet_path(p),
            "currentFolder": p["folder"],
            "currentExerciseId": current_id(p["folder"]),
            "recordedAt": t.strftime("%H:%M:%S"),
            "durationSec": round(p["dur"]),
            "gapFromPrevClipMin": gap,
            "orientation": "portrait" if p["h"] > p["w"] else "landscape",
            # 不是 iPhone 相機寫的拍攝時間（例如別人傳來、從 App 存下來的檔案）時，日期可能是存檔時間
            **({} if p.get("createdSource") == "apple" else {"dateUncertain": p.get("createdSource") or "none"}),
        })
        prev = p
    days.append({"date": d, "clips": clips, "trainingEntries": entries.get(d, []), "journal": jr.get(d)})

bdir = os.path.join(REVIEW_DIR, "batches")
os.makedirs(bdir, exist_ok=True)
for old in glob.glob(os.path.join(bdir, "batch-*.json")) + glob.glob(os.path.join(bdir, "result-*.json")):
    os.remove(old)
save(os.path.join(bdir, "library.json"), [{"id": e["id"], "name": e["name"], "group": e["group"]} for e in td["exercises"]])
batches, cur, n = [], [], 0
for day in days:
    if cur and n + len(day["clips"]) > a.batch_size:
        batches.append(cur)
        cur, n = [], 0
    cur.append(day)
    n += len(day["clips"])
if cur:
    batches.append(cur)
for i, b in enumerate(batches, 1):
    save(os.path.join(bdir, f"batch-{i}.json"), b)
    print(f"batch-{i}.json：{b[0]['date']}～{b[-1]['date']}，{len(b)} 天、{sum(len(x['clips']) for x in b)} 支")
print(f"預覽圖 {len(targets)} 張在 {sheets_dir}")
for e in errors:
    print("  預覽圖失敗：" + e)
print("下一步：每個 batch 交給 AI 依 scripts/videos/review-prompt.md 檢查，輸出 result-N.json；再跑 review_page.py")
