"""上傳後檢查影片能不能播：版權聲明（健身房背景音樂常被 Content ID 認領）造成的封鎖會反映在 YouTube 觀看頁。

用法：
  python scripts/videos/check_playback.py                       # 最近上傳的 3 支（_render/upload/results.json）
  python scripts/videos/check_playback.py 2026-11-26 2026-11-24 # 指定日期
  python scripts/videos/check_playback.py --all                 # 全部（100 多支連續查會被 YouTube 暫時擋 HTTP 429，少用）

不用登入，不公開的影片也查得到。每支印出：能不能播、能不能嵌入網站、可播放的國家數（249＝全部）、看不到的國家。
只拿營利、不封鎖的版權聲明在這裡看不出來；要看是哪首歌，到 Studio 的版權聲明頁（見 SKILL.md）。
"""
import argparse
import json
import os
import re
import time
import urllib.request

from _common import UPLOAD, load

ALL_COUNTRIES = 249  # 2026-11-26 實測：沒被封鎖的影片列出 249 個國家／地區
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
PLAYER = re.compile(r"var ytInitialPlayerResponse\s*=\s*(\{.+?\});(?:var|</script>)", re.S)

ap = argparse.ArgumentParser()
ap.add_argument("dates", nargs="*")
ap.add_argument("--all", action="store_true")
a = ap.parse_args()

uploaded = [r for r in load(os.path.join(UPLOAD, "results.json"), []) if r.get("videoId")]
by_date = {r["date"]: r["videoId"] for r in uploaded}
if a.all:
    todo = sorted(by_date.items())
elif a.dates:
    missing = [d for d in a.dates if d not in by_date]
    if missing:
        raise SystemExit(f"results.json 裡沒有這些日期：{missing}")
    todo = [(d, by_date[d]) for d in a.dates]
else:
    todo = sorted(by_date.items())[-3:]


def check(vid):
    url = f"https://www.youtube.com/watch?v={vid}&hl=zh-TW&gl=TW&has_verified=1"
    req = urllib.request.Request(url, headers={"user-agent": UA, "accept-language": "zh-TW,zh;q=0.9"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                m = PLAYER.search(r.read().decode("utf-8", "replace"))
            if not m:
                raise ValueError("觀看頁裡沒有播放資訊")
            return json.loads(m.group(1))
        except Exception as e:  # 429 也走這裡
            if attempt == 2:
                return {"error": str(e)}
            time.sleep(3)


all_countries = set()
rows = []
for i, (d, vid) in enumerate(todo):
    if i:
        time.sleep(1)
    p = check(vid)
    if "error" in p:
        rows.append((d, vid, None, p["error"]))
        continue
    ps = p.get("playabilityStatus", {})
    mf = p.get("microformat", {}).get("playerMicroformatRenderer", {})
    countries = set(mf.get("availableCountries") or [])
    all_countries |= countries
    rows.append((d, vid, {"status": ps.get("status"), "reason": ps.get("reason", ""), "embed": ps.get("playableInEmbed"),
                          "countries": countries, "unlisted": mf.get("isUnlisted")}, None))

problems = 0
for d, vid, x, err in rows:
    if err:
        problems += 1
        print(f"{d} {vid}  查不到：{err}")
        continue
    flags = []
    if x["status"] != "OK":
        flags.append(f"不能播（{x['status']} {x['reason']}）")
    if x["embed"] is False:
        flags.append("不能嵌入網站")
    if x["countries"] and "TW" not in x["countries"]:
        flags.append("台灣看不到")
    n = len(x["countries"])
    blocked = sorted(all_countries - x["countries"]) if n < ALL_COUNTRIES else []
    note = f"{n} 國" + (f"，看不到：{' '.join(blocked) or '（和其他支比不出來）'}" if n < ALL_COUNTRIES else "")
    vis = "不公開" if x["unlisted"] else "公開"
    print(f"{d} {vid}  {vis}  {'／'.join(flags) if flags else '能播、能嵌入'}  {note}")
    problems += bool(flags)
print(f"共 {len(rows)} 支，有問題 {problems} 支")
