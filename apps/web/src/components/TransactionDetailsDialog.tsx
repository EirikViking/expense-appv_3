import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { TransactionWithMeta } from '@expense/shared';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface TransactionDetailsDialogProps {
    transaction: TransactionWithMeta | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onDeleteSuccess?: () => void;
    onUpdateSuccess?: () => void;
}

export function TransactionDetailsDialog({ transaction, open, onOpenChange, onDeleteSuccess, onUpdateSuccess }: TransactionDetailsDialogProps) {
    const { t } = useTranslation();
    const [isDeleting, setIsDeleting] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);

    if (!transaction) return null;

    const handleDelete = async () => {
        if (!confirm(t('transactions.confirmDeleteOne'))) return;
        setIsDeleting(true);
        try {
            await api.deleteTransaction(transaction.id);
            onOpenChange(false);
            onDeleteSuccess?.();
        } catch (err) {
            alert(t('transactions.failedDeleteOne'));
        } finally {
            setIsDeleting(false);
        }
    };

    const handleToggleTransfer = async (next: boolean) => {
        setIsUpdating(true);
        try {
            await api.patchTransaction(transaction.id, { is_transfer: next });
            onUpdateSuccess?.();
        } catch (err) {
            alert(t('transactions.failedUpdateOne'));
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t('transactions.detailsTitle')}</DialogTitle>
                    <DialogDescription>{t('transactions.idLabel', { id: transaction.id })}</DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.amount')}</p>
                            <p className={`text-2xl font-bold ${transaction.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {formatCurrency(transaction.amount)}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.date')}</p>
                            <p className="text-lg font-medium">{formatDate(transaction.tx_date)}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('common.description')}</p>
                            <p className="break-words">{transaction.description}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('common.source')}</p>
                            <p className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline">{transaction.source_type}</Badge>
                                <span className="text-sm truncate max-w-[200px]" title={transaction.source_filename || ''}>
                                    {transaction.source_filename || t('common.unknownFile')}
                                </span>
                            </p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('common.merchant')}</p>
                            <p>{transaction.merchant_name || t('common.notAvailable')}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('common.category')}</p>
                            <p>{transaction.category_name || t('common.uncategorized')}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('common.status')}</p>
                            <Badge variant={transaction.status === 'booked' ? 'default' : 'secondary'}>{transaction.status}</Badge>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('common.transfer')}</p>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={transaction.is_transfer}
                                    disabled={isUpdating}
                                    onChange={(e) => handleToggleTransfer(e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm">
                                    {t('transactions.markAsTransferHint')}
                                </span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('common.recurring')}</p>
                            <p>{transaction.is_recurring ? t('common.yes') : t('common.no')}</p>
                        </div>
                    </div>

                    {transaction.notes && (
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('transactions.notes')}</p>
                            <p className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md text-sm">{transaction.notes}</p>
                        </div>
                    )}

                    <div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">{t('transactions.technicalData')}</p>
                        <div className="bg-slate-950 text-slate-50 p-4 rounded-md overflow-x-auto text-xs font-mono">
                            <pre>{JSON.stringify(transaction, null, 2)}</pre>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
                        <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t('transactions.deleteOne')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
