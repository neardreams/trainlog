#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""訓練進度總覽 v6 生成器 — training_data.json + journals_raw.json → HTML"""

import json
from pathlib import Path
from collections import defaultdict

BASE = Path('/sessions/dazzling-zealous-davinci/mnt/Entries')
DATA_DIR = BASE / 'trainlog' / 'data'

with open(DATA_DIR / 'training_data.json', encoding='utf-8') as f:
    DATA = json.load(f)
with open(DATA_DIR / 'journals_raw.json', encoding='utf-8') as f:
    JOURNALS = json.load(f)

EXERCISES = DATA['exercises']
META      = DATA['meta']
GROUP_ORDER   = META['group_order']
GROUP_ACCENT  = META['group_accent']
EXH_STYLE_MAP = META['exhaustion_style']

daily_index = defaultdict(list)
for ex in EXERCISES:
    for h in ex['history']:
        daily_index[h['date']].append(ex['id'])

EXERCISES_JS  = json.dumps(EXERCISES,  ensure_ascii=False)
JOURNALS_JS   = json.dumps(JOURNALS,   ensure_ascii=False)
DAILY_JS      = json.dumps({d: list(ids) for d, ids in daily_index.items()}, ensure_ascii=False)
GROUP_ORDER_JS  = json.dumps(GROUP_ORDER,  ensure_ascii=False)
GROUP_ACCENT_JS = json.dumps(GROUP_ACCENT, ensure_ascii=False)
EXH_STYLE_JS    = json.dumps(EXH_STYLE_MAP, ensure_ascii=False)

# ── CSS ──────────────────────────────────────────────────────────────────────
CSS = """\
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Arial,sans-serif;background:#f2f2f7;color:#1c1c1e;font-size:14px}
.page-header{background:linear-gradient(135deg,#1c1c1e 0%,#3a3a3c 100%);color:white;padding:20px 20px 14px;text-align:center}
.page-header h1{font-size:1.35rem;font-weight:700;margin-bottom:3px}
.page-header p{font-size:0.75rem;opacity:0.55}
.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:center;padding:9px 16px;background:white;border-bottom:1px solid #e5e5ea;position:sticky;top:0;z-index:100;box-shadow:0 1px 4px rgba(0,0,0,0.06)}
.btn{padding:7px 14px;border-radius:20px;border:none;cursor:pointer;font-size:0.78rem;font-weight:600;transition:all 0.15s}
.btn-primary{background:#007aff;color:white}
.btn-secondary{background:#f2f2f7;color:#1c1c1e}
.btn:hover{opacity:0.85;transform:scale(1.02)}
.sort-select{padding:6px 10px;border-radius:20px;border:1px solid #e5e5ea;font-size:0.78rem;background:white;cursor:pointer;color:#1c1c1e}
/* Week panel */
.week-panel{background:white;border-bottom:1px solid #e5e5ea;padding:10px 12px 12px}
.week-panel-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.week-panel-title{font-size:0.72rem;font-weight:700;color:#8e8e93;text-transform:uppercase;letter-spacing:.5px}
.week-nav{display:flex;gap:4px}
.week-nav-btn{background:#f2f2f7;border:none;cursor:pointer;font-size:0.8rem;padding:2px 8px;border-radius:8px;color:#3a3a3c;font-weight:600}
.week-nav-btn:hover{background:#e5e5ea}
.week-strip{display:flex;gap:5px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}
.week-strip::-webkit-scrollbar{display:none}
.day-cell{flex:0 0 auto;width:52px;border-radius:10px;padding:5px 3px 6px;text-align:center;cursor:pointer;border:1.5px solid transparent;transition:all 0.12s;background:#f9f9fb}
.day-cell:hover{border-color:#007aff;background:#f0f7ff}
.day-cell.today{background:#007aff;color:white}
.day-cell.today .day-dow,.day-cell.today .day-num{color:white!important}
.day-cell.trained{background:#f2f2f7}
.day-cell.active-sel{border-color:#ff9500!important;box-shadow:0 0 0 2px rgba(255,149,0,.25)}
.day-dow{font-size:0.6rem;font-weight:700;color:#8e8e93;margin-bottom:2px;text-transform:uppercase}
.day-num{font-size:0.95rem;font-weight:700;color:#1c1c1e;line-height:1}
.day-dots{display:flex;flex-wrap:wrap;justify-content:center;gap:2px;margin-top:4px;min-height:8px}
.day-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
/* Cards */
.section{padding:0 12px 4px}
.section-title{font-size:0.9rem;font-weight:700;padding:16px 4px 10px;color:#3a3a3c;display:flex;align-items:center;gap:8px}
.card{background:white;border-radius:14px;margin-bottom:10px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.07)}
.card-header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;cursor:pointer;user-select:none}
.card-header:hover{background:rgba(0,0,0,0.02)}
.card-title{display:flex;align-items:center;gap:9px}
.card-icon{font-size:1.15rem}
.card-name{font-weight:600;font-size:0.92rem}
.card-meta{display:flex;align-items:center;gap:5px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end}
.badge{padding:3px 9px;border-radius:10px;font-size:0.7rem;font-weight:600;white-space:nowrap}
.badge-latest{background:#e8f4ff;color:#007aff}
.badge-days{font-size:0.68rem;font-weight:700;padding:2px 7px;border-radius:8px}
.badge-days-fresh{background:#e8faf0;color:#1a7a3a}
.badge-days-mid{background:#fff3e0;color:#b45309}
.badge-days-old{background:#ffebeb;color:#cc0000}
.card-toggle{font-size:0.7rem;color:#c7c7cc;margin-left:4px}
.card-body{display:none;border-top:1px solid #f2f2f7}
.card-body.open{display:block}
.notes-section{padding:10px 14px;background:#fafafa;border-bottom:1px solid #eee}
.notes-title{font-size:0.68rem;font-weight:700;color:#8e8e93;text-transform:uppercase;margin-bottom:5px;letter-spacing:.5px}
.note-item{font-size:0.78rem;color:#3a3a3c;padding:2px 0 2px 14px;position:relative}
.note-item::before{content:'·';position:absolute;left:4px;color:#8e8e93;font-size:1rem;top:0}
.trend-section{display:flex;gap:16px;padding:12px 14px;background:#f9f9fb;border-bottom:1px solid #eee;flex-wrap:wrap}
.trend-item{flex:1;min-width:180px}
.trend-label{font-size:0.68rem;font-weight:700;color:#8e8e93;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
.trend-body{display:flex;align-items:center;gap:10px}
.trend-stats{display:flex;flex-direction:column;gap:2px}
.trend-stat{display:flex;gap:6px;align-items:baseline}
.trend-stat span{font-size:0.68rem;color:#8e8e93;width:28px}
.trend-stat strong{font-size:0.78rem;color:#1c1c1e}
.spark-js{position:relative;width:140px;height:44px;flex-shrink:0;cursor:crosshair}
.spark-js svg{overflow:visible}
.spark-tooltip{position:fixed;background:rgba(28,28,30,0.92);color:#fff;font-size:0.68rem;padding:4px 8px;border-radius:6px;pointer-events:none;white-space:nowrap;z-index:9999;display:none;line-height:1.5}
.summary-bar{display:flex;gap:6px;padding:8px 14px 10px;flex-wrap:wrap;border-bottom:1px solid #f2f2f7}
.stat-chip{background:#f2f2f7;border-radius:10px;padding:4px 9px;font-size:0.72rem;color:#3a3a3c}
.stat-chip strong{color:#1c1c1e}
.table-wrapper{overflow-x:auto;-webkit-overflow-scrolling:touch}
table{width:100%;border-collapse:collapse;font-size:0.75rem}
th{background:#f5f5f7;color:#6e6e73;font-size:0.65rem;font-weight:700;text-transform:uppercase;padding:7px 8px;text-align:left;letter-spacing:.3px;white-space:nowrap}
td{padding:8px 8px;border-bottom:1px solid #f8f8f8;vertical-align:top}
tr:last-child td{border-bottom:none}
tr:nth-child(even) td{background:#fafafa}
tr:hover td{background:#f0f8ff!important}
.date-cell{white-space:nowrap;font-weight:600;color:#007aff;font-size:0.72rem;cursor:pointer;text-decoration:underline dotted}
.date-cell:hover{color:#0056b3}
.sets-cell{line-height:1.5}
.volume-cell{font-weight:700;color:#007aff;white-space:nowrap}
.volume-na{color:#c7c7cc;font-style:italic}
.feel-cell{color:#3a3a3c;max-width:120px;line-height:1.4}
.exhaustion-badge{display:inline-block;padding:2px 7px;border-radius:8px;font-size:0.67rem;font-weight:600;white-space:nowrap}
.condition-cell{color:#3a3a3c}
.cue-cell{color:#8e8e93;max-width:160px;line-height:1.4}
/* ── Modal ── */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:10000;display:none;align-items:center;justify-content:center;padding:16px}
.modal-overlay.open{display:flex}
.modal-box{background:white;border-radius:18px;width:100%;max-width:860px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden}
.modal-header{padding:12px 16px;border-bottom:1px solid #f2f2f7;display:flex;align-items:center;gap:10px;flex-shrink:0}
.modal-back{background:#f2f2f7;border:none;border-radius:10px;cursor:pointer;font-size:0.8rem;font-weight:700;padding:5px 10px;color:#007aff;display:none}
.modal-back:hover{background:#e5e5ea}
.modal-title{font-size:0.95rem;font-weight:700;flex:1}
.modal-close{background:none;border:none;font-size:1.4rem;cursor:pointer;color:#8e8e93;line-height:1;padding:0 4px;flex-shrink:0}
.modal-close:hover{color:#1c1c1e}
/* Range bar */
.modal-range-bar{padding:8px 14px 6px;border-bottom:1px solid #f2f2f7;display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex-shrink:0;background:#fafafa}
.range-chips{display:flex;gap:4px;flex-wrap:wrap}
.range-chip{padding:4px 10px;border-radius:14px;border:1.5px solid #e5e5ea;font-size:0.72rem;font-weight:600;cursor:pointer;color:#3a3a3c;background:white;transition:all 0.12s}
.range-chip:hover{border-color:#007aff;color:#007aff}
.range-chip.active{background:#007aff;color:white;border-color:#007aff}
.range-sep{color:#e5e5ea;font-size:0.8rem}
.list-ctrl{display:flex;gap:6px;align-items:center;margin-left:auto}
.ctrl-sel{padding:4px 8px;border-radius:12px;border:1.5px solid #e5e5ea;font-size:0.72rem;background:white;cursor:pointer;color:#3a3a3c}
/* Modal tabs */
.modal-tabs{display:flex;border-bottom:1px solid #e5e5ea;flex-shrink:0}
.modal-tab{flex:1;padding:9px 8px;font-size:0.78rem;font-weight:600;text-align:center;cursor:pointer;color:#8e8e93;border-bottom:2.5px solid transparent;transition:all 0.15s}
.modal-tab.active{color:#007aff;border-bottom-color:#007aff}
.modal-content{flex:1;overflow-y:auto}
.modal-panel{display:none;padding:0}
.modal-panel.active{display:block}
.raw-journal{white-space:pre-wrap;font-family:monospace;font-size:0.74rem;color:#3a3a3c;line-height:1.7;background:#f9f9fb;padding:14px;border-radius:10px;margin:14px}
/* Range list */
.range-group-header{display:flex;align-items:center;gap:8px;padding:10px 14px 6px;font-size:0.72rem;font-weight:700;color:#8e8e93;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #f2f2f7;background:#fafafa;cursor:pointer;user-select:none}
.range-group-header:hover{background:#f2f2f7}
.range-group-toggle{font-size:0.65rem;color:#c7c7cc;margin-left:auto}
.range-group-body{display:block}
.ex-row{display:flex;align-items:center;gap:8px;padding:7px 14px;border-bottom:1px solid #f8f8f8;cursor:pointer;transition:background 0.1s}
.ex-row:hover{background:#f0f7ff}
.ex-row:last-child{border-bottom:none}
.ex-row-icon{font-size:1rem;flex-shrink:0}
.ex-row-name{font-weight:600;font-size:0.82rem;flex:1}
.ex-row-date{font-size:0.68rem;color:#8e8e93;white-space:nowrap}
.ex-row-sets{font-size:0.72rem;color:#3a3a3c;max-width:160px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap}
.ex-row-vol{font-size:0.72rem;font-weight:700;color:#007aff;white-space:nowrap;min-width:60px;text-align:right}
.ex-row-arrow{color:#c7c7cc;font-size:0.7rem;flex-shrink:0}
/* Exercise detail (drill-down) */
.ex-detail-panel{padding:0}
.ex-detail-trend{padding:12px 14px;background:#f9f9fb;border-bottom:1px solid #eee}
/* Compare */
.compare-pickers{display:flex;gap:12px;padding:12px 14px;border-bottom:1px solid #f2f2f7;flex-wrap:wrap;align-items:center}
.compare-picker-group{display:flex;align-items:center;gap:6px;flex:1;min-width:200px}
.compare-picker-group label{font-size:0.72rem;font-weight:700;color:#8e8e93;white-space:nowrap}
.date-input{padding:5px 9px;border-radius:10px;border:1.5px solid #e5e5ea;font-size:0.78rem;cursor:pointer}
.compare-btn{padding:5px 14px;border-radius:14px;background:#007aff;color:white;border:none;font-size:0.78rem;font-weight:600;cursor:pointer}
.compare-btn:hover{opacity:0.85}
.compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border-top:1px solid #f2f2f7}
.compare-col{border-right:1px solid #f2f2f7;overflow-x:auto}
.compare-col:last-child{border-right:none}
.compare-col-header{padding:8px 12px;font-size:0.72rem;font-weight:700;background:#f5f5f7;position:sticky;top:0;z-index:1;border-bottom:1px solid #e5e5ea}
.compare-ex-row{padding:6px 12px;border-bottom:1px solid #f8f8f8;font-size:0.74rem}
.compare-ex-row:hover{background:#f0f7ff}
.compare-ex-name{font-weight:600;margin-bottom:2px}
.compare-ex-detail{color:#8e8e93;font-size:0.68rem}
.compare-ex-vol{font-weight:700;color:#007aff;font-size:0.72rem}
.compare-match{background:#f0fff4}
.compare-delta-pos{color:#1a7a3a;font-weight:700}
.compare-delta-neg{color:#cc0000;font-weight:700}
.compare-delta-zero{color:#8e8e93}
.compare-only{background:#fff8f0}
.no-data{padding:24px;text-align:center;color:#8e8e93;font-size:0.82rem}
/* ── View switcher ── */
.view-tabs{display:flex;gap:2px;background:#f2f2f7;border-radius:20px;padding:3px;margin-right:4px}
.view-tab{padding:5px 14px;border-radius:17px;border:none;cursor:pointer;font-size:0.78rem;font-weight:600;background:transparent;color:#8e8e93;transition:all 0.15s;white-space:nowrap}
.view-tab.active{background:white;color:#007aff;box-shadow:0 1px 3px rgba(0,0,0,0.12)}
/* ── Day view (inline panel) ── */
.day-panel{background:#f2f2f7;display:none}
.day-panel.active{display:block}
.day-panel-hdr{display:flex;align-items:center;gap:8px;padding:10px 14px;background:white;border-bottom:1px solid #e5e5ea}
.day-back-btn{background:#f2f2f7;border:none;border-radius:10px;cursor:pointer;font-size:0.78rem;font-weight:700;padding:5px 10px;color:#007aff}
.day-back-btn:hover{background:#e8f0ff}
.day-hdr-title{font-size:0.95rem;font-weight:700;flex:1;text-align:center;min-width:0}
/* ── Exercise view wrapper ── */
.ex-panel{display:none}
.ex-panel.active{display:block}
"""

# ── HTML structure ────────────────────────────────────────────────────────────
HTML_BODY = """\
<div class="page-header">
  <h1>🏋️ 訓練進度總覽</h1>
  <p>JSON 外部資料 · 互動圖表 · 時間軸 · 動作歷程 drill-down</p>
</div>
<div class="toolbar">
  <div class="view-tabs">
    <button class="view-tab active" id="vtab-exercise" onclick="switchMainView('exercise')">💪 動作一覽</button>
    <button class="view-tab"        id="vtab-day"      onclick="switchMainView('day')">📅 日期記錄</button>
  </div>
  <button class="btn btn-secondary" id="btn-expand"   onclick="toggleAll(true)">展開全部</button>
  <button class="btn btn-secondary" id="btn-collapse" onclick="toggleAll(false)">收合全部</button>
  <select class="sort-select" id="sort-select" onchange="applySortAndRender()">
    <option value="group">依部位分類</option>
    <option value="recent">最近訓練優先</option>
    <option value="overdue">最久未練優先</option>
    <option value="maxwt">最大重量↓</option>
    <option value="volume">累計容量↓</option>
    <option value="sessions">訓練次數↓</option>
    <option value="progress">重量進步幅度↓</option>
    <option value="name">名稱字母序</option>
  </select>
</div>
<div class="week-panel" id="week-panel">
  <div class="week-panel-header">
    <span class="week-panel-title" id="week-panel-label">最近 14 天</span>
    <div class="week-nav">
      <button class="week-nav-btn" onclick="shiftWeek(-7)">‹ 前一週</button>
      <button class="week-nav-btn" onclick="shiftWeek(0)">今天</button>
      <button class="week-nav-btn" onclick="shiftWeek(7)">後一週 ›</button>
    </div>
  </div>
  <div class="week-strip" id="week-strip"></div>
</div>

<!-- ── Day view (inline panel, not modal) ── -->
<div class="day-panel" id="day-panel">
  <div class="day-panel-hdr">
    <button class="day-back-btn" id="day-back-btn" onclick="dayGoBack()" style="display:none">← 返回動作</button>
    <div class="day-hdr-title" id="day-hdr-title">—</div>
  </div>
  <div class="modal-range-bar" id="modal-range-bar">
    <div class="range-chips" id="range-chips">
      <span class="range-chip active" data-days="0" onclick="setRange(0)">當天</span>
      <span class="range-chip" data-days="3"  onclick="setRange(3)">±3天</span>
      <span class="range-chip" data-days="7"  onclick="setRange(7)">±7天</span>
      <span class="range-chip" data-days="14" onclick="setRange(14)">±14天</span>
      <span class="range-chip" data-days="30" onclick="setRange(30)">±30天</span>
    </div>
    <span class="range-sep">|</span>
    <div class="list-ctrl">
      <select class="ctrl-sel" id="group-by-sel" onchange="renderRangePanel()">
        <option value="exercise">依動作</option>
        <option value="date">依日期</option>
        <option value="group">依部位</option>
      </select>
      <select class="ctrl-sel" id="sort-by-sel" onchange="renderRangePanel()">
        <option value="date-desc">時間↓新→舊</option>
        <option value="date-asc">時間↑舊→新</option>
        <option value="vol-desc">容量↓</option>
        <option value="wt-desc">重量↓</option>
        <option value="name">名稱</option>
      </select>
    </div>
  </div>
  <div class="modal-tabs" id="modal-tabs">
    <div class="modal-tab active" id="tab-range"   onclick="switchDayTab('range')">📊 訓練整理</div>
    <div class="modal-tab"        id="tab-compare" onclick="switchDayTab('compare')">🔍 日期比較</div>
    <div class="modal-tab"        id="tab-raw"     onclick="switchDayTab('raw')">📄 原始日誌</div>
  </div>
  <div class="modal-content" style="min-height:60vh">
    <div class="modal-panel active" id="panel-range"></div>
    <div class="modal-panel"        id="panel-compare">
      <div class="compare-pickers">
        <div class="compare-picker-group">
          <label>📅 日期 A</label>
          <input type="date" class="date-input" id="cmp-date-a">
        </div>
        <div class="compare-picker-group">
          <label>📅 日期 B</label>
          <input type="date" class="date-input" id="cmp-date-b">
        </div>
        <button class="compare-btn" onclick="renderCompare()">比較</button>
      </div>
      <div id="compare-result"></div>
    </div>
    <div class="modal-panel" id="panel-raw"></div>
  </div>
</div>

<!-- ── Exercise view ── -->
<div class="ex-panel active" id="ex-panel">
  <div id="main-content"></div>
</div>

<div class="spark-tooltip" id="spark-tooltip"></div>
"""

# ── JS data block ─────────────────────────────────────────────────────────────
JS_DATA = f"""\
const EXERCISES   = {EXERCISES_JS};
const JOURNALS    = {JOURNALS_JS};
const DAILY_INDEX = {DAILY_JS};
const GROUP_ORDER  = {GROUP_ORDER_JS};
const GROUP_ACCENT = {GROUP_ACCENT_JS};
const EXH_STYLE    = {EXH_STYLE_JS};
const EX_MAP = Object.fromEntries(EXERCISES.map(e => [e.id, e]));
"""

# ── JS helpers + main card logic (raw string, no f-string escaping needed) ───
JS_HELPERS = r"""
// ── Calculation helpers ──────────────────────────────────────────────────────
function calcVolume(sets) {
  if (!sets || !sets.length) return null;
  let t = 0;
  for (const [w,r] of sets) { if (w==null||r==null) return null; t += w*r; }
  return t;
}
function getMaxWeight(sets) {
  const ws=(sets||[]).filter(s=>s[0]!=null&&s[0]>0).map(s=>s[0]);
  return ws.length?Math.max(...ws):null;
}
function formatSets(h) {
  if (h.sets_display) return h.sets_display;
  const sets=h.sets||[];
  if (!sets.length) return '-';
  if (sets[0][0]==null) return '動作練習';
  const parts=[]; let i=0;
  while (i<sets.length) {
    const [w,r]=sets[i];
    if (w==null||r==null){parts.push('？');i++;continue;}
    let c=1;
    while(i+c<sets.length&&sets[i+c][0]===w&&sets[i+c][1]===r)c++;
    const rStr=Number.isInteger(r)?String(r):r.toFixed(1);
    parts.push(c>1?`${c}×${rStr}\u3000(${w}kg)`:`${w}kg×${rStr}`);
    i+=c;
  }
  return parts.join(' / ');
}
function calcDaysAgo(ds) {
  const t=new Date();t.setHours(0,0,0,0);
  const d=new Date(ds);d.setHours(0,0,0,0);
  return Math.round((t-d)/86400000);
}
function lastDate(ex){return ex.history?.length?ex.history[ex.history.length-1].date:'0000-00-00';}
function isoDate(d){
  // Use local date parts to avoid UTC-shift timezone bug
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function dateAddDays(base,n){const d=new Date(base);d.setDate(d.getDate()+n);return d;}
function datesInRange(centre,days){
  const res=[];
  for(let i=-days;i<=days;i++) res.push(isoDate(dateAddDays(new Date(centre),i)));
  return res;
}

// ── Week strip ───────────────────────────────────────────────────────────────
const DOW_ZH=['日','一','二','三','四','五','六'];
let weekOffset=0;
function buildWeekStrip(centreOffset){
  weekOffset=centreOffset;
  const todayD=new Date();todayD.setHours(0,0,0,0);
  const todayStr=isoDate(todayD);
  const startOff=centreOffset-6;
  const days=[];
  for(let i=0;i<14;i++) days.push(isoDate(dateAddDays(todayD,startOff+i)));
  const label=`${days[0].slice(5)} — ${days[days.length-1].slice(5)}`;
  document.getElementById('week-panel-label').textContent=label;
  const strip=document.getElementById('week-strip');
  strip.innerHTML='';
  for(const ds of days){
    const d=new Date(ds);
    const exIds=DAILY_INDEX[ds]||[];
    const isTrained=exIds.length>0;
    const isToday=ds===todayStr;
    const isFuture=ds>todayStr;
    const cell=document.createElement('div');
    cell.className='day-cell'+(isToday?' today':'')+(isTrained&&!isToday?' trained':'');
    cell.dataset.date=ds;
    if(isTrained||JOURNALS[ds])cell.onclick=()=>openDayModal(ds);
    else cell.style.opacity=isFuture?'0.3':'0.55';
    const groups=[...new Set(exIds.map(id=>EX_MAP[id]?.group).filter(Boolean))];
    const dots=groups.map(g=>{
      const col=isToday?'rgba(255,255,255,0.85)':(GROUP_ACCENT[g]||'#888');
      return `<span class="day-dot" style="background:${col}" title="${g}"></span>`;
    }).join('');
    cell.innerHTML=`<div class="day-dow">${DOW_ZH[d.getDay()]}</div><div class="day-num">${d.getDate()}</div><div class="day-dots">${dots}</div>`;
    strip.appendChild(cell);
  }
  const tidx=days.indexOf(todayStr);
  if(tidx>=0){const cells=strip.querySelectorAll('.day-cell');if(cells[tidx])setTimeout(()=>cells[tidx].scrollIntoView({inline:'center',behavior:'smooth'}),50);}
}
function shiftWeek(delta){buildWeekStrip(delta===0?0:weekOffset+delta);}
function highlightDayCell(ds){
  document.querySelectorAll('.day-cell').forEach(c=>c.classList.remove('active-sel'));
  const cell=document.querySelector(`.day-cell[data-date="${ds}"]`);
  if(cell)cell.classList.add('active-sel');
}

// ── Sorting (main cards) ─────────────────────────────────────────────────────
function sortedExercises(sortKey){
  const exs=[...EXERCISES];
  switch(sortKey){
    case 'group':{const gi=Object.fromEntries(GROUP_ORDER.map((g,i)=>[g,i]));exs.sort((a,b)=>(gi[a.group]??99)-(gi[b.group]??99));return exs;}
    case 'recent': exs.sort((a,b)=>lastDate(b).localeCompare(lastDate(a)));break;
    case 'overdue':exs.sort((a,b)=>lastDate(a).localeCompare(lastDate(b)));break;
    case 'maxwt':{const mw=e=>Math.max(0,...(e.history||[]).map(h=>getMaxWeight(h.sets)||0));exs.sort((a,b)=>mw(b)-mw(a));break;}
    case 'volume':{const tv=e=>(e.history||[]).reduce((s,h)=>s+(calcVolume(h.sets)||0),0);exs.sort((a,b)=>tv(b)-tv(a));break;}
    case 'sessions':exs.sort((a,b)=>(b.history?.length||0)-(a.history?.length||0));break;
    case 'progress':{function pg(e){const qs=(e.history||[]).filter(h=>getMaxWeight(h.sets));if(qs.length<2)return 0;return(getMaxWeight(qs[qs.length-1].sets)||0)-(getMaxWeight(qs[0].sets)||0);}exs.sort((a,b)=>pg(b)-pg(a));break;}
    case 'name':exs.sort((a,b)=>a.name.localeCompare(b.name,'zh-TW'));break;
  }
  return exs;
}
"""

JS_SPARKLINE = r"""
// ── Sparkline ────────────────────────────────────────────────────────────────
function renderSparkline(el){
  const raw=el.dataset.chartdata,unit=el.dataset.unit||'';
  let data;try{data=JSON.parse(raw);}catch(e){return;}
  if(!data||data.length<2)return;
  const W=140,H=44,pX=6,pY=5;
  const vals=data.map(d=>d.value);
  const vmin=Math.min(...vals),vmax=Math.max(...vals),vr=vmax===vmin?1:vmax-vmin;
  const n=data.length;
  const xs=data.map((_,i)=>pX+i*(W-pX*2)/(n-1));
  const ys=vals.map(v=>H-pY-(v-vmin)/vr*(H-pY*2));
  const trend=vals[n-1]-vals[0];
  const stroke=trend>0?'#34c759':trend<0?'#ff3b30':'#8e8e93';
  const NS='http://www.w3.org/2000/svg';
  const uid=Math.random().toString(36).slice(2,7);
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('width',W);svg.setAttribute('height',H);
  const defs=document.createElementNS(NS,'defs');
  const grad=document.createElementNS(NS,'linearGradient');
  grad.id='g'+uid;grad.setAttribute('x1','0');grad.setAttribute('y1','0');grad.setAttribute('x2','0');grad.setAttribute('y2','1');
  [['0%','0.25'],['100%','0.02']].forEach(([o,op])=>{const s=document.createElementNS(NS,'stop');s.setAttribute('offset',o);s.setAttribute('stop-color',stroke);s.setAttribute('stop-opacity',op);grad.appendChild(s);});
  defs.appendChild(grad);svg.appendChild(defs);
  const pts=xs.map((x,i)=>`${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const fPts=`${pX},${H-2} ${pts} ${xs[n-1].toFixed(1)},${H-2}`;
  const poly=document.createElementNS(NS,'polygon');poly.setAttribute('points',fPts);poly.setAttribute('fill',`url(#g${uid})`);poly.setAttribute('stroke','none');svg.appendChild(poly);
  const line=document.createElementNS(NS,'polyline');line.setAttribute('points',pts);line.setAttribute('fill','none');line.setAttribute('stroke',stroke);line.setAttribute('stroke-width','2');line.setAttribute('stroke-linecap','round');line.setAttribute('stroke-linejoin','round');svg.appendChild(line);
  const xline=document.createElementNS(NS,'line');xline.setAttribute('y1',pY);xline.setAttribute('y2',H-pY);xline.setAttribute('stroke','rgba(120,120,130,0.4)');xline.setAttribute('stroke-width','1');xline.setAttribute('stroke-dasharray','3,2');xline.style.display='none';svg.appendChild(xline);
  const dot=document.createElementNS(NS,'circle');dot.setAttribute('r','4');dot.setAttribute('fill',stroke);dot.setAttribute('stroke','white');dot.setAttribute('stroke-width','1.5');dot.style.display='none';svg.appendChild(dot);
  const lDot=document.createElementNS(NS,'circle');lDot.setAttribute('cx',xs[n-1].toFixed(1));lDot.setAttribute('cy',ys[n-1].toFixed(1));lDot.setAttribute('r','3');lDot.setAttribute('fill',stroke);svg.appendChild(lDot);
  const ov=document.createElementNS(NS,'rect');ov.setAttribute('x',0);ov.setAttribute('y',0);ov.setAttribute('width',W);ov.setAttribute('height',H);ov.setAttribute('fill','transparent');ov.style.cursor='crosshair';svg.appendChild(ov);
  const tip=document.getElementById('spark-tooltip');
  ov.addEventListener('mousemove',e=>{
    const r=svg.getBoundingClientRect(),mx=e.clientX-r.left;
    let ni=0,nd=Infinity;
    xs.forEach((x,i)=>{const d=Math.abs(x-mx);if(d<nd){nd=d;ni=i;}});
    const cx=xs[ni],cy=ys[ni];
    xline.setAttribute('x1',cx.toFixed(1));xline.setAttribute('x2',cx.toFixed(1));xline.style.display='';
    dot.setAttribute('cx',cx.toFixed(1));dot.setAttribute('cy',cy.toFixed(1));dot.style.display='';
    tip.innerHTML=`<strong>${data[ni].date.slice(5)}</strong><br>${data[ni].value.toLocaleString()} ${unit}`;
    tip.style.display='block';tip.style.left=(e.clientX+14)+'px';tip.style.top=(e.clientY-36)+'px';
  });
  ov.addEventListener('mouseleave',()=>{xline.style.display='none';dot.style.display='none';tip.style.display='none';});
  el.appendChild(svg);
}
"""

JS_MODAL = r"""
// ── View state ────────────────────────────────────────────────────────────────
let currentMainView = 'exercise';  // 'exercise' | 'day'
let MS = {
  date: null,
  rangeDays: 0,
  groupBy: 'exercise',
  sortBy:  'date-desc',
  tab: 'range',
  view: 'list',  // 'list' | 'exdetail'
  drillExId: null,
};

// ── Main view switcher ────────────────────────────────────────────────────────
function switchMainView(view, opts) {
  currentMainView = view;
  document.getElementById('vtab-exercise').classList.toggle('active', view==='exercise');
  document.getElementById('vtab-day').classList.toggle('active', view==='day');
  document.getElementById('day-panel').classList.toggle('active', view==='day');
  document.getElementById('ex-panel').classList.toggle('active', view==='exercise');
  // Show/hide exercise-only toolbar controls
  const exOnly = view==='exercise';
  document.getElementById('btn-expand').style.display   = exOnly ? '' : 'none';
  document.getElementById('btn-collapse').style.display = exOnly ? '' : 'none';
  document.getElementById('sort-select').style.display  = exOnly ? '' : 'none';
  // URL param update
  const params = new URLSearchParams(window.location.search);
  if (view==='exercise') {
    params.delete('date'); params.delete('exercise');
    if (opts?.exercise) params.set('exercise', opts.exercise);
  } else {
    params.delete('exercise');
    if (MS.date) params.set('date', MS.date);
  }
  const qs = params.toString();
  try { history.replaceState(null, '', qs ? '?'+qs : window.location.pathname); } catch(e) {}
}

// ── Day tab switching ─────────────────────────────────────────────────────────
function switchDayTab(tab) {
  MS.tab = tab;
  document.querySelectorAll('.modal-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.modal-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('tab-'+tab).classList.add('active');
  document.getElementById('panel-'+tab).classList.add('active');
  const rangeBar = document.getElementById('modal-range-bar');
  rangeBar.style.display = (tab==='range'&&MS.view==='list') ? '' : 'none';
  if (tab==='range') renderRangePanel();
  else if (tab==='raw') renderRawPanel();
}

// ── Open day view ─────────────────────────────────────────────────────────────
function openDayModal(date) {  // kept as alias for backward compat
  showDayView(date);
}
function showDayView(date) {
  MS.date = date; MS.rangeDays = 0; MS.view = 'list'; MS.drillExId = null;
  document.querySelectorAll('.range-chip').forEach(c => {
    c.classList.toggle('active', parseInt(c.dataset.days)===0);
  });
  document.getElementById('group-by-sel').value = MS.groupBy;
  document.getElementById('sort-by-sel').value  = MS.sortBy;
  document.getElementById('cmp-date-a').value = date;
  const prev7 = isoDate(dateAddDays(new Date(date), -7));
  document.getElementById('cmp-date-b').value = prev7;
  updateDayHeader();
  document.getElementById('modal-range-bar').style.display = '';
  document.getElementById('day-back-btn').style.display = 'none';
  switchMainView('day');
  switchDayTab('range');
  highlightDayCell(date);
  window.scrollTo({top:0, behavior:'smooth'});
}

function updateDayHeader() {
  let title = MS.date;
  if (MS.rangeDays > 0) {
    const s = isoDate(dateAddDays(new Date(MS.date), -MS.rangeDays));
    const e2 = isoDate(dateAddDays(new Date(MS.date), MS.rangeDays));
    title = `${s} ～ ${e2}（${MS.rangeDays*2+1}天）`;
  }
  if (MS.view==='exdetail' && MS.drillExId) {
    const ex = EX_MAP[MS.drillExId];
    title = `${ex?.icon||'🏋️'} ${ex?.name||MS.drillExId} 全歷程`;
  }
  document.getElementById('day-hdr-title').textContent = title;
}
// legacy alias
function updateModalHeader() { updateDayHeader(); }

// ── Range selector ────────────────────────────────────────────────────────────
function setRange(days) {
  MS.rangeDays = days;
  document.querySelectorAll('.range-chip').forEach(c => {
    c.classList.toggle('active', parseInt(c.dataset.days)===days);
  });
  updateDayHeader();
  renderRangePanel();
  if (MS.tab==='raw') renderRawPanel();
}

// ── Range panel — table-based collapsible groups ──────────────────────────────
function renderRangePanel() {
  MS.groupBy = document.getElementById('group-by-sel').value;
  MS.sortBy  = document.getElementById('sort-by-sel').value;
  MS.view = 'list';
  document.getElementById('day-back-btn').style.display = 'none';
  document.getElementById('modal-range-bar').style.display = '';

  const dates = MS.rangeDays===0 ? [MS.date] : datesInRange(MS.date, MS.rangeDays);
  let entries = [];
  for (const ds of dates) {
    const exIds = DAILY_INDEX[ds] || [];
    for (const id of exIds) {
      const ex = EX_MAP[id]; if (!ex) continue;
      const h = ex.history.find(h=>h.date===ds); if (!h) continue;
      entries.push({date:ds, ex, h});
    }
  }

  if (!entries.length) {
    document.getElementById('panel-range').innerHTML = '<div class="no-data">此範圍內無訓練記錄</div>';
    return;
  }

  const sortFn = {
    'date-desc': (a,b) => b.date.localeCompare(a.date),
    'date-asc':  (a,b) => a.date.localeCompare(b.date),
    'vol-desc':  (a,b) => (calcVolume(b.h.sets)||0) - (calcVolume(a.h.sets)||0),
    'wt-desc':   (a,b) => (getMaxWeight(b.h.sets)||0) - (getMaxWeight(a.h.sets)||0),
    'name':      (a,b) => a.ex.name.localeCompare(b.ex.name,'zh-TW'),
  }[MS.sortBy] || ((a,b)=>b.date.localeCompare(a.date));
  entries.sort(sortFn);

  // ─── Helper: build one table row ──────────────────────────────────────────
  function exRow(date, ex, h, showDateCol, showNameCol) {
    const vol = calcVolume(h.sets);
    const wt  = getMaxWeight(h.sets);
    const exhSt = EXH_STYLE[h.exhaustion]||EXH_STYLE['—']||'';
    const volCell = vol!=null
      ? `<span class="volume-cell">${vol.toLocaleString()} kg</span>`
      : '<span class="volume-na">—</span>';
    const dateCell = showDateCol
      ? `<td class="date-cell" onclick="event.stopPropagation();openDayModal('${date}')">${date}</td>` : '';
    const nameCell = showNameCol
      ? `<td style="white-space:nowrap;font-weight:600;font-size:0.75rem;cursor:pointer">${ex.icon||'🏋️'} ${ex.name}</td>` : '';
    return `<tr style="cursor:pointer" onclick="openExerciseDetail('${ex.id}','${date}')">
      ${dateCell}${nameCell}
      <td class="sets-cell">${formatSets(h)}</td>
      <td>${volCell}</td>
      <td class="feel-cell">${h.feel||''}</td>
      <td><span class="exhaustion-badge" style="${exhSt}">${h.exhaustion||'—'}</span></td>
      <td class="cue-cell">${h.cue||''}</td>
    </tr>`;
  }

  // ─── Helper: wrap rows in table ───────────────────────────────────────────
  function wrapTable(headerCols, rowsHtml) {
    return `<div class="table-wrapper" style="border-top:none">
      <table>
        <thead><tr>${headerCols.map(c=>`<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
  }

  // ─── Helper: build collapsible group block ────────────────────────────────
  function groupBlock(gid, headerHtml, tableHtml) {
    const uid = 'rg-' + gid.replace(/[^a-z0-9]/gi,'_');
    return `
<div class="range-group-header" onclick="toggleRangeGroup('${uid}')">
  ${headerHtml}
  <span class="range-group-toggle" id="toggle-${uid}">▲</span>
</div>
<div class="range-group-body" id="${uid}">${tableHtml}</div>`;
  }

  let html = '';

  if (MS.groupBy === 'exercise') {
    const groups = {}, order = [];
    for (const e of entries) {
      if (!groups[e.ex.id]) { groups[e.ex.id] = []; order.push(e.ex.id); }
      groups[e.ex.id].push(e);
    }
    for (const id of order) {
      const rows = groups[id];
      const ex = rows[0].ex;
      const accent = GROUP_ACCENT[ex.group]||'#888';
      const totalVol = rows.reduce((s,r)=>s+(calcVolume(r.h.sets)||0),0);
      const maxWt = Math.max(0,...rows.map(r=>getMaxWeight(r.h.sets)||0));
      const headerHtml = `
        <span style="background:${accent};width:4px;height:14px;border-radius:2px;display:inline-block;flex-shrink:0"></span>
        <span style="font-weight:700;font-size:0.82rem">${ex.icon||'🏋️'} ${ex.name}</span>
        <span style="font-size:0.68rem;color:#8e8e93;font-weight:400;margin-left:4px">${ex.group} · ${rows.length}次</span>
        ${maxWt?`<span style="font-size:0.68rem;background:#e8f4ff;color:#007aff;border-radius:8px;padding:1px 6px;font-weight:600">最高 ${maxWt}kg</span>`:''}
        ${totalVol?`<span style="font-size:0.68rem;background:#e8faf0;color:#1a7a3a;border-radius:8px;padding:1px 6px;font-weight:600">累計 ${totalVol.toLocaleString()}kg</span>`:''}`;
      const rowsHtml = rows.map(({date,ex:e,h})=>exRow(date,e,h,true,false)).join('');
      html += groupBlock(id, headerHtml, wrapTable(['日期','重量/組次','總容量','感受度','力竭','動作提示'], rowsHtml));
    }

  } else if (MS.groupBy === 'date') {
    const groups = {}, order = [];
    for (const e of entries) {
      if (!groups[e.date]) { groups[e.date] = []; order.push(e.date); }
      groups[e.date].push(e);
    }
    const dateOrder = [...new Set(order)];
    if (MS.sortBy==='date-asc') dateOrder.sort(); else dateOrder.sort((a,b)=>b.localeCompare(a));
    for (const ds of dateOrder) {
      const rows = groups[ds]||[];
      const dayTotal = rows.reduce((s,r)=>s+(calcVolume(r.h.sets)||0),0);
      const d = new Date(ds);
      const dow = ['日','一','二','三','四','五','六'][d.getDay()];
      const headerHtml = `
        <span style="font-weight:700;font-size:0.82rem">📅 ${ds} <span style="font-weight:400;color:#8e8e93">（週${dow}）</span></span>
        <span style="font-size:0.68rem;color:#8e8e93;font-weight:400;margin-left:4px">${rows.length}動作</span>
        ${dayTotal?`<span style="font-size:0.68rem;background:#e8faf0;color:#1a7a3a;border-radius:8px;padding:1px 6px;font-weight:600">總容量 ${dayTotal.toLocaleString()}kg</span>`:''}`;
      const rowsHtml = rows.map(({date,ex,h})=>exRow(date,ex,h,false,true)).join('');
      html += groupBlock('d'+ds.replace(/-/g,''), headerHtml, wrapTable(['動作','重量/組次','總容量','感受度','力竭','動作提示'], rowsHtml));
    }

  } else if (MS.groupBy === 'group') {
    const groups = {}, order = [];
    for (const e of entries) {
      const g = e.ex.group||'其他';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(e);
    }
    const gOrder = GROUP_ORDER.filter(g=>groups[g]);
    for (const g of gOrder) {
      const rows = groups[g]||[];
      const accent = GROUP_ACCENT[g]||'#888';
      const gTotal = rows.reduce((s,r)=>s+(calcVolume(r.h.sets)||0),0);
      const headerHtml = `
        <span style="background:${accent};width:4px;height:14px;border-radius:2px;display:inline-block;flex-shrink:0"></span>
        <span style="font-weight:700;font-size:0.82rem">${g}</span>
        <span style="font-size:0.68rem;color:#8e8e93;font-weight:400;margin-left:4px">${rows.length}組次</span>
        ${gTotal?`<span style="font-size:0.68rem;background:#e8faf0;color:#1a7a3a;border-radius:8px;padding:1px 6px;font-weight:600">累計 ${gTotal.toLocaleString()}kg</span>`:''}`;
      const rowsHtml = rows.map(({date,ex,h})=>exRow(date,ex,h,true,true)).join('');
      html += groupBlock('g'+g, headerHtml, wrapTable(['日期','動作','重量/組次','總容量','感受度','力竭','動作提示'], rowsHtml));
    }
  }

  document.getElementById('panel-range').innerHTML = html;
}
function toggleRangeGroup(uid){
  const body=document.getElementById(uid);
  const tog=document.getElementById('toggle-'+uid);
  if(!body)return;
  const open=body.style.display!=='none';
  body.style.display=open?'none':'block';
  if(tog)tog.textContent=open?'▼':'▲';
}
"""


JS_EXDETAIL = r"""
// ── Exercise detail drill-down ────────────────────────────────────────────────
function openExerciseDetail(exId, focusDate) {
  MS.view = 'exdetail'; MS.drillExId = exId;
  updateDayHeader();
  document.getElementById('day-back-btn').style.display = '';
  document.getElementById('modal-range-bar').style.display = 'none';

  const ex = EX_MAP[exId];
  if (!ex) { document.getElementById('panel-range').innerHTML='<div class="no-data">找不到動作</div>'; return; }

  // Build trend HTML (inline sparklines)
  const hist = ex.history || [];
  const volData = hist.map(h=>[h.date,calcVolume(h.sets)]).filter(([,v])=>v!=null);
  const wtData  = hist.map(h=>[h.date,getMaxWeight(h.sets)]).filter(([,v])=>v!=null);

  let trendHtml = '';
  function trendItem(label, pairs, unit) {
    const vals=pairs.map(([,v])=>v);
    const delta=vals[vals.length-1]-vals[0];
    const dStr=(delta>=0?'+':'')+delta.toLocaleString(undefined,{maximumFractionDigits:1});
    const dc=delta>=0?'#34c759':'#ff3b30';
    const cj=JSON.stringify(pairs.map(([d,v])=>({'date':d,'value':v})));
    return `<div class="trend-item">
      <div class="trend-label">${label}</div>
      <div class="trend-body">
        <div class="spark-js" data-chartdata='${cj.replace(/'/g,"&apos;")}' data-unit="${unit}"></div>
        <div class="trend-stats">
          <div class="trend-stat"><span>首次</span><strong>${vals[0].toLocaleString()} ${unit}</strong></div>
          <div class="trend-stat"><span>最新</span><strong>${vals[vals.length-1].toLocaleString()} ${unit}</strong></div>
          <div class="trend-stat"><span>變化</span><strong style="color:${dc}">${dStr} ${unit}</strong></div>
        </div>
      </div>
    </div>`;
  }
  if (volData.length>=2||wtData.length>=2) {
    trendHtml = '<div class="trend-section ex-detail-trend">';
    if (volData.length>=2) trendHtml += trendItem('📦 總容量趨勢', volData, 'kg');
    if (wtData.length>=2)  trendHtml += trendItem('⚖️ 最高重量趨勢', wtData, 'kg');
    trendHtml += '</div>';
  }

  // Notes
  let notesHtml = '';
  if (ex.notes?.length) {
    notesHtml = '<div class="notes-section"><div class="notes-title">📌 動作要點</div>';
    for (const n of ex.notes) notesHtml += `<div class="note-item">${n}</div>`;
    notesHtml += '</div>';
  }

  // Full history table — highlight focusDate row
  const rows = [...hist].reverse().map(h => {
    const vol = calcVolume(h.sets);
    const volHtml = vol!=null?`<span class="volume-cell">${vol.toLocaleString()} kg</span>`:'<span class="volume-na">—</span>';
    const exhSt = EXH_STYLE[h.exhaustion]||EXH_STYLE['—']||'';
    const hl = h.date===focusDate ? 'background:#fff8e1;' : '';
    return `<tr style="${hl}">
<td class="date-cell" onclick="openDayModal('${h.date}')" style="font-size:0.72rem">${h.date}${h.date===focusDate?' ◀':''}</td>
<td class="sets-cell">${formatSets(h)}</td>
<td>${volHtml}</td>
<td class="feel-cell">${h.feel||''}</td>
<td><span class="exhaustion-badge" style="${exhSt}">${h.exhaustion||'—'}</span></td>
<td class="condition-cell" style="max-width:80px">${h.condition||''}</td>
<td class="cue-cell">${h.cue||''}</td>
</tr>`;
  }).join('');

  const totalVol = hist.reduce((s,h)=>s+(calcVolume(h.sets)||0),0);
  const maxWt = Math.max(0,...hist.map(h=>getMaxWeight(h.sets)||0));

  document.getElementById('panel-range').innerHTML = `
<div class="ex-detail-panel">
  ${notesHtml}
  ${trendHtml}
  <div class="summary-bar">
    <div class="stat-chip">📅 <strong>${hist.length}</strong> 次</div>
    <div class="stat-chip">⚖️ 最高 <strong>${maxWt?maxWt+' kg':'—'}</strong></div>
    <div class="stat-chip">📦 累計 <strong>${totalVol?totalVol.toLocaleString()+' kg':'—'}</strong></div>
  </div>
  <div class="table-wrapper"><table>
  <thead><tr>
    <th>日期</th><th>重量/組次</th><th>總容量</th>
    <th>感受度</th><th>力竭</th><th>狀態</th><th>提示</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  </table></div>
</div>`;

  // Render sparklines in the new content
  document.querySelectorAll('#panel-range .spark-js').forEach(renderSparkline);
}
function dayGoBack() {
  MS.view = 'list'; MS.drillExId = null;
  updateDayHeader();
  document.getElementById('day-back-btn').style.display = 'none';
  document.getElementById('modal-range-bar').style.display = '';
  renderRangePanel();
}
"""

JS_COMPARE = r"""
// ── Date comparison ───────────────────────────────────────────────────────────
function renderCompare() {
  const dA = document.getElementById('cmp-date-a').value;
  const dB = document.getElementById('cmp-date-b').value;
  if (!dA || !dB) return;
  const idsA = DAILY_INDEX[dA] || [];
  const idsB = DAILY_INDEX[dB] || [];

  function buildEntry(id, date) {
    const ex = EX_MAP[id]; if (!ex) return null;
    const h = ex.history.find(h=>h.date===date); if (!h) return null;
    return { ex, h, vol: calcVolume(h.sets), wt: getMaxWeight(h.sets) };
  }

  const entriesA = idsA.map(id=>buildEntry(id,dA)).filter(Boolean);
  const entriesB = idsB.map(id=>buildEntry(id,dB)).filter(Boolean);
  const allIds   = [...new Set([...idsA,...idsB])];

  function colHtml(entries, otherEntries, dateStr) {
    if (!entries.length) return `<div class="no-data">無訓練記錄</div>`;
    const otherMap = Object.fromEntries(otherEntries.map(e=>[e.ex.id,e]));
    return entries.map(({ex,h,vol,wt}) => {
      const other = otherMap[ex.id];
      const matched = !!other;
      const exhSt = EXH_STYLE[h.exhaustion]||EXH_STYLE['—']||'';
      let deltaHtml = '';
      if (matched && other.vol!=null && vol!=null) {
        const dv = vol - other.vol;
        const cls = dv>0?'compare-delta-pos':dv<0?'compare-delta-neg':'compare-delta-zero';
        deltaHtml += `<span class="${cls}"> ${dv>0?'+':''}${dv.toLocaleString()} kg</span>`;
      }
      if (matched && other.wt!=null && wt!=null) {
        const dw = wt - other.wt;
        const cls = dw>0?'compare-delta-pos':dw<0?'compare-delta-neg':'compare-delta-zero';
        deltaHtml += ` <span class="${cls}" style="font-size:0.65rem">(${dw>0?'+':''}${dw}kg⚖️)</span>`;
      }
      return `<div class="compare-ex-row ${matched?'compare-match':'compare-only'}" onclick="openExerciseDetail('${ex.id}','${dateStr}')">
        <div class="compare-ex-name">${ex.icon||'🏋️'} ${ex.name}${deltaHtml}</div>
        <div class="compare-ex-detail">${formatSets(h)}</div>
        <div style="display:flex;gap:6px;align-items:center;margin-top:2px">
          ${vol!=null?`<span class="compare-ex-vol">${vol.toLocaleString()} kg</span>`:''}
          <span class="exhaustion-badge" style="${exhSt};font-size:0.62rem;padding:1px 5px">${h.exhaustion||'—'}</span>
        </div>
        ${h.feel?`<div class="compare-ex-detail" style="color:#8e8e93">${h.feel}</div>`:''}
      </div>`;
    }).join('');
  }

  const totalA = entriesA.reduce((s,e)=>s+(e.vol||0),0);
  const totalB = entriesB.reduce((s,e)=>s+(e.vol||0),0);
  const diffTotal = totalA - totalB;
  const diffCls = diffTotal>0?'compare-delta-pos':diffTotal<0?'compare-delta-neg':'compare-delta-zero';

  document.getElementById('compare-result').innerHTML = `
<div style="padding:8px 14px;background:#f9f9fb;border-bottom:1px solid #eee;font-size:0.72rem;color:#3a3a3c">
  <strong>A</strong> ${dA} (${entriesA.length}動作, ${totalA.toLocaleString()} kg) vs
  <strong>B</strong> ${dB} (${entriesB.length}動作, ${totalB.toLocaleString()} kg) —
  容量差 <span class="${diffCls}">${diffTotal>0?'+':''}${diffTotal.toLocaleString()} kg</span>
  <span style="color:#c7c7cc;margin-left:8px">● 綠底=兩天都有, 橙底=僅此天有</span>
</div>
<div class="compare-grid">
  <div class="compare-col">
    <div class="compare-col-header">📅 A: ${dA}</div>
    ${colHtml(entriesA, entriesB, dA)}
  </div>
  <div class="compare-col">
    <div class="compare-col-header">📅 B: ${dB}</div>
    ${colHtml(entriesB, entriesA, dB)}
  </div>
</div>`;
}
"""

JS_RAW = r"""
// ── Raw journal panel ─────────────────────────────────────────────────────────
function renderRawPanel() {
  const dates = MS.rangeDays===0 ? [MS.date] : datesInRange(MS.date, MS.rangeDays);
  const filtered = dates.filter(d => JOURNALS[d]);
  if (!filtered.length) {
    document.getElementById('panel-raw').innerHTML = '<div class="no-data">此範圍無日誌記錄</div>';
    return;
  }
  const html = filtered.sort((a,b)=>b.localeCompare(a)).map(ds => `
<div style="margin:12px 14px 0">
  <div style="font-size:0.72rem;font-weight:700;color:#007aff;margin-bottom:4px">📅 ${ds}</div>
  <div class="raw-journal" style="margin:0">${JOURNALS[ds].replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
</div>`).join('');
  document.getElementById('panel-raw').innerHTML = html + '<div style="height:14px"></div>';
}
"""

JS_CARDBUILDER = r"""
// ── Main card builder (exercise list page) ────────────────────────────────────
function buildTrend(ex) {
  const volData=ex.history.map(h=>[h.date,calcVolume(h.sets)]).filter(([,v])=>v!=null);
  const wtData =ex.history.map(h=>[h.date,getMaxWeight(h.sets)]).filter(([,v])=>v!=null);
  if(!volData.length&&!wtData.length)return '';
  function tItem(label,pairs,unit){
    const vals=pairs.map(([,v])=>v);
    const delta=vals[vals.length-1]-vals[0];
    const dStr=(delta>=0?'+':'')+delta.toLocaleString(undefined,{maximumFractionDigits:1});
    const dc=delta>=0?'#34c759':'#ff3b30';
    const cj=JSON.stringify(pairs.map(([d,v])=>({'date':d,'value':v})));
    return `<div class="trend-item"><div class="trend-label">${label}</div>
    <div class="trend-body">
      <div class="spark-js" data-chartdata='${cj.replace(/'/g,"&apos;")}' data-unit="${unit}"></div>
      <div class="trend-stats">
        <div class="trend-stat"><span>首次</span><strong>${vals[0].toLocaleString()} ${unit}</strong></div>
        <div class="trend-stat"><span>最新</span><strong>${vals[vals.length-1].toLocaleString()} ${unit}</strong></div>
        <div class="trend-stat"><span>變化</span><strong style="color:${dc}">${dStr} ${unit}</strong></div>
      </div>
    </div></div>`;
  }
  let h='<div class="trend-section">';
  if(volData.length>=2)h+=tItem('📦 總容量趨勢',volData,'kg');
  if(wtData.length>=2) h+=tItem('⚖️ 最高重量趨勢',wtData,'kg');
  return h+'</div>';
}

function buildCard(ex){
  const eid=ex.id,hist=ex.history||[];
  const qHist=hist.filter(h=>calcVolume(h.sets)!=null);
  const latestDate=hist.length?hist[hist.length-1].date:'';
  const lw=qHist.length?getMaxWeight(qHist[qHist.length-1].sets):null;
  const lv=qHist.length?calcVolume(qHist[qHist.length-1].sets):null;
  const latestLabel=lw?`${lw}kg · ${(qHist[qHist.length-1].date||'').slice(5)} · Vol ${lv.toLocaleString()}`:(latestDate.slice(5)||'—');
  const days=latestDate?calcDaysAgo(latestDate):999;
  const dc=days<=3?'badge-days-fresh':days<=7?'badge-days-mid':'badge-days-old';
  const dl=days===0?'今天':days+'天前';
  const tVol=hist.reduce((s,h)=>s+(calcVolume(h.sets)||0),0);
  const mWt=Math.max(0,...hist.map(h=>getMaxWeight(h.sets)||0));
  let notesHtml='';
  if(ex.notes?.length){notesHtml='<div class="notes-section"><div class="notes-title">📌 動作要點</div>';for(const n of ex.notes)notesHtml+=`<div class="note-item">${n}</div>`;notesHtml+='</div>';}
  const trend=buildTrend(ex);
  const rows=hist.map(h=>{
    const vol=calcVolume(h.sets);
    const volH=vol!=null?`<span class="volume-cell">${vol.toLocaleString()} kg</span>`:'<span class="volume-na">—</span>';
    const exhSt=EXH_STYLE[h.exhaustion]||EXH_STYLE['—']||'';
    return `<tr><td class="date-cell" onclick="openDayModal('${h.date}')">${h.date}</td><td class="sets-cell">${formatSets(h)}</td><td>${volH}</td><td class="feel-cell">${h.feel||''}</td><td><span class="exhaustion-badge" style="${exhSt}">${h.exhaustion||'—'}</span></td><td class="condition-cell">${h.condition||''}</td><td class="cue-cell">${h.cue||''}</td></tr>`;
  }).join('');
  return `<div class="card" id="card-${eid}">
<div class="card-header" onclick="toggleCard('${eid}')">
  <div class="card-title"><span class="card-icon">${ex.icon||'🏋️'}</span><span class="card-name">${ex.name}</span></div>
  <div class="card-meta"><span class="badge badge-days ${dc}">${dl}</span><span class="badge badge-latest">${latestLabel}</span><span class="card-toggle" id="arrow-${eid}">▶</span></div>
</div>
<div class="card-body" id="body-${eid}">
${notesHtml}${trend}
<div class="summary-bar">
  <div class="stat-chip">📅 <strong>${hist.length}</strong> 次</div>
  <div class="stat-chip">⚖️ 最高 <strong>${mWt?mWt+' kg':'—'}</strong></div>
  <div class="stat-chip">📦 累計 <strong>${tVol?tVol.toLocaleString()+' kg':'—'}</strong></div>
</div>
<div class="table-wrapper"><table>
<thead><tr><th>日期</th><th>重量/組次</th><th>總容量</th><th>感受度</th><th>力竭狀況</th><th>身心狀態</th><th>動作提示</th></tr></thead>
<tbody>${rows}</tbody></table></div>
</div></div>`;
}

function renderAll(sortKey){
  const container=document.getElementById('main-content');
  const exs=sortedExercises(sortKey);
  let html='';
  if(sortKey==='group'){
    const groups={};
    for(const ex of exs){if(!groups[ex.group])groups[ex.group]=[];groups[ex.group].push(ex);}
    for(const g of GROUP_ORDER){
      if(!groups[g])continue;
      const accent=GROUP_ACCENT[g]||'#888';
      html+=`<div class="section"><div class="section-title"><span style="background:${accent};width:4px;height:18px;border-radius:2px;display:inline-block;"></span> ${g}</div>`;
      for(const ex of groups[g])html+=buildCard(ex);
      html+='</div>';
    }
  }else{
    const lm={recent:'最近訓練優先',overdue:'最久未練優先',maxwt:'最大重量↓',volume:'累計容量↓',sessions:'訓練次數↓',progress:'重量進步幅度↓',name:'名稱字母序'};
    html+=`<div class="section"><div class="section-title"><span style="background:#888;width:4px;height:18px;border-radius:2px;display:inline-block;"></span> 排序：${lm[sortKey]||sortKey}</div>`;
    for(const ex of exs)html+=buildCard(ex);
    html+='</div>';
  }
  container.innerHTML=html;
  document.querySelectorAll('.spark-js').forEach(renderSparkline);
}
function applySortAndRender(){renderAll(document.getElementById('sort-select').value);}
function toggleCard(id){const b=document.getElementById('body-'+id),a=document.getElementById('arrow-'+id),o=b.classList.contains('open');b.classList.toggle('open',!o);a.textContent=o?'▶':'▼';}
function toggleAll(o){document.querySelectorAll('.card-body').forEach(b=>b.classList.toggle('open',o));document.querySelectorAll('.card-toggle').forEach(a=>a.textContent=o?'▼':'▶');}

// ── Init ──────────────────────────────────────────────────────────────────────
(function init() {
  buildWeekStrip(0);
  renderAll('group');
  const params = new URLSearchParams(window.location.search);
  const dateParam  = params.get('date');
  const exParam    = params.get('exercise');
  if (dateParam) {
    showDayView(dateParam);
  } else if (exParam) {
    switchMainView('exercise', { exercise: exParam });
    const card = document.getElementById('card-' + exParam);
    if (card) {
      toggleCard(exParam);
      setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
  }
})();
"""

# ── Assemble & write ───────────────────────────────────────────────────────────
HTML = f"""<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>訓練進度總覽 v6</title>
<style>
{CSS}
</style>
</head>
<body>
{HTML_BODY}
<script>
// ── Embedded data ─────────────────────────────────────────────────────────────
{JS_DATA}
</script>
<script>
{JS_HELPERS}
{JS_SPARKLINE}
{JS_MODAL}
{JS_EXDETAIL}
{JS_COMPARE}
{JS_RAW}
{JS_CARDBUILDER}
</script>
<div style="text-align:center;padding:28px;color:#8e8e93;font-size:0.72rem;">
  v6 · 外部 JSON · 時間軸 · 動作歷程 drill-down · 日期範圍 · 比較 · 動態排序
</div>
</body>
</html>"""

out = BASE / 'trainlog' / 'index.html'
out.write_text(HTML, encoding='utf-8')
print(f'Done → {out}')
print(f'  File size: {out.stat().st_size/1024:.1f} KB')
