# Personal Expense Analytics Update Plan

## A. Triage and Reproduction Steps
1.  **Dashboard**: Visually inspect `http://localhost:5173`. Compare with "Insights" page to confirm similarity.
2.  **XLSX Header**: Run `pnpm test:e2e` (new test) with fixture `storebrand2021-dagens_dato_079126.xlsx`. Expect failure "Could not find header row".
3.  **PDF Invalid Rows**: Upload `storebrand2021-dagens_dato_079126.pdf`. Observe "4279 invalid rows skipped" in the upload result toast/dialog.
4.  **Income Bug**: set filter to "Last 3 Months" in Insights/Compare. Observe `Total Income` value.
5.  **Versioning**: Check footer. It is currently static or missing.
6.  **Large Transactions**: Find a transaction > 10,000 NOK. Verify it affects "Total Expenses".

### Preventative Playbook: Zombie Processes
> [!WARNING]
> **Risk**: Vite process from previous session handling port 5173 but serving old code.
> **Check**: Before starting dev, run `netstat -ano | findstr :5173` (Windows).
> **Fix**:
> 1. Stop all terminals.
> 2. `taskkill /F /IM node.exe` (Aggressive) or find specific PID.
> 3. Verify directory: `ls` to ensure you are in `expense-appv_3`.
> 4. Clean start: `pnpm dev:web`.

## B. Root Cause Hypotheses
1.  **Dashboard**: Design decision to reuse components led to lack of distinct purpose.
2.  **XLSX Header**: `findHeaderRow` in `xlsx-parser.ts` searches only first 20 rows, requires exact case-sensitive match for "Dato" and "Beløp", and handles spaces poorly.
3.  **PDF Invalid Rows**: `pdf-extractor.ts` uses simple Y-position grouping which fails on multi-line text or slight misalignments in PDF table rows, causing required fields (Date, Amount) to be missed in the reconstructed line.
4.  **Income Bug**: `SUM(amount > 0)` in `analytics.ts` includes internal transfers (e.g., "Transfer from Savings") which are not real income. It might also include initial account balance entries if imported.
5.  **Versioning**: No mechanism exists to inject git metadata into the build.
6.  **Large Transactions**: No "excluded" state exists in the data model; deletions are permanent and destructive.

## C. Proposed Code Changes

### Common / Shared
- `packages/shared/src/index.ts`: Add `is_excluded` to `Transaction` interface.

### Dashboard Redesign
- `apps/web/src/pages/Dashboard.tsx`: Complete rewrite.
  - Implement `SpendVelocityWidget` (VS Previous Month).
  - Implement `FunFactsWidget` (Randomized insights).
  - Implement `AnomaliesWidget` (Top 3 alerts).
  - Remove generic charts.

### XLSX Parsring
- `apps/web/src/lib/xlsx-parser.ts`:
  - `findHeaderRow`: Increase search window to 50 rows.
  - Normalization: `cell.v.toString().trim().toLowerCase()`.
  - Fuzzy Match: Allow "belop", "beløp (nok)", "utl. beløp".

### PDF Parsing
- `apps/web/src/lib/pdf-extractor.ts`:
  - Implement `return skipped_lines` with reasons.
  - Relax Y-grouping tolerance or use "Look-ahead" for hanging lines.
- `apps/worker/src/routes/ingest.ts`:
  - Pass `skipped_lines` info to the response.
- `apps/worker/src/lib/pdf-parser.ts`:
  - Better regex for "Amount" (handle distinct placement).

### Analytics & Fun Facts
- `apps/worker/src/routes/analytics.ts`:
  - New endpoint `GET /analytics/fun-facts`.
  - Update `buildWhereClause` to add `AND is_excluded = 0` by default.
  - Fix Income: Add `AND category_id NOT IN (SELECT id FROM categories WHERE name = 'Internal Transfer')` (requires identifying transfer category).
  - *Better approach*: Filter out `source_type` if it implies transfer, or use the new `is_excluded` flag on identified transfers.

### Versioning
- `scripts/generate-version.ts`: New script.
  - usages `git log -1 --format="%h %ci"` to get hash and date.
  - Writes `apps/web/src/version.ts`: `export const APP_VERSION = "v1.0.0-abcdef (2025-01-01 12:00)";`
- `apps/web/vite.config.ts` or `package.json`: Run this script before build/dev.
- `apps/web/src/components/Footer.tsx`: Display `APP_VERSION`.

### Large Transactions & Bulk Actions
- `apps/worker/src/routes/transactions.ts`:
  - `POST /transactions/:id/exclude`: Toggle `is_excluded`.
  - `POST /transactions/bulk-exclude`: `{ ids: [...] }` or `{ filter: {...} }`.

## D. Data Model Changes
1.  **Migration**: `migrations/002_add_excluded.sql`
    ```sql
    ALTER TABLE transactions ADD COLUMN is_excluded BOOLEAN DEFAULT 0;
    CREATE INDEX idx_transactions_excluded ON transactions(is_excluded);
    ```
2.  **Migration Strategy**:
    - Run `pnpm db:migrate:local` for dev.
    - Run `pnpm db:migrate:remote` for production (Worker).

## E. UI/UX Changes
1.  **Dashboard**:
    - *Velocity Gauge*: Visual color-coded (Green=Good, Red=Overspending).
    - *Fun Facts*: Card with "Did you know?" icon.
2.  **Upload Dialog**:
    - *Success*: "Imported 400 transactions."
    - *Warning*: "Imported 400. Skipped 50 duplicates. Skipped 10 invalid rows (Show Details)."
    - *Details*: Modal showing raw line content of skipped rows.
3.  **Transactions List**:
    - Row > 10,000 NOK: Highlighted background. Action button "Exclude".
    - Excluded rows: Greyed out, crossed out text (if "Show Hidden" is on).
4.  **Acceptance Criteria**:
    - User can identify and read "invalid row" reasons.
    - Income for 3 months matches "Salary + Dividends" only, not Transfers.
    - Dashboard tells a "story" (velocity, anomalies), not just data dump.

## F. Test Plan
1.  **Playwright (`e2e/`)**:
    - `parsing.spec.ts`: Upload fixtures/storebrand_tricky.xlsx. Assert 0 errors.
    - `dashboard.spec.ts`: Assert "Spending Velocity" widget exists.
    - `exclusion.spec.ts`: Mark 1 item excluded. Verify "Total Expenses" in Dashboard decreases.
    - `smoke.spec.ts`: Verify Version string in footer.
2.  **Manual QA Checklist**:
    - [ ] Upload real bank PDF. Check "Invalid Rows" count is < 1%.
    - [ ] Check "Total Income" for last 3 months.
    - [ ] Deploy Worker. Verify `/health`.
    - [ ] Deploy Pages. Verify `VITE_API_URL` connectivity.

## G. Deployment Plan
1.  **Worker (Manual)**:
    - Run `pnpm test` (Worker tests).
    - Run `pnpm db:migrate:remote`.
    - Run `pnpm run deploy:worker` (needs script alias for `wrangler deploy`).
    - *Verify*: `https://api.expense.app/health` returns 200.
2.  **Frontend (Auto)**:
    - Push to `main`.
    - *Verify*: Cloudflare Pages "Success". Check `APP_VERSION` in footer.

## H. Risk and Rollback
- **Risk**: `is_excluded` column missing in Prod causes 500 API errors.
  - *Mitigation*: Deploy Worker + Migration *before* Frontend uses the feature. Frontend gracefully handles missing field? No, Backend throws SQL error.
  - *Strict Order*: 1. Migrate DB. 2. Deploy Worker. 3. Deploy Frontend.
- **Rollback**:
  - `wrangler d1 execute ... --command "ALTER TABLE transactions DROP COLUMN is_excluded"` (if needed).
  - Revert git commit.

## Execution Output Requirements

### Prioritized Execution Order
1.  **Triage**: Reproduce all issues with new test fixtures.
2.  **Versioning**: Implement `scripts/generate-version.ts` (Quick win, helps debugging).
3.  **Backend Core**: Add `is_excluded` migration and API support.
4.  **Parsing Fixes**: Fix XLSX and PDF handling (High value).
5.  **Analytics Core**: Fix Income bug and add Fun Facts API.
6.  **Frontend Features**: Implement Dashboard and Bulk Actions.

### List of Files Likely to Change
- `package.json`
- `scripts/generate-version.ts` (NEW)
- `migrations/002_add_excluded.sql` (NEW)
- `apps/worker/src/routes/analytics.ts`
- `apps/worker/src/routes/transactions.ts`
- `apps/worker/src/routes/ingest.ts`
- `apps/web/src/pages/Dashboard.tsx`
- `apps/web/src/lib/xlsx-parser.ts`
- `apps/web/src/lib/pdf-extractor.ts`
- `apps/web/src/components/Footer.tsx`

### List of New Migrations
- `002_add_excluded.sql`

### Commit Strategy
- Commit 1: "feat: add automatic versioning script"
- Commit 2: "fix(parsing): improve xlsx and pdf extraction logic"
- Commit 3: "feat(backend): add is_excluded column and endpoints" (Deploy Worker here)
- Commit 4: "fix(analytics): correct income calculation and add fun facts" (Deploy Worker here)
- Commit 5: "feat(ui): redesign dashboard and add exclusion UI" (Deploy Pages here)

### Final Acceptance Checklist
- [ ] Dashboard shows "Spending Velocity" and "Fun Facts".
- [ ] "Total Income" (3 months) excludes internal transfers.
- [ ] XLSX Upload of `storebrand2021` succeeds.
- [ ] PDF Upload provides "skipped rows" report.
- [ ] Footer shows `vX.Y.Z (YYYY-MM-DD HH:mm)`.
- [ ] Transactions > 10k can be excluded via UI.
- [ ] Excluded transactions do not appear in Analytics totals.
