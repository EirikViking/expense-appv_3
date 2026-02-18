function normalizeText(input: unknown): string {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Ã¸/g, 'o')
    .replace(/Ã¦/g, 'ae')
    .replace(/Ã¥/g, 'a')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(text: string, needles: string[]): boolean {
  for (const needle of needles) {
    if (text.includes(needle)) return true;
  }
  return false;
}

export function getCategoryHint(combinedText: unknown, amount: number): string | null {
  const text = normalizeText(combinedText);
  if (!text) return null;

  // Most specific first.
  if (hasAny(text, ['google play', 'apple.com/bill']) && amount < 0) return 'cat_bills_memberships';
  if (/\b(bolt|uber|taxi)\b/.test(text) && amount < 0) return 'cat_transport_taxi_uber';
  if (hasAny(text, ['paypal :tidal', 'tidalmusica', 'tidal'])) return 'cat_entertainment_streaming';
  if (hasAny(text, ['felleskonto'])) return 'cat_bills_housing_shared';
  if (hasAny(text, ['talkmore'])) return 'cat_bills_internet';
  if (hasAny(text, ['clasohlson', 'clas ohlson', 'clas ohl'])) return 'cat_shopping_home';
  if (hasAny(text, ['eivind heggedal'])) return 'cat_other_p2p';
  if (hasAny(text, ['flamingotours', 'flamingo tours'])) return 'cat_travel';
  if (hasAny(text, ['omkostninger']) && hasAny(text, ['innbet utland', 'utlandsbetaling'])) return 'cat_bills';
  if (hasAny(text, ['visa-kostnad', 'arspris kort med visa', 'kort med visa -'])) return 'cat_bills';
  if (hasAny(text, ['vita', 'arnika'])) return 'cat_health_personal_care';
  if (hasAny(text, ['pensjon eller trygd']) && amount > 0) return 'cat_income_salary';

  if (hasAny(text, ['trumf'])) {
    return amount > 0 ? 'cat_income_refund' : 'cat_food_groceries';
  }

  if (hasAny(text, ['klarna'])) return 'cat_shopping';
  if (hasAny(text, ['paypal :'])) return 'cat_shopping';

  return null;
}
