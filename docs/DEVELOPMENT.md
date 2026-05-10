# DEVELOPMENT.md

## 命名規則對照表

| 情境 | 規則 | 範例 |
|------|------|------|
| 路由檔案 | camelCase + 功能前綴 | `authRoutes.js`、`adminProductRoutes.js` |
| Middleware 檔案 | camelCase + Middleware 後綴 | `authMiddleware.js`、`sessionMiddleware.js` |
| 變數 / 函式 | camelCase | `getAdminToken`、`registerUser`、`dualAuth` |
| 資料庫欄位 | snake_case | `user_id`、`created_at`、`order_no`、`image_url` |
| API Request body | camelCase | `productId`、`recipientName`、`recipientEmail` |
| API Response body | snake_case（與 DB 欄位一致） | `product_id`、`total_amount`、`order_no` |
| 錯誤代碼（`error` 欄位） | SCREAMING_SNAKE_CASE | `VALIDATION_ERROR`、`STOCK_INSUFFICIENT` |
| 頁面 EJS 檔案 | kebab-case | `product-detail.ejs`、`order-detail.ejs` |
| 前端 JS 頁面檔案 | kebab-case | `product-detail.js`、`admin-orders.js` |
| 計畫文件 | `YYYY-MM-DD-<feature-name>.md` | `2026-05-10-cart-merge.md` |

## 模組系統

本專案後端使用 **CommonJS**（`require` / `module.exports`），前端 JS 使用全域變數（非 ESM）。

唯一例外：`vitest.config.js` 使用 ESM（`import { defineConfig } from 'vitest/config'`）。

## 新增 API 端點的步驟

1. **確認路由檔案**：找對應的 `src/routes/` 檔案，或新增新檔案
2. **撰寫 JSDoc `@openapi` 註解**：緊接在 `router.METHOD` 之前，格式參考既有端點
3. **實作業務邏輯**：
   - 驗證 request 參數（必填欄位、型別、範圍）
   - 操作 `db`（從 `../database` 引入）
   - 回傳統一格式 `{ data, error, message }`
4. **若新增路由檔案**：在 `app.js` 掛載 `app.use('/api/...', require('./src/routes/新檔案'))`
5. **撰寫測試**：在 `tests/` 新增對應測試檔，加入 `vitest.config.js` 的 `sequence.files` 陣列

## 新增 Middleware 的步驟

1. 在 `src/middleware/` 建立 `xxxMiddleware.js`
2. 函式簽章：`function xxxMiddleware(req, res, next)`
3. 正常繼續：呼叫 `next()`
4. 攔截：回傳統一錯誤格式（不呼叫 `next()`）
5. 在路由檔案頂層或 `app.js` 掛載

## 新增資料庫表格的步驟

1. 在 `src/database.js` 的 `initializeDatabase()` 函式中，`db.exec(...)` SQL 加入 `CREATE TABLE IF NOT EXISTS ...`
2. 若需種子資料，仿照 `seedAdminUser()` / `seedProducts()` 模式，先查是否已存在再插入（idempotent）
3. 更新 `docs/ARCHITECTURE.md` 的 Schema 表格

## 環境變數表

| 變數 | 用途 | 必要 | 預設值 |
|------|------|------|--------|
| `JWT_SECRET` | JWT 簽名金鑰 | **必填**（未設定時 server.js 拒絕啟動） | 無 |
| `PORT` | 伺服器監聽埠 | 否 | `3001` |
| `FRONTEND_URL` | CORS 允許的 origin | 否 | `http://localhost:3001` |
| `ADMIN_EMAIL` | 種子管理員帳號 email | 否 | `admin@hexschool.com` |
| `ADMIN_PASSWORD` | 種子管理員密碼 | 否 | `12345678` |
| `NODE_ENV` | 環境識別符 | 否 | 未設定 |
| `ECPAY_MERCHANT_ID` | 綠界特店代號 | 否（金流功能未實作） | `3002607` |
| `ECPAY_HASH_KEY` | 綠界 Hash Key | 否 | `pwFHCqoQZGmho4w6` |
| `ECPAY_HASH_IV` | 綠界 Hash IV | 否 | `EkRm7iFT261dpevs` |
| `ECPAY_ENV` | 綠界環境（staging/production） | 否 | `staging` |

> `NODE_ENV=test` 時，bcrypt salt rounds 降為 1（加速測試）。金流相關環境變數目前僅在 `.env.example` 預留，尚無對應實作。

## JSDoc `@openapi` 格式規範

所有 API 端點必須在 `router.METHOD` 前撰寫 OpenAPI 3.0 JSDoc 註解，供 `generate-openapi.js` 掃描：

```js
/**
 * @openapi
 * /api/your-path:
 *   post:
 *     summary: 一行摘要
 *     tags: [TagName]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [field1]
 *             properties:
 *               field1:
 *                 type: string
 *     responses:
 *       201:
 *         description: 成功說明
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                 error:
 *                   type: string
 *                   nullable: true
 *                 message:
 *                   type: string
 *       400:
 *         description: 失敗說明
 */
router.post('/your-path', middleware, (req, res) => { ... });
```

tags 命名規則：`Auth`、`Products`、`Cart`、`Orders`、`Admin Products`、`Admin Orders`

## 計畫歸檔流程

1. **計畫命名格式**：`YYYY-MM-DD-<feature-name>.md`（例：`2026-05-15-payment-integration.md`）
2. **計畫目錄**：`docs/plans/`
3. **計畫文件結構**：

```markdown
# 功能名稱

## User Story
身為 [角色]，我希望 [行為]，以便 [目的]

## Spec
- 端點設計
- 資料結構
- 驗證規則
- 業務邏輯

## Tasks
- [ ] Task 1
- [ ] Task 2
- [x] Task 3（已完成）
```

4. **功能完成後**：將計畫檔移至 `docs/plans/archive/`
5. **更新**：`docs/FEATURES.md` 的完成狀態 + `docs/CHANGELOG.md` 新增版本記錄
