"""檢查合併成品：每天的 MP4 與 JSON 都在、長度與章節數相符、格式正確、不會變成 Shorts、每支原檔剛好用一次。

用法：python scripts/videos/verify_render.py
"""
import collections
import json
import os
import subprocess

from _common import PROBE_JSON, RENDER, REVIEW_JSON, load, renders_this

probe = {(p["date"], p["file"]): p for p in load(PROBE_JSON, [])}
expected = {(r["date"], r["file"]) for r in load(REVIEW_JSON, []) if renders_this(r)}
problems, seen = [], collections.Counter()
total_sec = total_bytes = 0
canvas, n_ch = collections.Counter(), []
days = sorted(f[:-5] for f in os.listdir(RENDER) if f.endswith(".json") and f[:4].isdigit())
for d in days:
    j = load(os.path.join(RENDER, f"{d}.json"))
    mp4 = os.path.join(RENDER, f"{d}.mp4")
    if not os.path.exists(mp4):
        problems.append(f"{d}：沒有 mp4")
        continue
    pr = json.loads(subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams",
                                    "-show_chapters", mp4], capture_output=True, text=True, encoding="utf-8").stdout)
    dur = float(pr["format"]["duration"])
    v = next(s for s in pr["streams"] if s["codec_type"] == "video")
    au = [s["codec_name"] for s in pr["streams"] if s["codec_type"] == "audio"]
    if abs(dur - j["durationSec"]) > 0.5:
        problems.append(f"{d}：影片 {dur:.2f} 秒，JSON 寫 {j['durationSec']}")
    if len(pr["chapters"]) != len(j["chapters"]):
        problems.append(f"{d}：MP4 章節 {len(pr['chapters'])} 個，JSON {len(j['chapters'])} 個")
    if v["codec_name"] != "h264" or f"{v['width']}x{v['height']}" != j["canvas"] or au[:1] != ["aac"]:
        problems.append(f"{d}：格式 {v['codec_name']} {v['width']}x{v['height']} 音訊 {au}")
    if v["height"] > v["width"] and dur <= 180:
        problems.append(f"{d}：直式而且 {dur:.0f} 秒，會變成 Shorts")
    chs = j["chapters"]
    if chs[0]["start"] != 0:
        problems.append(f"{d}：第一個章節不是 0:00")
    problems += [f"{d}：章節不到 10 秒：{ch['title']}" for ch in chs if ch["end"] - ch["start"] < 10 and len(chs) > 1]
    src = sum(probe[(d, c["file"])]["dur"] for c in j["clips"] if (d, c["file"]) in probe)
    if abs(src - j["durationSec"]) > 0.15 * len(j["clips"]) + 0.5:
        problems.append(f"{d}：原檔合計 {src:.1f} 秒，成品 {j['durationSec']} 秒")
    for c in j["clips"]:
        seen[(d, c["file"])] += 1
    total_sec += dur
    total_bytes += os.path.getsize(mp4)
    canvas[j["canvas"]] += 1
    n_ch.append(len(chs))

missing, extra = sorted(expected - set(seen)), sorted(set(seen) - expected)
dups = [k for k, v in seen.items() if v > 1]
print(f"{len(days)} 天、{sum(seen.values())} 支（應有 {len(expected)} 支）；{total_sec / 3600:.2f} 小時、{total_bytes / 1e9:.1f} GB；畫面 {dict(canvas)}")
if n_ch:
    print(f"每天章節 {min(n_ch)}–{max(n_ch)} 個")
for label, items in (("還沒合併", missing), ("不該出現", extra), ("重複", dups)):
    if items:
        print(f"{label}：{items[:20]}{' …' if len(items) > 20 else ''}")
print(f"問題 {len(problems)} 個")
for p in problems:
    print("  " + p)
