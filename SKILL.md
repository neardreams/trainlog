---
name: apple-journal-sync
description: >
  同步 Apple Journal 日誌到 trainlog GitHub Pages 儀表板。
  當使用者提到「同步日誌」「更新 trainlog」「匯入 Apple 日誌」「journal sync」
  「更新訓練紀錄」「把日誌更新上去」或任何關於將 Apple 日誌條目同步到 trainlog repo 的需求時，
  都應該使用這個 skill。即使使用者只是說「更新一下」或「跑一下同步」也應該觸發。
---

# Apple Journal → trainlog 同步 Skill

## 概述

使用者從 Apple Journal 匯出 HTML，同步到電腦後呼叫這個 skill。
Skill 會自動完成所有工作：同步 raw data、分析訓練數據、生成頁面、部署。

**分工原則：**
- **腳本處理**（不花 token）：HTML 解析、差異比對、raw data 同步
- **LLM 處理**（需要語意理解）：從日誌原文中截取結構化的訓練數據

## 目錄結構

```
TrainLogs/
├── Apple日誌條目/
│   ├── Entries/           ← Apple Journal HTML（YYYY-MM-DD.html）
│   └── Resources/         ← 圖片等（.heic）
└── trainlog/              ← 程式碼 repo (neardreams/trainlog)，網站由 Cloudflare 部署
    ├── data/
    │   ├── journals_raw.json      ← 日誌純文字（腳本維護）
    │   ├── training_data.json     ← 結構化訓練數據（LLM 維護）
    │   ├── .sync_hashes.json      ← HTML body hash 基準
    │   └── .pending_updates.json  ← 待確認的舊條目更新（暫存）
    ├── scripts/
    │   └── sync_journals.py       ← 核心解析腳本
    ├── generate_v6.py             ← 舊版 HTML 生成器（已停用）
    └── index.html                 ← GitHub Pages 頁面
```

---

## 完整執行流程

### Step 1: 腳本同步 raw data

找到 `Apple日誌條目` 和 `trainlog` 的實際路徑後執行：

```bash
python3 <trainlog>/scripts/sync_journals.py \
  --entries-dir "<Apple日誌條目>/Entries" \
  --data-dir "<trainlog>/data"
```

如果 `.sync_hashes.json` 不存在，先跑 `--init-baseline`。

腳本會印出統計。根據結果：
- **有新增** → 記下新增的日期，進入 Step 2
- **有待確認** → 讀 `.pending_updates.json`，呈現給使用者決定後用 `--apply-pending` 套用
- **全部未變動** → 告知使用者「所有條目都是最新的」，流程結束

### Step 2: LLM 分析並更新 training_data.json

這是需要 LLM 語意理解的部分。對於 Step 1 中**新增或更新的日期**：

1. **讀取** `journals_raw.json` 中對應日期的原文
2. **讀取** `training_data.json` 的現有結構
3. **從日誌原文中截取每一項訓練動作的結構化數據**

#### training_data.json 的結構

```json
{
  "meta": {
    "group_order": ["腿部", "背部", "胸部", "肩部", "手臂", "核心", "髖部"],
    "group_accent": { "腿部": "#2196F3", ... },
    "exhaustion_style": { "輕鬆": "...", "普通": "...", "吃力": "...", "力竭": "..." }
  },
  "exercises": [
    {
      "id": "zercher_squat",
      "name": "熊抱槓深蹲",
      "group": "腿部",
      "icon": "🏋️",
      "notes": ["技術要點1", "技術要點2"],
      "history": [
        {
          "date": "2026-03-24",
          "sets": [[45, 10], [45, 10], [45, 10], [45, 10]],
          "feel": "正常訓練",
          "exhaustion": "普通",
          "condition": "正常",
          "cue": "注意膝蓋不要內夾"
        }
      ]
    }
  ]
}
```

#### 截取規則

對每一筆新增日期的日誌原文：

1. **辨識訓練動作**：找出日誌中提到的每一個訓練項目
2. **比對現有動作**：用 `exercises` 裡的 `name` 和常見別名做比對
   - 如果是現有動作 → 在該動作的 `history` 裡新增一筆記錄
   - 如果是全新動作 → 建立新的 exercise 物件（需確認 group 分類）
3. **截取欄位**：
   - `date`：該日誌的日期
   - `sets`：每組的 `[重量kg, 次數]`，如果沒有明確重量就用 `[null, 次數]`
   - `feel`：體感描述，摘要成一句話
   - `exhaustion`：從「輕鬆/普通/吃力/力竭」中選一個，根據日誌描述判斷
   - `condition`：當日身體狀況（如有提及），沒有就寫「正常」
   - `cue`：技術提醒或教練指導重點，摘要成一句話
4. **更新 notes**：如果日誌中有新的技術要點或教練指導，且不在現有 notes 中，追加進去

#### 注意事項

- 不要覆蓋已有的 history 記錄，只追加新的
- 同一天同一個動作只能有一筆記錄
- 保持 `id` 命名慣例：小寫英文 + 底線（如 `seated_calf_machine`）
- 教練課和自主訓練的內容都要截取；教練課只教學、沒有組數的動作記一筆 `sets: []`、`exhaustion: "—"`、`condition: "教練課"`，重點寫進 `cue`
- 列在「熱身」裡的滾筒放鬆、拉伸、活動度、啟動動作（風車、Y-raise、90/90 等）不記；但熱身段落裡出現的正式重量訓練要記
- 主項標明「熱身組」的組數不放進 `sets`，寫在 `feel`（例：「熱身 20×10、60×3」）
- 正式訓練中的輔助／復健動作要記：前臂復健（旋前、旋後、尺偏、橈偏）、肩胛／核心啟動（Y-raise、Pallof press、側棒式、單腳臀橋、單腳提踵、反向北歐彎舉…）、RDL 持槓握力練習
- 同一動作但不同器械或單／雙側版本拆成不同動作（例：三樓蝴蝶機夾胸 vs Panatta Standing Multi-Flight；三樓腿伸展 vs 一樓分腿腿伸展），重量才可比較
- 單手、單腳、啞鈴、Panatta 分邊器械記「單邊」重量；輔助引體／雙槓記輔助公斤數（負 64 公斤 → 64）；器械空重或自重記 0
- `exhaustion` 依 RIR 判斷：RIR 0（或「半下」）→ 力竭；RIR 1–2 → 吃力；RIR 2–3 以上 → 普通；只有左邊力竭 → 力竭（左）
- 時間／距離類動作在 exercise 上設 `rep_unit`（`"秒"` 或 `"米"`），次數欄就填秒數或米數；重量 0 的顯示文字用 `zero_label`（`"空重"`／`"自重"`／`"空槓"`）
- 預設格式無法表達時（例：「最重 85kg（教練課）」「4×10（槓高 7）」），在 history 加 `sets_display` 覆寫顯示文字
- 有氧要記（分類「有氧」，exercise 設 `"kind": "cardio"`）：跑步機、操場跑、飛輪課、樓梯機、風扇車 HIIT、團體有氧課。history 用 `sets: []`、`minutes`（總分鐘，不知道就 `null`）、`distance_km`（可選）、`sets_display`（例：「35 分 · 4 km/h · 坡度 4 · 心率 ~130」）

### Step 3: 驗證資料

```bash
cd <trainlog> && pnpm validate:data
```

失敗時依錯誤訊息修正 `training_data.json`，**驗證沒通過不得進行下一步**。
（網頁開頁時直接讀 `data/*.json`，不需要再產生 HTML；`generate_v6.py` 是舊版，已停用。）

### Step 4: Git commit + push

```bash
cd <trainlog>
git add data/journals_raw.json data/training_data.json data/.sync_hashes.json
git commit -m "sync: 更新日誌 $(date +%Y-%m-%d)"
git push origin main
```

不要 commit `.pending_updates.json`。

### Step 5: 部署到 Cloudflare

網站在 https://trainlog.x-hu.com（GitHub 只作為程式碼倉庫，不使用 GitHub Pages）。push 後執行：

```bash
cd <trainlog>
pnpm build
npx wrangler deploy
```

`pnpm build` 會把網頁與 `data/` 的兩個 JSON 輸出到 `apps/web/dist/`，只有這個目錄會被公開。
部署後確認網站已更新：`curl -s https://trainlog.x-hu.com/data/training_data.json | grep -c "<最新日期>"`（大於 0 即可）。
若已在 Cloudflare 控制台把 Worker 連上 GitHub（push 自動部署），這一步可省略。

---

## 首次使用（init-baseline）

如果 `.sync_hashes.json` 不存在：

```bash
python3 <trainlog>/scripts/sync_journals.py \
  --entries-dir "<Apple日誌條目>/Entries" \
  --data-dir "<trainlog>/data" \
  --init-baseline
```

## 差異比對機制

腳本用 HTML `<body>` 內容的 MD5 hash 做差異偵測（忽略 `<head>` 和 CSS，
因為 Apple 每次匯出時 style 定義可能變動，但 body 內容不變）。

- **新條目** → 自動新增
- **舊條目 HTML 沒變** → 跳過
- **舊條目 HTML 有變** → 存入 `.pending_updates.json`，由使用者確認

## 解析器修正後重建（--reparse）

日常同步只會解析「新的」或「HTML 有變」的條目。若修正了解析器，舊條目不會自動重新解析，要跑：

```bash
python3 <trainlog>/scripts/sync_journals.py --entries-dir "<Apple日誌條目>/Entries" --data-dir "<trainlog>/data" --reparse
```

它會用目前的 HTML 重建所有原文並更新 hash，最後列出「內容有變動」的日期（只差空白的不算）。
接著對這些日期比對新舊原文，把先前漏掉的動作或組數補進 `training_data.json`（Step 2 的規則）。

## 注意事項

- `sync_journals.py` 只用 Python 標準庫
- 空行與段落一律依「有沒有文字」判斷，不能看 `p1`／`p2`／`p3` 這類 class：Apple 每篇匯出的 class 名稱不固定（2026-10-22 曾因此把整篇內容當空行丟掉）
- 清單（`<ol>`／`<ul>` 的 `<li>`）會轉成 `1. `／`- ` 開頭的行
- HTML 解析只抽取文字，多媒體會被忽略
- `.gitignore` 已排除 `.pending_updates.json`
