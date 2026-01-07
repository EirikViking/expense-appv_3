import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { BudgetWithSpent, Category } from '@expense/shared';
import { BUDGET_PERIOD_TYPES } from '@expense/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, cn } from '@/lib/utils';
import {
  Plus,
  Pencil,
  Trash2,
  PiggyBank,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';
import { TransactionsDrilldownDialog } from '@/components/TransactionsDrilldownDialog';

export function BudgetsPage() {
  const [budgets, setBudgets] = useState<BudgetWithSpent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drilldown state
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownTitle, setDrilldownTitle] = useState('');
  const [drilldownSubtitle, setDrilldownSubtitle] = useState('');
  const [drilldownCategory, setDrilldownCategory] = useState<string | undefined>();
  const [drilldownDateFrom, setDrilldownDateFrom] = useState<string | undefined>();
  const [drilldownDateTo, setDrilldownDateTo] = useState<string | undefined>();

  // Edit/Create state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formPeriod, setFormPeriod] = useState<string>('monthly');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [budgetsRes, catsRes] = await Promise.all([
        api.getBudgets(),
        api.getCategories(),
      ]);
      setBudgets(budgetsRes.budgets);
      setCategories(catsRes.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const startCreate = () => {
    setIsCreating(true);
    setEditingId(null);
    setFormName('');
    setFormAmount('');
    setFormPeriod('monthly');
    setFormCategoryId('');
    setFormStartDate('');
    setFormEndDate('');
  };

  const startEdit = (budget: BudgetWithSpent) => {
    setEditingId(budget.id);
    setIsCreating(false);
    setFormName(budget.name);
    setFormAmount(budget.amount.toString());
    setFormPeriod(budget.period);
    setFormCategoryId(budget.category_id || '');
    setFormStartDate(budget.start_date || '');
    setFormEndDate(budget.end_date || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
  };

  const handleSave = async () => {
    try {
      const data = {
        name: formName,
        amount: parseFloat(formAmount),
        period: formPeriod as BudgetWithSpent['period'],
        category_id: formCategoryId || undefined,
        start_date: formStartDate || undefined,
        end_date: formEndDate || undefined,
      };

      if (isCreating) {
        await api.createBudget(data);
      } else if (editingId) {
        await api.updateBudget(editingId, data);
      }
      cancelEdit();
      fetchData();
    } catch (err) {
      console.error('Failed to save budget:', err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this budget?')) return;
    try {
      await api.deleteBudget(id);
      fetchData();
    } catch (err) {
      console.error('Failed to delete budget:', err);
    }
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return 'bg-red-500';
    if (percentage >= 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getProgressBgColor = (percentage: number) => {
    if (percentage >= 100) return 'bg-red-100';
    if (percentage >= 80) return 'bg-yellow-100';
    return 'bg-green-100';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Budgets</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Budgets</h1>
        <Button onClick={startCreate}>
          <Plus className="h-4 w-4 mr-2" />
          New Budget
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Create/Edit Form */}
      {(isCreating || editingId) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {isCreating ? 'New Budget' : 'Edit Budget'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Budget Name
                </label>
                <Input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Monthly Groceries"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (NOK)
                </label>
                <Input
                  type="number"
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="5000"
                  min="0"
                  step="100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Period
                </label>
                <select
                  value={formPeriod}
                  onChange={(e) => setFormPeriod(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {BUDGET_PERIOD_TYPES.map((p) => (
                    <option key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category (optional)
                </label>
                <select
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All categories</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date (optional)
                </label>
                <Input
                  type="date"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date (optional)
                </label>
                <Input
                  type="date"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={!formName.trim() || !formAmount}
              >
                {isCreating ? 'Create' : 'Save'}
              </Button>
              <Button variant="outline" onClick={cancelEdit}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Budgets Grid */}
      {budgets.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {budgets.map((budget) => {
            const percentage = budget.amount > 0
              ? (budget.spent / budget.amount) * 100
              : 0;
            const remaining = budget.amount - budget.spent;
            const isOverBudget = remaining < 0;
            const category = categories.find((c) => c.id === budget.category_id);

            return (
              <Card
                key={budget.id}
                className={cn(
                  'relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow',
                  isOverBudget && 'border-red-300'
                )}
                onClick={(e) => {
                  // Prevent drilldown if clicking edit/delete buttons
                  if ((e.target as HTMLElement).closest('button')) return;
                  setDrilldownCategory(budget.category_id || undefined);
                  setDrilldownDateFrom(budget.start_date);
                  setDrilldownDateTo(budget.end_date || undefined);
                  setDrilldownTitle(budget.name);
                  setDrilldownSubtitle(`${formatCurrency(budget.spent)} spent of ${formatCurrency(budget.amount)}`);
                  setDrilldownOpen(true);
                }}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {budget.name}
                        {isOverBudget && (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                      </CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {budget.period}
                        </Badge>
                        {category && (
                          <Badge
                            variant="secondary"
                            className="text-xs"
                            style={category.color ? {
                              backgroundColor: `${category.color}20`,
                              color: category.color,
                            } : undefined}
                          >
                            {category.name}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); startEdit(budget); }}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <Pencil className="h-4 w-4 text-gray-400" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(budget.id); }}
                        className="p-1 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-2xl font-bold">
                          {formatCurrency(budget.spent)}
                        </p>
                        <p className="text-sm text-gray-500">
                          of {formatCurrency(budget.amount)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={cn(
                          'text-lg font-semibold',
                          isOverBudget ? 'text-red-600' : 'text-green-600'
                        )}>
                          {isOverBudget ? '-' : ''}{formatCurrency(Math.abs(remaining))}
                        </p>
                        <p className="text-xs text-gray-500">
                          {isOverBudget ? 'over budget' : 'remaining'}
                        </p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className={cn(
                      'h-3 rounded-full overflow-hidden',
                      getProgressBgColor(percentage)
                    )}>
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          getProgressColor(percentage)
                        )}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">
                        {percentage.toFixed(0)}% used
                      </span>
                      {percentage >= 80 && percentage < 100 && (
                        <span className="text-yellow-600 flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          Approaching limit
                        </span>
                      )}
                      {isOverBudget && (
                        <span className="text-red-600">
                          {(percentage - 100).toFixed(0)}% over
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <PiggyBank className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No budgets yet
              </h3>
              <p className="text-gray-500 mb-4">
                Create a budget to track your spending and stay on target.
              </p>
              <Button onClick={startCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Budget
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Drilldown Dialog */}
      <TransactionsDrilldownDialog
        open={drilldownOpen}
        onOpenChange={setDrilldownOpen}
        title={drilldownTitle}
        subtitle={drilldownSubtitle}
        dateFrom={drilldownDateFrom}
        dateTo={drilldownDateTo}
        categoryId={drilldownCategory}
      // Force expense filter for budgets
      // The dialog already handles max_amount: 0 if category/merchant is present. 
      // But for budgets, we want to see expenses.
      />
    </div>
  );
}
