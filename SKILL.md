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
# 有更新影片清單時也加上 data/videos.json（見「訓練影片」）
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

## 訓練影片（data/videos.json）

訓練影片的原檔、合併影片和上傳紀錄都放在 `local-media/training/`。這個資料夾只在本機：已列在 `.git/info/exclude`，不 commit 也不部署。處理腳本在 `scripts/videos/`（Python 標準庫＋ffmpeg；有 NVIDIA 顯示卡時用 NVENC）。

```
local-media/training/
├── <YYYY-MM-DD>/<動作名稱>/IMG_xxxx.MOV   ← 依日期、動作分類好的原檔（另有「待確認」「非訓練片段」）
├── _catalog/
│   ├── probe.json                          ← 每支原檔的格式（probe.py）
│   ├── review.json                         ← 逐支檢查結果：動作、第幾組、左右、章節標籤（review_apply.py）
│   ├── moves.json                          ← 改判時搬檔的紀錄
│   └── classification-decisions.json       ← 每支原檔的分類
├── _review/                                ← 預覽圖、檢查批次、本機檢查頁（不公開）
└── _render/
    ├── <YYYY-MM-DD>.mp4 / .json            ← 每天合併成一支（1080p、30fps、SDR）＋章節與各段時間
    └── upload/
        ├── excerpts.json                   ← 每天每個動作的日誌原文
        ├── manifest.json、<日期>.txt        ← 每支的 YouTube 標題、說明欄（章節＋紀錄＋日誌原文）
        ├── CODEX_TASK.md                   ← 給上傳者（Codex）的任務說明
        └── results.json                    ← 已上傳的影片 ID（上傳者寫入）
```

### 新影片進來時

1. 把影片依日期、動作分類到 `local-media/training/<日期>/<動作名稱>/`，不確定的放「待確認」。
2. 量格式：`python scripts/videos/probe.py`
3. 逐支檢查：
   1. `python scripts/videos/review_prepare.py`：替還沒檢查的日子產生預覽圖和 `_review/batches/batch-N.json`。
   2. 每個 batch 交給一個 AI 子代理，指示用 `scripts/videos/review-prompt.md`，輸出 `result-N.json`。檢查要判斷動作、第幾組、左右邊；影片不一定每組都錄，**不能假設第 N 支＝第 N 組**，不確定的標成「片段 N」。
   3. `python scripts/videos/review_page.py` 產生 `_review/index.html`，用本機伺服器開給使用者看（只看標成「動作不同」「組數不確定」的）。使用者的修正要改進對應的 `result-N.json`。
   4. `python scripts/videos/review_apply.py --dry-run` 先看要搬哪些檔，確認後去掉 `--dry-run` 執行。
   5. 日期不確定的原檔（不是 iPhone 相機寫的拍攝時間，例如別人傳來的檔案）不會合併。確認日期後，搬到正確日期的資料夾、在 `review.json` 該筆改日期並加 `"dateConfirmed": true`，再跑一次 `probe.py`。
4. 合併：`python scripts/videos/render.py --dry-run` 看每天的章節，沒問題就去掉 `--dry-run`；完成後跑 `python scripts/videos/verify_render.py`。章節標籤改了要重做時加 `--dates <日期> --redo`（分段檔沿用，幾秒就好）。
5. 準備上傳：
   1. `python scripts/videos/upload_prepare.py --excerpt-input`，把 `excerpt-input.json` 交給 AI，指示用 `scripts/videos/excerpt-prompt.md`；
   2. `python scripts/videos/upload_prepare.py --add-excerpts <AI 的輸出>`：只收逐行和日誌一致的原文；
   3. `python scripts/videos/upload_prepare.py` 產生 `manifest.json`、每天的 `.txt`、`playlists.json` 和 `CODEX_TASK.md`。說明欄要先給使用者看過再上傳。
      - 說明欄最後一行是 hashtag：每個動作各一個中文和英文（對照表在 `scripts/videos/hashtags.json`，新動作要補上），再加 `#重訓`。使用者想點 hashtag 參考別人的影片。
      - 每支都會設定錄製日期（訓練日）、類別「運動」，並加入播放清單：全部訓練、每個月，以及錄過 3 天以上的動作各一個、教練課。播放清單一律不公開。
6. 上傳（使用者交給 Codex）：在 `_render/upload/` 執行
   ```bash
   codex exec -m gpt-6.1-terra -c 'model_reasoning_effort="xhigh"' -c 'service_tier="fast"' --skip-git-repo-check - < CODEX_TASK.md
   ```
   Codex 依 `results.json` 續傳，已傳的會跳過。上傳時會同時設定播放清單、錄製日期和類別。
   - **已上傳的影片要改附加資料時**（例如 hashtag 表改了、某個動作滿 3 天而有了新的播放清單）：先跑 `upload_prepare.py`，再跑 `python scripts/videos/metadata_prepare.py`。它會列出附加資料和 `metadata-results.json` 紀錄不同的影片，寫進 `metadata.json`；接著讓 Codex 照 `CODEX_METADATA_TASK.md` 在 Studio 逐支修改，這一輪不用上傳檔案：
     ```bash
     codex exec -m gpt-6.1-terra -c 'model_reasoning_effort="xhigh"' -c 'service_tier="fast"' --skip-git-repo-check - < CODEX_METADATA_TASK.md
     ```
   - Codex 用 computer use 直接操作使用者的 Chrome 視窗（截圖、點擊、輸入），選檔時在 Windows「開啟」對話框輸入完整路徑。上傳期間它會佔用滑鼠和鍵盤。從 Codex 26.1027（2026-10-30）起，命令列啟動的 Codex 不能用 Chrome 擴充功能的瀏覽器工具（「The browser access host is unavailable」），所以不要叫它用那個工具。Claude in Chrome 一次只能交給網頁 10 MB 的檔案，沒辦法上傳這些影片。
7. 產生影片清單並驗證：
   ```bash
   python scripts/videos/build_videos_json.py
   pnpm validate:data
   ```
   驗證會檢查：每一段都對得到當天那個動作的訓練紀錄、組號不超過組數、時間不重疊。每支影片也要有 `canvas`（畫面尺寸，取自 `_render/<日期>.json`），網站的播放器用它決定直式或橫式。
8. 照 Step 4、Step 5 commit（含 `data/videos.json`）並部署。

### 注意
- 直式而且 3 分鐘以內的影片會被 YouTube 當成 Shorts，手機上不顯示章節、也不能跳到指定時間；`render.py` 會把這種日子改成橫式輸出。
- 用未經 Google 稽核的 API 上傳，影片會被永久鎖成「私人」，所以上傳要透過 YouTube Studio 網頁。
- YouTube 只靠說明欄的時間戳記產生章節（第一個從 0:00 開始、每段至少 10 秒）。「Marco's workout」頻道已在 2026-10-29 啟用進階功能，章節會在影片處理完後出現，每日上傳上限也已提高。
- `results.json` 可能帶 UTF-8 BOM（PowerShell 寫的）；腳本都用 `utf-8-sig` 讀。

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
