import { describe, expect, it } from 'vitest';
import type { AnalyticsCompareResponse, AnalyticsSummary, CategoryBreakdown, MerchantBreakdown, TimeSeriesPoint } from '@expense/shared';
import { buildCoachWisdom, buildSpendingQuiz } from '@/pages/Insights';

const summary: AnalyticsSummary = {
  total_income: 42000,
  total_expenses: 12000,
  net: 30000,
  pending_count: 0,
  pending_amount: 0,
  booked_count: 20,
  booked_amount: 12000,
  transaction_count: 20,
  avg_transaction: 600,
  period: { start: '2026-01-01', end: '2026-01-31' },
};

const categories: CategoryBreakdown[] = [
  {
    category_id: 'cat_food_groceries',
    category_name: 'Groceries',
    category_color: '#f87171',
    parent_id: 'cat_food',
    total: 3600,
    count: 12,
    percentage: 30,
  },
  {
    category_id: 'cat_transport_public',
    category_name: 'Public Transit',
    category_color: '#93c5fd',
    parent_id: 'cat_transport',
    total: 1200,
    count: 15,
    percentage: 10,
  },
];

const merchants: MerchantBreakdown[] = [
  { merchant_id: 'm1', merchant_name: 'Rema 1000', total: 2400, count: 8, avg: 300, trend: 0 },
  { merchant_id: 'm2', merchant_name: 'Meny', total: 1200, count: 4, avg: 300, trend: 0 },
  { merchant_id: 'm3', merchant_name: 'Kiwi', total: 900, count: 3, avg: 300, trend: 0 },
];

const timeseries: TimeSeriesPoint[] = [
  { date: '2026-01-10', income: 0, expenses: 420, net: -420, count: 2 },
  { date: '2026-01-11', income: 0, expenses: 830, net: -830, count: 3 },
  { date: '2026-01-12', income: 0, expenses: 510, net: -510, count: 2 },
];

describe('Insights quiz and coach', () => {
  it('builds a 3-question quiz with valid answer indexes', () => {
    const quiz = buildSpendingQuiz({
      lang: 'nb',
      currentLanguage: 'nb',
      summary,
      categories,
      merchants,
      timeseries,
    });

    expect(quiz).toHaveLength(3);
    for (const q of quiz) {
      expect(q.options.length).toBeGreaterThanOrEqual(3);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.correctIndex).toBeLessThan(q.options.length);
    }
  });

  it('praises the user when expense delta is down versus previous period', () => {
    const compare = {
      current: summary,
      previous: { ...summary, total_expenses: 14000 },
      change: { income: 0, expenses: -2000, net: 2000, count: 0 },
      change_percentage: { income: 0, expenses: -14.3, net: 0, count: 0 },
    } satisfies AnalyticsCompareResponse;

    const coach = buildCoachWisdom({
      lang: 'nb',
      summary,
      compare,
      categories,
      merchants,
      currentLanguage: 'nb',
    });

    expect(coach.praise.toLowerCase()).toContain('sterkt jobbet');
    expect(coach.bullets.length).toBeGreaterThanOrEqual(2);
  });
});
