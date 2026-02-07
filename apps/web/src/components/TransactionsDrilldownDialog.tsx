import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import type { FlowType, TransactionWithMeta, TransactionStatus } from '@expense/shared';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { ArrowUpRight, ArrowDownRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { TransactionDetailsDialog } from './TransactionDetailsDialog';

interface TransactionsDrilldownDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    subtitle?: string;
    // Filter params
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
    const [loading, setLoading] = useState(true);
    const [transactions, setTransactions] = useState<TransactionWithMeta[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [selectedTx, setSelectedTx] = useState<TransactionWithMeta | null>(null);
    const limit = 20;

    useEffect(() => {
        if (open) {
            loadTransactions();
        }
    }, [open, page, dateFrom, dateTo, merchantId, merchantName, categoryId, status, flowType, includeTransfers, minAmount, maxAmount]);

    const loadTransactions = async () => {
        setLoading(true);
        try {
            // If we only have a merchant name (no merchant_id), use free-text search to
            // avoid "exact equality" filters missing variants (e.g. KIWI 505 BARCODE vs Varekjøp KIWI...).
            const effectiveMerchantName = merchantId ? merchantName : undefined;
            const effectiveSearch = search || (!merchantId && merchantName ? merchantName : undefined);

            const response = await api.getTransactions({
                date_from: dateFrom,
                date_to: dateTo,
                merchant_id: merchantId,
                merchant_name: effectiveMerchantName,
                search: effectiveSearch,
                category_id: categoryId,
                status: status,
                flow_type: flowType,
                include_transfers: includeTransfers,
                min_amount: minAmount,
                max_amount: maxAmount,
                limit,
                offset: page * limit,
                sort_by: 'date',
                sort_order: 'desc',
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
        setTransactions([]);
        setTotal(0);
        onOpenChange(false);
    };

    return (
        <>
            <Dialog open={open} onOpenChange={handleClose}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{title}</DialogTitle>
                        {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
                    </DialogHeader>

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
                                        className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer group"
                                        onClick={() => setSelectedTx(tx)}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div
                                                className={cn(
                                                    'h-10 w-10 rounded-full flex items-center justify-center',
                                                    tx.amount >= 0 ? 'bg-green-100' : 'bg-red-100'
                                                )}
                                            >
                                                {tx.amount >= 0 ? (
                                                    <ArrowDownRight className="h-5 w-5 text-green-600" />
                                                ) : (
                                                    <ArrowUpRight className="h-5 w-5 text-red-600" />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-medium truncate">{tx.description}</p>
                                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                                    <span>{formatDate(tx.tx_date)}</span>
                                                    {tx.merchant_name && (
                                                        <>
                                                            <span>•</span>
                                                            <span className="truncate">{tx.merchant_name}</span>
                                                        </>
                                                    )}
                                                    {tx.source_filename && (
                                                        <span className="text-xs text-gray-400 ml-2" title={`Source: ${tx.source_filename}`}>
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
                                                        color: tx.category_color ?? undefined
                                                    }}
                                                >
                                                    {tx.category_name}
                                                </Badge>
                                            )}
                                            <span
                                                className={cn(
                                                    'font-semibold',
                                                    tx.amount >= 0 ? 'text-green-600' : 'text-red-600'
                                                )}
                                            >
                                                {formatCurrency(tx.amount, true)}
                                            </span>
                                            <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500 transition-colors ml-2" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-32 text-gray-500">
                                No transactions found
                            </div>
                        )}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-4 border-t">
                            <p className="text-sm text-gray-500">
                                Showing {page * limit + 1}-{Math.min((page + 1) * limit, total)} of {total}
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                                    disabled={page === 0}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                                    disabled={page >= totalPages - 1}
                                >
                                    Next
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
                onOpenChange={(open) => !open && setSelectedTx(null)}
                onDeleteSuccess={() => { setSelectedTx(null); loadTransactions(); }}
                onUpdateSuccess={() => { loadTransactions(); }}
            />
        </>
    );
}
