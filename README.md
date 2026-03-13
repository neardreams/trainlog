# trainlog

個人訓練進度追蹤儀表板，以 GitHub Pages 靜態部署。

## 功能
- 各肌群訓練進度卡片（含 sparkline 趨勢圖）
- 14 天時間軸，按肌群標色
- 點擊任一訓練日 → 展開範圍/排序/分組清單
- 動作歷程下鑽（drill-down）
- 日期比較（兩日訓練並排 + 增減指標）

## 更新流程

1. 編輯 `data/training_data.json` 或 `data/journals_raw.json`
2. 執行 `python3 generate_v6.py`（會產生新的 `index.html`）
3. `git add -A && git commit -m "update" && git push`

## Live

https://&lt;YOUR_USERNAME&gt;.github.io/trainlog/
