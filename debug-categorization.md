# Kategoriserings-diagnose

## Problem
Appen kategoriserer ikke utgifter fra nettbank-Excel-filer, men fungerer for kredittkort-PDF-filer.

## Årsak
Kategoriseringsreglene matcher basert på `merchant` + `description`. 

- **PDF-filer**: `merchant` ekstraheres direkte fra PDF-strukturen
- **XLSX-filer**: `merchant` utledes fra beskrivelsen via `deriveMerchantFromSpesifikasjon()`

Funksjonen `deriveMerchantFromSpesifikasjon()` har begrensninger:
1. Søker kun etter kjente butikknavn (REMA, KIWI, MENY, COOP, EXTRA, OBS, SPAR, JOKER)
2. Stripper prefikser (VISA, BANKAXEPT, KORTKJØP)
3. Tar første 1-3 tokens

## Løsningsforslag

### Alternativ 1: Forbedre merchant-utledning
Utvid `deriveMerchantFromSpesifikasjon()` til å håndtere flere mønstre fra din nettbank.

### Alternativ 2: Gjør regel-matching mer robust
Endre regel-motoren til å matche bedre når `merchant` mangler.

### Alternativ 3: Debug eksisterende data
Kjør en rapport på databasen for å se hvilke transaksjoner som mangler kategorier.

## Neste steg
1. Gi meg 3-5 eksempellinjer fra din nettbank-Excel-fil (anonymiser om nødvendig)
2. Eller: Kjør en SQL-query for å se hvilke XLSX-transaksjoner som mangler kategorier
3. Eller: Fortell meg hvilken nettbank du bruker (DNB, Nordea, Storebrand, etc.)

## SQL for debugging
```sql
-- Finn XLSX-transaksjoner uten kategori
SELECT 
  tx_date,
  description,
  merchant,
  amount,
  source_type
FROM transactions t
LEFT JOIN transaction_meta tm ON tm.transaction_id = t.id
WHERE t.source_type = 'xlsx'
  AND (tm.category_id IS NULL OR tm.category_id = '')
  AND t.is_excluded = 0
LIMIT 20;
```
