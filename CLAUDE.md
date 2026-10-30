# CLAUDE.md — TrainLog

這份文件是給 AI（Claude）開發與維護本專案用的。這個專案**完全由 AI 開發與維護**，所以每一條規則都以「改完能自己驗證、不會悄悄壞掉」為目標。開始任何工作前先讀完。

---

## 1. 專案是什麼

個人重量訓練紀錄與分析工具。

- **資料來源**：使用者在 Apple 日誌（Apple Journal）寫訓練日記 → 匯出 HTML → Python 腳本同步成純文字 → AI 依語意整理成結構化資料（`data/training_data.json`）。
- **目前的前端**：`apps/web`（React），開頁時讀 `data/training_data.json`、`data/journals_raw.json`，以及可選的 `data/videos.json`（訓練影片的 YouTube 連結）。GitHub（repo：`neardreams/trainlog`）**只當程式碼倉庫**；正式網站部署在 **Cloudflare Workers**：https://trainlog.x-hu.com（`wrangler.jsonc`，自訂網域、不使用 workers.dev；`pnpm build && npx wrangler deploy`，帳號已用 `wrangler login` 登入）。只公開 `apps/web/dist/`（網頁、data/ 的 JSON（`training_data.json`、`journals_raw.json`、有的話 `videos.json`）、授權清單），**絕不能把整個 repo 當靜態目錄**。舊版 `generate_v6.py`／`index.html` 已停用（2026-10-21 切換），尚未移到 `legacy/`。
- **目標**：改寫成 React 網頁（現在），之後補 React Native App（Expo），兩者共用 TypeScript 的資料型別、計算邏輯與設計 token。

### 使用者與語言
- 介面一律使用**繁體中文（台灣用語）**，`lang="zh-Hant"`。
- 和使用者溝通也用繁體中文。
- 日期顯示習慣：`10/19`、`2026/10/19`、`2026 年 10 月 19 日`、`週一`／`星期一`。週一為一週的第一天。

---

## 2. 現況與目標架構

### 現況（可運作，部署中）
```
trainlog/
├── data/
│   ├── training_data.json     ← 結構化訓練資料（AI 依 SKILL.md 維護）
│   ├── journals_raw.json      ← 日誌原文（腳本維護，勿手動改）
│   └── .sync_hashes.json      ← 同步用的 HTML hash 基準
├── scripts/sync_journals.py   ← Apple 日誌 HTML → journals_raw.json（只用標準庫）
├── scripts/videos/            ← 訓練影片：檢查、合併、上傳準備、videos.json（流程見 SKILL.md「訓練影片」）
├── generate_v6.py             ← 舊版生成器（已停用）
├── index.html                 ← 舊版頁面（已停用，生成物，勿手改）
├── wrangler.jsonc             ← Cloudflare 部署設定
├── SKILL.md                   ← 日誌同步 skill：截取規則的權威來源
└── redesign/                  ← UI 重構的設計稿（未追蹤，僅供參考）
    └── v14/                   ← ★ 目前定案的視覺規格（見第 5 節）
```

### 目標（monorepo，pnpm workspaces）
```
trainlog/
├── apps/
│   ├── web/          ← React + Vite + TypeScript + Tailwind v4 + shadcn/ui
│   ├── mobile/       ← Expo（React Native）+ NativeWind（目前只是空架子）
│   └── (api/)        ← 預留：之後的後端（Cloudflare Workers + Hono），尚未建立
├── packages/
│   ├── core/         ← 領域模型、zod schema、adapter、所有計算邏輯（純函式）、DataSource 介面
│   ├── data-client/  ← 資料來源實作（StaticJsonSource）＋ Provider ＋ TanStack Query hooks
│   ├── (db/)         ← 預留：之後的 D1 資料表與 migration，尚未建立
│   └── tokens/       ← 設計 token 的唯一來源（JSON）→ CSS 變數／Tailwind v4 @theme／Tailwind v3 preset（NativeWind）
├── data/             ← 不變
├── scripts/          ← Python 同步腳本，不變；另加資料驗證步驟
└── legacy/           ← 搬移後的 generate_v6.py 與 index.html（新網頁上線前保留）
```

**遷移原則**
1. 新網頁已於 2026-10-21 取代舊版上線；`SKILL.md` 已改為驗證資料＋`pnpm build`＋部署。
2. `generate_v6.py`、`index.html` 之後移進 `legacy/`（尚未搬）。
3. `apps/mobile/` 目前只是空架子（驗證共用 core／tokens 可行），使用者明確要求前不要擴充 App 功能。
4. **分層規則**：畫面（apps）→ hooks（data-client）→ `DataSource` 介面（core）→ 實作。畫面不得直接讀 `data/*.json` 或使用原始 JSON 型別；新增資料需求先擴充領域模型與 `DataSource` 介面。日後的後端只需新增一個 `DataSource` 實作。

### 版本（2026-10 鎖定）
| 項目 | 版本 | 備註 |
|---|---|---|
| Node.js | 24 LTS | Windows 以 winget 安裝；未重開的 session 需在指令前把 `C:\Program Files\nodejs` 加進 PATH |
| pnpm | 12.14 | `packageManager` 已鎖定；共用版本用 `pnpm-workspace.yaml` 的 catalog |
| React | 19.3.0 | 由 Expo SDK 58 決定，全 workspace 統一 |
| Expo SDK | 58（RN 0.88） | |
| TypeScript | 6.0.x | 7.x 尚未被 typescript-eslint 支援，不要升級 |
| Tailwind | 網頁 v4.3、App v3 | NativeWind 穩定版（4.x）只支援 Tailwind v3；v5 正式版出來後再統一 |
| Vite／Vitest | 8／5 | |

### 授權規則
- 會打包進網頁／App 的套件只允許 MIT、MIT-0、ISC、Apache-2.0、BSD-2/3-Clause、0BSD、OFL-1.1、CC0-1.0、Unlicense。
- 開發工具的間接依賴有已審核例外清單（`tools/check-licenses.mjs` 的 `DEV_EXCEPTIONS`，例如 lightningcss＝MPL-2.0）。**新增例外前必須先問使用者。**
- `pnpm licenses:check` 必須通過；CI 也會檢查。

---

## 3. 指令

> 標示「預定」的指令在專案建立後才存在；建立時若有調整，請回來更新本節。

| 用途 | 指令 |
|---|---|
| 同步日誌（見 SKILL.md） | `python scripts/sync_journals.py --entries-dir "<Apple日誌條目>/Entries" --data-dir data` |
| 舊版頁面生成 | `python generate_v6.py` |
| v14 設計稿預覽 | 啟動 `.claude/launch.json` 的 `redesign`（`python -m http.server 5191`），開 http://localhost:5191/redesign/v14/mock.html（資料更新後先跑 `python redesign/v14/build_mock_data.py`） |
| 安裝相依 | `pnpm install` |
| 開發伺服器 | `pnpm dev`（http://localhost:5180） |
| 型別檢查 | `pnpm typecheck` |
| 單元測試 | `pnpm test` |
| 資料驗證 | `pnpm validate:data`（用 `packages/core` 的 zod schema 驗證 `data/*.json`） |
| 畫面截圖測試（預定） | `pnpm test:e2e`（Playwright） |
| 建置 | `pnpm build` → `apps/web/dist`（只複製 data/ 的 `training_data.json`、`journals_raw.json`，以及存在時的 `videos.json`） |
| 訓練影片（檢查、合併、上傳準備、影片清單） | `python scripts/videos/<步驟>.py`，流程見 SKILL.md「訓練影片」 |
| 程式檢查 | `pnpm lint`（ESLint＋Prettier） |
| 授權檢查 | `pnpm licenses:check` |
| 部署網站 | `pnpm build && npx wrangler deploy` |

Windows 環境：Python 指令前加 `PYTHONIOENCODING=utf-8`，否則中文輸出會亂碼。

---

## 4. 資料模型（`data/training_data.json`）

截取規則的權威來源是 `SKILL.md`。這裡只列前端需要的結構與語意。

```ts
type TrainingData = {
  meta: {
    group_order: string[]                 // 部位順序：腿部、背部、胸部、肩部、手臂、核心、髖部、有氧
    group_accent: Record<string, string>  // 舊版用的顏色，新前端不使用（改用第 5 節的部位色）
    exhaustion_style: Record<string, string> // 舊版用，新前端不使用
  }
  exercises: Exercise[]
}
type Exercise = {
  id: string            // 小寫英文＋底線，唯一
  name: string
  group: string         // 屬於 meta.group_order
  icon?: string         // emoji，新介面不顯示
  notes?: string[]      // 動作要點
  kind?: 'cardio'       // 有氧：用時間／距離取代重量與容量
  rep_unit?: '秒' | '米' // 次數欄改為秒數或米數
  zero_label?: string   // 重量為 0 時顯示：空重／自重／空槓
  history: HistoryEntry[] // 依日期由舊到新
}
type HistoryEntry = {
  date: string                      // YYYY-MM-DD（本地日期，不要轉 UTC）
  sets: [number | null, number | null][] // [重量kg, 次數]；重量 null = 未記錄或無重量
  sets_display?: string             // 預設格式無法表達時的覆寫文字，有值就直接顯示它
  feel?: string                     // 感受度
  exhaustion?: string               // 輕鬆／普通／吃力／力竭／力竭（左）／力竭（左腳）／—
  condition?: string                // 身心狀態，「正常」以外才值得強調
  cue?: string                      // 教練提醒、技術重點
  minutes?: number | null           // 有氧
  distance_km?: number              // 有氧
}
```
`journals_raw.json`：`{ "YYYY-MM-DD": "日誌原文" }`，原文第一行通常是 `# 日期`，顯示時要去掉。

`videos.json`（可選；沒有這個檔案時網站照常運作）：每個訓練日的影片合併成一支 YouTube 不公開影片，segments 是影片中的各段（也是 YouTube 說明欄的章節）。由 `scripts/videos/build_videos_json.py` 產生，不要手動編輯。
```ts
type Videos = {
  videos: {
    date: string          // YYYY-MM-DD，同一天只能有一支
    youtube_id: string    // 11 字元
    duration_sec: number
    canvas: string        // 畫面尺寸「寬x高」：'1080x1920' 直式、'1920x1080' 橫式（領域模型轉成 width／height，播放器依此用 9:16 或 16:9）
    title: string
    segments: {           // 依時間排序、不重疊、不超過影片長度
      exercise_id: string // 必須對得到當天這個動作的訓練紀錄
      start: number       // 秒
      end: number
      label: string       // 章節標籤，不含動作名稱：「第 3 組 80kg×6」「片段 5（左）」「暖身」
      set?: number        // 能確定是第幾組時才有，不能超過那筆紀錄的組數
      side?: '左' | '右'
    }[]
  }[]
}
```
網頁上的影片一律在網站內的播放器播放（`VideoPlayerDialog`，AppShell 只掛一個，任何地方用 `openVideo()` 開啟；內嵌 `https://www.youtube-nocookie.com/embed/<id>?start=<秒>…&enablejsapi=1&origin=<網站>`）。播放器透過 YouTube 播放器的訊息介面跳段：點段落在同一個播放器裡跳過去直接播（不重新載入，重新載入常被瀏覽器擋下自動播放）；瀏覽器不允許有聲音的自動播放時改成靜音播放並顯示「開啟聲音」。單一動作時可切換「這一天／所有 N 天」，看同一個動作在其他天的影片。影片入口一律是深色底＋主色圓形播放鍵（`PlayCircle`），點了直接播（沒有下拉選單）：
- 訓練紀錄頁標頭：「有影片 · N 段」標籤（`DayVideoTag`）＋「播放當天影片」（`DayVideoAction`；當天沒錄影時改成「前一支影片 MM/DD」，跳到那天）。
- 當天影片面板（`DayVideoPanel`，訓練整理／日期比較／原始日誌都在最上面）：大縮圖、依部位色分段的時間軸、每個動作的章節；沒錄影時列出這些動作在其他天的影片；日期範圍時另列「期間其他影片」。
- 每個動作的明細卡：名稱旁「影片 N 段」、右側縮圖（`EntryVideoTile`；當天沒拍到時改放其他天的影片）、「所有影片 N 天」；組數標記右上角有播放記號的組，點了從那一組開始播（`segmentsBySet`）。
- 日期比較：欄標題（當天影片）與每格（那天的這個動作）。依日期分組的標頭、總覽「最近訓練」每列（`DayVideoButton`）。
- 總覽「最近破紀錄」：從最重那一組開始播（`topSetSegment`）；「久未練動作」：所有影片。
- 動作庫：每列的「影片」欄（所有影片 N 天）、展開明細的「所有影片」與最近 5 次每列。
- 月曆、手機週條的日期格與熱度圖格子右上角標出有影片，提示也寫「有影片」。
- 上面的影片按鈕一律顯示（版面不因有沒有影片跳動）；沒有影片時是同位置、同大小的「沒有影片」樣式（`NoVideo`：虛線框、淡色、`VideoOff` 圖示或「—」，不能點，滑過去顯示原因）。

播放器另有「在 YouTube 開啟」（`https://youtu.be/<id>?t=<秒>`）。

### 計算定義（全部放在 `packages/core`，必須有單元測試）
這些定義沿用舊版 `generate_v6.py`，改動前要先問使用者。

| 名稱 | 定義 |
|---|---|
| 容量 `calcVolume(sets)` | Σ 重量×次數；**只要任一組重量或次數是 null 就回傳 null**；沒有組數回傳 null |
| 最高重量 `getMaxWeight(sets)` | 重量 > 0 的最大值；沒有則 null |
| 破紀錄（PR） | 某次的最高重量 **大於** 該動作先前所有紀錄的最高重量（需有先前紀錄）；有氧不計。器械輔助類目前也照「越高越好」判斷（已知限制） |
| 距今天數 | 以本地日期計算的整數天差 |
| 上次訓練色 | ≤3 天 成功色、≤7 天 警示色、其他 危險色 |
| 狀態篩選 | 近 7 天（≤7）、8–30 天、30 天以上 |
| 久未練動作 | 練過 ≥3 次，且距上次 >21 天 |
| 連續訓練週數 | 從本週往回數，每週（週一到週日）至少 1 個訓練日；本週還沒練就從上週開始數 |
| 本週比較 | 本週（週一到今天）vs 上週同期（上週一到上週的今天） |
| 訓練日 | `history` 中出現過的日期 |

排序選項（動作庫）：依部位分組、最近訓練優先、最久未練優先、最高重量、累計容量、訓練次數、重量進步幅度（最後一次最高重量 − 第一次）、名稱（`localeCompare('zh-TW')`）。

---

## 5. 設計系統（視覺規格的權威來源）

**`redesign/v14/mock.html`（v14 企業版＋活力）與 `redesign/v14/PLAN.md` 是使用者認可的視覺規格**（2026-10-30 定案並實作）。外觀、元件狀態、互動都以它為準；有疑問時打開設計稿比對（網站內的「設計規格」頁 `#/spec` 列出實際元件）。v14 以 v12 為底：版面骨架（深色殼層列＋淺色側邊導覽＋物件標頭＋面板＋資料表格＋狀態列）、密度都沿用 v12，只改顏色、數字字型、色塊面積和動態。

### 字型
- 英數：**Geist**；中文：**Noto Sans TC**；等寬：**Geist Mono**（以 `@fontsource-variable/*` 打包；CSS 字型名稱 `"Geist Variable"`、`"Noto Sans TC Variable"`、`"Geist Mono Variable"`）。
- 讀數（指標、屬性、組數、週讀數）用 **Barlow Condensed 斜體**（`@fontsource/barlow-condensed`，OFL-1.1；token `--disp`）。**讀數用窄體斜體，表格欄位用等寬字**（表格數字要直向對齊）。
- 所有數字使用 `font-variant-numeric: tabular-nums`。
- 字級：頁面標題 22/800、指標 42、屬性 23、組數 19（窄體斜體）、區塊標題 13.5/800、內文 13.5、表格 13、輔助說明 12/500。

### 顏色
- 主色方案 `volt`（螢光黃綠，預設）／`orange`／`blue`／`indigo`，各有淺色、深色一組：`--a`、`--a-hover`、`--a-fg`、`--a-text`、`--a-soft`、`--a-line`、熱度 `--h1..4`、長條 `--bar`／`--bar-hi`。螢光黃綠在淺色底上對比不足，長條改用墨色，主色只當重點（本週、滑過）。
- 墨色與底色：`--ink`（墨色實心：最重的組、選取的導覽）、`--shell`（頂部列）、`--canvas`、`--panel`、`--head`、`--th`、`--line`／`--line-2`、`--ctl`（控制項邊框）。
- 影片：`--vid`（深色底）、`--vid-2`（滑過）、`--vid-ol`（外框）；播放鍵用主色。
- 語意色 `green`／`amber`／`red`（12 階，淺深各一組，不是反轉）。
- token 定義在 `packages/tokens/src/tokens.json`，產生 CSS 變數（`dist/tokens.css`）與 Tailwind 設定。

### 規則
1. **元件只使用 token**，不要直接寫色碼（部位字塊的白字／深色字例外，見 PLAN.md 第 6 節）。
2. **每個互動元件都要有完整狀態**：預設、滑過、按下、focus-visible、停用；可選取的還要有選取狀態。按鈕滑過換底色並把邊框變墨色、按下下沉 1px；鍵盤焦點用 2px 主色外框；可點的列滑過時左側出現主色線；展開／選取列用主色淡底＋左側 3px 主色線。
3. **徽章一律三層**：淺底＋同色系邊框＋深色字。增減用斜切實心標籤（平行四邊形）加三角形。
4. **語意色只用在狀態**（成功／警示／危險），而且永遠搭配文字，不能只靠顏色傳達意思。
5. **部位色固定**（不隨排序或篩選改變），依 `meta.group_order` 對應：腿部 g0 藍、背部 g2 青綠、胸部 g1 橘、肩部 g6 紫、手臂 g4 粉、核心 g3 黃、髖部 g5 綠、有氧 g7 紅（淺深各一組，`--g0..g7`）。部位一律用**部位字塊**（色塊＋「腿」「背」…；背部、手臂、核心用深色字）。
6. **直角**：圓角 token 全部是 0（按鈕、面板、對話框、徽章都一樣）。列高：標準 38px、緊湊 32px。
7. 圖表：單一數列不加圖例；長條直角；平均線虛線並附斜角標籤；滑過一律有提示框（`data-tip`，全站共用一個提示框）。不要做雙 Y 軸圖。
8. 動態：換頁時長條長出、比例條展開、指標數字跑表（只播一次）；系統設「減少動態」時全部關閉。
9. 寬度 ≥1280px 用側欄＋滿版版面；1024–1279 收窄；<1024 側欄改抽屜；≤760 表格改成一筆一張卡片。**任何寬度都不能出現整頁橫向捲動。**

### 元件來源
- 樣式在 `apps/web/src/styles/v14.css`（v14 的類名，與設計稿一致）；`components.css`、`extras.css` 只剩還沒搬的舊元件（指令面板、通知、歷史側欄、影片播放器等）。
- 共用元件：`ObjectHeader`（麵包屑、圖示塊、標題、屬性列、分頁）、`Panel`、`PartTile`、`Sets`（組數標記）、`VideoLinks`（所有影片入口）、`RecordPanel`（動作紀錄面板）。
- 自己做的：殼層列、側欄版型、月曆與手機週條、指令面板（Ctrl K）、全年熱度圖、指標磚、每週訓練量、迷你趨勢線、趨勢圖。

---

## 6. 功能清單（新網頁必須具備，對照 v14 設計稿）

- **框架**：可收合側欄（工作區導覽、整月月曆、部位導覽、同步狀態）、麵包屑、全域搜尋（Ctrl K 或 `/`，可搜動作、部位、日期如 `10/19`、`1019`，也能執行指令）、深淺色切換、密度切換。側欄收合、深淺色、密度記在 localStorage（讀寫都要 try/catch）。
- **總覽**：統計期間（近 7／30／90 天）；指標卡 5 張（本週訓練、訓練日、總容量、破紀錄、連續週數，附增減與 12 週小圖）；每週訓練量（容量／天數／組數，26 週）；部位分布；全年熱度圖；最近破紀錄；最近訓練；久未練動作；力竭分布。各區塊可點擊跳轉。
- **動作庫**：標頭屬性列（動作數、7 天內／8–30 天／超過 30 天、有影片）；搜尋、部位多選、狀態篩選、篩選標籤、8 種排序（含點表頭排序）、依部位分組可收合、固定表頭、每列影片欄、展開明細（分頁：概覽／歷程／動作要點；概覽是欄位格＋趨勢圖＋動作要點＋最近 5 次）、展開全部／收合全部、匯出 CSV（UTF-8 BOM）、底部筆數統計。
- **訓練紀錄**：上一個／下一個訓練日、跳到日期、今天；範圍（當天、±3、±7、±14、±30 天）；分組（依動作／日期／部位）與排序；分頁（訓練整理／日期比較／原始日誌）；當天影片面板；每個動作一張明細卡（組數、感受、力竭、身心狀態、動作提示、影片縮圖、破紀錄）；日期比較是多天並排的矩陣（當天＝前 3 個訓練日＋這天＋後 1 個；範圍＝範圍內的訓練日）；點動作下鑽看全歷程並標出來源日期、可返回；標頭屬性列（動作、組數、容量、部位分布、力竭分布、身心狀態）；≥1600 寬右側當日日誌。
- **網址參數**：`?date=YYYY-MM-DD`、`?exercise=<id>`、`?view=exercise|day`；預設進總覽。

---

## 7. AI 開發規則

### 每次改動後必須自己驗證
1. `pnpm typecheck` 與 `pnpm test` 通過。
2. 改到計算邏輯：先補或改單元測試，再改程式。
3. 改到畫面：開瀏覽器實際看過 **1440 寬、1280 寬、手機（375）** 三種寬度，以及**淺色與深色**；確認主控台沒有錯誤、沒有橫向捲動。
4. 改到資料格式：同步更新 zod schema、`SKILL.md`、本文件第 4 節，並跑 `pnpm validate:data`。
5. 回報時照實說：哪些驗證過、哪些沒有（例如「沒有實際下載 CSV」）。

### 資料
- **不要手動編輯 `data/journals_raw.json`、`data/.sync_hashes.json`、`data/videos.json`、`index.html`**；它們是腳本產物。
- `local-media/`（訓練影片原檔、合併影片、上傳紀錄）只在本機，已列在 `.git/info/exclude`、ESLint 與 Prettier 的忽略清單；不要 commit 或部署其中任何檔案。
- `data/training_data.json` 只透過 `SKILL.md` 的流程更新；只追加、不覆蓋既有紀錄。
- 不要 commit `data/.pending_updates.json`。
- 衍生數據（容量、PR、統計）在前端由 `packages/core` 計算，不要寫回 JSON。

### 程式
- TypeScript 開 `strict`；不要用 `any`，資料進來先經 zod 驗證。
- 計算邏輯全部是 `packages/core` 裡的純函式，畫面元件不自己算。
- 日期一律用本地日期字串 `YYYY-MM-DD` 處理，避免 `new Date('YYYY-MM-DD')` 被當成 UTC 而差一天。
- 顏色、間距、圓角、陰影只能用 token；新增 token 先改 `packages/tokens`。
- 元件樣式沿用 v14 設計稿的類名（`apps/web/src/styles/v14.css`）；舊檔（`components.css`、`extras.css`）有同名類別時要刪掉舊規則，不要靠覆寫。Tailwind 工具類**一律加 `tw:` 前綴**（例如 `tw:mr-2`），因為 v14 有 `.grid`、`.fixed`、`.hidden` 等類名，不加前綴會被 Tailwind 的同名工具類覆蓋。
- 使用者看得到的文字都用繁體中文；不要出現開發用語（例如「JSON 外部資料」「drill-down」）。

### 流程
- 使用者沒要求就不要 commit、push 或建立分支；要 commit 時依系統提示附上 attribution。
- 影響外觀或行為的改動（例如改計算定義、改預設頁面、改導覽名稱）先問使用者。
- 遇到 v14 設計稿沒有定義的介面，先參考 v14 的規則做，並在回報中說明做了什麼決定。

---

## 8. 已知決定與歷史

- 舊版（v6）的兩個 bug 已在 v9 設計中修正，新網頁要沿用修正後的行為：
  1. 開頁時時間軸捲到今天會帶動整頁往下捲 → 只橫向捲動時間軸。
  2. 在「日期比較」點動作沒有反應 → 切到「訓練整理」並顯示該動作全歷程。
- 「動作一覽」改名「動作庫」、「日期記錄」改名「訓練紀錄」（使用者可能要求改回）。
- 技術選型：純 AI 開發維護，因此選 React＋RN（TypeScript 單一語言、AI 最熟、shadcn 程式碼在專案內可直接改）。曾評估 Angular＋Optimus UI（PrimeNG v21 社群分支，太新、AI 不熟）、ng-zorro（Ant Design 外觀難改）、Taiga UI（使用者不喜歡 Material 風格）、Flutter（與網頁無法共用邏輯）。
- 設計演進：v1–v13 的設計稿都在 `redesign/`。v9 是第一個上線的版本；v10–v13 是重構的試作（v13 因密度太低被否決）；**現在的定案規格是 v14**（2026-10-30 實作），其他版本不要參考。
