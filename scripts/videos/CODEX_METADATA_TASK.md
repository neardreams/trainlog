# 任務：替已上傳的訓練影片補上 hashtag、錄製日期、類別、播放清單（YouTube「Marco's workout」頻道）

> 這份由 `scripts/videos/metadata_prepare.py` 複製到 `local-media/training/_render/upload/`。上傳者（Codex）在那個資料夾執行。
> 這一輪**不上傳任何檔案**，只在 YouTube Studio 修改已經上傳的影片和建立播放清單。
> 用 **computer use 的電腦畫面操作**（截圖、點擊、輸入、按鍵）操作使用者已開啟的 Google Chrome 視窗。**不要用 Chrome 擴充功能的瀏覽器工具**：從命令列啟動的 Codex 無法使用它（「The browser access host is unavailable」）。**不要打開觀看頁**（youtube.com/watch、youtu.be）：computer use 在 Windows 上判斷不出那種分頁的網址時會直接結束工作；只在 studio.youtube.com 裡操作。

所有內容都已經準備好。你只負責照清單設定，不要自己改內容。

## 檔案（和這份文件在同一個資料夾）
- `playlists.json`：要有的播放清單，依建立順序。每個有：
  - `key`
  - `title`
  - `description`
  - `visibility`：一律是 `unlisted`
- `metadata.json`：要設定的影片，依日期排序。每支有：
  - `date`
  - `videoId`
  - `studioUrl`：Studio 的編輯頁
  - `title`：不用改，用來核對是不是同一支
  - `description`：新的完整說明欄，最後一行是 hashtag
  - `recordingDate`：錄製日期 YYYY-MM-DD
  - `category`：類別，「運動」
  - `playlists`：這支要加入的播放清單標題
  - `metaHash`
- `playlists-results.json`、`metadata-results.json`：進度檔，由你建立並維護，請用 **UTF-8（不要 BOM）** 寫入。兩個檔都是**扁平物件的陣列**（格式見下方）；用 Node 的 `JSON.stringify` 寫，不要用 PowerShell 的 `ConvertTo-Json`（它會包成 `{"value": …, "Count": …}`，腳本讀不了）。

## 步驟
1. 打開 https://studio.youtube.com，確認右上角的頻道是 **Marco's workout**；不是的話，用「切換帳戶」切過去。確認之前什麼都不要改。
2. **播放清單**：依 `playlists.json` 的順序，頻道上還沒有同名播放清單的就建立。
   - 標題、說明照填；瀏覽權限選「**不公開**」。
   - 已經有同名的就沿用，不要重複建立。
   - 每個播放清單的 ID（網址裡 `list=` 後面那段）寫進 `playlists-results.json`：
     ```json
     {"key": "all", "title": "全部訓練", "playlistId": "PL...", "url": "https://www.youtube.com/playlist?list=PL..."}
     ```
3. **逐支影片**：依 `metadata.json` 的順序，`metadata-results.json` 裡已經有相同 `videoId` 而且 `metaHash` 相同的就跳過。其他的：
   1. 打開 `studioUrl`，確認標題和 `title` 一樣。不一樣就跳過這支，最後回報。
   2. **說明**：整段換成 `description`，保留所有換行，不要增刪任何字。
   3. **播放清單**：勾選 `playlists` 裡的每一個，其他的不要動。
   4. 「顯示更多」→ **錄製日期**：填 `recordingDate`；**類別**：選「運動」。
   5. 標題、目標觀眾、瀏覽權限、縮圖等其他設定都不要動。按「儲存」。
   6. **重新整理這支影片的編輯頁**，確認說明欄的最後一行是 `description` 的 hashtag 那一行、類別是「運動」、錄製日期正確、播放清單都有勾到。任何一項不對就重做這支，不要記錄。（曾經發生過按了儲存卻沒有存進去的情況。）
   7. 確認存好後，在 `metadata-results.json` 加一筆（同一個 `videoId` 已經有的就取代）：
      ```json
      {"date": "2026-02-04", "videoId": "...", "metaHash": "...", "savedAt": "<時間>"}
      ```
   8. 依日期順序處理，播放清單裡的影片就會依訓練日排列。
4. **播放清單排序**：全部做完後，打開每個播放清單，確認影片依日期由舊到新排列。不是的話，用播放清單的排序功能改成「新增日期（最舊）」，或手動調整。

## 停止條件
- 同一個步驟連續失敗 3 次：停下來回報，不要一直重試。
- 遇到需要輸入密碼或登入的畫面就停下來回報。**不要輸入任何密碼**。

## 限制
- 不要刪除任何影片或播放清單，不要改頻道設定，也不要改影片的標題、瀏覽權限、目標觀眾。
- 本機只能讀這個資料夾的 `playlists.json`、`metadata.json`，只能寫 `playlists-results.json`、`metadata-results.json` 和 `codex-progress.log`（可選）。
- 不要動 TrainLog 專案的其他檔案。

## 最後回報（繁體中文）
- 建立了哪些播放清單（沿用了哪些）；
- 設定了幾支影片，有沒有跳過或失敗的；
- 播放清單的排序是否正確。
