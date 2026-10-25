# AI Code Review 報告

- **審查日期**：2026-10-25
- **審查對象**：`main`（`babeb34`）
- **審查範圍**：訂單、付款、運費、購物車與相關測試
- **派出的 SubAgent**（定義於 `.claude/agents/`）：

| SubAgent | 任務 | 結果 |
|----------|------|------|
| `security-reviewer` | 存取控制、付款驗證、輸入驗證、機密外洩 | 7 項（5 項與下表重疊，另 2 項低風險） |
| `code-reviewer` | 商業邏輯、邊界值、狀態轉換、測試正確性 | 5 項，全部與下表重疊 |
| `test-runner` | 執行 `test:unit`、`test:integration` 並分析測試缺口 | 見下方「測試執行結果」 |

## 測試執行結果（修正前）

| 指令 | 結果 | 通過 | 失敗 | 略過 |
|------|------|------|------|------|
| `npm run test:unit` | ✅ | 54 | 0 | 1（`tests/shipping.test.js:29`） |
| `npm run test:integration` | ✅ | 10 | 0 | 0 |

測試全綠，但下列問題都沒有被抓到。被略過的那 1 項，正好是會揭露問題 3 的測試。

---

## 發現的問題

### 問題 1：訂單詳情 API 沒有檢查訂單擁有者（IDOR）　【訂單查詢】

- **嚴重度**：高
- **發現者**：security-reviewer（SEC-1）、code-reviewer（CR-1）、test-runner
- **位置**：`src/routes/orderRoutes.js:351`（`GET /api/orders/:id` handler）
- **問題說明**：handler 呼叫的是 `findOrderById(req.params.id)`（`src/services/orderService.js`，SQL 只有 `WHERE id = ?`），沒有限定 `user_id`。同一個檔案的 `/pay` 與 `/check-payment` 都正確使用 `findOrderForUser(id, userId)`，只有這支漏掉。`docs/FEATURES.md` 規定「他人訂單視為 404」。
- **重現情境**：會員 A 建立訂單 X → 會員 B 帶自己的 JWT 呼叫 `GET /api/orders/X` → 實際回 **200**，內容包含 A 的收件人姓名、Email、地址與品項；預期回 **404 NOT_FOUND**。
- **修正方向**：改用 `findOrderForUser(req.params.id, req.user.userId)`。

### 問題 2：付款查詢在回應缺少 CheckMacValue 時跳過驗章　【付款狀態】

- **嚴重度**：高
- **發現者**：security-reviewer（SEC-3）、code-reviewer（CR-2）、test-runner
- **位置**：`src/services/paymentService.js:15`（`isTradePaid`）
- **問題說明**：判斷式是 `if (tradeInfo.CheckMacValue && !verifyCheckMacValue(...))`。回應只要不帶 `CheckMacValue`，就會整段短路、跳過驗章。`MerchantTradeNo` 與 `TradeAmt` 都能從訂單資料推得，因此偽造的回應可以讓訂單被 `markOrderPaid` 標成 `paid`。
- **重現情境**：讓 `QueryTradeInfo` 回傳 `MerchantTradeNo=<訂單的 merchant_trade_no>&TradeAmt=<total_amount>&TradeStatus=1`（不帶 CheckMacValue）→ 呼叫 `POST /api/orders/:id/check-payment` → 實際：訂單從 `pending` 變成 **`paid`**；預期：驗章失敗、回 500 `ECPAY_QUERY_ERROR`，訂單維持 `pending`。
- **修正方向**：一律呼叫 `verifyCheckMacValue`（它在缺值時本來就會回傳 false），不要用欄位存不存在來決定要不要驗。

### 問題 3：免運門檻用 `>`，小計剛好 1,500 元仍收運費　【運費計算】

- **嚴重度**：高
- **發現者**：security-reviewer（SEC-4）、code-reviewer（CR-3）、test-runner
- **位置**：`src/utils/shipping.js:40`（`qualifiesForFreeShipping`）
- **問題說明**：程式寫 `subtotal > SHIPPING_RATES.FREE_SHIPPING_THRESHOLD`，但規格是「商品小計**滿** 1,500 元免基本運費」，應為 `>=`。`tests/acceptance/coupon.test.js` 也期望折扣後剛好 1,500 元要免運。
- **重現情境**：`calculateShipping({ subtotal: 1500, method: 'home_delivery' })` → 實際 `qualifiesForFreeShipping=false`、`shippingFee=120`、`totalAmount=1620`；預期 `true`、`0`、`1500`。用 API 下單時宅配多收 120 元，超商多收 60 元。
- **修正方向**：改成 `>=`。

### 問題 4：購物車 PATCH 數量沒有驗證正整數　【購物車數量】

- **嚴重度**：高
- **發現者**：security-reviewer（SEC-2）、code-reviewer（CR-4）、test-runner
- **位置**：`src/routes/cartRoutes.js:296-299`（`PATCH /api/cart/:itemId` handler）
- **問題說明**：程式只用 `Number(quantity)` 加上 `isNaN` 檢查，沒有像 POST 一樣使用 `parsePositiveInteger`。因此 `0`、`-5`、`1.5`、`""`、`null`、`true` 都會通過。規格要求 quantity 必須是正整數，不符合時回 400 `VALIDATION_ERROR`。
- **重現情境**：
  - `PATCH /api/cart/<id>`，body `{ "quantity": 1.5 }` → 實際回 200，並寫入 1.5。購物車總額變成 price × 1.5，結帳金額與扣庫存都會是小數；預期回 400。
  - body `{ "quantity": 0 }` 或 `{ "quantity": -5 }` → 實際被資料庫的 CHECK 擋下，回 **500**；預期回 400 `VALIDATION_ERROR`。（security-reviewer 也指出，若沒有 DB CHECK，負數會壓低訂單金額並反向增加庫存。）
- **修正方向**：改用 `parsePositiveInteger(quantity)`，回傳 `null` 時回 400。

### 問題 5：免運邊界測試被 `it.skip`，掩蓋了問題 3　【測試】

- **嚴重度**：中
- **發現者**：code-reviewer（CR-5）、security-reviewer（SEC-5）、test-runner
- **位置**：`tests/shipping.test.js:29`（`it.skip('商品小計 1,500 元時免基本運費')`）
- **問題說明**：唯一的門檻邊界測試被停用，所以問題 3 存在時測試仍然全綠。這個測試的期望值本身是正確的。另外，問題 1、2、4 也都缺少對應的負向測試：
  - `tests/orders.test.js`：沒有「會員 B 查會員 A 的訂單應回 404」。
  - `tests/integration/order-checkout.integration.test.js`：偽造回應只測了「簽章錯誤」與「金額不符」，沒有「不帶 CheckMacValue」。
  - `tests/cart.test.js`：PATCH 只測合法值 3，沒有測 0、負數、小數。
- **重現情境**：把 `it.skip` 改成 `it`，再跑 `npm run test:unit` → 實際：該測試失敗（得到 `false` / `120`）。
- **修正方向**：移除 `.skip`，並補上上述各問題的回歸測試。

---

## 其他觀察（本次不修正）

| 編號 | 位置 | 說明 | 嚴重度 |
|------|------|------|--------|
| SEC-6 | `src/routes/pageRoutes.js:61-72`（`GET /ecpay/payment/:orderId`） | 付款表單頁不需要登入，也不檢查訂單歸屬。知道訂單 uuid 就能看到品項與金額。uuid 難以猜測，所以列為低。 | 低 |
| SEC-7 | `src/utils/ecpay.js:4-7`（`ECPAY_CONFIG`） | 缺少環境變數時，會退回綠界公開的 staging 測試憑證。建議在 production 環境缺值時直接啟動失敗。 | 低 |

其他測試缺口（寬鬆斷言、未測的邊界值等）詳見各 SubAgent 的原始報告。重點如下：
- `tests/cart.test.js:134` 只檢查 `total` 屬性存在，沒有驗證數值。
- `tests/adminOrders.test.js` 的篩選測試在結果為空陣列時不會執行任何斷言。
- 沒有測 `action: 'fail'` 的模擬付款。
