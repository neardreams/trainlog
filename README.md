# trainlog

個人訓練進度追蹤儀表板。GitHub 只存放程式碼，網站部署在 Cloudflare（push 到 `main` 後自動建置部署）。

## 功能
- 各肌群訓練進度卡片（含 sparkline 趨勢圖）
- 14 天時間軸，按肌群標色
- 點擊任一訓練日 → 展開範圍/排序/分組清單
- 動作歷程下鑽（drill-down）
- 日期比較（兩日訓練並排 + 增減指標）

## 更新流程

1. 編輯 `data/training_data.json` 或 `data/journals_raw.json`
2. 執行 `pnpm validate:data` 確認資料格式正確
3. `git add` 資料檔後 commit、push，再執行下方的部署指令

## 部署

- 網址：https://trainlog.x-hu.com（Cloudflare Workers 自訂網域）
- 設定檔：`wrangler.jsonc`
- 部署：`pnpm build && npx wrangler deploy`
- 只公開 `apps/web/dist/`（網頁、`training_data.json`、`journals_raw.json`、授權清單），repo 其他檔案不會被公開
