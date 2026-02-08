import { describe, expect, it } from 'vitest';
import { buildCombinedText, passesGuards, trainNaiveBayes } from './other-reclassify';

describe('other-reclassify', () => {
  it('buildCombinedText includes merchant + description for matching', () => {
    const combined = buildCombinedText('REMA 1000 SORENGA', 'Varekjøp noe som ikke inneholder rema');
    expect(combined).toContain('rema 1000 sorenga');
  });

  it('passesGuards blocks groceries unless grocery hint exists', () => {
    expect(
      passesGuards({
        predicted_category_id: 'cat_food_groceries',
        amount: -100,
        combined_text: 'apple.com/bill subscription',
      })
    ).toBe(false);

    expect(
      passesGuards({
        predicted_category_id: 'cat_food_groceries',
        amount: -100,
        combined_text: 'varekjøp rema 1000 sorenga',
      })
    ).toBe(true);
  });

  it('naive bayes can learn groceries from merchant-only signal', () => {
    const examples = [
      { category_id: 'cat_food_groceries', text: 'rema 1000 sorenga varekjøp' },
      { category_id: 'cat_food_groceries', text: 'kiwi 505 barcode' },
      { category_id: 'cat_food_groceries', text: 'meny bjorvika' },
      { category_id: 'cat_food_groceries', text: 'coop extra' },
      { category_id: 'cat_food_groceries', text: 'joker' },
      { category_id: 'cat_food_groceries', text: 'spar' },
      { category_id: 'cat_food_groceries', text: 'obs' },
      { category_id: 'cat_food_groceries', text: 'rema varekjøp' },
      { category_id: 'cat_food_groceries', text: 'kiwi varekjøp' },
      { category_id: 'cat_food_groceries', text: 'meny varekjøp' },
      { category_id: 'cat_other_subscriptions', text: 'apple.com/bill subscription' },
      { category_id: 'cat_other_subscriptions', text: 'google one subscription' },
      { category_id: 'cat_other_subscriptions', text: 'netflix.com subscription' },
      { category_id: 'cat_other_subscriptions', text: 'hbomax help' },
      { category_id: 'cat_other_subscriptions', text: 'spotify subscription' },
      { category_id: 'cat_other_subscriptions', text: 'icloud subscription' },
      { category_id: 'cat_other_subscriptions', text: 'anthropic subscription' },
      { category_id: 'cat_other_subscriptions', text: 'replit subscription' },
      { category_id: 'cat_other_subscriptions', text: 'openrouter subscription' },
      { category_id: 'cat_other_subscriptions', text: 'claude.ai subscription' },
    ];

    const { score } = trainNaiveBayes(examples, { minDocsPerCat: 3, alpha: 1 });
    const s = score('rema 1000 sorenga');
    expect(s?.topCat).toBe('cat_food_groceries');
  });
});

