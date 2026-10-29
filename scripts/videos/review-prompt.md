# 逐支檢查訓練影片（給 AI 檢查者的指示）

> 用法：`review_prepare.py` 產生 `local-media/training/_review/batches/batch-N.json` 之後，每個 batch 交給一個 AI（子代理）。
> 把下面的 `<BATCH>`、`<RESULT>` 換成該批的絕對路徑，例如 `…/_review/batches/batch-1.json`、`…/result-1.json`。
> 全部完成後跑 `review_page.py` 給使用者看，確認後再跑 `review_apply.py`。

---

你要逐支檢查一批健身訓練影片，判斷每支影片是什麼動作、對應訓練紀錄的第幾組。所有輸出文字用繁體中文（台灣用語）。

## 檔案
- 你的批次：`<BATCH>` —— 陣列，每個元素是一天：
  - `date`；
  - `clips`：依拍攝時間排序，每支有 `file`、`sheet`（預覽圖路徑）、`currentExerciseId`（目前分類）、`recordedAt`、`durationSec`、`gapFromPrevClipMin`（距上一支結束幾分鐘）、`orientation`，有時有 `dateUncertain`；
  - `trainingEntries`：當天訓練紀錄，`sets` 是 `[重量kg, 次數]` 的陣列，依組別順序；
  - `journal`：當天日誌原文，可能是 null。
- 動作庫：同資料夾的 `library.json`（id、name、group）。
- 每支影片的 `sheet` 是一張預覽圖：同一支影片平均抽 6 格，由左到右是時間先後。**每一張都要用 Read 工具打開看過**，不可以只憑分類或檔名推斷。

## 每支影片要判斷什麼
1. `exerciseId`，只能是下面其中一種：
   - `library.json` 裡的 id；
   - `"new:<中文動作名>"`：動作庫沒有這個動作；
   - `"non_training"`：不是訓練組，例如走動、聊天、整理器材、別人在練、生活片段、幾乎沒內容；
   - `"unclear"`：真的看不出來。
   `currentExerciseId` 是 `needs_review`（待確認）或 `non_training` 的影片也一樣要重新判斷。
2. `confidence`：`high`（清楚看得到）／`medium`（大概是）／`low`（猜測）。
3. `role`：`working`（正式組）／`warmup`（暖身，重量明顯較輕或空槓）／`partial`（只錄到一部分）／`retake`（重錄或測試，常見是 15 秒以下的短片）／`unknown`。
4. `side`：單側動作才填，`"左"` 或 `"右"`，以練習者身體的左右為準。
   - 分腿蹲、後腳抬高蹲：看前腳是哪一隻；單手划船：看拿啞鈴的是哪一手。
   - 看不出來就填 `"未知"`，不要猜。
   - 雙側動作填 `null`。
5. `visibleLoad`：看得到的重量線索，例如「每邊 15kg 黃色槓片＋小片」「啞鈴約 10kg」；看不到就填 `null`。
6. `set`：對應當天該動作 `trainingEntries` 裡 `sets` 的第幾組（從 1 開始）；單側動作左右兩支是同一組。
   - 只有合理確定時才填，否則填 `null`。
   - 影片可能跳過某幾組沒錄，也可能有暖身、重錄，**絕對不能直接假設第 N 支＝第 N 組**。
   - 判斷依據：
     - 拍攝順序；
     - `gapFromPrevClipMin`：當天一般休息約 2–4 分鐘，間隔明顯拉長（約 1.7 倍以上）代表中間可能有一組沒錄；
     - 各組重量不同時看槓片；
     - 影片數與組數的關係，例如單側 4 組配 8 支；
     - 檔名編號跳號（例如 IMG_4197 之後是 IMG_4199）；
     - 日誌裡的描述（例如「第三組錄漏了」「左腳先」）。
7. `setConfidence`：`high`／`medium`／`low`；`set` 為 `null` 時也填 `null`。
8. `label`：給 YouTube 章節用的短標籤，不含動作名稱。
   - 確定組數：「第 3 組 80kg×6」；重量是 null 時寫「第 3 組 ×10」；單側加「（左）」，例如「第 2 組（左）10kg×10」。重量與次數取自那一組的 `sets`；日誌寫明某一側重量不同時照日誌。
   - 暖身：「暖身」。
   - 其他（不確定、partial、retake）：「片段 N」，N 是這支在當天同一動作影片中的順序（從 1 開始）。
   - `non_training`／`unclear`：「—」。
9. `note`：一句簡短理由，說明你看到什麼、為什麼這樣判斷。和 `currentExerciseId` 不同時，要說清楚差在哪。

其他注意：
- 標了 `dateUncertain` 的影片，對照日誌看日期是否合理，寫進 `note`（例如內容其實是前一天日誌寫的動作）。
- 影片的動作和當天日誌、訓練紀錄對不起來時，在 `note` 寫出來。
- 每天如果有值得一提的情況（例如「4 組只錄 3 支，第 2、3 支間隔 8 分鐘，推測第 3 組沒錄」），寫進 `dayNotes`。

## 輸出
用 Write 工具寫入 `<RESULT>`（UTF-8），格式：
```json
{"clips":[{"date":"2026-02-10","file":"IMG_3603.MOV","exerciseId":"bulgarian_split","confidence":"high","role":"retake","side":"未知","visibleLoad":null,"set":null,"setConfidence":null,"label":"片段 1","note":"..."}],"dayNotes":[{"date":"2026-02-10","note":"..."}]}
```
- batch 裡的每一支影片都必須剛好出現一次，`file` 和 `date` 照抄。
- 寫完後自己讀回來確認：是合法 JSON，而且筆數等於 batch 裡的影片總數。

限制：不要修改或移動任何其他檔案（尤其是影片和專案資料）；只讀你的 batch 和 `library.json`。

最後回覆不超過 200 字：總支數、和目前分類不同的支數（逐支列出 檔名：原分類→新判斷）、低信心支數。
