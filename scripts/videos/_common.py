"""訓練影片腳本的共用設定：路徑、JSON 讀寫、拍攝時間、動作名稱、要合併的片段。

資料夾（都在 local-media/training/，只在本機、不進 git）：
  <YYYY-MM-DD>/<動作名稱>/IMG_xxxx.MOV   分類好的原檔（另有「待確認」「非訓練片段」）
  _catalog/probe.json                    每支原檔的格式（probe.py）
  _catalog/review.json                   每支原檔的檢查結果：動作、第幾組、左右、章節標籤（review_apply.py）
  _review/                               檢查用的預覽圖、批次、檢查頁（review_prepare.py／review_page.py）
  _render/<YYYY-MM-DD>.mp4 / .json       每天合併成一支＋章節（render.py）
  _render/upload/                        上傳清單、日誌原文、上傳紀錄（upload_prepare.py；results.json 由上傳者寫）
"""
import datetime as dt
import json
import os
import sys

for _s in (sys.stdout, sys.stderr):
    _s.reconfigure(encoding="utf-8", errors="replace")

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DATA = os.path.join(REPO, "data")
TRAINING = os.path.join(REPO, "local-media", "training")
CATALOG = os.path.join(TRAINING, "_catalog")
REVIEW_DIR = os.path.join(TRAINING, "_review")
RENDER = os.path.join(TRAINING, "_render")
UPLOAD = os.path.join(RENDER, "upload")
PROBE_JSON = os.path.join(CATALOG, "probe.json")
REVIEW_JSON = os.path.join(CATALOG, "review.json")
TEMPLATES = os.path.dirname(os.path.abspath(__file__))

NEEDS_REVIEW = "待確認"
NON_TRAINING = "非訓練片段"
VIDEO_EXT = (".mov", ".mp4")
TZ = dt.timezone(dt.timedelta(hours=8))
WEEK = "一二三四五六日"
# HDR（iPhone 的 HLG）→ SDR
TONEMAP = (
    "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=hable:desat=0,"
    "zscale=t=bt709:m=bt709:r=tv,format=yuv420p,"
)


def load(path, default=None):
    """讀 JSON；容許 UTF-8 BOM（PowerShell 寫的檔案常帶 BOM）。檔案不存在時回傳 default。"""
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


def save(path, data, indent=1):
    """寫 JSON（UTF-8、LF）；先寫暫存檔再取代，避免讀到寫一半的檔案。"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=indent)
    os.replace(tmp, path)


def training_data():
    return load(os.path.join(DATA, "training_data.json"))


def journals():
    return load(os.path.join(DATA, "journals_raw.json"), {})


def exercise_names(td=None):
    td = td or training_data()
    return {e["id"]: e["name"] for e in td["exercises"]}


def ex_name(eid, names):
    """動作 id → 名稱；new:<名稱> 是動作庫還沒有的動作"""
    return names.get(eid) or str(eid).removeprefix("new:")


def folder_of(eid, names):
    """檢查結果的動作 id → 原檔應該放的資料夾名稱"""
    if eid == "non_training":
        return NON_TRAINING
    if eid in ("unclear", "needs_review"):
        return NEEDS_REVIEW
    return ex_name(eid, names)


def clip_path(p):
    return os.path.join(TRAINING, p["date"], p["folder"], p["file"])


def recorded_at(p):
    """拍攝時間（台灣時間）；影片沒有內嵌時間時用檔案修改時間"""
    if p.get("created"):
        return dt.datetime.fromisoformat(p["created"].replace("Z", "+00:00")).astimezone(TZ)
    return dt.datetime.fromtimestamp(os.path.getmtime(clip_path(p)), TZ)


def iter_clips():
    """依日期、資料夾列出所有原檔：(date, folder, file)"""
    if not os.path.isdir(TRAINING):
        return
    for d in sorted(os.listdir(TRAINING)):
        if d.startswith("_") or not os.path.isdir(os.path.join(TRAINING, d)):
            continue
        for sub in sorted(os.listdir(os.path.join(TRAINING, d))):
            p = os.path.join(TRAINING, d, sub)
            if not os.path.isdir(p):
                continue
            for f in sorted(os.listdir(p)):
                if f.lower().endswith(VIDEO_EXT):
                    yield d, sub, f


def renders_this(r):
    """這支原檔要不要放進合併影片：訓練片段、不是重錄、日期確定"""
    if r.get("exerciseId") in ("non_training", "unclear", "needs_review"):
        return False
    if r.get("role") == "retake":
        return False
    return not (r.get("dateUncertain") and not r.get("dateConfirmed"))


def parse_dates(arg):
    return [d.strip() for d in arg.split(",") if d.strip()] if arg else []
