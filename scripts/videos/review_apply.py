"""套用逐支檢查的結果：寫進 _catalog/review.json，並把分錯資料夾的原檔搬到正確的地方。

用法：python scripts/videos/review_apply.py [--dry-run]
讀 _review/batches/ 的 batch-N.json 與 result-N.json（使用者看過檢查頁、修正都改進 result 之後才跑）。
- 先檢查：每支都有結果、動作 id 合法、組號不超過當天組數，有問題就停止
- review.json：同一支（日期＋檔名）以新結果取代
- 搬檔：依動作放到 <日期>/<動作名稱>/（非訓練片段、無法判斷各有資料夾），紀錄寫在 _catalog/moves.json
- 同步更新 _catalog/classification-decisions.json 與 probe.json 的 folder
"""
import argparse
import datetime as dt
import glob
import os
import re

from _common import (
    CATALOG, PROBE_JSON, REVIEW_DIR, REVIEW_JSON, TRAINING, exercise_names, folder_of, load, save, training_data,
)

ap = argparse.ArgumentParser()
ap.add_argument("--dry-run", action="store_true")
a = ap.parse_args()

td = training_data()
names = exercise_names(td)
sets_of = {(e["id"], h["date"]): len(h["sets"]) for e in td["exercises"] for h in e["history"]}
bdir = os.path.join(REVIEW_DIR, "batches")
batches = sorted(glob.glob(os.path.join(bdir, "batch-*.json")), key=lambda p: int(re.search(r"(\d+)\.json$", p).group(1)))
if not batches:
    raise SystemExit(f"{bdir} 沒有 batch，先跑 review_prepare.py")

problems, merged = [], []
for bp in batches:
    rp = bp.replace("batch-", "result-")
    res = load(rp)
    if res is None:
        problems.append(f"缺少 {os.path.basename(rp)}")
        continue
    got = {(c["date"], c["file"]): c for c in res["clips"]}
    for day in load(bp):
        for c in day["clips"]:
            r = got.get((day["date"], c["file"]))
            if r is None:
                problems.append(f"{day['date']} {c['file']}：沒有檢查結果")
                continue
            eid = r.get("exerciseId")
            if not (eid in names or eid in ("non_training", "unclear") or str(eid).startswith("new:")):
                problems.append(f"{day['date']} {c['file']}：動作 id 不合法：{eid}")
            n = sets_of.get((eid, day["date"]))
            if r.get("set") is not None and (n is None or not 1 <= r["set"] <= n):
                problems.append(f"{day['date']} {c['file']}：第 {r['set']} 組對不到當天紀錄（{n} 組）")
            keep = {k: r.get(k) for k in ("exerciseId", "confidence", "role", "side", "visibleLoad", "set",
                                          "setConfidence", "label", "note") if r.get(k) is not None}
            merged.append({"date": day["date"], "file": c["file"], "from": c["currentFolder"], **keep,
                           **({"dateUncertain": c["dateUncertain"]} if c.get("dateUncertain") else {})})
if problems:
    print(f"有 {len(problems)} 個問題，沒有套用：")
    for p in problems[:50]:
        print("  " + p)
    raise SystemExit(1)

moves = []
for m in merged:
    to = folder_of(m["exerciseId"], names)
    if to != m["from"]:
        moves.append({"date": m["date"], "file": m["file"], "from": m["from"], "to": to, "exerciseId": m["exerciseId"]})
print(f"{len(merged)} 支的檢查結果；要搬 {len(moves)} 支：")
for mv in moves:
    print(f"  {mv['date']} {mv['file']}：{mv['from']} → {mv['to']}")
if a.dry_run:
    raise SystemExit

for mv in moves:
    src = os.path.join(TRAINING, mv["date"], mv["from"], mv["file"])
    dst_dir = os.path.join(TRAINING, mv["date"], mv["to"])
    os.makedirs(dst_dir, exist_ok=True)
    if os.path.exists(os.path.join(dst_dir, mv["file"])):
        raise SystemExit(f"目的地已有同名檔案：{mv['date']}/{mv['to']}/{mv['file']}")
    os.replace(src, os.path.join(dst_dir, mv["file"]))

now = dt.datetime.now().astimezone().isoformat(timespec="seconds")
review = {(r["date"], r["file"]): r for r in load(REVIEW_JSON, [])}
for m in merged:
    review[(m["date"], m["file"])] = {k: v for k, v in m.items() if k != "from"} | {"reviewedAt": now}
save(REVIEW_JSON, sorted(review.values(), key=lambda r: (r["date"], r["file"])))

log = load(os.path.join(CATALOG, "moves.json"), [])
save(os.path.join(CATALOG, "moves.json"), log + [mv | {"movedAt": now} for mv in moves])

dpath = os.path.join(CATALOG, "classification-decisions.json")
decisions = load(dpath, {})
for m in merged:
    eid = m["exerciseId"]
    if eid == "non_training":
        decisions[m["file"]] = {"nonTraining": True, "evidence": m.get("note", "")}
    elif eid == "unclear":
        decisions[m["file"]] = {"label": "待確認", "status": "needs_review", "evidence": m.get("note", "")}
    else:
        decisions[m["file"]] = {"exerciseId": eid, "evidence": m.get("note", "")}
save(dpath, decisions, indent=2)

moved = {(mv["date"], mv["file"]): mv["to"] for mv in moves}
probe = load(PROBE_JSON, [])
for p in probe:
    if (p["date"], p["file"]) in moved:
        p["folder"] = moved[(p["date"], p["file"])]
save(PROBE_JSON, probe, indent=0)
print(f"已寫入 {REVIEW_JSON}（共 {len(review)} 支），搬了 {len(moves)} 支。下一步：render.py")
