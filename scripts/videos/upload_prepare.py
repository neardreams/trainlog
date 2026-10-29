"""準備上傳：每支合併影片的 YouTube 標題與說明欄（章節＋每個動作的紀錄＋日誌原文），以及給上傳者的任務說明。

用法：
  python scripts/videos/upload_prepare.py --excerpt-input
      → _render/upload/excerpt-input.json：還沒有日誌原文的（日期、動作）；交給 AI 依 scripts/videos/excerpt-prompt.md 擷取
  python scripts/videos/upload_prepare.py --add-excerpts <AI 的輸出.json>
      → 併進 _render/upload/excerpts.json（會逐行檢查是不是日誌原文）
  python scripts/videos/upload_prepare.py
      → _render/upload/manifest.json、<日期>.txt、playlists.json、CODEX_TASK.md
        （上傳者照 manifest 填寫標題、說明、錄製日期、類別、播放清單，影片 ID 寫進 results.json）
YouTube 限制：說明欄最多 5000 字、不能有 < >；章節由說明欄的時間戳記產生（第一個 0:00、每段至少 10 秒）；
hashtag 最多 15 個（前 3 個顯示在標題上方）。hashtag 對照表在 scripts/videos/hashtags.json。
"""
import argparse
import os
import re
import shutil

from _common import RENDER, TEMPLATES, UPLOAD, exercise_names, journals, load, save, training_data
from _meta import CATEGORY, hashtags_for, meta_hash, playlist_plan

ap = argparse.ArgumentParser()
ap.add_argument("--excerpt-input", action="store_true")
ap.add_argument("--add-excerpts", metavar="FILE")
ap.add_argument("--allow-missing", action="store_true", help="還沒有日誌原文的動作就只放紀錄")
ap.add_argument("--out", default=UPLOAD, help="輸出資料夾（預設 _render/upload）")
a = ap.parse_args()

td = training_data()
names = exercise_names(td)
entry = {(e["id"], h["date"]): h for e in td["exercises"] for h in e["history"]}
jr = journals()
excerpts_path = os.path.join(UPLOAD, "excerpts.json")
excerpts = {(x["date"], x["exerciseId"]): x["excerpt"] for x in load(excerpts_path, [])}
days = [load(os.path.join(RENDER, f)) for f in sorted(os.listdir(RENDER)) if f.endswith(".json") and f[:4].isdigit()]


def journal_lines(date):
    return {ln.strip() for ln in (jr.get(date) or "").splitlines() if ln.strip()}


def not_verbatim(date, text):
    lines = journal_lines(date)
    return [ln for ln in text.splitlines() if ln.strip() and ln.strip() not in lines]


if a.excerpt_input:
    todo = []
    for d in days:
        ids = [i for i in dict.fromkeys(c["exerciseId"] for c in d["clips"]) if (d["date"], i) not in excerpts]
        if ids:
            todo.append({"date": d["date"], "exercises": [{"id": i, "name": names.get(i, i)} for i in ids],
                         "journal": jr.get(d["date"])})
    save(os.path.join(UPLOAD, "excerpt-input.json"), todo)
    print(f"{len(todo)} 天、{sum(len(t['exercises']) for t in todo)} 個動作還沒有日誌原文 → excerpt-input.json")
    raise SystemExit

if a.add_excerpts:
    bad = 0
    for x in load(a.add_excerpts):
        wrong = not_verbatim(x["date"], x["excerpt"])
        if wrong:
            bad += 1
            print(f"  {x['date']} {x['exerciseId']}：{len(wrong)} 行不是日誌原文，例如「{wrong[0][:30]}」，沒有收")
            continue
        excerpts[(x["date"], x["exerciseId"])] = x["excerpt"]
    save(excerpts_path, [{"date": d, "exerciseId": e, "excerpt": t} for (d, e), t in sorted(excerpts.items())])
    print(f"excerpts.json 共 {len(excerpts)} 筆（這次退回 {bad} 筆）")
    raise SystemExit

LIMIT = 5000


def clean(s):
    # YouTube 不接受角括號；日誌裡的「數字:數字」改掉，免得被當成章節時間
    return re.sub(r"(\d):(\d)", r"\1∶\2", s.replace("<", "＜").replace(">", "＞"))


def fmt_w(w):
    return str(int(w)) if float(w).is_integer() else str(w)


def record(h):
    if h.get("sets_display"):
        return h["sets_display"]
    return "、".join((f"{fmt_w(w)}kg" if w is not None else "") + (f"×{n}" if n is not None else "")
                    for w, n in h["sets"] if not (w is None and n is None))


manifest, missing, notes = [], [], []
playlists, playlists_of = playlist_plan(days, td, names)
for j in days:
    d = j["date"]
    ids = list(dict.fromkeys(c["exerciseId"] for c in j["clips"]))
    head = j["description"].split("\n\n", 1)
    top = f"{head[0]}\n\n{head[1] if len(head) > 1 else ''}"
    blocks = []
    for eid in ids:
        ex = excerpts.get((d, eid))
        if ex is None:
            missing.append(f"{d} {eid}")
            ex = ""
        if not_verbatim(d, ex):
            raise SystemExit(f"{d} {eid} 的日誌原文和日誌對不上，請重新擷取")
        ex = re.sub(r"\n{3,}", "\n\n", ex).strip()
        h = entry.get((eid, d))
        lines = [f"【{names.get(eid, eid)}】"]
        if h and record(h):
            lines.append(f"紀錄：{record(h)}")
        if ex:
            lines += ["日誌：", clean(ex)]
        blocks.append("\n".join(lines))
    tail = f"TrainLog：https://trainlog.x-hu.com/?date={d}\n\n{' '.join(hashtags_for(ids, names))}"
    desc = "\n\n".join([top, *blocks, tail])
    if len(desc) > LIMIT:
        per = max(80, (LIMIT - len(top) - len(tail) - 40) // max(1, len(blocks)) - 4)
        blocks = [b if len(b) <= per else b[:per].rstrip() + "…" for b in blocks]
        desc = "\n\n".join([top, *blocks, tail])
        notes.append(f"{d}：說明欄太長，日誌原文已截短到 {len(desc)} 字")
    title = j["title"].replace("<", "＜").replace(">", "＞")
    assert len(title) <= 100 and len(desc) <= LIMIT and desc.split("\n\n")[1].startswith("0:00"), d
    m = {"date": d, "file": os.path.join(RENDER, j["file"]), "title": title, "description": desc,
         "visibility": "unlisted", "recordingDate": d, "category": CATEGORY, "playlists": playlists_of[d]}
    manifest.append(m | {"metaHash": meta_hash(m)})

if missing and not a.allow_missing:
    print(f"{len(missing)} 個動作還沒有日誌原文（先跑 --excerpt-input，或加 --allow-missing）：")
    for m in missing[:20]:
        print("  " + m)
    raise SystemExit(1)
os.makedirs(a.out, exist_ok=True)
save(os.path.join(a.out, "manifest.json"), manifest)
save(os.path.join(a.out, "playlists.json"), [{k: p[k] for k in ("key", "title", "description")} | {"visibility": "unlisted"}
                                            for p in playlists])
for m in manifest:
    with open(os.path.join(a.out, f"{m['date']}.txt"), "w", encoding="utf-8", newline="\n") as f:
        f.write(f"{m['title']}\n\n{m['description']}\n")
shutil.copyfile(os.path.join(TEMPLATES, "CODEX_TASK.md"), os.path.join(a.out, "CODEX_TASK.md"))
done = {r["date"] for r in load(os.path.join(UPLOAD, "results.json"), [])}
print(f"manifest.json：{len(manifest)} 支（已上傳 {len(done & {m['date'] for m in manifest})} 支）、"
      f"播放清單 {len(playlists)} 個 → {a.out}")
for n in notes:
    print("  " + n)
