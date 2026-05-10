# FEATURES.md

## 功能完成狀態

| 功能模組 | 狀態 |
|----------|------|
| 使用者認證（註冊/登入/個人資料） | ✅ 完成 |
| 商品瀏覽（公開列表 + 詳情） | ✅ 完成 |
| 購物車（訪客 + 登入雙模式） | ✅ 完成 |
| 訂單建立（含庫存扣減 transaction） | ✅ 完成 |
| 模擬付款（success/fail 切換） | 🗑️ 已移除（由 ECPay 金流取代） |
| 後台商品管理（CRUD） | ✅ 完成 |
| 後台訂單管理（查看 + 篩選狀態） | ✅ 完成 |
| EJS 前台頁面（SSR） | ✅ 完成 |
| EJS 後台頁面（SSR） | ✅ 完成 |
| OpenAPI 文件生成 | ✅ 完成 |
| 金流整合（ECPay AIO 信用卡） | ✅ 完成 |

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

### 端點表

| 方法 | 路徑 | 認證 | Request Body | 狀態碼 |
|------|------|------|--------------|--------|
| POST | `/api/orders` | JWT | `{ recipientName, recipientEmail, recipientAddress }` | 201 / 400 / 401 |
| GET | `/api/orders` | JWT | - | 200 / 401 |
| GET | `/api/orders/:id` | JWT | - | 200 / 401 / 404 |

---

---

## 5. 綠界金流（ECPay AIO）

### 行為描述

本專案僅運行於本地端，無法接收綠界伺服器主動推送的 ReturnURL 通知（server-to-server POST），因此以**本地端主動查詢** `QueryTradeInfo` API 取代，確認付款結果。

#### 整體流程

1. 用戶在訂單詳情頁（`/orders/:id`）點擊「前往綠界付款」
2. 前端呼叫 `POST /api/payments/ecpay/:orderId`，後端產生含 CheckMacValue 的表單參數
3. 前端以 JavaScript 動態建立 `<form method="POST">` 並立即送出，瀏覽器導向綠界測試環境
4. 用戶在綠界完成刷卡（信用卡付款）
5. 綠界透過瀏覽器 redirect（`OrderResultURL`）POST 回 `/api/payments/ecpay/result`
6. 後端收到後，主動呼叫 `QueryTradeInfo/V5` 查詢真實付款狀態（防止竄改）
7. 依查詢結果更新訂單 `status`，然後 redirect 至 `/orders/:id?payment=success|failed`

#### 付款方式限制

本實作僅支援**信用卡（ChoosePayment=Credit）**。其他方式（ATM、超商、TWQR 掃碼）的付款完成通知走 server-to-server ReturnURL，本地環境接收不到，不應選擇。

#### 產生付款表單（POST /api/payments/ecpay/:orderId）

需 JWT 認證，且訂單 `status` 必須為 `pending`。處理流程：
1. 確認訂單屬於當前登入用戶
2. 以 `orderId` 的 UUID 去除 `-` 後取前 20 字元作為 `MerchantTradeNo`（ECPay 限制最多 20 字元、英數字）
3. 將 `MerchantTradeNo` 寫入訂單 `ecpay_trade_no` 欄位，供後續 callback 對應訂單
4. 組合付款參數並以 SHA256 演算法計算 CheckMacValue
5. 回傳 `{ actionUrl, params }` 供前端建立自動提交表單

CheckMacValue 演算法遵循綠界規範：篩除 `CheckMacValue` 鍵 → 以 key 名稱 case-insensitive 排序 → 組合成 `HashKey=...&k=v&...&HashIV=...` → ECPay 特製 URL encode（PHP urlencode + lowercase + .NET 7 字元還原）→ SHA256 → 轉大寫。

#### OrderResultURL 結果接收（POST /api/payments/ecpay/result）

此為瀏覽器端 redirect，不需認證。綠界 POST body 含 `MerchantTradeNo`、`RtnCode` 等欄位。處理流程：
1. 以 `MerchantTradeNo` 查詢訂單（`ecpay_trade_no` 欄位）
2. 呼叫 `QueryTradeInfo/V5` 主動查詢確認，`TradeStatus=1` 為付款成功
3. 若 QueryTradeInfo 呼叫失敗，fallback 使用綠界 POST 的 `RtnCode`（`1` = 成功）
4. 更新訂單 `status`（`paid` 或 `failed`），redirect 至訂單詳情頁並帶 `?payment=success|failed`

#### ReturnURL（POST /api/payments/ecpay/notify）

本地環境下，綠界無法連線至 `localhost`，此 endpoint 實際上不會被呼叫到。但仍實作為備用（未來部署至公開伺服器時自動生效）：驗證 CheckMacValue → 查訂單 → 更新 status → 回傳純文字 `1|OK`。

#### 付款狀態 payload

| paymentResult 參數值 | 訂單 status | 顯示訊息 |
|-----------------------|-------------|----------|
| `success` | `paid` | 付款成功！感謝您的購買。 |
| `failed` | `failed` | 付款失敗，請重試。 |
| `cancel` | 不變（仍為 `pending`） | 付款已取消。 |

### 端點表

| 方法 | 路徑 | 認證 | 說明 | 狀態碼 |
|------|------|------|------|--------|
| POST | `/api/payments/ecpay/:orderId` | JWT | 產生付款表單參數 | 200 / 400 / 401 / 404 |
| POST | `/api/payments/ecpay/result` | 無 | 綠界 OrderResultURL 回調（瀏覽器） | 302 |
| POST | `/api/payments/ecpay/notify` | 無 | 綠界 ReturnURL 回調（server-to-server，本地備用） | 200（純文字） |

### 相關環境變數

| 變數名稱 | 說明 | 測試值 |
|----------|------|--------|
| `ECPAY_MERCHANT_ID` | 特店編號 | `3002607` |
| `ECPAY_HASH_KEY` | CheckMacValue Hash Key | `pwFHCqoQZGmho4w6` |
| `ECPAY_HASH_IV` | CheckMacValue Hash IV | `EkRm7iFT261dpevs` |
| `ECPAY_ENV` | 環境切換（`staging` / `production`） | `staging` |
| `BASE_URL` | 本機伺服器 URL（用於拼接 callback URL） | `http://localhost:3001` |

### 測試信用卡（staging 環境）

| 欄位 | 值 |
|------|-----|
| 卡號 | `4311-9522-2222-2222` |
| 有效期 | 任意未來月/年 |
| CVV | 任意三位數 |

---

## 7. 後台商品管理（Admin）

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

## 8. 後台訂單管理（Admin）

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
