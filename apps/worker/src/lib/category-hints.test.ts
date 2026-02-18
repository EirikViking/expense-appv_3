import { describe, expect, it } from 'vitest';
import { getCategoryHint } from './category-hints';

describe('category hints', () => {
  it('maps known Other merchants from real samples', () => {
    expect(getCategoryHint('Visa 100021 Bolt Oslo', -239.2)).toBe('cat_transport_taxi_uber');
    expect(getCategoryHint('Uber *Trip Help.Uber.Com', -119.5)).toBe('cat_transport_taxi_uber');
    expect(getCategoryHint('Taxi Sentrum AS', -450)).toBe('cat_transport_taxi_uber');
    expect(getCategoryHint('Visa 100032 Nok 1061,56 Klarna Ab', -1061.56)).toBe('cat_shopping');
    expect(getCategoryHint('Giro 3225 Talkmore AS AvtalegiroTalkmore AS', -239.2)).toBe('cat_bills_internet');
    expect(getCategoryHint('Visa 100331 Clasohlson.com/no', -1199)).toBe('cat_shopping_home');
    expect(getCategoryHint('Visa 100021 Vita', -879.15)).toBe('cat_health_personal_care');
    expect(getCategoryHint('Visa 100021 Arnika AS', -1478.4)).toBe('cat_health_personal_care');
    expect(getCategoryHint('Overførsel Utland 50243359 Flamingotours Aps Nok 929,00', -929)).toBe('cat_travel');
    expect(getCategoryHint('Omkostninger ... Innbet Utland ...', -50)).toBe('cat_bills');
    expect(getCategoryHint('Omkostninger utlandsbetaling 30,00 NOK STFB...', -30)).toBe('cat_bills');
    expect(getCategoryHint('Pensjon Eller Trygd 221840176 Nav', 15248)).toBe('cat_income_salary');
    expect(getCategoryHint('Visa 100321 Eivind Heggedal', -299)).toBe('cat_other_p2p');
    expect(getCategoryHint('Visa 100021 Paypal :tidalmusica', -59)).toBe('cat_entertainment_streaming');
  });

  it('handles trumf directionally and keeps unknown as null', () => {
    expect(getCategoryHint('BOLT transfer refund', 150)).toBeNull();
    expect(getCategoryHint('Giro 224254874 Trumf AS', -423.07)).toBe('cat_food_groceries');
    expect(getCategoryHint('Giro innbetaling Trumf bonus', 423.07)).toBe('cat_income_refund');
    expect(getCategoryHint('Overføring til Felleskonto', -8200)).toBe('cat_bills_housing_shared');
    expect(getCategoryHint('Ukjent leverandør abc123', -42)).toBeNull();
  });
});
