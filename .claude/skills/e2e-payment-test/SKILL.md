---
name: e2e-payment-test
description: 花漾生活 Bloom & Co. 綠界（ECPay）完整金流 E2E 測試。當使用者要求「跑金流 E2E」「測試付款流程」「ATM 付款測試」「綠界結帳測試」「端對端付款測試」或要驗證「從商品頁到綠界取號完成訂單」時使用。透過 Playwright MCP 自動化瀏覽器，涵蓋正常流程（登入→加入購物車→結帳→綠界→ATM→臺灣土地銀行→取號）與異常情境（欄位驗證錯誤、付款失敗/取消）。
---

# E2E 金流測試 — 綠界 ATM 完整流程

## 測試目標

驗證花漾生活前台從「進入商品頁」到「綠界後台成功建立訂單（ATM 取號）」的完整金流串接，並涵蓋異常情境，確保金流整合穩定可重複測試。

- **金流商**：綠界 ECPay，**staging 測試環境**（MerchantID `3002607`，AIO 端點 `https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5`）。
- **付款方式（本測試）**：ATM 網路 ATM 轉帳 →「臺灣土地銀行」→ 取號成功（虛擬帳號產生即代表綠界後台訂單建立成功；ATM 性質為「取號後待轉帳」，訂單狀態維持 `pending`）。

## 前置條件

| 項目 | 內容 |
|------|------|
| 伺服器 | `http://localhost:3001`（若未啟動：於專案根目錄執行 `npm run dev:server`，或 `npm start`） |
| 測試帳號 | `admin@hexschool.com` / `12345678`（seed 管理員，勿另行註冊帳號） |
| 自動化工具 | **Playwright MCP**（主要）。亦可用 Chrome DevTools MCP / Claude in Chrome 替代 |
| 環境變數 | `.env` 須含 `ECPAY_MERCHANT_ID`/`ECPAY_HASH_KEY`/`ECPAY_HASH_IV`/`ECPAY_ENV=staging`、`JWT_SECRET` |

## 系統金流串接（背景知識）

1. 結帳送單 → `POST /api/orders`，建立 `pending` 訂單，回傳 `paymentUrl = /payment/ecpay/:orderId`。
2. 瀏覽器導向 `/payment/ecpay/:orderId` → 後端計算 `CheckMacValue`，渲染**自動送出的隱藏表單**，POST 至綠界 AIO（`ChoosePayment: ALL`，故綠界頁可自選付款方式）。
3. 綠界 staging 收銀台 → 選 **ATM** → 選 **臺灣土地銀行** → **取號**（產生繳費虛擬帳號）。
4. 綠界以 `OrderResultURL = /payment/result?orderId=...` 導回 → 前端 `payment-result` 觸發 `POST /api/orders/:id/verify`（呼叫綠界 `QueryTradeInfo/V5`）。
5. ATM 取號後 `TradeStatus = '0'`（已成立、未繳費）→ 結果頁顯示「交易確認中／訂單已成立，尚未完成付款」。**此即綠界後台訂單建立成功**。

## Playwright MCP 指令對照

| 動作 | Playwright MCP 工具 |
|------|--------------------|
| 開啟頁面 | `browser_navigate({ url })` |
| 讀取可操作元素（取得 ref） | `browser_snapshot()` |
| 點擊 | `browser_click({ element, ref })` |
| 輸入文字 | `browser_type({ element, ref, text })` 或 `browser_fill_form` |
| 下拉選單 | `browser_select_option({ element, ref, values })` |
| 等待 | `browser_wait_for({ text })` / `{ time }` |
| 截圖（每步留證） | `browser_take_screenshot({ filename })` |
| 視窗大小 | `browser_resize({ width, height })` |
| 執行 JS（必要時） | `browser_evaluate({ function })` |

> 綠界頁面為外部站台，按鈕/欄位文字可能微調；一律先 `browser_snapshot()` 依**可見文字/可及性名稱**定位（如「ATM」「臺灣土地銀行」「確認」），勿寫死 CSS selector。

---

## 正常流程（Happy Path）— 主測試案例

> 每一步驟結束都 `browser_take_screenshot` 留證，檔名依序 `e2e-01-...` ～ `e2e-09-...`，存於 `docs/e2e/`。

1. **開啟首頁**：`browser_navigate('http://localhost:3001/')`。確認頁面標題含「花漾生活」。
2. **登入**：
   - `browser_navigate('http://localhost:3001/login')`
   - 於「Email」欄輸入 `admin@hexschool.com`、「密碼」欄輸入 `12345678` → 點「登入」。
   - 等待導回首頁，頁首出現「登出」即登入成功。
3. **加入一個品項到購物車**：
   - 回首頁，於任一商品卡點「加入購物車」（或進商品詳情頁點「加入購物車」）。
   - 確認出現「已加入購物車」通知、頁首購物車數量 +1。
4. **進行結帳**：
   - `browser_navigate('http://localhost:3001/cart')` → 點「前往結帳」。
   - 於 `/checkout` 填寫：收件人姓名「測試員」、電子郵件 `admin@hexschool.com`、收件地址「台北市大同區迪化街一段 100 號」。
   - 點「確認下單」→ 頁面導向 `/payment/ecpay/:orderId`（隨即自動轉送綠界）。
5. **進入綠界金流（staging 收銀台）**（網址 `payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5`，標題「選擇支付方式」）：
   - `browser_wait_for` 綠界頁載入；確認「訂單資訊」明細與金額正確。
   - **(a) 選擇 ATM 網路交易**：於「付款方式」清單點 **「網路ATM」**（即圖示的「ATM 網路交易」；WebATM 為即時交易）。
     - 註：綠界另有 **「ATM虛擬帳號」**＝取號待繳，選它則訂單停留 `pending`（虛擬帳號頁即代表綠界後台建單成功）。本測試走「網路ATM」可在 staging 完成付款。
   - **(b) 選擇銀行**：於「選擇銀行」下拉（`browser_select_option`）選「**台灣土地銀行**」→ 點「**前往付款**」→ 跳出提醒視窗點「**關閉**」（關閉後即導向模擬繳費頁）。
6. **完成模擬繳費**：staging 導向綠界模擬頁 `pay-stage.ecpay.com.tw/MockMPPost/LandWebAtm`（土地銀行 WebATM 模擬，已預填 `RC=0`／`MSG=交易成功`／金額）→ 點 **「Save」** 送出模擬成功的繳費結果。此即代表**綠界後台成功建立並完成該筆交易**。
7. **導回結果頁**：綠界導回 `/payment/result?orderId=...`，前端自動觸發 verify 向綠界查詢 → 顯示 **「付款成功」**＋綠界交易編號。
8. **驗證訂單**：點「查看訂單」進入 `/orders/:id`（或 `browser_navigate('/orders')`）→ 確認訂單狀態 **「已付款」**、金額正確、顯示綠界交易編號與付款時間。

### 預期結果（正常流程）
- ✅ 成功登入並建立含 1 項商品的訂單。
- ✅ 綠界 staging 收銀台可選「網路ATM」→ 台灣土地銀行 → 前往付款。
- ✅ 模擬繳費頁（LandWebAtm）點 Save → 導回結果頁顯示 **「付款成功」**＋綠界交易編號。
- ✅ 訂單詳情狀態為 **「已付款」**，記錄綠界交易編號與付款時間（即綠界後台訂單建立成功）。

---

## 異常情境

### A. 結帳欄位驗證錯誤
- 於 `/checkout` **不填**收件人姓名（或填入格式錯誤的 Email，如 `abc`）即點「確認下單」。
- **預期**：表單不送出，對應欄位下方出現紅字錯誤（「請輸入收件人姓名」／「Email 格式不正確」），欄框轉為朱赭色，停留在結帳頁、未建立訂單。

### B. 登入失敗
- 以錯誤密碼登入（`admin@hexschool.com` / `0000`）。
- **預期**：顯示「Email 或密碼錯誤」通知，停留在登入頁、未取得 token。

### C. 付款失敗 / 取消
- 在綠界收銀台選擇「信用卡」並使用綠界測試**失敗卡號**（例：`4000 2211 1111 1111`，或於 3D 驗證頁取消），或直接於綠界頁取消交易。
- **預期**：綠界回傳失敗 → 導回 `/payment/result` 顯示「付款失敗／交易確認中」；訂單狀態維持 `pending`，使用者可於訂單詳情點「前往綠界付款」重試（系統會重新產生 `MerchantTradeNo` 避免「訂單編號重覆」）。

### D. 空購物車結帳
- 清空購物車後直接 `POST /api/orders`。
- **預期**：回 400「購物車為空」，不建立訂單。

---

## 錄影（電腦內建螢幕錄製）

本流程需錄影「呼叫 Skill → 瀏覽器自動化 → 綠界後台訂單建立成功」。

- **Windows 內建（Xbox Game Bar）**：按 `Win + Alt + R` 開始/停止錄製；影片存於 `C:\Users\<使用者>\Videos\Captures\`。（先按 `Win + G` 可開啟 Game Bar 介面確認。）
- 建議流程：**先按 `Win + Alt + R` 開始錄影 → 再呼叫本 Skill 執行 Playwright 自動化 → 看到綠界取號成功頁後停止錄影**。
- 注意：Playwright MCP 若以 headless（無視窗）模式執行，OS 螢幕錄影將拍不到瀏覽器畫面；此時請改用 headed 模式，或以 Playwright 內建 video 錄製，或以本 Skill 各步驟截圖（`docs/e2e/`）作為佐證。
- AI Agent 無法代替使用者啟動 OS 內建錄影（屬系統快捷鍵）；Agent 負責執行自動化與逐步截圖，OS 錄影由使用者觸發。

## 測試資料清理（選用）
- ATM 取號訂單會在 DB 留下 `pending` 訂單並扣減 1 庫存（符合金流測試預期，通常保留）。
- 如需還原：刪除該筆 `orders` 與其 `order_items`，並將對應商品 `stock + 數量`（參考既有清理腳本，使用 better-sqlite3 於交易中處理）。
