# FEATURES.md

## 功能完成狀態

| 功能模組 | 狀態 |
|----------|------|
| 使用者認證（註冊/登入/個人資料） | ✅ 完成 |
| 商品瀏覽（公開列表 + 詳情） | ✅ 完成 |
| 購物車（訪客 + 登入雙模式） | ✅ 完成 |
| 訂單建立（含庫存扣減 transaction） | ✅ 完成 |
| 模擬付款（success/fail 切換） | ✅ 完成 |
| 後台商品管理（CRUD） | ✅ 完成 |
| 後台訂單管理（查看 + 篩選狀態） | ✅ 完成 |
| EJS 前台頁面（SSR） | ✅ 完成 |
| EJS 後台頁面（SSR） | ✅ 完成 |
| OpenAPI 文件生成 | ✅ 完成 |
| 金流整合（ECPay） | ⏳ 待開發（環境變數已預留） |

---

## 1. 使用者認證

### 行為描述

#### 註冊（POST /api/auth/register）

接受 `email`、`password`、`name` 三個必填欄位。驗證順序：
1. 缺少任一欄位 → 400 `VALIDATION_ERROR`
2. email 格式不符正規表達式 → 400 `VALIDATION_ERROR`
3. password 少於 6 字元 → 400 `VALIDATION_ERROR`
4. email 已存在 → 409 `CONFLICT`
5. 通過：建立用戶（role 固定為 `user`）、以 bcrypt 10 rounds 雜湊密碼、簽發 7 天 JWT → 201

回傳的 JWT payload 包含 `{ userId, email, role }`。

#### 登入（POST /api/auth/login）

接受 `email`、`password`。Email 不存在或密碼錯誤統一回傳 401（不區分，避免用戶枚舉）。成功後簽發 7 天 JWT。

#### 個人資料（GET /api/auth/profile）

需 Bearer Token。從 DB 查詢 `id, email, name, role, created_at` 回傳（不含 password_hash）。

### 端點表

| 方法 | 路徑 | 認證 | 狀態碼 |
|------|------|------|--------|
| POST | `/api/auth/register` | 無 | 201 / 400 / 409 |
| POST | `/api/auth/login` | 無 | 200 / 400 / 401 |
| GET | `/api/auth/profile` | JWT | 200 / 401 / 404 |

---

## 2. 商品瀏覽（公開）

### 行為描述

#### 商品列表（GET /api/products）

支援分頁查詢，預設 `page=1`、`limit=10`，最大 limit 100（超過自動截斷）。依 `created_at DESC` 排序。回傳 `{ products, pagination }` 其中 pagination 含 `{ total, page, limit, totalPages }`。

#### 商品詳情（GET /api/products/:id）

以 UUID 查詢單一商品。商品不存在回傳 404。

### 端點表

| 方法 | 路徑 | 查詢參數 | 狀態碼 |
|------|------|----------|--------|
| GET | `/api/products` | `page`（預設 1）、`limit`（預設 10，最大 100） | 200 |
| GET | `/api/products/:id` | - | 200 / 404 |

---

## 3. 購物車

### 行為描述

購物車支援**訪客模式**（以 `X-Session-Id` header 識別）與**登入模式**（以 JWT Bearer 識別）。兩者的購物車資料相互獨立，無自動合併機制。

#### dualAuth 認證邏輯（重要）

- 若請求帶有 `Authorization: Bearer ...` header：強制走 JWT 驗證。Token 無效 → 401，**不會** fallback 到 session。
- 若請求無 `Authorization` header 但有 `X-Session-Id` header：使用 session 模式。
- 兩者皆無：401 `UNAUTHORIZED`。

#### 加入購物車（POST /api/cart）

必填：`productId`。選填：`quantity`（預設 1，必須為正整數）。

業務邏輯：
- 商品不存在 → 404
- 庫存驗證：若商品**已在**購物車，以「現有數量 + 新增數量」和庫存比較；若「超出」→ 400 `STOCK_INSUFFICIENT`
- 若商品**已在**購物車：累加 quantity（`UPDATE cart_items SET quantity = ?`），**不是**建立新記錄
- 若商品**未在**購物車：INSERT 新記錄

#### 修改數量（PATCH /api/cart/:itemId）

必填：`quantity`（正整數）。僅能修改自己的購物車項目（owner 條件）。驗證 quantity 不超過庫存。

#### 移除項目（DELETE /api/cart/:itemId）

僅能刪除自己的購物車項目。成功回傳 `data: null`。

#### 查看購物車（GET /api/cart）

JOIN products 取得商品即時資訊。回傳 `{ items, total }`，`total` 為所有 `price × quantity` 總和（即時計算，非快照）。

### 端點表

| 方法 | 路徑 | 認證 | Request Body | 狀態碼 |
|------|------|------|--------------|--------|
| GET | `/api/cart` | JWT 或 X-Session-Id | - | 200 / 401 |
| POST | `/api/cart` | JWT 或 X-Session-Id | `{ productId, quantity? }` | 200 / 400 / 401 / 404 |
| PATCH | `/api/cart/:itemId` | JWT 或 X-Session-Id | `{ quantity }` | 200 / 400 / 401 / 404 |
| DELETE | `/api/cart/:itemId` | JWT 或 X-Session-Id | - | 200 / 401 / 404 |

---

## 4. 訂單

### 行為描述

#### 建立訂單（POST /api/orders）

**必須登入**（JWT），訪客無法下單。必填：`recipientName`、`recipientEmail`（格式驗證）、`recipientAddress`。

業務邏輯（單一 better-sqlite3 transaction，全部成功或全部回滾）：
1. 取得用戶購物車（只取 `user_id` 對應的項目，不支援 session 模式）
2. 購物車為空 → 400 `CART_EMPTY`
3. 批次檢查所有商品庫存是否足夠，不足者列出商品名稱 → 400 `STOCK_INSUFFICIENT`
4. 計算 `total_amount = Σ(product_price × quantity)`
5. 建立訂單（status 預設 `pending`，order_no 格式：`ORD-YYYYMMDD-XXXXX`）
6. 為每個購物車項目建立 `order_items` 記錄（快照 `product_name`、`product_price`）
7. 逐一扣減商品庫存（`UPDATE products SET stock = stock - ? WHERE id = ?`）
8. 清空用戶購物車（`DELETE FROM cart_items WHERE user_id = ?`）

#### 訂單列表（GET /api/orders）

僅回傳當前登入用戶的訂單，依 `created_at DESC` 排序。不分頁。

#### 訂單詳情（GET /api/orders/:id）

查詢條件包含 `user_id`（防止用戶查看他人訂單）。回傳含 `items` 陣列。

#### 模擬付款（PATCH /api/orders/:id/pay）

必填：`action`（`success` 或 `fail`）。僅能操作 `status = pending` 的訂單。
- `action: 'success'` → `status` 改為 `paid`
- `action: 'fail'` → `status` 改為 `failed`

付款後無法再次付款（非 pending 狀態 → 400 `INVALID_STATUS`）。

### 端點表

| 方法 | 路徑 | 認證 | Request Body | 狀態碼 |
|------|------|------|--------------|--------|
| POST | `/api/orders` | JWT | `{ recipientName, recipientEmail, recipientAddress }` | 201 / 400 / 401 |
| GET | `/api/orders` | JWT | - | 200 / 401 |
| GET | `/api/orders/:id` | JWT | - | 200 / 401 / 404 |
| PATCH | `/api/orders/:id/pay` | JWT | `{ action: 'success'|'fail' }` | 200 / 400 / 401 / 404 |

---

## 5. 後台商品管理（Admin）

### 行為描述

所有路由需 JWT + role=admin（`authMiddleware` 後接 `adminMiddleware`）。

#### 後台商品列表（GET /api/admin/products）

與公開商品列表邏輯相同，但需認證。支援 `page`、`limit` 分頁。

#### 新增商品（POST /api/admin/products）

必填：`name`（非空字串）、`price`（正整數）、`stock`（非負整數）。選填：`description`、`image_url`。

#### 編輯商品（PUT /api/admin/products/:id）

支援部分欄位更新（Partial Update），未傳的欄位保留舊值。驗證規則：
- `name` 傳入且為空字串 → 400
- `price` 傳入但非正整數 → 400
- `stock` 傳入但非非負整數 → 400

更新時同步設定 `updated_at = datetime('now')`。

#### 刪除商品（DELETE /api/admin/products/:id）

刪除前檢查：若商品存在任何 `status = 'pending'` 的訂單中 → 409 `CONFLICT`（防止刪除進行中訂單的商品）。已完成（paid/failed）訂單中的商品可以刪除。

### 端點表

| 方法 | 路徑 | 認證 | Request Body | 狀態碼 |
|------|------|------|--------------|--------|
| GET | `/api/admin/products` | JWT + Admin | - | 200 / 401 / 403 |
| POST | `/api/admin/products` | JWT + Admin | `{ name, price, stock, description?, image_url? }` | 201 / 400 / 401 / 403 |
| PUT | `/api/admin/products/:id` | JWT + Admin | 任意欄位組合 | 200 / 400 / 401 / 403 / 404 |
| DELETE | `/api/admin/products/:id` | JWT + Admin | - | 200 / 401 / 403 / 404 / 409 |

---

## 6. 後台訂單管理（Admin）

### 行為描述

#### 後台訂單列表（GET /api/admin/orders）

查詢**所有**用戶的訂單（不限 user_id）。支援：
- `page`、`limit` 分頁（預設 10，最大 100）
- `status` 篩選（`pending`/`paid`/`failed`；未傳或無效值則不篩選）

依 `created_at DESC` 排序。

#### 後台訂單詳情（GET /api/admin/orders/:id）

可查詢任意用戶的訂單。回傳欄位包含：訂單資料 + `items` 陣列 + `user` 物件（`{ name, email }`）。若下單用戶已被刪除，`user` 欄位為 `null`。

### 端點表

| 方法 | 路徑 | 查詢參數 | 認證 | 狀態碼 |
|------|------|----------|------|--------|
| GET | `/api/admin/orders` | `page`、`limit`、`status` | JWT + Admin | 200 / 401 / 403 |
| GET | `/api/admin/orders/:id` | - | JWT + Admin | 200 / 401 / 403 / 404 |
