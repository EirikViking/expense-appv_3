import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { TransactionWithMeta, TransactionStatus, SourceType, Category } from '@expense/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatCurrency,
  formatDate,
  formatDateLocal,
  getMonthRange,
  getPreviousMonthRange,
  getYearToDateRange,
  cn,
} from '@/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  Tag,
  Pencil,
  X,
  Plus,
  Trash2,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { TransactionDetailsDialog } from '@/components/TransactionDetailsDialog';
import { useTranslation } from 'react-i18next';

export function TransactionsPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [transactions, setTransactions] = useState<TransactionWithMeta[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState<TransactionStatus | ''>('');
  const [sourceType, setSourceType] = useState<SourceType | ''>('');
  const [categoryId, setCategoryId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [excludeTransfers, setExcludeTransfers] = useState(true);
  const [merchantId, setMerchantId] = useState('');
  const [merchantName, setMerchantName] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  // Pagination
  const [page, setPage] = useState(0);
  const limit = 50;

  // Edit mode
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Details & Add
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithMeta | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newTx, setNewTx] = useState({
    date: formatDateLocal(new Date()),
    amount: '',
    description: '',
    category_id: ''
  });
  const [createErrors, setCreateErrors] = useState<{ date?: string; amount?: string; description?: string }>({});
  const [createError, setCreateError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(t('transactions.confirmBulkDelete', { count: selectedIds.length }))) return;

    try {
      await Promise.all(selectedIds.map(id => api.deleteTransaction(id)));
      setSelectedIds([]);
      fetchData();
    } catch (err) {
      alert(t('transactions.failedBulkDelete'));
      fetchData();
    }
  };

  const handleCreate = async () => {
    setCreateError(null);
    const nextErrors: { date?: string; amount?: string; description?: string } = {};
    const parsedAmount = parseFloat(newTx.amount);
    if (!newTx.date) nextErrors.date = t('transactions.validation.dateRequired');
    if (!newTx.description.trim()) nextErrors.description = t('transactions.validation.descriptionRequired');
    if (!newTx.amount || Number.isNaN(parsedAmount) || !Number.isFinite(parsedAmount)) {
      nextErrors.amount = t('transactions.validation.amountInvalid');
    }
    setCreateErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      await api.createTransaction({
        date: newTx.date,
        amount: parsedAmount, // Ensure number
        description: newTx.description.trim(),
        category_id: newTx.category_id || undefined
      });
      setIsAddOpen(false);
      setNewTx({ date: formatDateLocal(new Date()), amount: '', description: '', category_id: '' });
      setCreateErrors({});
      fetchData();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t('transactions.failedCreate'));
    }
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [txResult, catResult] = await Promise.all([
        api.getTransactions({
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          status: status || undefined,
          source_type: sourceType || undefined,
          category_id: categoryId || undefined,
          merchant_id: merchantId || undefined,
          merchant_name: merchantName || undefined,
          min_amount: (() => {
            if (!minAmount.trim()) return undefined;
            const n = Number(minAmount);
            return Number.isFinite(n) ? n : undefined;
          })(),
          max_amount: (() => {
            if (!maxAmount.trim()) return undefined;
            const n = Number(maxAmount);
            return Number.isFinite(n) ? n : undefined;
          })(),
          search: searchQuery || undefined,
          include_transfers: !excludeTransfers,
          limit,
          offset: page * limit,
        }),
        categories.length === 0 ? api.getCategories() : Promise.resolve({ categories }),
      ]);

      setTransactions(txResult.transactions);
      setTotal(txResult.total);
      if ('categories' in catResult && catResult.categories) {
        setCategories(catResult.categories);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('transactions.failedFetch'));
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo, status, sourceType, categoryId, merchantId, merchantName, minAmount, maxAmount, searchQuery, page, categories.length, excludeTransfers]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Initialize from URL query params (drilldown support)
  useEffect(() => {
    const qDateFrom = searchParams.get('date_from') || '';
    const qDateTo = searchParams.get('date_to') || '';
    const qStatus = (searchParams.get('status') || '') as TransactionStatus | '';
    const qSource = (searchParams.get('source_type') || '') as SourceType | '';
    const qCategory = searchParams.get('category_id') || '';
    const qMerchantId = searchParams.get('merchant_id') || '';
    const qMerchantName = searchParams.get('merchant_name') || '';
    const qMinAmount = searchParams.get('min_amount') || '';
    const qMaxAmount = searchParams.get('max_amount') || '';
    const qSearch = searchParams.get('search') || '';
    const qIncludeTransfers = searchParams.get('include_transfers');

    if (qDateFrom) setDateFrom(qDateFrom);
    if (qDateTo) setDateTo(qDateTo);
    if (qStatus) setStatus(qStatus);
    if (qSource) setSourceType(qSource);
    if (qCategory) setCategoryId(qCategory);
    if (qMerchantId) setMerchantId(qMerchantId);
    if (qMerchantName) setMerchantName(qMerchantName);
    if (qMinAmount) setMinAmount(qMinAmount);
    if (qMaxAmount) setMaxAmount(qMaxAmount);
    if (qSearch) setSearchQuery(qSearch);
    if (qIncludeTransfers === '1' || qIncludeTransfers === 'true') setExcludeTransfers(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isAddOpen) {
      setCreateErrors({});
      setCreateError(null);
    }
  }, [isAddOpen]);

  const totalPages = Math.ceil(total / limit);

  const handleSaveEdit = async (txId: string) => {
    try {
      await api.updateTransactionMeta(txId, {
        category_id: editCategory || undefined,
        notes: editNotes || undefined,
      });
      setEditingId(null);
      fetchData();
    } catch (err) {
      console.error('Failed to update transaction:', err);
    }
  };

  const startEdit = (tx: TransactionWithMeta) => {
    setEditingId(tx.id);
    setEditCategory(tx.category_id || '');
    setEditNotes(tx.notes || '');
  };

  const clearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setStatus('');
    setSourceType('');
    setCategoryId('');
    setMerchantId('');
    setMerchantName('');
    setMinAmount('');
    setMaxAmount('');
    setSearchQuery('');
    setExcludeTransfers(true);
    setPage(0);
  };

  const hasFilters = dateFrom || dateTo || status || sourceType || categoryId || merchantId || merchantName || minAmount || maxAmount || searchQuery || !excludeTransfers;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('transactions.title')}</h1>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <Button variant="destructive" onClick={handleBulkDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              {t('transactions.delete')} ({selectedIds.length})
            </Button>
          )}
          <Button onClick={() => setIsAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('transactions.addTransaction')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-2" />
            {t('common.filters')}
            {hasFilters && (
              <Badge variant="secondary" className="ml-2">
                {t('common.active')}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="text"
          placeholder={t('common.searchTransactionsPlaceholder')}
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setPage(0);
          }}
          className="pl-10"
        />
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('transactions.quickDatePresets')}
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const r = getMonthRange();
                    setDateFrom(r.start);
                    setDateTo(r.end);
                    setPage(0);
                  }}
                >
                  {t('common.thisMonth')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const r = getPreviousMonthRange();
                    setDateFrom(r.start);
                    setDateTo(r.end);
                    setPage(0);
                  }}
                >
                  {t('common.lastMonth')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const r = getYearToDateRange();
                    setDateFrom(r.start);
                    setDateTo(r.end);
                    setPage(0);
                  }}
                >
                  {t('common.yearToDate')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDateFrom('');
                    setDateTo('');
                    setPage(0);
                  }}
                >
                  {t('common.clearDates')}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('common.fromDate')}
                </label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('common.toDate')}
                </label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('common.status')}
                </label>
                <select
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value as TransactionStatus | '');
                    setPage(0);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">{t('common.all')}</option>
                  <option value="booked">{t('common.booked')}</option>
                  <option value="pending">{t('common.pending')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('common.source')}
                </label>
                <select
                  value={sourceType}
                  onChange={(e) => {
                    setSourceType(e.target.value as SourceType | '');
                    setPage(0);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">{t('common.all')}</option>
                  <option value="xlsx">{t('common.creditCardXlsx')}</option>
                  <option value="pdf">{t('common.bankStatementPdf')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('common.category')}
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    setPage(0);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">{t('common.allCategories')}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('common.minAmount')}
                </label>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. -500"
                  value={minAmount}
                  onChange={(e) => {
                    setMinAmount(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('common.maxAmount')}
                </label>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="e.g. 0"
                  value={maxAmount}
                  onChange={(e) => {
                    setMaxAmount(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('transactions.merchantExact')}
                </label>
                <Input
                  type="text"
                  placeholder="e.g. KIWI"
                  value={merchantName}
                  onChange={(e) => {
                    setMerchantName(e.target.value);
                    setMerchantId(''); // avoid AND-ing both
                    setPage(0);
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('transactions.merchantId')}
                </label>
                <Input
                  type="text"
                  placeholder="(optional)"
                  value={merchantId}
                  onChange={(e) => {
                    setMerchantId(e.target.value);
                    if (e.target.value) setMerchantName('');
                    setPage(0);
                  }}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <input
                id="exclude-transfers"
                type="checkbox"
                checked={excludeTransfers}
                onChange={(e) => {
                  setExcludeTransfers(e.target.checked);
                  setPage(0);
                }}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="exclude-transfers" className="text-sm text-gray-700">
                {t('transactions.excludeTransfersDefault')}
              </label>
            </div>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="mt-4"
              >
                <X className="h-4 w-4 mr-2" />
                {t('common.clearFilters')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Results count */}
          <p className="text-sm text-gray-600">
            {t('transactions.showingCount', { shown: transactions.length, total })}
          </p>

          {/* Transactions List */}
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-200">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => !editingId && setSelectedTransaction(tx)}
                  >
                    {editingId === tx.id ? (
                      // Edit Mode
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium">{tx.description}</p>
                            <p className="text-sm text-gray-500">{formatDate(tx.tx_date)}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleSaveEdit(tx.id)}>
                              {t('common.save')}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                              {t('common.cancel')}
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {t('common.category')}
                            </label>
                            <select
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">{t('common.uncategorized')}</option>
                              {categories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              {t('transactions.notes')}
                            </label>
                            <Input
                              type="text"
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              placeholder={t('transactions.notesPlaceholder')}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      // View Mode
                      <div className="flex items-center gap-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(tx.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedIds([...selectedIds, tx.id]);
                            else setSelectedIds(selectedIds.filter(id => id !== tx.id));
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                        <div
                          className="h-10 w-10 rounded-lg flex items-center justify-center text-white text-sm font-medium"
                          style={{
                            backgroundColor: tx.category_color || '#6b7280',
                          }}
                        >
                          {tx.category_name?.charAt(0) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{tx.description}</p>
                            {tx.is_transfer && (
                              <Badge variant="secondary" className="text-xs">
                                Transfer
                              </Badge>
                            )}
                            {tx.is_recurring && (
                              <Badge variant="outline" className="text-xs">
                                Recurring
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <span>{formatDate(tx.tx_date)}</span>
                            {tx.merchant_name && (
                              <>
                                <span className="text-gray-400">|</span>
                                <span>{tx.merchant_name}</span>
                              </>
                            )}
                            {tx.category_name && (
                              <>
                                <span className="text-gray-400">|</span>
                                <span
                                  className="px-1.5 py-0.5 rounded text-xs"
                                  style={tx.category_color ? {
                                    backgroundColor: `${tx.category_color}20`,
                                    color: tx.category_color,
                                  } : { backgroundColor: '#6b728020', color: '#6b7280' }}
                                >
                                  {tx.category_name}
                                </span>
                              </>
                            )}
                          </div>
                          {tx.tags && tx.tags.length > 0 && (
                            <div className="flex items-center gap-1 mt-1">
                              <Tag className="h-3 w-3 text-gray-400" />
                              {tx.tags.map((tag) => (
                                <Badge
                                  key={tag.id}
                                  variant="secondary"
                                  className="text-xs"
                                  style={tag.color ? {
                                    backgroundColor: `${tag.color}20`,
                                    color: tag.color,
                                  } : undefined}
                                >
                                  {tag.name}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {tx.notes && (
                            <p className="text-xs text-gray-400 mt-1 italic">
                              {tx.notes}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p
                            className={cn(
                              'font-semibold',
                              tx.amount < 0 ? 'text-red-600' : 'text-green-600'
                            )}
                          >
                            {formatCurrency(tx.amount, true)}
                          </p>
                          <div className="flex items-center justify-end gap-2 mt-1">
                            <Badge
                              variant={tx.status === 'booked' ? 'default' : 'warning'}
                            >
                              {tx.status}
                            </Badge>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEdit(tx);
                              }}
                              className="p-1 hover:bg-gray-200 rounded"
                            >
                              <Pencil className="h-3 w-3 text-gray-400" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {transactions.length === 0 && (
                  <div className="p-12 text-center text-gray-500">
                    {t('transactions.noTransactionsFound')}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t('common.previous')}
              </Button>
              <span className="text-sm text-gray-600">
                {t('transactions.pageOf', { page: page + 1, total: totalPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                {t('common.next')}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('transactions.addTransaction')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t('common.date')}</Label>
              <div className="col-span-3">
                <Input type="date" value={newTx.date} onChange={e => setNewTx({ ...newTx, date: e.target.value })} />
                {createErrors.date && (
                  <p className="mt-1 text-xs text-red-600">{createErrors.date}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t('common.amount')}</Label>
              <div className="col-span-3">
                <Input type="number" step="0.01" value={newTx.amount} onChange={e => setNewTx({ ...newTx, amount: e.target.value })} />
                {createErrors.amount && (
                  <p className="mt-1 text-xs text-red-600">{createErrors.amount}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t('common.description')}</Label>
              <div className="col-span-3">
                <Input value={newTx.description} onChange={e => setNewTx({ ...newTx, description: e.target.value })} />
                {createErrors.description && (
                  <p className="mt-1 text-xs text-red-600">{createErrors.description}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t('common.category')}</Label>
              <select
                className="col-span-3 flex h-10 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                value={newTx.category_id}
                onChange={(e) => setNewTx({ ...newTx, category_id: e.target.value })}
              >
                <option value="">{t('common.uncategorized')}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            {createError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {createError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={handleCreate}>{t('transactions.saveTransaction')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransactionDetailsDialog
        transaction={selectedTransaction}
        open={!!selectedTransaction}
        onOpenChange={(open) => !open && setSelectedTransaction(null)}
        onDeleteSuccess={() => { fetchData(); setSelectedTransaction(null); }}
        onUpdateSuccess={() => { fetchData(); }}
      />
    </div>
  );
}
