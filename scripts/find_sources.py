"""找出 iCloud 同步進來的日誌匯出和訓練影片，列出還沒處理的部分；加 --import 就把影片複製進 local-media。

用法：
  python scripts/find_sources.py                 # 只列出：日誌來源、新日期、新影片、codex.exe
  python scripts/find_sources.py --json          # 同上，輸出 JSON（給 skill 讀）
  python scripts/find_sources.py --import        # 把有日誌的訓練日影片複製到 local-media/training/<日期>/待確認/
  python scripts/find_sources.py --import --dates 2026-11-07   # 只匯入指定日期（沒有日誌的日子要這樣指定）

來源（可用參數或環境變數覆寫：--journal-dir / TRAINLOG_JOURNAL_DIR、--photos-dir / TRAINLOG_PHOTOS_DIR）：
- 日誌：
  1. Taildrop：先跑 `tailscale file get` 把收件匣的檔案移到 ../raw/taildrop/，再找最新的 Apple 日誌匯出 ZIP
     （../raw/taildrop/ 或「下載」資料夾，最近 60 天），只解出 Entries/*.html 到 ../raw/taildrop/<ZIP 檔名>/Entries。
  2. iCloud Drive 裡的「Apple日誌條目/Entries」，以及 FreeFileSync 複本 ../raw/Entries（可能落後）。
  挑最新一篇日期最晚的那個（同日期時優先 Taildrop，再來 iCloud）。--no-taildrop 跳過 1。
- 影片：iCloud 照片資料夾（~/Pictures/iCloud Photos/Photos、各磁碟的 iCloudPhoto/Photos）。
  IMG 編號會重複使用，所以依拍攝時間（建立時間與修改時間取早的）篩選，用檔案大小判斷是否已匯入。
  預設只看 local-media 最後一個影片日（含）之後的檔案，可用 --since 往前。
只用 Python 標準庫。複製 iCloud 的雲端檔（尚未下載）會觸發下載，可能要一點時間。
"""
import argparse
import collections
import datetime as dt
import glob
import json
import os
import re
import shutil
import string
import subprocess
import sys
import zipfile

for _s in (sys.stdout, sys.stderr):
    _s.reconfigure(encoding="utf-8", errors="replace")

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA = os.path.join(REPO, "data")
TRAINING = os.path.join(REPO, "local-media", "training")
PROBE_JSON = os.path.join(TRAINING, "_catalog", "probe.json")
HOME = os.path.expanduser("~")
TZ = dt.timezone(dt.timedelta(hours=8))
VIDEO_EXT = (".mov", ".mp4")
DATE_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})\.html$")
DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
NEEDS_REVIEW = "待確認"


def load(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8-sig") as f:
        return json.load(f)


# ── 日誌 ─────────────────────────────────────────────

TAILDROP_DIR = os.path.join(os.path.dirname(REPO), "raw", "taildrop")
ENTRY_IN_ZIP = re.compile(r"(?:^|/)Entries/(\d{4}-\d{2}-\d{2})\.html$")


def tailscale_exe():
    return shutil.which("tailscale") or next(
        (p for p in (r"C:\Program Files\Tailscale\tailscale.exe",) if os.path.exists(p)), None)


def receive_taildrop():
    """把 Tailscale 收件匣（Taildrop）的檔案移到 raw/taildrop/；回傳 (收到的檔名, 錯誤訊息)"""
    exe = tailscale_exe()
    if not exe:
        return [], "找不到 tailscale"
    os.makedirs(TAILDROP_DIR, exist_ok=True)
    try:
        # 同名就覆蓋：每次匯出都是整本，新的取代舊的
        r = subprocess.run([exe, "file", "get", "--verbose", "--conflict=overwrite", TAILDROP_DIR],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60)
    except (OSError, subprocess.TimeoutExpired) as e:
        return [], f"tailscale file get 失敗：{e}"
    got = []
    for f in os.listdir(TAILDROP_DIR):
        p = os.path.join(TAILDROP_DIR, f)
        if os.path.isfile(p) and DATE_RE.match(f):
            # 直接傳資料夾時，HTML 可能被攤平放在收件匣：收進 loose/Entries
            dest = os.path.join(TAILDROP_DIR, "loose", "Entries")
            os.makedirs(dest, exist_ok=True)
            os.replace(p, os.path.join(dest, f))
            got.append(f)
    # Windows 版 Tailscale 收到的檔案直接存進「下載」：零散的 YYYY-MM-DD.html 複製（不搬走）進 loose/Entries
    limit = dt.datetime.now().timestamp() - 60 * 86400
    for p in glob.glob(os.path.join(HOME, "Downloads", "*.html")):
        f = os.path.basename(p)
        if not DATE_RE.match(f) or os.path.getmtime(p) < limit:
            continue
        dest = os.path.join(TAILDROP_DIR, "loose", "Entries", f)
        if not os.path.exists(dest) or os.path.getmtime(dest) < os.path.getmtime(p):
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copy2(p, dest)
            got.append(f)
    if r.returncode == 0:
        got += [ln for ln in (r.stdout + r.stderr).splitlines() if ln.strip() and not ln.startswith("moved 0/")]
    return sorted(set(got)), (None if r.returncode == 0 else (r.stderr or r.stdout).strip())


def taildrop_entry_dirs():
    """raw/taildrop/ 底下所有含 YYYY-MM-DD.html 的 Entries 資料夾（ZIP 解出的、攤平收進來的、整個資料夾傳來的）"""
    out = []
    for root, dirs, files in os.walk(TAILDROP_DIR):
        html = [os.path.join(root, f) for f in files if DATE_RE.match(f)]
        if os.path.basename(root) == "Entries" and html:
            out.append((max(map(os.path.getmtime, html)), os.path.abspath(root)))
    # 最近收到的在前：日期一樣時優先用最新那份（舊條目改過才看得到）
    return [p for _, p in sorted(out, reverse=True)]


def journal_zips():
    """Taildrop 收到的、或 Windows 版 Tailscale 直接存到「下載」的 Apple 日誌匯出 ZIP（最近 60 天），新到舊"""
    limit = dt.datetime.now().timestamp() - 60 * 86400
    paths = glob.glob(os.path.join(TAILDROP_DIR, "*.zip")) + glob.glob(os.path.join(HOME, "Downloads", "*.zip"))
    out = []
    for p in paths:
        try:
            if os.path.getmtime(p) < limit:
                continue
            with zipfile.ZipFile(p) as z:
                if any(ENTRY_IN_ZIP.search(n) for n in z.namelist()):
                    out.append(p)
        except (OSError, zipfile.BadZipFile):
            continue
    return sorted(out, key=os.path.getmtime, reverse=True)


def extract_entries(zip_path):
    """只解出 Entries/*.html 到 raw/taildrop/<ZIP 檔名>/Entries（照片等附件用不到）；已解過且 ZIP 沒變就跳過"""
    stem = os.path.splitext(os.path.basename(zip_path))[0]
    dest = os.path.join(TAILDROP_DIR, stem, "Entries")
    stamp = os.path.join(TAILDROP_DIR, stem, ".from-zip")
    sig = f"{os.path.abspath(zip_path)}|{os.path.getsize(zip_path)}|{int(os.path.getmtime(zip_path))}"
    if os.path.isdir(dest) and os.path.exists(stamp) and open(stamp, encoding="utf-8").read() == sig:
        return dest
    os.makedirs(dest, exist_ok=True)
    with zipfile.ZipFile(zip_path) as z:
        for n in z.namelist():
            m = ENTRY_IN_ZIP.search(n)
            if m:  # 只用日期當檔名，不照 ZIP 裡的路徑寫檔
                with z.open(n) as src, open(os.path.join(dest, f"{m.group(1)}.html"), "wb") as dst:
                    shutil.copyfileobj(src, dst)
    with open(stamp, "w", encoding="utf-8") as f:
        f.write(sig)
    return dest


def journal_candidates(taildrop=False):
    """(路徑, 標籤)；Taildrop 最優先，再來 iCloud"""
    out = [(p, "Taildrop") for p in taildrop_entry_dirs()] if taildrop else []
    icloud = os.path.join(HOME, "iCloudDrive")
    for pat in ("Apple日誌條目/Entries", "*/Apple日誌條目/Entries", "*/*/Apple日誌條目/Entries"):
        out += [(p, "iCloud Drive") for p in sorted(glob.glob(os.path.join(icloud, pat)))]
    workspace = os.path.dirname(REPO)
    out += [(os.path.join(workspace, "raw", "Entries"), "FreeFileSync 複本"),
            (os.path.join(workspace, "Apple日誌條目", "Entries"), "工作資料夾")]
    seen, res = set(), []
    for p, label in out:
        k = os.path.normcase(os.path.abspath(p))
        if k not in seen and os.path.isdir(p):
            seen.add(k)
            res.append((os.path.abspath(p), label))
    return res


def entry_dates(d):
    return sorted(m.group(1) for f in os.listdir(d) if (m := DATE_RE.match(f)))


def pick_journal(override, taildrop=False):
    if override:
        if not os.path.isdir(override):
            raise SystemExit(f"找不到日誌資料夾：{override}")
        return {"dir": os.path.abspath(override), "label": "指定", "dates": entry_dates(override)}, []
    cands = [{"dir": p, "label": l, "dates": entry_dates(p)} for p, l in journal_candidates(taildrop)]
    cands = [c for c in cands if c["dates"]]
    if not cands:
        raise SystemExit("找不到 Apple 日誌匯出（Taildrop 的 ZIP 或 Apple日誌條目/Entries）。用 --journal-dir 指定。")
    best = max(cands, key=lambda c: (c["dates"][-1], -cands.index(c)))
    return best, cands


# ── 影片 ─────────────────────────────────────────────

def photos_candidates():
    out = [os.path.join(HOME, "Pictures", "iCloud Photos", "Photos")]
    for drive in string.ascii_uppercase[2:]:
        root = f"{drive}:\\"
        if not os.path.exists(root):
            continue
        out += [os.path.join(root, "iCloudPhoto", "Photos"), os.path.join(root, "iCloud Photos", "Photos")]
    seen, res = set(), []
    for p in out:
        if not os.path.isdir(p):
            continue
        k = os.path.normcase(os.path.realpath(p))
        if k not in seen:
            seen.add(k)
            res.append(p)
    return res


def captured(st):
    """拍攝時間的近似值：建立時間與修改時間取早的（iCloud 下載時常把修改時間改成下載時間）"""
    return dt.datetime.fromtimestamp(min(st.st_ctime, st.st_mtime), TZ)


def local_clips():
    """已在 local-media 的原檔：日期集合、大小集合"""
    days, sizes = set(), set()
    if os.path.isdir(TRAINING):
        for d in os.listdir(TRAINING):
            p = os.path.join(TRAINING, d)
            if not DAY_RE.match(d) or not os.path.isdir(p):
                continue
            for root, _, files in os.walk(p):
                for f in files:
                    if f.lower().endswith(VIDEO_EXT):
                        days.add(d)
                        sizes.add(os.path.getsize(os.path.join(root, f)))
    for p in load(PROBE_JSON, []) or []:
        if p.get("bytes"):
            sizes.add(p["bytes"])
    return days, sizes


def scan_photos(folder, since, known_sizes):
    found = []
    with os.scandir(folder) as it:
        for e in it:
            if not e.is_file() or not e.name.lower().endswith(VIDEO_EXT):
                continue
            st = e.stat()
            t = captured(st)
            if t.date() < since:
                continue
            found.append({
                "file": e.name, "path": e.path, "bytes": st.st_size,
                "captured": t.isoformat(timespec="seconds"), "date": t.date().isoformat(),
                "cloudOnly": bool(getattr(st, "st_file_attributes", 0) & 0x1000),  # FILE_ATTRIBUTE_OFFLINE
                "imported": st.st_size in known_sizes,
            })
    return sorted(found, key=lambda c: c["captured"])


def dest_name(day_dir, name):
    """IMG_6079(1).MOV → IMG_6079.MOV（沒撞名時）"""
    clean = re.sub(r"\(\d+\)(?=\.[^.]+$)", "", name)
    return clean if not os.path.exists(os.path.join(day_dir, clean)) else name


# ── Codex ────────────────────────────────────────────

def find_codex():
    """bin 底下的 hash 資料夾會隨更新改變，每次都重新找；挑最新的 codex.exe"""
    exes = glob.glob(os.path.join(os.environ.get("LOCALAPPDATA", ""), "OpenAI", "Codex", "bin", "*", "codex.exe"))
    if exes:
        return max(exes, key=os.path.getmtime)
    return shutil.which("codex")


# ── main ─────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--journal-dir", default=os.environ.get("TRAINLOG_JOURNAL_DIR"))
    ap.add_argument("--photos-dir", default=os.environ.get("TRAINLOG_PHOTOS_DIR"))
    ap.add_argument("--since", help="YYYY-MM-DD；預設是 local-media 最後一個影片日")
    ap.add_argument("--import", dest="do_import", action="store_true", help="複製新影片到 <日期>/待確認/")
    ap.add_argument("--dates", help="只匯入這些日期（逗號分隔）；可包含沒有日誌的日子")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--no-taildrop", action="store_true", help="不收 Taildrop、不看 ZIP")
    a = ap.parse_args()

    received, td_err, td_zip = [], None, None
    use_td = not a.journal_dir and not a.no_taildrop
    if use_td:
        received, td_err = receive_taildrop()
        zips = journal_zips()
        if zips:
            td_zip = zips[0]
            extract_entries(td_zip)
    journal, cands = pick_journal(a.journal_dir, use_td)
    synced = set(load(os.path.join(DATA, "journals_raw.json"), {}) or {})
    journal_days = set(journal["dates"])
    new_dates = [d for d in journal["dates"] if d not in synced]

    video_days, known_sizes = local_clips()
    if a.since:
        since = dt.date.fromisoformat(a.since)
    elif video_days:
        since = dt.date.fromisoformat(max(video_days))
    else:
        since = dt.date.today() - dt.timedelta(days=30)

    if a.photos_dir:
        if not os.path.isdir(a.photos_dir):
            raise SystemExit(f"找不到照片資料夾：{a.photos_dir}")
        photos = a.photos_dir
    else:
        pc = photos_candidates()
        photos = pc[0] if pc else None
    clips = scan_photos(photos, since, known_sizes) if photos else []

    by_day = collections.defaultdict(list)
    for c in clips:
        by_day[c["date"]].append(c)
    days = [{
        "date": d,
        "hasJournal": d in journal_days,
        "new": [c for c in by_day[d] if not c["imported"]],
        "alreadyImported": sum(c["imported"] for c in by_day[d]),
    } for d in sorted(by_day)]

    wanted = set(a.dates.split(",")) if a.dates else None
    copied = []
    if a.do_import:
        for day in days:
            if wanted is not None:
                if day["date"] not in wanted:
                    continue
            elif not day["hasJournal"]:
                continue
            ddir = os.path.join(TRAINING, day["date"], NEEDS_REVIEW)
            os.makedirs(ddir, exist_ok=True)
            for c in day["new"]:
                dst = os.path.join(ddir, dest_name(ddir, c["file"]))
                if not a.json:
                    print(f"複製 {c['file']} → {os.path.relpath(dst, REPO)}" + ("（雲端檔，下載中…）" if c["cloudOnly"] else ""), flush=True)
                tmp = dst + ".part"
                shutil.copy2(c["path"], tmp)
                os.replace(tmp, dst)
                copied.append({"date": day["date"], "from": c["path"], "to": os.path.relpath(dst, REPO)})

    out = {
        "taildrop": {"received": received, "error": td_err, "zip": td_zip},
        "journal": {"dir": journal["dir"], "source": journal["label"], "latest": journal["dates"][-1],
                    "others": [{"dir": c["dir"], "source": c["label"], "latest": c["dates"][-1]}
                               for c in cands if c["dir"] != journal["dir"]]},
        "newJournalDates": new_dates,
        "photosDir": photos,
        "videosSince": since.isoformat(),
        "videoDays": days,
        "copied": copied,
        "codex": find_codex(),
    }
    if a.json:
        print(json.dumps(out, ensure_ascii=False, indent=1))
        return

    if received:
        print(f"Taildrop 收到：{', '.join(received)}")
    if td_err:
        print(f"Taildrop：{td_err}")
    if td_zip:
        print(f"Taildrop／下載的日誌 ZIP：{td_zip}（{dt.datetime.fromtimestamp(os.path.getmtime(td_zip), TZ):%m/%d %H:%M}）")
    print(f"日誌來源：{journal['dir']}（{journal['label']}，最新 {journal['dates'][-1]}）")
    for o in out["journal"]["others"]:
        lag = "  ← 落後" if o["latest"] < journal["dates"][-1] else ""
        print(f"  另有：{o['dir']}（{o['source']}，最新 {o['latest']}）{lag}")
    print(f"還沒同步的日誌：{', '.join(new_dates) if new_dates else '無'}")
    print(f"照片資料夾：{photos or '找不到（用 --photos-dir 指定）'}；看 {since} 之後拍的影片")
    if not days:
        print("  沒有新影片")
    for day in days:
        tag = "有日誌" if day["hasJournal"] else "沒有日誌（可能不是訓練；要匯入請用 --dates）"
        cloud = sum(c["cloudOnly"] for c in day["new"])
        extra = f"，已匯入 {day['alreadyImported']} 支" if day["alreadyImported"] else ""
        extra += f"，{cloud} 支尚未下載" if cloud else ""
        print(f"  {day['date']}：新影片 {len(day['new'])} 支{extra}　[{tag}]")
        for c in day["new"]:
            print(f"      {c['file']}  {c['captured'][11:16]}  {c['bytes'] / 1e6:.0f} MB")
    if copied:
        print(f"已複製 {len(copied)} 支到 local-media/training/<日期>/{NEEDS_REVIEW}/。下一步：python scripts/videos/probe.py")
    print(f"codex.exe：{out['codex'] or '找不到'}")


if __name__ == "__main__":
    main()
