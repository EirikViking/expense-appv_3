import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import type { FlowType, TransactionWithMeta, TransactionStatus } from '@expense/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { TransactionDetailsDialog } from './TransactionDetailsDialog';

interface TransactionsDrilldownDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  dateFrom?: string;
  dateTo?: string;
  merchantId?: string;
  merchantName?: string;
  search?: string;
  categoryId?: string;
  status?: TransactionStatus;
  flowType?: FlowType;
  includeTransfers?: boolean;
  minAmount?: number;
  maxAmount?: number;
}

export function TransactionsDrilldownDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  dateFrom,
  dateTo,
  merchantId,
  merchantName,
  search,
  categoryId,
  status,
  flowType,
  includeTransfers,
  minAmount,
  maxAmount,
}: TransactionsDrilldownDialogProps) {
  const { i18n } = useTranslation();
  const isNb = (i18n.resolvedLanguage || i18n.language || 'en').startsWith('nb');

  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<TransactionWithMeta[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [selectedTx, setSelectedTx] = useState<TransactionWithMeta | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'amount_abs' | 'merchant'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const limit = 20;

  useEffect(() => {
    if (open) void loadTransactions();
  }, [
    open,
    page,
    dateFrom,
    dateTo,
    merchantId,
    merchantName,
    categoryId,
    status,
    flowType,
    includeTransfers,
    minAmount,
    maxAmount,
    sortBy,
    sortOrder,
  ]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      // Merchant drilldown should include all variants of the merchant name.
      const merchantNeedle = merchantName?.trim() ? merchantName.trim() : undefined;
      const effectiveSearch = (search && search.trim()) ? search.trim() : merchantNeedle;
      const useMerchantIdFilter = Boolean(merchantId) && !merchantNeedle && !effectiveSearch;

      const response = await api.getTransactions({
        date_from: dateFrom,
        date_to: dateTo,
        merchant_id: useMerchantIdFilter ? merchantId : undefined,
        merchant_name: undefined,
        search: effectiveSearch,
        category_id: categoryId,
        status,
        flow_type: flowType,
        include_transfers: includeTransfers,
        min_amount: minAmount,
        max_amount: maxAmount,
        limit,
        offset: page * limit,
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      setTransactions(response.transactions);
      setTotal(response.total);
    } catch (err) {
      console.error('Failed to load transactions:', err);
      setTransactions([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  const handleClose = () => {
    setPage(0);
    setSortBy('date');
    setSortOrder('desc');
    setTransactions([]);
    setTotal(0);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-3xl max-h-[82vh] overflow-hidden flex flex-col border-white/20 bg-[#0b1220] text-white">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
          </DialogHeader>

          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-xs text-white/70">
              {isNb ? 'Sorter transaksjoner' : 'Sort transactions'}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={sortBy}
                onChange={(e) => {
                  setPage(0);
                  setSortBy(e.target.value as 'date' | 'amount_abs' | 'merchant');
                }}
                className="h-8 rounded border border-white/15 bg-white/5 px-2 text-xs text-white"
              >
                <option value="date">{isNb ? 'Dato' : 'Date'}</option>
                <option value="amount_abs">{isNb ? 'Beløp' : 'Amount'}</option>
                <option value="merchant">{isNb ? 'Brukersted' : 'Merchant'}</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  setPage(0);
                  setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
                }}
                className="h-8 rounded border border-white/15 bg-white/5 px-2 text-xs text-white hover:bg-white/10"
              >
                {sortOrder === 'desc' ? (isNb ? 'Synkende' : 'Descending') : (isNb ? 'Stigende' : 'Ascending')}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : transactions.length > 0 ? (
              <div className="space-y-2">
                {transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.07] cursor-pointer group"
                    onClick={() => setSelectedTx(tx)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={cn(
                          'h-10 w-10 rounded-full flex items-center justify-center',
                          tx.amount >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'
                        )}
                      >
                        {tx.amount >= 0 ? (
                          <ArrowDownRight className="h-5 w-5 text-green-300" />
                        ) : (
                          <ArrowUpRight className="h-5 w-5 text-red-300" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{tx.description}</p>
                        <div className="flex items-center gap-2 text-sm text-white/60">
                          <span>{formatDate(tx.tx_date)}</span>
                          {tx.merchant_name && (
                            <>
                              <span>•</span>
                              <span className="truncate">{tx.merchant_name}</span>
                            </>
                          )}
                          {tx.source_filename && (
                            <span className="ml-2 text-xs text-white/40" title={`Source: ${tx.source_filename}`}>
                              ({tx.source_filename})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {tx.category_name && (
                        <Badge
                          variant="outline"
                          style={{
                            borderColor: tx.category_color ?? undefined,
                            color: tx.category_color ?? undefined,
                          }}
                        >
                          {tx.category_name}
                        </Badge>
                      )}
                      <span
                        className={cn(
                          'font-semibold',
                          tx.amount >= 0 ? 'text-green-300' : 'text-red-300'
                        )}
                      >
                        {formatCurrency(tx.amount, true)}
                      </span>
                      <ChevronRight className="ml-1 h-4 w-4 text-white/30 transition-colors group-hover:text-cyan-300" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center text-white/55">
                {isNb ? 'Ingen transaksjoner funnet' : 'No transactions found'}
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-white/10 pt-4">
              <p className="text-sm text-white/60">
                {isNb
                  ? `Viser ${page * limit + 1}-${Math.min((page + 1) * limit, total)} av ${total}`
                  : `Showing ${page * limit + 1}-${Math.min((page + 1) * limit, total)} of ${total}`}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  {isNb ? 'Forrige' : 'Previous'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  {isNb ? 'Neste' : 'Next'}
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <TransactionDetailsDialog
        transaction={selectedTx}
        open={!!selectedTx}
        onOpenChange={(nextOpen) => !nextOpen && setSelectedTx(null)}
        onDeleteSuccess={() => {
          setSelectedTx(null);
          void loadTransactions();
        }}
        onUpdateSuccess={() => {
          void loadTransactions();
        }}
      />
    </>
  );
}

