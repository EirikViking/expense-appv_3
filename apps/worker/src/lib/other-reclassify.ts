type TrainingExample = { category_id: string; text: string };

const STOP = new Set([
  'notanr',
  'kurs',
  'usd',
  'eur',
  'nok',
  'aud',
  'try',
  'sek',
  'dkk',
  'gbp',
  'chf',
  'payment',
  'betaling',
  'betal',
  'dato',
  'til',
  'fra',
  'as',
  'ab',
  'no',
  'www',
  'http',
  'https',
]);

function normalizeText(s: unknown): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildCombinedText(merchant: unknown, description: unknown): string {
  return normalizeText(`${merchant || ''} ${description || ''}`);
}

function tokenize(text: string): string[] {
  const t = normalizeText(text);
  if (!t) return [];
  // Keep norwegian letters; drop separators and most punctuation.
  const tokens = t
    .split(/[^a-z0-9æøå]+/i)
    .map((x) => x.trim())
    .filter((x) => x.length >= 3 && x.length <= 32);
  return tokens.filter((x) => !STOP.has(x));
}

function softmaxTop2(logA: number, logB: number): [number, number] {
  const m = Math.max(logA, logB);
  const ea = Math.exp(logA - m);
  const eb = Math.exp(logB - m);
  const sum = ea + eb;
  return [ea / sum, eb / sum];
}

export function trainNaiveBayes(
  examples: TrainingExample[],
  opts?: { minDocsPerCat?: number; alpha?: number }
): { score: (text: string) => null | { topCat: string; pTop: number; margin: number; secondCat: string | null } } {
  const minDocsPerCat = opts?.minDocsPerCat ?? 10;
  const alpha = opts?.alpha ?? 1;

  const byCat = new Map<string, { docs: number; tokenTotal: number; tokenCounts: Map<string, number> }>();
  const vocab = new Set<string>();

  for (const ex of examples) {
    const cat = ex.category_id;
    if (!cat || cat === 'cat_other') continue;
    const tokens = tokenize(ex.text);
    if (tokens.length === 0) continue;

    let st = byCat.get(cat);
    if (!st) {
      st = { docs: 0, tokenTotal: 0, tokenCounts: new Map() };
      byCat.set(cat, st);
    }

    st.docs++;
    for (const tok of tokens) {
      st.tokenTotal++;
      st.tokenCounts.set(tok, (st.tokenCounts.get(tok) || 0) + 1);
      vocab.add(tok);
    }
  }

  for (const [cat, st] of [...byCat.entries()]) {
    if (st.docs < minDocsPerCat) byCat.delete(cat);
  }

  const cats = [...byCat.keys()];
  const totalDocs = [...byCat.values()].reduce((a, s) => a + s.docs, 0);
  const V = Math.max(1, vocab.size);

  function score(text: string) {
    const tokens = tokenize(text);
    if (tokens.length === 0 || cats.length < 2 || totalDocs === 0) return null;

    const out: Array<[string, number]> = [];
    for (const cat of cats) {
      const st = byCat.get(cat)!;
      const prior = Math.log((st.docs + alpha) / (totalDocs + alpha * cats.length));
      let lp = prior;
      for (const tok of tokens) {
        const c = st.tokenCounts.get(tok) || 0;
        lp += Math.log((c + alpha) / (st.tokenTotal + alpha * V));
      }
      out.push([cat, lp]);
    }

    out.sort((a, b) => b[1] - a[1]);
    const [topCat, topLp] = out[0]!;
    const [secondCat, secondLp] = out[1] ?? [null as any, -Infinity];
    const margin = topLp - (secondLp ?? -Infinity);
    const [pTop] = softmaxTop2(topLp, secondLp ?? -Infinity);
    return { topCat, pTop, margin, secondCat: secondCat ?? null };
  }

  return { score };
}

export function passesGuards(params: {
  predicted_category_id: string;
  amount: number;
  combined_text: string;
}): boolean {
  const cat = params.predicted_category_id;
  const lower = normalizeText(params.combined_text);

  const isGroceryHint = /\b(kiwi|rema|meny|coop|extra|obs|spar|joker)\b/.test(lower);
  const isVippsHint = /\bvipps\b/.test(lower);
  const isTaxHint = /\bskatteetaten\b/.test(lower);

  return (
    (cat !== 'cat_food_groceries' || isGroceryHint) &&
    (cat !== 'cat_other_p2p' || isVippsHint) &&
    (cat !== 'cat_bills_tax' || isTaxHint) &&
    // Don't assign "Income" categories onto negative expenses.
    (!String(cat).startsWith('cat_income') || Number(params.amount) > 0)
  );
}

