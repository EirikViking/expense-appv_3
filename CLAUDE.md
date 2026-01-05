# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal Expense Analytics - A production-ready expense tracking app for Norwegian bank and credit card statements. Monorepo with pnpm workspaces.

## Tech Stack

- **Frontend**: Vite, React, TypeScript, Tailwind CSS
- **Backend**: Cloudflare Worker with Hono
- **Database**: Cloudflare D1 (SQLite)
- **File storage**: Cloudflare R2 (optional)

## Commands

```bash
# Install dependencies
pnpm install

# Start development servers
pnpm dev:web          # Web app at http://localhost:5173
pnpm dev:worker       # Worker API at http://localhost:8788

# Build
pnpm build            # Build all packages
pnpm build:web        # Build web only
pnpm build:worker     # Build worker only

# Typecheck
pnpm typecheck        # Typecheck all packages

# Generate test fixtures
pnpm generate-fixtures

# Database migrations (local)
pnpm --filter worker db:migrate:local
```

## Architecture

### Monorepo Structure

```
apps/web/           # React frontend (Vite)
apps/worker/        # Cloudflare Worker API (Hono)
packages/shared/    # Shared types, schemas, constants
migrations/         # D1 SQL migrations
scripts/            # Utility scripts
sample_data/        # Test fixtures (gitignored)
```

### Critical Design Decisions

1. **PDF parsing split**: PDF text extraction happens in browser using pdfjs-dist, extracted text is sent to Worker for transaction parsing
2. **XLSX parsing**: Fully in browser using SheetJS, normalized transactions sent to Worker
3. **File deduplication**: SHA256 hash of file bytes, checked before processing
4. **Transaction deduplication**: SHA256 of `${tx_date}|${description.trim().toLowerCase()}|${amount}|${source_type}`

### Browser Crypto Guardrails

**CRITICAL**: The web app must use `globalThis.crypto.subtle` only. Node crypto imports are forbidden.

- `apps/web/src/crypto-shim.ts` - Throws fatal error if Node crypto is imported
- `apps/web/vite.config.ts` - Contains build-time guard that scans for forbidden patterns
- Vite aliases `crypto` and `node:crypto` to the shim

Forbidden patterns in apps/web and packages/shared:
- `from "crypto"` or `from 'crypto'`
- `from "node:crypto"` or `from 'node:crypto'`
- `require("crypto")` or `require("node:crypto")`
- `import * as crypto`
- `import crypto from`

### API Authentication

- Password-based login via `POST /auth/login`
- JWT stored in HttpOnly cookie (24h expiry)
- Protected routes: `/ingest/*`, `/transactions/*`

### Environment Variables

**Worker** (in wrangler.toml or .dev.vars):
- `ADMIN_PASSWORD` - Login password
- `JWT_SECRET` - JWT signing secret

**Web** (in .env):
- `VITE_API_URL` - Worker API URL for production (dev uses Vite proxy)
- `VITE_DEV_LOGS` - Enable debug logging (true/false)

**Development Note**: In dev mode, the web app uses a Vite proxy (`/api` -> `localhost:8788`) to avoid cross-origin cookie issues. The `VITE_API_URL` is only used in production builds.

## Norwegian Format Parsing

### XLSX (Credit Card)
- Columns: Dato, Bokført, Spesifikasjon, Sted, Valuta, Utl. beløp, Beløp
- Dates: DD.MM.YYYY
- Numbers: comma decimal, space thousands separator
- Header row detected dynamically
- All transactions marked as "booked"

### PDF (Bank Statement)
- Section marker "Reservasjoner" = pending transactions
- Section marker "Kontobevegelser" = booked transactions
- Line format: `DD.MM.YYYY  Description  -1 234,56`

## D1 Schema

Three tables in `migrations/001_initial.sql`:
- `ingested_files` - Tracks uploaded files by hash
- `transactions` - Normalized transactions with tx_hash for deduplication
- `category_rules` - Pattern matching rules for categorization

## API Endpoints

- `GET /health` - Health check
- `POST /auth/login` - Password login
- `POST /auth/logout` - Logout
- `POST /ingest/xlsx` - Ingest XLSX transactions
- `POST /ingest/pdf` - Ingest PDF (extracted text)
- `GET /transactions` - List transactions with filters
