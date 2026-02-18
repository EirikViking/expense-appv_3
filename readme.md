# Expense App v3 (MVP)

Personal expense analytics app for Norwegian bank and credit card data.

## Features
- XLSX upload and parsing (credit cards)
- PDF upload and text extraction (bank statements)
- Transaction and file deduplication (SHA256)
- Session authentication with Secure HttpOnly cookies
- Admin user management (invite + reset links, role/active controls)
- Norwegian date and number formats

## Tech stack
- Frontend: React, Vite, TypeScript, Tailwind
- Backend: Cloudflare Worker (Hono)
- Database: Cloudflare D1 (SQLite)
- Monorepo: pnpm workspaces

## Development

```bash
pnpm install
pnpm dev:web     # http://localhost:5173
pnpm dev:worker  # http://localhost:8788
```

## Auth bootstrap and invite flow (CLI)

Local verification sequence (cookie-based auth, no localStorage token):

```bash
API_BASE=http://localhost:8788
COOKIE_JAR=.cookies.txt

# 1) First run: no users -> bootstrap required
curl -s -i "$API_BASE/auth/me"

# 2) Create first admin (sets session cookie)
curl -s -i -c "$COOKIE_JAR" -b "$COOKIE_JAR" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"admin@example.com","name":"Admin","password":"StrongPass123"}' \\
  "$API_BASE/auth/bootstrap"

# 3) Confirm authenticated user context
curl -s -i -c "$COOKIE_JAR" -b "$COOKIE_JAR" "$API_BASE/auth/me"

# 4) Create a new user and capture invite token from JSON
curl -s -i -c "$COOKIE_JAR" -b "$COOKIE_JAR" \\
  -H "Content-Type: application/json" \\
  -d '{"email":"user@example.com","name":"Regular User","role":"user"}' \\
  "$API_BASE/admin/users"

# 5) Set first password with invite token (replace INVITE_TOKEN)
curl -s -i -H "Content-Type: application/json" \\
  -d '{"token":"INVITE_TOKEN","password":"UserPass123"}' \\
  "$API_BASE/auth/set-password"

# 6) Login as invited user (separate cookie jar)
curl -s -i -c user.cookies -b user.cookies \\
  -H "Content-Type: application/json" \\
  -d '{"email":"user@example.com","password":"UserPass123","remember_me":true}' \\
  "$API_BASE/auth/login"

# 7) Verify protected endpoint works as invited user
curl -s -i -c user.cookies -b user.cookies "$API_BASE/transactions?limit=1"
```

## Production diagnostics (CLI)

These scripts talk to the deployed API and require an admin password in your shell environment.

Set:
- `RUN_REBUILD_PASSWORD`

Then run:

```bash
pnpm run diag:prod -- --from 2025-01-01 --to 2025-04-06
pnpm run verify:prod -- --from 2025-01-01 --to 2025-04-06
```

To ingest a local PDF without using the frontend uploader:

```bash
pnpm run ingest:pdf -- --file path/to/statement.pdf
```

To skip validation (not recommended):

```bash
pnpm run ingest:pdf -- --file path/to/statement.pdf --no-verify
pnpm run ingest:xlsx -- --file path/to/statement.xlsx --no-verify
```

## Production deploy verification

Frontend production deploy is triggered by pushing `origin/main` (Cloudflare Pages).

Quick checks:

```bash
curl -s https://expense-appv-3.pages.dev/build.txt
curl -I https://expense-appv-3.pages.dev/favicon.svg
```

In the app UI, open Settings and confirm the footer label `Build: <sha>` matches `build.txt`.

If `apps/worker` changes, deploy Worker production explicitly after merge.

## Storebrand "Detaljer" PDF Parsing

The backend parser supports Storebrand "Detaljer" PDFs using a block parser:
- Transaction start sentinel: `Beløp ... <CURRENCY>` (amount is parsed only from this line)
- Description: `Transaksjonstekst ...`
- Merchant hint (optional): `Butikk ...`
- Dates: prefers the `Bokført` date from the 4-date row following the header line `... Bokført Rentedato Tilgjengelig`

If the parser returns zero transactions, the API responds with HTTP `422`:
- `code: "PDF_NO_TRANSACTIONS"`
- `message`: user-friendly text
- `debug.stats`: parse stats including Storebrand Detaljer block counts and up to 3 redacted rejected blocks
