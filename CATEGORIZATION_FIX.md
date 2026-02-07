# Kategoriseringsfiks - Oppsummering

## Problem
Appen kategoriserte ikke utgifter fra nettbank-Excel-filer (eksporter.xlsx).

## Årsak
Merchant-utledningen (`deriveMerchantFromSpesifikasjon`) hadde ikke støtte for de spesifikke mønstrene i din nettbank-fil.

## Løsning Implementert

### 1. Forbedret Merchant-utledning (`xlsx-parser.ts`)

**Nye merchant-mønstre:**
- SATS, ANTHROPIC, CLAUDE.AI, OPENROUTER, REPLIT
- PAYPAL, FLYTOGET, LOVABLE, GOOGLE PLAY, APPLE, TV 2

**Vipps-transaksjoner:**
- Ekstraherer merchant fra "Vipps*Los Tacos" → "LOS TACOS"

**Varekjøp-transaksjoner:**
- Ekstraherer merchant fra "Varekjøp REMA SØRENGA..." → "REMA 1000"

**Bedre opprydding:**
- Fjerner "Notanr XXXXXXX" suffix
- Fjerner valuta/kurs-info ("USD 5,80 Kurs 986,72")
- Fjerner kortnummer ("427279XXXXXX6829")
- Fjerner "VISA VARE" prefix

### 2. Forbedret Overførings-deteksjon (`transfer-detect.ts`)

**Nye mønstre:**
- "betaling av kredittkort"
- "kredittkortregning"
- "felleskonto"
- "gebyr overført"
- "Til Anja" (personnavnmønster)
- Kontonummer-mønstre (XXXX.XX.XXXXX)

## Eksempler fra din fil

### Før:
```
"KIWI 505 BARCODE Notanr 74383766009800088550605"
→ merchant: undefined eller feil
```

### Etter:
```
"KIWI 505 BARCODE Notanr 74383766009800088550605"
→ merchant: "KIWI"
```

### Før:
```
"Vipps*Los Tacos Bjoervika Notanr 74987506002002677126098"
→ merchant: undefined
```

### Etter:
```
"Vipps*Los Tacos Bjoervika Notanr 74987506002002677126098"
→ merchant: "LOS TACOS"
```

### Før:
```
"Varekjøp REMA SØRENGA SØRENGKAIA 1 OSLO betal dato 2026-01-03"
→ merchant: undefined
```

### Etter:
```
"Varekjøp REMA SØRENGA SØRENGKAIA 1 OSLO betal dato 2026-01-03"
→ merchant: "REMA 1000"
```

### Overføringer (ekskluderes automatisk):
```
"Overføring - STOREBRAND BANK ASA Betalingsdato: 08.01.2026"
"Til Anja"
"betaling av kredittkortregning"
"9802.44.27714, Felleskonto ..."
```

## Neste steg

1. **Test filen i appen:**
   - Gå til Upload-siden
   - Last opp `eksporter.xlsx`
   - Sjekk at transaksjoner blir kategorisert

2. **Opprett regler:**
   - Gå til Settings → Rules
   - Lag regler for dine vanlige merchants (KIWI, SATS, etc.)
   - Reglene vil nå matche fordi merchant-feltet er riktig

3. **Verifiser:**
   - Sjekk at overføringer er ekskludert
   - Sjekk at merchant-feltet er riktig for alle transaksjoner
   - Sjekk at kategorisering fungerer

## Filer endret
- `apps/web/src/lib/xlsx-parser.ts` - Forbedret merchant-utledning
- `apps/worker/src/lib/transfer-detect.ts` - Forbedret overførings-deteksjon
