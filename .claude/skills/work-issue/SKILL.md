---
name: work-issue
description: 以 GitHub Issue 驅動開發，處理一個帶 ready 標籤的 Issue：讀 Issue → 改標籤 → 開分支 → 實作與補測試 → 派 test-runner 驗證 → 更新 docs 與 openapi.json → 開 PR → 派 reviewer 檢查 → 標成 in-review 後停下。當使用者輸入 /work-issue <編號>，或要求「處理 Issue #N」「做這個 Issue」時使用。不會合併 PR。
argument-hint: <issue 編號>
---

# work-issue — Issue 驅動開發

用法：`/work-issue <編號>`（例如 `/work-issue 1`）。`$ARGUMENTS` 即 Issue 編號；未提供時先問使用者，不要自行挑選 Issue。

## 標籤狀態機

| 標籤 | 意義 | 誰來設 |
|------|------|--------|
| `ready` | 可交給 AI | 使用者 |
| `in-progress` | AI 處理中 | 本 Skill（步驟 1） |
| `in-review` | PR 已開、待人工合併 | 本 Skill（步驟 9） |
| `needs-human` | 需人工介入 | 本 Skill（遇到「停止條件」時） |

同一時間只保留其中一個標籤：切換時用 `gh issue edit <N> --remove-label <舊> --add-label <新>`。

## 步驟

### 1. 讀 Issue 並確認可以開工
```bash
gh issue view <N> --json number,title,body,author,labels,state
gh api user --jq .login
```
必須**全部**符合才繼續，否則停下並說明原因（不改標籤）：
- `state` 為 `OPEN`
- 標籤含 `ready`
- `author.login` 等於目前 `gh` 登入的帳號（只處理自己開的 Issue）

符合後把標籤改為 `in-progress`：
```bash
gh issue edit <N> --remove-label ready --add-label in-progress
```
從 Issue 內文整理出：功能規格、驗收條件、指定的驗收測試檔與指令（`## 驗收測試` 段落，例如 `npm run test:acceptance -- coupon`）、「不在本次範圍」清單。

### 2. 從最新的 main 開分支
```bash
git checkout main && git pull origin main
git checkout -b issue-<N>-<簡短英文名稱>   # 例：issue-1-coupon
```
開始前工作目錄必須乾淨（`git status --short` 無輸出）；不乾淨就停下來問使用者，不要 stash 或丟棄別人的變更。

### 3. 實作
- 先讀 `CLAUDE.md`、`docs/ARCHITECTURE.md`、`docs/FEATURES.md` 與相關原始碼，沿用既有慣例：
  - API 回應統一 `{ data, error, message }`，錯誤時 `data: null`，欄位用 snake_case
  - 商業規則放 `src/utils/` 的純函式模組（比照 `shipping.js`），路由只負責驗證與串接
  - 會寫入資料的流程維持 `db.transaction()`；驗證失敗必須在 transaction 之前回 400，不能有副作用
  - 新增 DB 欄位用 `src/database.js` 既有的 migration 寫法（先 `PRAGMA table_info` 檢查再 `ALTER TABLE`）
- 讀驗收測試檔了解實際 API 路徑、請求與回應格式（**以驗收測試為準**），但**只讀不改**。
- 只做 Issue 範圍內的事；「不在本次範圍」列出的項目不要做。

### 4. 補上 Unit 或 Integration Test
- 純函式模組 → `tests/<module>.test.js`，用 `it.each` table-driven，涵蓋邊界值與錯誤情境
- API 流程與資料庫副作用 → `tests/integration/*.integration.test.js`（CI 不跑驗收測試，核心流程要在這裡有保護）
- 測試一律使用記憶體 SQLite，不得動到專案的 `database.sqlite`

### 5. 派 test-runner 驗證
派出 `test-runner` SubAgent，依序執行：
1. `npm run test:unit`
2. `npm run test:integration`
3. 該 Issue 指定的驗收測試（例如 `npm run test:acceptance -- coupon`）

並請它執行 `git diff --stat main -- tests/acceptance`，確認輸出為空。
有失敗就回到步驟 3 修正後重派，**不得**為了通過而修改、跳過（`it.skip`）或刪除測試。

### 6. 更新文件與 OpenAPI
- 路由的 JSDoc `@openapi` 註解補上新的請求／回應欄位與錯誤碼（會員端與後台端都要檢查）
- 執行 `npm run openapi` 重新產生 `openapi.json`
- 依變更更新 `docs/FEATURES.md`（功能、規則、錯誤碼、測試數量）、`docs/ARCHITECTURE.md`（目錄、資料表、資料流）、`docs/TESTING.md`（測試檔清單）、`docs/CHANGELOG.md`（`[Unreleased]` 下的既有分類，不要重複建立同名標題）
- 若新欄位會出現在前台或後台畫面（例如金額明細），同步更新 `views/`，避免畫面上的數字對不起來

### 7. Commit、推送並開 PR
提交前檢查：
```bash
git status --short
git diff --cached --stat -- tests/acceptance   # 必須為空
git diff --cached | grep -iE "sk-|ghp_|gho_|AKIA|HASH_KEY=|HASH_IV=|password="   # 必須無命中
```
- 不得提交 `.env`、API Key、Token、密碼等機密
- Commit 訊息以 `feat:` / `fix:` 開頭並註明 `(#<N>)`

```bash
git push -u origin issue-<N>-<名稱>
gh pr create --base main --title "feat: <Issue 標題> (#<N>)" --body-file <描述檔>
```
PR 描述必須包含：
- 第一行 `Closes #<N>`
- 變更內容摘要
- 三組測試指令與結果（通過數）
- 「`tests/acceptance/` 未修改」的確認
- 不在本次範圍的項目

### 8. 派 reviewer 檢查 PR
同時派出 `code-reviewer` 與 `security-reviewer`，提供 Issue 編號與 `git diff main...<分支>`，要求：
- 對照 Issue 規格與驗收條件逐條檢查
- **必查** `git diff --stat main...<分支> -- tests/acceptance` 為空（終端機指令也可能改到檔案，不能只靠權限設定）
- 只讀，不改檔案、不在 GitHub 留言

處理結果：
- **「高」或「嚴重」**：必須修正 → 重派 test-runner → push → 再請 reviewer 確認
- 「中」「低」：成本低且在範圍內就順手修；否則在回報中列出，交由使用者決定
- 若 reviewer 發現 `tests/acceptance/` 被修改：還原該檔（`git checkout main -- tests/acceptance`），並在回報中說明

### 9. 標成 in-review 並停下
```bash
gh issue edit <N> --remove-label in-progress --add-label in-review
gh pr checks <PR 編號>
```
向使用者回報：PR 連結、測試結果、reviewer 結論（已修與未修的問題）、GitHub Actions 狀態，然後**停止**。

## 邊界（不可違反）

- **不合併 PR**：不得執行 `gh pr merge`、不得 push 到 `main`。合併由使用者在 GitHub 網頁確認 Actions 通過後手動進行，Issue 會由 `Closes #<N>` 自動關閉。
- **不修改 `tests/acceptance/`**：包含用 Edit 工具與任何終端機指令（`sed`、`>`、`git checkout` 其他版本等）。
- **不處理**：沒有 `ready` 標籤、不是自己開的、或已關閉的 Issue。
- **不擴大範圍**：只做 Issue 規格；「不在本次範圍」的項目不做。
- **不跳過測試**：不得新增 `it.skip`／`describe.skip`，不得刪改既有測試的期望值來迎合實作。
- **不跑 E2E**：`npm run test:e2e` 會寫入開發 DB 並連綠界 staging，除非使用者明確要求。
- **不提交機密**：`.env`、API Key、Token、密碼、HashKey/HashIV 一律不進版控。
- **不用破壞性 git 指令**：不 `push --force`、不 `reset --hard`、不刪除分支。

## 停止條件（改標 `needs-human` 並回報）

遇到以下情況時，執行 `gh issue edit <N> --remove-label in-progress --add-label needs-human`，說明卡在哪裡後停止：
- Issue 規格與驗收測試互相矛盾，或規格不足以判斷正確行為
- 必須修改 `tests/acceptance/` 才能通過驗收
- 同一個測試修正 3 次仍失敗
- 需要新的環境變數、外部服務憑證或安裝新套件
- reviewer 指出的「高」嚴重度問題需要超出 Issue 範圍的設計決策
