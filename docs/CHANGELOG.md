# CHANGELOG.md

## [1.1.0] - 2026-05-10

### 新增

- **綠界金流串接（ECPay AIO 信用卡）**：以 SHA256 CheckMacValue 演算法產生付款表單，透過前端自動提交至 `payment-stage.ecpay.com.tw`
- **`POST /api/payments/ecpay/:orderId`**：產生含 CheckMacValue 的綠界付款表單參數（JWT 認證）
- **`POST /api/payments/ecpay/result`**（OrderResultURL）：接收綠界瀏覽器 redirect，主動呼叫 `QueryTradeInfo/V5` 驗證付款結果後更新訂單狀態
- **`POST /api/payments/ecpay/notify`**（ReturnURL）：接收綠界 server-to-server 通知（本地備用，部署公開伺服器後自動生效）
- **`src/utils/ecpay.js`**：封裝 CheckMacValue 計算/驗證、buildPaymentParams、queryTradeInfo 工具函式
- **`orders.ecpay_trade_no` 欄位**：透過 `ALTER TABLE` migration 新增，儲存綠界 MerchantTradeNo 供 callback 反查訂單

### 變更

- 訂單詳情頁（`/orders/:id`）付款按鈕由「付款成功 / 付款失敗」模擬按鈕改為「前往綠界付款」
- `public/js/pages/order-detail.js`：移除 `simulatePay`，新增 `handleEcpayPay`（動態建立 form 並提交）

### 移除

- 模擬付款端點 `PATCH /api/orders/:id/pay` 功能保留（程式碼未刪除，但前台已不再顯示對應按鈕）

---

## [1.0.0] - 2026-05-10

### 初始版本

#### 新增

- **使用者認證系統**：JWT 認證（HS256，7天效期）、bcrypt 密碼雜湊（10 rounds）、角色系統（user/admin）
- **商品瀏覽 API**：公開商品列表（分頁）、商品詳情
- **購物車 API**：雙模式認證（JWT 優先 / X-Session-Id fallback）、加入/修改/刪除/查看購物車、重複加入自動累加數量
- **訂單 API**：從購物車建立訂單（含庫存扣減 transaction）、模擬付款（success/fail）、訂單列表與詳情
- **後台商品管理 API**：新增/編輯/刪除商品（刪除前防止 pending 訂單）
- **後台訂單管理 API**：查詢所有訂單（含狀態篩選）、訂單詳情（含用戶資料）
- **EJS 前台頁面**：首頁、商品詳情、購物車、結帳、登入、訂單列表、訂單詳情
- **EJS 後台頁面**：商品管理、訂單管理
- **資料庫種子資料**：管理員帳號（admin@hexschool.com）+ 8 筆花卉商品
- **統一 API 回應格式**：`{ data, error, message }` 三欄位
- **OpenAPI 文件**：`@openapi` JSDoc 註解 + `generate-openapi.js` 生成腳本
- **整合測試**：Vitest + supertest，6 個測試檔，循序執行
- **TailwindCSS 4**：前端樣式建置流程

---

> 格式說明：新增功能記錄於 `### 新增`，變更記錄於 `### 變更`，修復記錄於 `### 修復`，移除記錄於 `### 移除`。
