import { describe, expect, it } from 'vitest';
import type { BudgetTrackingPeriod, CategoryBreakdown, MerchantBreakdown } from '@expense/shared';
import { buildBudgetSurplusPlan } from '@/pages/Insights';

const categories: CategoryBreakdown[] = [
  {
    category_id: 'cat_food_groceries',
    category_name: 'Groceries',
    category_color: '#22c55e',
    parent_id: 'cat_food',
    total: 4200,
    count: 18,
    percentage: 35,
  },
];

const merchants: MerchantBreakdown[] = [
  { merchant_id: 'm1', merchant_name: 'KIWI', total: 2100, count: 8, avg: 262.5, trend: 0 },
];

function makePeriod(partial: Partial<BudgetTrackingPeriod>): BudgetTrackingPeriod {
  return {
    period: 'monthly',
    label: 'Måned',
    start_date: '2026-02-01',
    end_date: '2026-02-28',
    budget_amount: 10000,
    spent_amount: 4000,
    remaining_amount: 6000,
    progress_ratio: 0.4,
    status: 'on_track',
    days_elapsed: 14,
    days_total: 28,
    days_remaining: 14,
    projected_spent: 8000,
    projected_variance: -2000,
    ...partial,
  };
}

describe('buildBudgetSurplusPlan', () => {
  it('returns a plan with distributed ideas when ahead of schedule', () => {
    const plan = buildBudgetSurplusPlan({
      lang: 'nb',
      currentLanguage: 'nb',
      categories,
      merchants,
      budgetTracking: [makePeriod({ spent_amount: 3800, days_elapsed: 14, days_total: 28 })],
    });

    expect(plan).not.toBeNull();
    expect(plan?.period).toBe('monthly');
    expect(plan?.surplusAmount).toBe(1200);
    expect(plan?.ideas).toHaveLength(4);
    expect(plan?.ideas.reduce((sum, idea) => sum + idea.amount, 0)).toBe(plan?.surplusAmount);
  });

  it('returns null when there is no meaningful surplus', () => {
    const plan = buildBudgetSurplusPlan({
      lang: 'nb',
      currentLanguage: 'nb',
      categories,
      merchants,
      budgetTracking: [makePeriod({ spent_amount: 5000, days_elapsed: 14, days_total: 28 })],
    });

    expect(plan).toBeNull();
  });
});
