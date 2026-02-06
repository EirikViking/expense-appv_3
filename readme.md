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
