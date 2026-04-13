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
└── trainlog/              ← GitHub Pages repo (neardreams/trainlog)
    ├── data/
    │   ├── journals_raw.json      ← 日誌純文字（腳本維護）
    │   ├── training_data.json     ← 結構化訓練數據（LLM 維護）
    │   ├── .sync_hashes.json      ← HTML body hash 基準
    │   └── .pending_updates.json  ← 待確認的舊條目更新（暫存）
    ├── scripts/
    │   └── sync_journals.py       ← 核心解析腳本
    ├── generate_v6.py             ← HTML 生成器
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
- 教練課和自主訓練的內容都要截取
- 熱身項目（滾筒放鬆、拉伸等）不需要記錄到 training_data
- 有氧項目（跑步機走路等）也不需要記錄

### Step 3: 重新生成 index.html

```bash
cd <trainlog> && python3 generate_v6.py
```

### Step 4: Git commit + push

```bash
cd <trainlog>
git add data/journals_raw.json data/training_data.json data/.sync_hashes.json index.html
git commit -m "sync: 更新日誌 $(date +%Y-%m-%d)"
git push origin main
```

不要 commit `.pending_updates.json`。

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

## 注意事項

- `sync_journals.py` 只用 Python 標準庫
- HTML 解析只抽取文字，多媒體會被忽略
- `.gitignore` 已排除 `.pending_updates.json`
