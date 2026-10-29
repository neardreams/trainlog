"""YouTube 影片的附加資料規則：hashtag、播放清單、錄製日期、類別（upload_prepare.py 與 metadata_prepare.py 共用）。"""
import hashlib
import json
import os
import re

from _common import TEMPLATES, ex_name, load

CATEGORY = "運動"  # Studio 的「類別」：Sports
EXERCISE_PLAYLIST_MIN_DAYS = 3  # 至少錄過幾天的動作才有自己的播放清單
MAX_HASHTAGS = 15  # 超過 15 個 YouTube 會整個忽略

_tags = load(os.path.join(TEMPLATES, "hashtags.json"))


def hashtags_for(exercise_ids, names):
    """當天各動作的 hashtag（依出現順序、去重複）＋通用標籤；YouTube 會把前 3 個顯示在標題上方"""
    out = []
    for eid in exercise_ids:
        tags = _tags["exercises"].get(eid) or ["#" + re.sub(r"[\s（）()／/·、，,：:]+", "", ex_name(eid, names))]
        out += [t for t in tags if t not in out]
    out += [t for t in _tags["general"] if t not in out]
    return out[:MAX_HASHTAGS]


def month_title(date):
    y, m, _ = date.split("-")
    return f"{y} 年 {int(m)} 月訓練"


def playlist_plan(days, td, names):
    """依合併影片（render.py 的 <日期>.json）規劃播放清單。
    回傳 (playlists, by_date)：playlists 依「全部 → 月份 → 動作 → 教練課」排序，每個含 key、title、description、dates；
    by_date[date] 是那天影片要加入的播放清單標題。"""
    coach = {h["date"] for e in td["exercises"] for h in e["history"] if h.get("condition") == "教練課"}
    days = sorted(days, key=lambda d: d["date"])
    ids_of = {d["date"]: list(dict.fromkeys(c["exerciseId"] for c in d["clips"])) for d in days}
    ex_days = {}
    for d in days:
        for eid in ids_of[d["date"]]:
            ex_days.setdefault(eid, []).append(d["date"])
    order = {e["id"]: i for i, e in enumerate(td["exercises"])}
    playlists = [{"key": "all", "title": "全部訓練", "description": "TrainLog 每個訓練日的影片，依日期排列。",
                  "dates": [d["date"] for d in days]}]
    for month in sorted({d["date"][:7] for d in days}):
        ds = [d["date"] for d in days if d["date"].startswith(month)]
        playlists.append({"key": f"month:{month}", "title": month_title(ds[0]),
                          "description": f"TrainLog {month_title(ds[0])}的影片，依日期排列。", "dates": ds})
    for eid in sorted((e for e, ds in ex_days.items() if len(ds) >= EXERCISE_PLAYLIST_MIN_DAYS),
                      key=lambda e: (-len(ex_days[e]), order.get(e, 999))):
        name = ex_name(eid, names)
        playlists.append({"key": f"exercise:{eid}", "title": f"動作：{name}",
                          "description": f"TrainLog 有「{name}」的訓練日，依日期排列；影片章節可以跳到每一組。",
                          "dates": ex_days[eid]})
    coach_days = [d["date"] for d in days if d["date"] in coach]
    if coach_days:
        playlists.append({"key": "coach", "title": "教練課", "description": "TrainLog 教練課當天的影片，依日期排列。",
                          "dates": coach_days})
    by_date = {d["date"]: [p["title"] for p in playlists if d["date"] in p["dates"]] for d in days}
    return playlists, by_date


def meta_hash(entry):
    """影片附加資料的指紋：內容變了才需要重新設定"""
    keys = ("title", "description", "recordingDate", "category", "playlists")
    return hashlib.sha1(json.dumps([entry.get(k) for k in keys], ensure_ascii=False).encode()).hexdigest()[:12]
