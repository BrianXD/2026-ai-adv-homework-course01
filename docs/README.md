# 花店電商後端

一個花卉電商平台的全端應用，後端提供 REST API，前端以 EJS 模板 SSR 渲染，支援訪客（session）與登入用戶雙模式購物車。

## 技術棧

| 層級 | 技術 |
|------|------|
| 框架 | Express 4.16 |
| 模板引擎 | EJS 5 |
| 資料庫 | SQLite（better-sqlite3 12） |
| 認證 | JWT（jsonwebtoken 9，HS256，7天效期） |
| 密碼雜湊 | bcrypt（10 rounds，測試環境 1 round） |
| ID 生成 | UUID v4 |
| CSS | TailwindCSS 4（CLI build） |
| 測試 | Vitest 2 + supertest 7 |
| API 文件 | swagger-jsdoc 6（`@openapi` JSDoc 註解） |

## 快速開始

```bash
# 1. 複製環境變數
cp .env.example .env
# 編輯 .env，至少設定 JWT_SECRET

# 2. 安裝依賴
npm install

# 3. 啟動（開發模式，分兩個終端）
node server.js
npx @tailwindcss/cli -i public/css/input.css -o public/css/output.css --watch

# 4. 一鍵生產啟動（先 build CSS 再啟動）
npm start

# 瀏覽器開啟
open http://localhost:3001
```

> 資料庫會在首次啟動時自動建立（`database.sqlite`），並植入管理員帳號與 8 筆花卉商品種子資料。

## 預設帳號

| 身份 | Email | 密碼 |
|------|-------|------|
| 管理員 | admin@hexschool.com | 12345678 |

## 常用指令

| 指令 | 說明 |
|------|------|
| `npm start` | 生產啟動（build CSS + 啟動伺服器） |
| `node server.js` | 直接啟動伺服器（不 build CSS） |
| `npm run dev:css` | TailwindCSS watch 模式 |
| `npm run css:build` | 一次性 minify 建置 CSS |
| `npm test` | 執行所有測試（循序） |
| `node generate-openapi.js` | 產生 OpenAPI JSON |

## 文件索引

| 文件 | 說明 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 目錄結構、啟動流程、API 路由總覽、資料庫 Schema |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 開發規範、命名規則、新增模組步驟、環境變數說明 |
| [FEATURES.md](./FEATURES.md) | 各功能行為描述、端點表格、錯誤碼 |
| [TESTING.md](./TESTING.md) | 測試架構、執行順序、撰寫新測試指南 |
| [CHANGELOG.md](./CHANGELOG.md) | 更新日誌 |
