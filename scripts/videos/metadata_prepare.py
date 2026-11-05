"""已上傳影片的附加資料（說明欄＋hashtag、錄製日期、類別、播放清單）→ 交給 Codex 在 YouTube Studio 逐支設定。

用法：先跑 upload_prepare.py（更新 manifest.json、playlists.json），再跑
  python scripts/videos/metadata_prepare.py
輸出（_render/upload/）：
  metadata.json              已上傳、而且附加資料和 metadata-results.json 紀錄不同（或還沒設定）的影片
  CODEX_METADATA_TASK.md     給 Codex 的任務說明（建立播放清單、逐支設定；完成的寫進 metadata-results.json）
"""
import datetime as dt
import os
import shutil

from _common import TEMPLATES, UPLOAD, load, save
from _meta import legacy_meta_hash

manifest = load(os.path.join(UPLOAD, "manifest.json"))
if not manifest:
    raise SystemExit("找不到 manifest.json，先跑 upload_prepare.py")
if "metaHash" not in manifest[0]:
    raise SystemExit("manifest.json 是舊格式（沒有播放清單、錄製日期），先重跑 upload_prepare.py")
uploaded = {r["date"]: r["videoId"] for r in load(os.path.join(UPLOAD, "results.json"), []) if r.get("videoId")}
results_path = os.path.join(UPLOAD, "metadata-results.json")
results = load(results_path, [])

# 2026-10-31 起 metaHash 不看播放清單順序。紀錄的指紋等於 manifest 現在內容的舊版指紋 → 其實已是最新，換成新版（先備份）。
# 舊紀錄都換完、也沒有用舊 manifest 的 Codex 在跑之後，這段和 legacy_meta_hash 可以刪掉。
current = {uploaded[m["date"]]: m for m in manifest if m["date"] in uploaded}
legacy = [r for r in results if r.get("videoId") in current and r.get("metaHash") != current[r["videoId"]]["metaHash"]
          and r.get("metaHash") == legacy_meta_hash(current[r["videoId"]])]
if legacy:
    backup = results_path.replace(".json", f".backup-{dt.datetime.now():%Y%m%d-%H%M%S}.json")
    shutil.copyfile(results_path, backup)
    for r in legacy:
        r["metaHash"] = current[r["videoId"]]["metaHash"]
    save(results_path, results, indent=2)
    print(f"metadata-results.json：{len(legacy)} 筆舊版指紋換成新版（不看播放清單順序），原檔備份成 {os.path.basename(backup)}")
done = {r["videoId"]: r.get("metaHash") for r in results}

todo = []
for m in manifest:
    vid = uploaded.get(m["date"])
    if vid and done.get(vid) != m["metaHash"]:
        todo.append({"date": m["date"], "videoId": vid, "studioUrl": f"https://studio.youtube.com/video/{vid}/edit",
                     **{k: m[k] for k in ("title", "description", "recordingDate", "category", "playlists", "metaHash")}})
save(os.path.join(UPLOAD, "metadata.json"), todo)
shutil.copyfile(os.path.join(TEMPLATES, "CODEX_METADATA_TASK.md"), os.path.join(UPLOAD, "CODEX_METADATA_TASK.md"))
waiting = [m["date"] for m in manifest if m["date"] not in uploaded]
print(f"metadata.json：{len(todo)} 支要設定（已上傳 {len(uploaded)} 支，其中 {len(uploaded) - len(todo)} 支已是最新）")
if waiting:
    print(f"還沒上傳的 {len(waiting)} 支（上傳時就會照 manifest 設定）：{waiting[:5]}{' …' if len(waiting) > 5 else ''}")
