# ARCHITECTURE.md

## 目錄結構

```
.
├── server.js                   # 程式入口：讀 PORT、守衛 JWT_SECRET、啟動 HTTP
├── app.js                      # Express 應用組裝：middleware 掛載、路由註冊、404/error handler
├── src/
│   ├── database.js             # SQLite 連線、建表 DDL、種子資料（管理員帳號 + 8 筆商品）
│   ├── middleware/
│   │   ├── authMiddleware.js   # JWT Bearer 驗證；解碼後確認 user 仍存在 DB；掛到 req.user
│   │   ├── adminMiddleware.js  # 檢查 req.user.role === 'admin'，否則 403
│   │   ├── sessionMiddleware.js# 讀取 X-Session-Id header，掛到 req.sessionId
│   │   └── errorHandler.js    # 全域錯誤 handler；500 屏蔽內部訊息；operational error 顯示 message
│   └── routes/
│       ├── authRoutes.js       # POST /register、POST /login、GET /profile
│       ├── productRoutes.js    # GET /products、GET /products/:id（公開）
│       ├── cartRoutes.js       # 購物車 CRUD；dualAuth（JWT 優先，fallback session）
│       ├── orderRoutes.js      # 使用者訂單；authMiddleware 強制登入
│       ├── adminProductRoutes.js  # 管理員商品 CRUD；authMiddleware + adminMiddleware
│       ├── adminOrderRoutes.js    # 管理員訂單查詢；authMiddleware + adminMiddleware
│       └── pageRoutes.js       # EJS 頁面路由（前台 + 後台）
├── views/
│   ├── layouts/
│   │   ├── front.ejs           # 前台 layout（head + header + footer）
│   │   └── admin.ejs           # 後台 layout（管理員 header + sidebar）
│   ├── pages/
│   │   ├── index.ejs           # 首頁（商品列表）
│   │   ├── product-detail.ejs  # 商品詳情
│   │   ├── cart.ejs            # 購物車
│   │   ├── checkout.ejs        # 結帳表單
│   │   ├── login.ejs           # 登入頁
│   │   ├── orders.ejs          # 我的訂單列表
│   │   ├── order-detail.ejs    # 訂單詳情（含付款結果顯示）
│   │   ├── 404.ejs             # 404 頁面
│   │   └── admin/
│   │       ├── products.ejs    # 後台商品管理
│   │       └── orders.ejs      # 後台訂單管理
│   └── partials/
│       ├── head.ejs            # <head> 標籤（CSS 引入）
│       ├── header.ejs          # 前台 header（導覽列、購物車圖示）
│       ├── footer.ejs          # 前台 footer
│       ├── notification.ejs    # Toast 通知容器
│       ├── admin-header.ejs    # 後台頂部 header
│       └── admin-sidebar.ejs   # 後台側邊欄
├── public/
│   ├── css/
│   │   ├── input.css           # TailwindCSS 來源（含 @import tailwindcss）
│   │   └── output.css          # 建置後的 CSS（不要手動編輯）
│   ├── js/
│   │   ├── api.js              # 前端 fetch 封裝（統一加 Authorization header）
│   │   ├── auth.js             # 前端 JWT 管理（localStorage 存取、角色判斷）
│   │   ├── header-init.js      # header 初始化（登入狀態顯示、購物車數量）
│   │   ├── notification.js     # Toast 通知顯示邏輯
│   │   └── pages/              # 各頁面專屬 JS
│   │       ├── index.js        # 首頁商品載入與分頁
│   │       ├── product-detail.js
│   │       ├── cart.js
│   │       ├── checkout.js
│   │       ├── login.js
│   │       ├── orders.js
│   │       ├── order-detail.js
│   │       ├── admin-products.js
│   │       └── admin-orders.js
│   └── stylesheets/
│       └── style.css           # 自訂 CSS（非 Tailwind，目前為空）
├── tests/                      # Vitest 測試（API 整合測試）
├── generate-openapi.js         # 掃描 @openapi JSDoc 產出 swagger.json
├── swagger-config.js           # swaggerJsdoc 設定（title、version、伺服器 URL）
├── vitest.config.js            # 測試循序設定（fileParallelism: false）
└── .env.example                # 環境變數範例
```

## 啟動流程

```
node server.js
  └── require('./app')
        ├── require('dotenv').config()          # 載入 .env
        ├── require('./src/database')           # 建表 + 植入種子資料（idempotent）
        ├── app.use(cors, json, urlencoded)     # 全域 middleware
        ├── app.use(sessionMiddleware)          # 解析 X-Session-Id header
        ├── app.use('/api/auth', ...)
        ├── app.use('/api/admin/products', ...) # authMiddleware + adminMiddleware
        ├── app.use('/api/admin/orders', ...)   # authMiddleware + adminMiddleware
        ├── app.use('/api/products', ...)
        ├── app.use('/api/cart', ...)           # dualAuth（內部自定義）
        ├── app.use('/api/orders', ...)         # authMiddleware（路由層 router.use）
        ├── app.use('/', pageRoutes)
        ├── 404 handler（API → JSON；頁面 → EJS 404）
        └── errorHandler（全域錯誤）
  └── 確認 JWT_SECRET 存在（否則 process.exit(1)）
  └── app.listen(PORT)  # 預設 3001
```

## API 路由總覽

| 前綴 | 方法 | 路徑 | 認證 | 說明 |
|------|------|------|------|------|
| `/api/auth` | POST | `/register` | 無 | 使用者註冊 |
| `/api/auth` | POST | `/login` | 無 | 使用者登入 |
| `/api/auth` | GET | `/profile` | JWT | 取得自己的個人資料 |
| `/api/products` | GET | `/` | 無 | 商品列表（分頁） |
| `/api/products` | GET | `/:id` | 無 | 商品詳情 |
| `/api/cart` | GET | `/` | JWT 或 Session | 查看購物車 |
| `/api/cart` | POST | `/` | JWT 或 Session | 加入購物車 |
| `/api/cart` | PATCH | `/:itemId` | JWT 或 Session | 修改數量 |
| `/api/cart` | DELETE | `/:itemId` | JWT 或 Session | 移除項目 |
| `/api/orders` | POST | `/` | JWT | 從購物車建立訂單 |
| `/api/orders` | GET | `/` | JWT | 自己的訂單列表 |
| `/api/orders` | GET | `/:id` | JWT | 訂單詳情 |
| `/api/orders` | PATCH | `/:id/pay` | JWT | 模擬付款 |
| `/api/admin/products` | GET | `/` | JWT + Admin | 後台商品列表 |
| `/api/admin/products` | POST | `/` | JWT + Admin | 新增商品 |
| `/api/admin/products` | PUT | `/:id` | JWT + Admin | 編輯商品 |
| `/api/admin/products` | DELETE | `/:id` | JWT + Admin | 刪除商品 |
| `/api/admin/orders` | GET | `/` | JWT + Admin | 後台訂單列表（可篩狀態） |
| `/api/admin/orders` | GET | `/:id` | JWT + Admin | 後台訂單詳情（含用戶資料） |

## 統一回應格式

所有 API 回應均為以下結構：

```json
// 成功
{
  "data": { ... },
  "error": null,
  "message": "成功"
}

// 失敗
{
  "data": null,
  "error": "VALIDATION_ERROR",
  "message": "email、password、name 為必填欄位"
}
```

**錯誤代碼列表：**

| error 代碼 | HTTP 狀態 | 說明 |
|------------|-----------|------|
| `VALIDATION_ERROR` | 400 | 欄位缺失或格式錯誤 |
| `STOCK_INSUFFICIENT` | 400 | 庫存不足 |
| `CART_EMPTY` | 400 | 購物車為空 |
| `INVALID_STATUS` | 400 | 訂單狀態不符合操作條件 |
| `UNAUTHORIZED` | 401 | 未提供 Token 或 Token 無效/過期 |
| `FORBIDDEN` | 403 | 已登入但非管理員 |
| `NOT_FOUND` | 404 | 資源不存在 |
| `CONFLICT` | 409 | Email 已被使用 / 商品有未完成訂單 |
| `INTERNAL_ERROR` | 500 | 伺服器內部錯誤（訊息已安全化） |

## 認證與授權機制

### 標準 JWT 認證（authMiddleware）

適用路由：`/api/auth/profile`、`/api/orders/*`、`/api/admin/*`

1. 讀取 `Authorization: Bearer <token>` header
2. 以 `HS256` 演算法、`JWT_SECRET` 驗簽；token 有效期 **7 天**
3. 確認 DB 中仍存在對應 user（防止帳號被刪後 token 仍有效）
4. 掛載 `req.user = { userId, email, role }` 供後續路由使用

### 管理員授權（adminMiddleware）

接在 `authMiddleware` 之後，僅檢查 `req.user.role === 'admin'`。

### 購物車雙模式認證（dualAuth，cartRoutes.js 內部函式）

購物車支援訪客與登入用戶，但規則有精妙之處：

- **若有 `Authorization` header**：強制走 JWT 驗證。若 token 無效 → 直接回傳 401，**不** fallback 到 session。
- **若無 `Authorization` header 且有 `X-Session-Id` header**：使用 session 模式，`req.sessionId` 已由 `sessionMiddleware` 掛載。
- **兩者皆無**：回傳 401。

購物車項目的 owner 判斷（`getOwnerCondition`）：
- 登入用戶：以 `user_id` 欄位識別
- 訪客：以 `session_id` 欄位識別

## 資料庫 Schema

資料庫位置：`database.sqlite`（與 `src/` 同層）  
WAL mode 開啟（`journal_mode = WAL`）、外鍵強制開啟（`foreign_keys = ON`）

### users 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `email` | TEXT | UNIQUE NOT NULL | 登入帳號 |
| `password_hash` | TEXT | NOT NULL | bcrypt hash |
| `name` | TEXT | NOT NULL | 顯示名稱 |
| `role` | TEXT | NOT NULL DEFAULT 'user' CHECK(IN 'user','admin') | 角色 |
| `created_at` | TEXT | NOT NULL DEFAULT datetime('now') | 建立時間（ISO 格式） |

### products 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `name` | TEXT | NOT NULL | 商品名稱 |
| `description` | TEXT | - | 商品描述 |
| `price` | INTEGER | NOT NULL CHECK(> 0) | 售價（新台幣，整數） |
| `stock` | INTEGER | NOT NULL DEFAULT 0 CHECK(>= 0) | 庫存數量 |
| `image_url` | TEXT | - | 圖片 URL |
| `created_at` | TEXT | NOT NULL DEFAULT datetime('now') | 建立時間 |
| `updated_at` | TEXT | NOT NULL DEFAULT datetime('now') | 最後更新時間 |

> `updated_at` 需在更新時手動設定 `datetime('now')`，DB 沒有 trigger 自動更新。

### cart_items 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `session_id` | TEXT | - | 訪客 session（nullable） |
| `user_id` | TEXT | FK → users.id | 登入用戶（nullable） |
| `product_id` | TEXT | NOT NULL FK → products.id | 商品 ID |
| `quantity` | INTEGER | NOT NULL DEFAULT 1 CHECK(> 0) | 數量 |

> `session_id` 與 `user_id` 恰好一個為 NULL，另一個有值。

### orders 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `order_no` | TEXT | UNIQUE NOT NULL | 訂單編號，格式 `ORD-YYYYMMDD-XXXXX`（5 碼大寫 UUID 前段） |
| `user_id` | TEXT | NOT NULL FK → users.id | 下訂用戶 |
| `recipient_name` | TEXT | NOT NULL | 收件人姓名 |
| `recipient_email` | TEXT | NOT NULL | 收件人 Email |
| `recipient_address` | TEXT | NOT NULL | 收件地址 |
| `total_amount` | INTEGER | NOT NULL | 訂單金額（新台幣） |
| `status` | TEXT | NOT NULL DEFAULT 'pending' CHECK(IN 'pending','paid','failed') | 付款狀態 |
| `created_at` | TEXT | NOT NULL DEFAULT datetime('now') | 建立時間 |

### order_items 表

| 欄位 | 型別 | 約束 | 說明 |
|------|------|------|------|
| `id` | TEXT | PRIMARY KEY | UUID v4 |
| `order_id` | TEXT | NOT NULL FK → orders.id | 所屬訂單 |
| `product_id` | TEXT | NOT NULL FK → products.id | 商品 ID（保留關聯） |
| `product_name` | TEXT | NOT NULL | 快照：下單當時商品名稱 |
| `product_price` | INTEGER | NOT NULL | 快照：下單當時售價 |
| `quantity` | INTEGER | NOT NULL | 購買數量 |

> `product_name` 和 `product_price` 是快照欄位，即使商品後來被修改或刪除，訂單歷史仍保留下單當時的資料。

## 頁面路由（EJS SSR）

| 路徑 | Layout | pageScript | 說明 |
|------|--------|------------|------|
| `GET /` | front | index | 首頁（商品列表） |
| `GET /products/:id` | front | product-detail | 商品詳情；`productId` 傳入 EJS |
| `GET /cart` | front | cart | 購物車 |
| `GET /checkout` | front | checkout | 結帳表單 |
| `GET /login` | front | login | 登入頁 |
| `GET /orders` | front | orders | 我的訂單 |
| `GET /orders/:id` | front | order-detail | 訂單詳情；`orderId`、`paymentResult`（query param `?payment=`）傳入 EJS |
| `GET /admin/products` | admin | admin-products | 後台商品管理 |
| `GET /admin/orders` | admin | admin-orders | 後台訂單管理 |

> 後台路由無 server-side 權限驗證（認證在前端 JS 執行 API 時由 JWT 把關）。

## 資料流（下單流程）

```
用戶瀏覽商品（GET /api/products）
  └── 加入購物車（POST /api/cart）         # dualAuth
        ├── 若商品已在購物車：quantity 累加
        └── 若商品不在購物車：新增 cart_item
用戶結帳（POST /api/orders）              # authMiddleware（需登入）
  └── better-sqlite3 transaction：
        ├── INSERT orders
        ├── INSERT order_items（快照商品名稱和價格）
        ├── UPDATE products SET stock = stock - quantity（逐筆扣）
        └── DELETE cart_items WHERE user_id = ?（清空用戶購物車）
用戶付款（PATCH /api/orders/:id/pay）
  ├── action: 'success' → status = 'paid'
  └── action: 'fail'    → status = 'failed'
  （僅 pending 狀態可操作）
```
