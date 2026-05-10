# TESTING.md

## 測試架構

本專案使用 **Vitest 2** 作為測試框架，搭配 **supertest 7** 對 Express app 發送 HTTP 請求。所有測試為 API 整合測試，直接操作實際的 SQLite 資料庫（無 mock）。

## 測試檔案表

| 測試檔案 | 涵蓋 API | 測試案例 |
|----------|----------|----------|
| `tests/setup.js` | - | 共用輔助函式（非測試） |
| `tests/auth.test.js` | `/api/auth/*` | 註冊、重複 email 衝突、登入、錯誤密碼、取得個人資料、未授權存取 |
| `tests/products.test.js` | `/api/products/*` | 商品列表、分頁、商品詳情、不存在商品 404 |
| `tests/cart.test.js` | `/api/cart/*` | 訪客模式加入/查看/修改/刪除購物車、登入模式加入、商品不存在 404 |
| `tests/orders.test.js` | `/api/orders/*` | 建立訂單、空購物車錯誤、未授權、訂單列表、訂單詳情、不存在訂單 404 |
| `tests/adminProducts.test.js` | `/api/admin/products/*` | 後台列表、新增商品、更新商品、刪除商品並確認消失、一般用戶被拒、無 Token 被拒 |
| `tests/adminOrders.test.js` | `/api/admin/orders/*` | 後台訂單列表、狀態篩選、訂單詳情（含 user 欄位）、一般用戶被拒 |

## 執行順序與依賴關係

`vitest.config.js` 設定 `fileParallelism: false` 並明確指定執行順序：

```
auth.test.js → products.test.js → cart.test.js → orders.test.js → adminProducts.test.js → adminOrders.test.js
```

**不可並行執行**的原因：

- 所有測試共享同一個 `database.sqlite` 實例
- `orders.test.js` 的 `beforeAll` 依賴 `cart` 加入商品，再呼叫 `POST /api/orders`
- `adminOrders.test.js` 的 `beforeAll` 自行建立測試訂單，需商品列表有資料（依賴 seed 資料）
- `cart.test.js` 在 `beforeAll` 從 products 列表取第一筆商品的 ID

## 輔助函式（tests/setup.js）

```js
// 取得管理員 JWT Token（使用種子管理員帳號）
const adminToken = await getAdminToken();

// 動態建立測試用戶並取得 token（避免 email 衝突）
// email 格式：test-<timestamp>-<random>@example.com
const { token, user } = await registerUser();

// 自訂欄位
const { token } = await registerUser({ email: 'custom@test.com', name: '特定用戶' });
```

> `registerUser` 每次產生不同 email（含 `Date.now()` 和隨機字串），確保測試間不會因 email 衝突而失敗。

## 撰寫新測試的步驟

1. 在 `tests/` 建立 `<feature>.test.js`
2. 引入 setup 工具：
   ```js
   const { app, request, getAdminToken, registerUser } = require('./setup');
   ```
3. 使用 `describe` 群組化測試案例
4. 若需前置資料（例如先建立商品），放在 `beforeAll`
5. 每個 `it` 驗證：HTTP 狀態碼、`data` 存在性、`error` 欄位值、關鍵業務欄位
6. 在 `vitest.config.js` 的 `sequence.files` 陣列末尾加入新檔案路徑

## 新測試範例

```js
const { app, request, getAdminToken } = require('./setup');

describe('MyFeature API', () => {
  let adminToken;

  beforeAll(async () => {
    adminToken = await getAdminToken();
  });

  it('should return 200 with valid data', async () => {
    const res = await request(app)
      .get('/api/my-endpoint')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
  });

  it('should return 401 without token', async () => {
    const res = await request(app).get('/api/my-endpoint');
    expect(res.status).toBe(401);
    expect(res.body.error).not.toBeNull();
  });
});
```

## 常見陷阱

### 1. 共享資料庫狀態造成測試污染

測試間**不清空**資料庫。`cart.test.js` 在每個 `it` 間共享 `cartItemId` 變數（先加入再刪除），若測試失敗到一半，後續 `it` 可能因狀態不一致而失敗。

**解法**：測試案例設計要考慮前一個 `it` 的副作用，或在 `beforeEach` 清理特定資料。

### 2. orders.test.js 的訂單建立後購物車被清空

`orders.test.js` 的第一個 `it`（建立訂單）成功後，購物車會被清空（transaction 的一部分）。第二個 `it`（空購物車錯誤）就依賴這個狀態——**不要**在它們之間插入新的加入購物車操作。

### 3. 管理員帳號是種子資料，不可在測試中刪除

`getAdminToken` 使用固定的 `admin@hexschool.com` 帳號。若某個測試刪除了這個帳號，所有後續使用 `getAdminToken` 的測試都會失敗。

### 4. JWT_SECRET 必須在測試環境存在

測試使用實際的 `app.js`，而 `server.js` 不會被執行（不會有 `process.exit(1)` 保護）。但 `authMiddleware` 使用 `jwt.verify(..., process.env.JWT_SECRET)`，若未設定，token 驗證會拋出例外。確保 `.env` 有設定 `JWT_SECRET`。

### 5. bcrypt 在測試環境自動降速

`database.js` 的 `seedAdminUser` 中，`saltRounds` 在 `NODE_ENV === 'test'` 時為 1。`registerUser` 呼叫 `POST /api/auth/register`，此路由固定使用 10 rounds。若大量呼叫 `registerUser` 可能導致 `beforeAll` 超過 `hookTimeout: 10000ms`。
