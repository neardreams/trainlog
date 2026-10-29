"""已上傳影片的附加資料（說明欄＋hashtag、錄製日期、類別、播放清單）→ 交給 Codex 在 YouTube Studio 逐支設定。

用法：先跑 upload_prepare.py（更新 manifest.json、playlists.json），再跑
  python scripts/videos/metadata_prepare.py
輸出（_render/upload/）：
  metadata.json              已上傳、而且附加資料和 metadata-results.json 紀錄不同（或還沒設定）的影片
  CODEX_METADATA_TASK.md     給 Codex 的任務說明（建立播放清單、逐支設定；完成的寫進 metadata-results.json）
"""
import os
import shutil

from _common import TEMPLATES, UPLOAD, load, save

manifest = load(os.path.join(UPLOAD, "manifest.json"))
if not manifest:
    raise SystemExit("找不到 manifest.json，先跑 upload_prepare.py")
if "metaHash" not in manifest[0]:
    raise SystemExit("manifest.json 是舊格式（沒有播放清單、錄製日期），先重跑 upload_prepare.py")
uploaded = {r["date"]: r["videoId"] for r in load(os.path.join(UPLOAD, "results.json"), []) if r.get("videoId")}
done = {r["videoId"]: r.get("metaHash") for r in load(os.path.join(UPLOAD, "metadata-results.json"), [])}

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
