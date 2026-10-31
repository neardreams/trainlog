# 任務：把訓練影片上傳到 YouTube「Marco's workout」頻道（不公開）

> 這份由 `scripts/videos/upload_prepare.py` 複製到 `local-media/training/_render/upload/`。上傳者（Codex）在那個資料夾執行。

影片、標題、說明欄都已經準備好。你只負責上傳，並照清單填寫，不要自己改內容。

## 檔案（和這份文件在同一個資料夾）
- `manifest.json`：陣列，依日期排序。每筆有：
  - `date`
  - `file`：影片的絕對路徑，1080p H.264
  - `title`
  - `description`：開頭是 YouTube 章節時間戳記，接著是每個動作的紀錄和日誌原文，最後一行是 hashtag
  - `visibility`：一律是 `unlisted`
  - `recordingDate`：錄製日期 YYYY-MM-DD
  - `category`：類別，「運動」
  - `playlists`：要加入的播放清單標題
  - `metaHash`
- `playlists.json`：頻道上應該有的播放清單（`title`、`description`、`visibility` 一律是 `unlisted`）。
- `results.json`、`metadata-results.json`、`playlists-results.json`：進度檔，由你建立並維護，說明見下方。請用 **UTF-8（不要 BOM）** 寫入。

## 怎麼上傳
- 使用者的 Chrome 已經登入 YouTube（帳號 @neardreams）。
- 用 **computer use 的電腦畫面操作**（截圖、點擊、輸入、按鍵）操作使用者已開啟的 Google Chrome 視窗，在裡面開 https://studio.youtube.com。**不要用 Chrome 擴充功能的瀏覽器工具**（computer-use 介面裡的 browser／chrome 後端）：從命令列啟動的 Codex 無法使用它（會回報「The browser access host is unavailable」）。
- 如果 computer use 完全無法截圖 Chrome 視窗，立刻停止，回報錯誤訊息原文。
- 按「選取檔案」後會跳出 Windows 的「開啟」對話框。它是另一個頂層視窗，**對話框裡的任何東西都不能用 `sky.click` 點**：不論座標或 `element_index`，都會被擋成「point … is over chrome.exe "", not target window …」。照下面只用鍵盤和 `set_value`：
  1. 重新取 **Studio 那個 Chrome 視窗**的狀態：`sky.get_window_state({window: targetWindow, include_text: true})`。對話框的欄位會出現在這個視窗的 `accessibility.tree` 裡（`dialog Open`、`edit … File name`）。`sky.list_windows()` 不一定列得出對話框，列不出來也不用停。對話框已經開著（上次留下的）也一樣照做。
  2. 用 `sky.set_value({window: state.window, element_index: <「File name」那個 edit 的 index>, value: '"' + file + '"'})` 把含雙引號的完整路徑填進檔案名稱欄。set_value 失敗時改用鍵盤：`sky.press_key({window: state.window, key: "Alt+n"})` 讓焦點到檔案名稱欄，取狀態確認 `focused_element` 是 File name 的 edit，再 `sky.type_text(...)` 輸入路徑。
  3. 按 `sky.press_key({window: state.window, key: "Alt+o"})`（等於按「開啟」）。不要按 Return：焦點可能在對話框的搜尋框，Return 會變成搜尋。
  4. 取 Studio 視窗的新狀態，確認對話框已關、開始上傳。
- **不要用 YouTube Data API 上傳**：未經 Google 稽核的 API 專案上傳的影片會被永久鎖成「私人」。
- 遇到需要輸入密碼或登入的畫面就停下來回報。**不要輸入任何密碼**，也不要建立新的瀏覽器設定檔。

## 步驟
1. 打開 YouTube Studio，確認右上角目前的頻道。預設是個人頻道「Yuwei Hu」，要先用「切換帳戶」切到 **Marco's workout**。在 Studio 確認頻道名稱之前，**一支都不要上傳**。
2. 先讀 `results.json`，已經有紀錄的 `date` 跳過。
3. 依 `manifest.json` 的順序，每一支影片：
   1. 建立 → 上傳影片，按「選取檔案」，在 Windows 的「開啟」對話框的檔案名稱欄輸入 `file` 的完整路徑（含雙引號），按 Enter。可以一次選多支（檔案名稱欄寫成 `"路徑1" "路徑2"`）（Studio 一次最多 15 支），但每支的細節都要逐支設定，不能留在「草稿」。
   2. **標題**：完全照 `title` 填，先清掉 YouTube 預設的檔名標題。
   3. **說明**：完全照 `description` 填，保留所有換行，不要增刪任何字。
   4. **播放清單**：勾選 `playlists` 裡的每一個。頻道上還沒有的，照 `playlists.json` 的標題、說明建立，瀏覽權限「不公開」；新建的播放清單 ID（網址 `list=` 後面那段）寫進 `playlists-results.json`：`{"key": "...", "title": "...", "playlistId": "PL...", "url": "..."}`。
   5. **目標觀眾**：選「否，這不是為兒童打造的內容」。
   6. 「顯示更多」→ **錄製日期**：填 `recordingDate`；**類別**：選「運動」。
   7. 其他欄位（標記、影片元素等）都不要動。
   8. **瀏覽權限**：選「不公開」（Unlisted），然後按「儲存」。
   9. 確認都存好之後，在 `results.json` 加一筆：
      ```json
      {"date": "2026-02-04", "file": "...", "videoId": "...", "url": "https://youtu.be/...", "visibility": "unlisted", "savedAt": "<時間>"}
      ```
      並在 `metadata-results.json` 加一筆：`{"date": "...", "videoId": "...", "metaHash": "<manifest 裡的 metaHash>", "savedAt": "<時間>"}`。
4. 這次執行的第一支傳完，在 Studio 的「內容」清單確認標題正確、瀏覽權限是「不公開」，有任何不對就先修正再繼續。**不要打開觀看頁**（youtube.com/watch、youtu.be）：在 Windows 上 computer use 判斷不出那種分頁的網址時，會直接結束這次工作。章節要等 YouTube 處理完才會出現，不用等。

## 停止條件
- 出現「已達每日上傳上限」之類的訊息：把已完成的寫進 `results.json`，回報停在哪一天。
- 同一個步驟連續失敗 3 次：停下來回報，不要一直重試。

## 限制
- 只能新增影片，不要刪除或修改頻道上已經存在的任何影片，也不要改頻道設定。
- 本機只能讀 `manifest.json`、`playlists.json` 和清單裡的影片，只能寫 `results.json`、`metadata-results.json`、`playlists-results.json` 和 `codex-progress.log`（可選）。
- 不要動 TrainLog 專案的其他檔案。

## 最後回報（繁體中文）
- 這次上傳了幾支、最後一支是哪一天；
- 是否停在每日上限，或遇到其他問題；
- 第一支的驗證結果。
