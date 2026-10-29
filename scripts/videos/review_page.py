"""逐支檢查的結果做成本機檢查頁 → local-media/training/_review/index.html（不上傳、不公開）

用法：python scripts/videos/review_page.py
讀 _review/batches/ 的 batch-N.json 與 AI 寫的 result-N.json。標出「動作不同」「信心不高」「組數不確定」，
使用者勾選後按「複製我的修正」貼回對話；確認後再跑 review_apply.py。
用本機伺服器開（例如 python -m http.server 5190 --directory local-media/training/_review）。
"""
import collections
import glob
import html
import os
import re

from _common import REVIEW_DIR, load, save

out_dir = REVIEW_DIR
bdir = os.path.join(REVIEW_DIR, "batches")
library = {x["id"]: x for x in load(os.path.join(bdir, "library.json"), [])}


def _n(path):
    return int(re.search(r"(\d+)\.json$", path).group(1))


days, results = [], {}
for bp in sorted(glob.glob(os.path.join(bdir, "batch-*.json")), key=_n):
    days += load(bp)
    rp = os.path.join(bdir, f"result-{_n(bp)}.json")
    res = load(rp)
    if res is None:
        raise SystemExit(f"缺少 {rp}（AI 還沒檢查完這一批）")
    for c in res["clips"]:
        results[(c["date"], c["file"])] = c
    for n in res.get("dayNotes", []):
        results[("note", n["date"])] = n["note"]


def ex_name(eid):
    if eid is None:
        return "—"
    if eid in library:
        return library[eid]["name"]
    return {"non_training": "非訓練片段", "needs_review": "待確認", "unclear": "無法判斷"}.get(
        eid, eid[4:] + "（新動作）" if eid.startswith("new:") else eid
    )


stats = collections.Counter()
merged = []
for d in days:
    for c in d["clips"]:
        r = results.get((d["date"], c["file"]))
        if r is None:
            stats["missing"] += 1
            r = {"exerciseId": "unclear", "confidence": "low", "note": "檢查結果缺漏"}
        changed = r.get("exerciseId") != c["currentExerciseId"]
        low = r.get("confidence") != "high"
        has_sets = any(e["exerciseId"] == r.get("exerciseId") and e["sets"] for e in d["trainingEntries"])
        set_unsure = has_sets and r.get("role") not in ("warmup", "retake", "partial") and (
            r.get("set") is None or r.get("setConfidence") == "low"
        )
        flag = "change" if changed else "low" if low else "set" if set_unsure else ""
        stats[flag or "ok"] += 1
        merged.append((d, c, r, flag))

save(
    os.path.join(out_dir, "review-data.json"),
    [{"date": d["date"], "file": c["file"], "current": c["currentExerciseId"], **r, "flag": flag} for d, c, r, flag in merged],
)

E = html.escape
parts = []
by_day = collections.defaultdict(list)
for d, c, r, flag in merged:
    by_day[d["date"]].append((d, c, r, flag))
for date, items in by_day.items():
    d = items[0][0]
    n_flag = sum(1 for *_, f in items if f)
    entries = "".join(
        f"<li><b>{E(e['name'])}</b> "
        + E(e.get("sets_display") or "、".join(f"{w if w is not None else '—'}kg×{n if n is not None else '—'}" for w, n in e["sets"]) or "（無組數）")
        + "</li>"
        for e in d["trainingEntries"]
    ) or "<li>訓練資料沒有這天</li>"
    journal = E((d["journal"] or "（沒有日誌）").split("\n", 1)[-1].strip())
    note = results.get(("note", date))
    rows = []
    for _, c, r, flag in items:
        badge = {"change": ("動作不同", "red"), "low": ("低信心", "amber"), "set": ("組數不確定", "amber")}.get(flag)
        cur, new = ex_name(c["currentExerciseId"]), ex_name(r.get("exerciseId"))
        exl = f"<s>{E(cur)}</s> → <b>{E(new)}</b>" if flag == "change" else f"<b>{E(new)}</b>"
        meta = f"{c['recordedAt'][:5]} · {c['durationSec']} 秒"
        if c["gapFromPrevClipMin"] is not None:
            meta += f" · 距上一支 {c['gapFromPrevClipMin']} 分"
        extras = [x for x in (r.get("side") if r.get("side") not in (None, "未知", "雙側") else None, r.get("visibleLoad")) if x]
        rows.append(
            f"""<article class="clip" data-flag="{flag}" data-key="{E(date)}/{E(c['file'])}">
  <img loading="lazy" src="sheets/{E(os.path.basename(c['sheet']))}" alt="{E(c['file'])} 的 6 格預覽">
  <div class="info">
    <div class="line1">{exl}{f' <span class="badge {badge[1]}">{badge[0]}</span>' if badge else ''}</div>
    <div class="label">{E(r.get('label') or '')}</div>
    <div class="meta">{E(c['file'])} · {E(meta)}{' · ' + E('、'.join(extras)) if extras else ''}{' · 日期待確認' if c.get('dateUncertain') else ''}</div>
    <div class="note">{E(r.get('note') or '')}</div>
    <div class="fix">
      <label><input type="radio" name="{E(date)}/{E(c['file'])}" value="ok"> 正確</label>
      <label><input type="radio" name="{E(date)}/{E(c['file'])}" value="fix"> 要改</label>
      <input type="text" placeholder="要改成什麼（例：背槓深蹲 第 2 組）">
    </div>
  </div>
</article>"""
        )
    parts.append(
        f"""<section class="day" data-flags="{n_flag}">
  <h2>{date}<span class="count">{len(items)} 支{f' · <em>{n_flag} 支要看</em>' if n_flag else ''}</span></h2>
  <details><summary>當天訓練資料與日誌</summary><ul class="entries">{entries}</ul><pre>{journal}</pre></details>
  {f'<p class="daynote">{E(note)}</p>' if note else ''}
  {''.join(rows)}
</section>"""
    )

total = len(merged)
page = f"""<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>影片動作檢查</title>
<style>
:root{{--bg:#fbfbfc;--surface:#fff;--border:#e4e4e9;--text:#1c1c20;--text2:#63636e;--acc:#3e63dd;--red:#ce2c31;--redbg:#feebec;--amber:#ab6400;--amberbg:#fff7c2}}
@media (prefers-color-scheme:dark){{:root{{--bg:#111113;--surface:#18191b;--border:#2e3035;--text:#edeef0;--text2:#a0a1a8;--acc:#8da4ef;--red:#ff9592;--redbg:#3b1219;--amber:#ffca16;--amberbg:#302008}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,"Noto Sans TC","Microsoft JhengHei",sans-serif}}
header{{position:sticky;top:0;z-index:2;background:var(--surface);border-bottom:1px solid var(--border);padding:12px 16px;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center}}
h1{{font-size:18px;margin:0}}.stats{{color:var(--text2);font-variant-numeric:tabular-nums}}
.seg{{display:inline-flex;border:1px solid var(--border);border-radius:8px;overflow:hidden}}.seg button{{border:0;background:none;color:var(--text);padding:6px 12px;font:inherit;cursor:pointer}}.seg button.on{{background:var(--acc);color:#fff}}
#copy{{border:1px solid var(--border);background:var(--surface);color:var(--text);border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer}}
main{{max-width:1500px;margin:0 auto;padding:8px 16px 64px}}
.day{{margin-top:24px}}h2{{font-size:16px;margin:0 0 6px}}.count{{font-weight:400;color:var(--text2);font-size:13px;margin-left:8px}}.count em{{color:var(--amber);font-style:normal}}
details{{margin:0 0 8px;color:var(--text2)}}pre{{white-space:pre-wrap;font:inherit;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:8px 12px;max-height:320px;overflow:auto}}
.entries{{margin:6px 0;padding-left:20px}}.daynote{{background:var(--amberbg);color:var(--text);border-radius:8px;padding:6px 10px;margin:4px 0 8px}}
.clip{{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:12px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:8px;margin:8px 0}}
.clip img{{width:100%;height:auto;border-radius:6px;display:block;background:#000}}
.line1{{font-size:15px}}.label{{font-weight:600;margin-top:2px}}.meta,.note{{color:var(--text2);font-size:12px;margin-top:4px}}.note{{color:var(--text)}}
.badge{{font-size:11px;font-weight:600;border-radius:4px;padding:1px 6px;margin-left:6px;white-space:nowrap}}.badge.red{{background:var(--redbg);color:var(--red)}}.badge.amber{{background:var(--amberbg);color:var(--amber)}}
.fix{{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center}}.fix input[type=text]{{flex:1 1 180px;min-width:0;border:1px solid var(--border);border-radius:6px;padding:4px 8px;background:var(--bg);color:var(--text);font:inherit}}
.hint{{color:var(--text2);margin:12px 0 0;max-width:900px}}
.hide{{display:none}}
@media (max-width:900px){{.clip{{grid-template-columns:1fr}}}}
</style></head><body>
<header><h1>影片動作檢查</h1>
<span class="stats">共 {total} 支 · 動作不同 {stats['change']} · 低信心 {stats['low']} · 組數不確定 {stats['set']} · 沒問題 {stats['ok']}</span>
<span class="seg" role="group" aria-label="篩選"><button data-f="need" class="on">要看的</button><button data-f="change">動作不同</button><button data-f="all">全部</button></span>
<button id="copy">複製我的修正</button><span id="msg" class="stats"></span></header>
<main><p class="hint">每張圖是同一支影片平均抽出的 6 格，由左到右。「動作不同」請一定要看；「組數不確定」的章節會標成「片段 N」，知道是第幾組再填，不填也可以。勾選會自動存在這台電腦的瀏覽器裡，看完按「複製我的修正」貼回對話。</p>{''.join(parts)}</main>
<script>
const KEY='trainlog-review-v1';let saved={{}};try{{saved=JSON.parse(localStorage.getItem(KEY)||'{{}}')}}catch(e){{}}
function save(){{try{{localStorage.setItem(KEY,JSON.stringify(saved))}}catch(e){{}}}}
document.querySelectorAll('.clip').forEach(el=>{{const k=el.dataset.key,s=saved[k]||{{}};const t=el.querySelector('input[type=text]');
 if(s.v)el.querySelector(`input[value=${{s.v}}]`).checked=true;if(s.t)t.value=s.t;
 el.addEventListener('change',()=>{{const v=el.querySelector('input[type=radio]:checked');saved[k]={{v:v&&v.value,t:t.value}};save()}});t.addEventListener('input',()=>{{const v=el.querySelector('input[type=radio]:checked');saved[k]={{v:v?v.value:'fix',t:t.value}};if(!v)el.querySelector('input[value=fix]').checked=true;save()}})}});
function filt(f){{document.querySelectorAll('.seg button').forEach(b=>b.classList.toggle('on',b.dataset.f===f));
 document.querySelectorAll('.clip').forEach(el=>{{const fl=el.dataset.flag;el.classList.toggle('hide',f==='need'?!fl:f==='change'?fl!=='change':false)}});
 document.querySelectorAll('.day').forEach(d=>d.classList.toggle('hide',!d.querySelector('.clip:not(.hide)')))}}
document.querySelectorAll('.seg button').forEach(b=>b.onclick=()=>filt(b.dataset.f));filt('need');
document.getElementById('copy').onclick=async()=>{{const lines=Object.entries(saved).filter(([k,s])=>s.v==='fix'||s.t).map(([k,s])=>`${{k}}：${{s.t||'要改'}}`);
 const ok=Object.values(saved).filter(s=>s.v==='ok').length;const txt=`已確認正確 ${{ok}} 支\\n要修正 ${{lines.length}} 支：\\n`+lines.join('\\n');
 try{{await navigator.clipboard.writeText(txt);document.getElementById('msg').textContent='已複製，貼回對話給 Claude'}}catch(e){{
  let ta=document.getElementById('out');if(!ta){{ta=document.createElement('textarea');ta.id='out';ta.rows=6;ta.style.cssText='width:100%;font:inherit';document.querySelector('header').appendChild(ta)}}
  ta.value=txt;ta.select();document.getElementById('msg').textContent='無法自動複製，請手動複製下方文字'}}}};
</script></body></html>"""
open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8", newline="\n").write(page)
print(f"檢查頁：{os.path.join(out_dir, 'index.html')}；共 {total} 支，{dict(stats)}")
