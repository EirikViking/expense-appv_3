const NB_CATEGORY_NAME_MAP: Record<string, string> = {
  'Food & Dining': 'Mat og servering',
  Groceries: 'Dagligvarer',
  Restaurants: 'Restauranter',
  'Coffee & Snacks': 'Kaffe og snacks',
  Transportation: 'Transport',
  Fuel: 'Drivstoff',
  'Public Transit': 'Kollektivtransport',
  Parking: 'Parkering',
  Shopping: 'Shopping',
  Clothing: 'Klær',
  Electronics: 'Elektronikk',
  'Home & Garden': 'Hjem og hage',
  Entertainment: 'Underholdning',
  'Streaming Services': 'Strømmetjenester',
  Games: 'Spill',
  'Events & Activities': 'Arrangementer og aktiviteter',
  'Bills & Utilities': 'Regninger og faste utgifter',
  Electricity: 'Strøm',
  'Internet & Phone': 'Internett og telefon',
  Insurance: 'Forsikring',
  'Health & Wellness': 'Helse og velvære',
  Pharmacy: 'Apotek',
  Fitness: 'Trening',
  Medical: 'Medisinsk',
  Travel: 'Reise',
  Lodging: 'Overnatting',
  Flights: 'Flyreiser',
  Income: 'Inntekt',
  Salary: 'Lønn',
  Refunds: 'Refusjoner',
  Transfers: 'Overføringer',
  Other: 'Annet',
  'Personal Care': 'Personlig pleie',
  'Memberships & Fees': 'Medlemskap og gebyrer',
  'P2P / Vipps': 'P2P / Vipps',
  'Home Services': 'Hjemmetjenester',
  Alcohol: 'Alkohol',
  Finance: 'Finans',
  Investments: 'Investeringer',
  'Rent / Shared costs': 'Husleie/Fellesutgifter',
  'Betaling av skatt': 'Betaling av skatt',
  'Gaver og veldedighet': 'Gaver og veldedighet',
};

const NB_CATEGORY_NAME_MAP_NORMALIZED: Record<string, string> = Object.fromEntries(
  Object.entries(NB_CATEGORY_NAME_MAP).map(([key, value]) => [key.toLowerCase(), value])
);

function isNorwegianLanguage(language: string): boolean {
  const normalized = String(language || '').toLowerCase();
  return normalized === 'nb' || normalized.startsWith('nb-') || normalized === 'no' || normalized.startsWith('no-');
}

export function localizeCategoryName(name: string | null | undefined, language: string): string {
  if (!name) return '';
  if (!isNorwegianLanguage(language)) return name;

  const normalizedName = name.trim().toLowerCase();
  return NB_CATEGORY_NAME_MAP[name] ?? NB_CATEGORY_NAME_MAP_NORMALIZED[normalizedName] ?? name;
}

