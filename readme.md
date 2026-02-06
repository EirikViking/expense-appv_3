# Expense App v3 (MVP)

Personal expense analytics app for Norwegian bank and credit card data.

## Features
- XLSX upload and parsing (credit cards)
- PDF upload and text extraction (bank statements)
- Transaction and file deduplication (SHA256)
- JWT authentication
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

## Production diagnostics (CLI)

These scripts talk to the deployed API and require an admin password in your shell environment.

Set one of:
- `RUN_REBUILD_PASSWORD`
- `ADMIN_PASSWORD`

Then run:

```bash
pnpm run diag:prod -- --from 2025-01-01 --to 2025-04-06
pnpm run verify:prod -- --from 2025-01-01 --to 2025-04-06
```

To ingest a local PDF without using the frontend uploader:

```bash
pnpm run ingest:pdf -- --file path/to/statement.pdf
```
