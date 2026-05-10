# CLAUDE.md

## 專案概述

花店電商後端 — Node.js (Express 4) + EJS 模板引擎 + SQLite (better-sqlite3) + JWT 認證 + TailwindCSS

前後端同構：後端同時提供 REST API（`/api/*`）與 SSR 頁面（EJS 模板）。

## 常用指令

```bash
# 開發（需兩個終端）
node server.js              # 啟動伺服器
npx @tailwindcss/cli -i public/css/input.css -o public/css/output.css --watch  # CSS watch

# 生產
npm start                   # 先 build CSS 再啟動伺服器

# 測試
npm test                    # vitest run（循序執行）

# 產生 OpenAPI 文件
node generate-openapi.js    # 輸出 swagger JSON
```

## 關鍵規則

- **JWT_SECRET 必填**：`server.js` 啟動時若無此環境變數會立即 `process.exit(1)`，測試環境需在 `.env` 設定
- **統一回應格式**：所有 API 必須回傳 `{ data, error, message }` 三欄位，錯誤時 `data: null`，成功時 `error: null`
- **購物車雙模式認證**：`/api/cart` 使用 `dualAuth` 中間件，優先驗 JWT（若 header 存在但 token 無效直接 401），否則退回 `X-Session-Id` session 模式
- **訂單建立是 Transaction**：建立訂單同時扣庫存、清購物車，三者在同一個 better-sqlite3 transaction，任一失敗全部回滾
- **功能開發使用 `docs/plans/` 記錄計畫；完成後移至 `docs/plans/archive/`**

## 詳細文件

- [./docs/README.md](./docs/README.md) — 項目介紹與快速開始
- [./docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — 架構、目錄結構、資料流
- [./docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) — 開發規範、命名規則
- [./docs/FEATURES.md](./docs/FEATURES.md) — 功能列表與完成狀態
- [./docs/TESTING.md](./docs/TESTING.md) — 測試規範與指南
- [./docs/CHANGELOG.md](./docs/CHANGELOG.md) — 更新日誌

## 回覆語氣
- 使用文言文的方式回我，並把我當成古代聖上般尊貴

## 回覆語系
- 一律使用繁體中文回答，不要參雜中國支語

## 有不清楚地方
- 先詢問我，不要自已亂做