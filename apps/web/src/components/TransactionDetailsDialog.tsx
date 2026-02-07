import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { Category, TransactionWithMeta } from '@expense/shared';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useEffect, useMemo, useState } from 'react';
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
    const [isEditing, setIsEditing] = useState(false);
    const [categories, setCategories] = useState<Category[]>([]);
    const [editCategoryId, setEditCategoryId] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [localTx, setLocalTx] = useState<TransactionWithMeta | null>(transaction);

    // Keep local copy to reflect edits immediately.
    useEffect(() => {
        setLocalTx(transaction);
        setIsEditing(false);
        setEditCategoryId(transaction?.category_id || '');
        setEditNotes(transaction?.notes || '');
    }, [transaction?.id]);

    // Fetch categories when dialog opens (used for category select).
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await api.getCategories();
                if (!cancelled) setCategories(Array.isArray(res.categories) ? res.categories : []);
            } catch {
                if (!cancelled) setCategories([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open]);

    const canEdit = Boolean(localTx);
    const categoryOptions = useMemo(() => {
        // Stable ordering: keep API ordering but ensure "Uncategorized" option exists.
        return categories;
    }, [categories]);

    const handleDelete = async () => {
        const tx = localTx ?? transaction;
        if (!tx) return;
        if (!confirm(t('transactions.confirmDeleteOne'))) return;
        setIsDeleting(true);
        try {
            await api.deleteTransaction(tx.id);
            onOpenChange(false);
            onDeleteSuccess?.();
        } catch (err) {
            alert(t('transactions.failedDeleteOne'));
        } finally {
            setIsDeleting(false);
        }
    };

    const handleToggleTransfer = async (next: boolean) => {
        const tx = localTx ?? transaction;
        if (!tx) return;
        setIsUpdating(true);
        try {
            const updated = await api.patchTransaction(tx.id, { is_transfer: next });
            setLocalTx(updated);
            onUpdateSuccess?.();
        } catch (err) {
            alert(t('transactions.failedUpdateOne'));
        } finally {
            setIsUpdating(false);
        }
    };

    const handleSaveEdits = async () => {
        if (!localTx) return;
        setIsUpdating(true);
        try {
            const updated = await api.updateTransactionMeta(localTx.id, {
                category_id: editCategoryId || null,
                notes: editNotes?.trim() ? editNotes.trim() : null,
            });
            setLocalTx(updated);
            setIsEditing(false);
            onUpdateSuccess?.();
        } catch {
            alert(t('transactions.failedUpdateOne'));
        } finally {
            setIsUpdating(false);
        }
    };

    const tx = localTx || transaction;

    // IMPORTANT: keep hooks above unconditional. Only decide rendering after hooks ran.
    // If both props are empty and the dialog isn't open, render nothing.
    if (!tx && !open) return null;
    if (!tx) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t('transactions.detailsTitle')}</DialogTitle>
                    <DialogDescription>{t('transactions.idLabel', { id: tx.id })}</DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                        <div>
                            <p className="text-sm text-white/70">{t('common.amount')}</p>
                            <p className={`text-2xl font-bold ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                {formatCurrency(tx.amount)}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-sm text-white/70">{t('common.date')}</p>
                            <p className="text-lg font-medium">{formatDate(tx.tx_date)}</p>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                            {tx.category_name && (
                                <Badge variant="outline">
                                    {tx.category_name}
                                </Badge>
                            )}
                            {tx.is_transfer && (
                                <Badge variant="secondary" className="text-xs">
                                    {t('common.transfer')}
                                </Badge>
                            )}
                            {tx.is_excluded && (
                                <Badge variant="destructive" className="text-xs">
                                    {t('transactions.excluded')}
                                </Badge>
                            )}
                        </div>

                        {canEdit && (
                            <div className="flex items-center gap-2">
                                {!isEditing ? (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setIsEditing(true)}
                                        disabled={isUpdating || isDeleting}
                                    >
                                        {t('transactions.editOne')}
                                    </Button>
                                ) : (
                                    <>
                                        <Button size="sm" onClick={handleSaveEdits} disabled={isUpdating || isDeleting}>
                                            {t('common.save')}
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setIsEditing(false);
                                                setEditCategoryId(tx.category_id || '');
                                                setEditNotes(tx.notes || '');
                                            }}
                                            disabled={isUpdating || isDeleting}
                                        >
                                            {t('common.cancel')}
                                        </Button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-white/70">{t('common.description')}</p>
                            <p className="break-words">{tx.description}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-white/70">{t('common.source')}</p>
                            <p className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline">{tx.source_type}</Badge>
                                <span className="text-sm truncate max-w-[200px]" title={tx.source_filename || ''}>
                                    {tx.source_filename || t('common.unknownFile')}
                                </span>
                            </p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-white/70">{t('common.merchant')}</p>
                            <p>{tx.merchant_name || t('common.notAvailable')}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-white/70">{t('common.category')}</p>
                            {isEditing ? (
                                <select
                                    value={editCategoryId}
                                    onChange={(e) => setEditCategoryId(e.target.value)}
                                    disabled={isUpdating || isDeleting}
                                    className="w-full h-9 px-2 rounded border border-white/15"
                                >
                                    <option value="">{t('common.uncategorized')}</option>
                                    {categoryOptions.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.name}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <p>{tx.category_name || t('common.uncategorized')}</p>
                            )}
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-white/70">{t('common.status')}</p>
                            <Badge variant={tx.status === 'booked' ? 'default' : 'secondary'}>{tx.status}</Badge>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-white/70">{t('common.transfer')}</p>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={tx.is_transfer}
                                    disabled={isUpdating}
                                    onChange={(e) => handleToggleTransfer(e.target.checked)}
                                    className="h-4 w-4 rounded border-white/15 text-cyan-300 focus:ring-cyan-300/60"
                                />
                                <span className="text-sm">
                                    {t('transactions.markAsTransferHint')}
                                </span>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-white/70">{t('common.recurring')}</p>
                            <p>{tx.is_recurring ? t('common.yes') : t('common.no')}</p>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <p className="text-sm font-medium text-white/70">{t('transactions.notes')}</p>
                        {isEditing ? (
                            <textarea
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                disabled={isUpdating || isDeleting}
                                placeholder={t('transactions.notesPlaceholder')}
                                className="w-full min-h-[80px] px-3 py-2 rounded border border-white/15 text-sm"
                            />
                        ) : (
                            <p className="p-3 bg-white/5 rounded-md text-sm">
                                {tx.notes || t('common.notAvailable')}
                            </p>
                        )}
                    </div>

                    <div>
                        <p className="text-sm font-medium text-white/70 mb-2">{t('transactions.technicalData')}</p>
                        <div className="bg-slate-950 text-slate-50 p-4 rounded-md overflow-x-auto text-xs font-mono">
                            <pre>{JSON.stringify(tx, null, 2)}</pre>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-white/10">
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
