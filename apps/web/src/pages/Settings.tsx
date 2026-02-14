import { useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Settings as SettingsIcon } from 'lucide-react';
import { useFeatureFlags } from '@/context/FeatureFlagsContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useTranslation } from 'react-i18next';

export function SettingsPage() {
    const { t } = useTranslation();
    const { showBudgets, setShowBudgets } = useFeatureFlags();
    const [resetDialogOpen, setResetDialogOpen] = useState(false);
    const [resetPhrase, setResetPhrase] = useState('');
    const [loading, setLoading] = useState(false);

    const toggleBudgets = () => {
        setShowBudgets(!showBudgets);
    };

    const confirmReset = async () => {
        if (resetPhrase.trim().toUpperCase() !== 'DELETE') return;
        setLoading(true);
        try {
            await api.resetData(true);
            alert(t('settingsPage.resetSuccess'));
            window.location.reload();
        } catch (err: any) {
            alert(`${t('settingsPage.resetFailed')}: ${err.message || t('settingsPage.unknownError')}`);
        } finally {
            setLoading(false);
            setResetPhrase('');
            setResetDialogOpen(false);
        }
    };

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <SettingsIcon className="h-8 w-8 text-white/80" />
                <h1 className="text-3xl font-bold">{t('settingsPage.title')}</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{t('settingsPage.appearanceTitle')}</CardTitle>
                    <CardDescription>{t('settingsPage.appearanceDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between p-4 border border-white/15 rounded-lg bg-white/5">
                        <div className="space-y-0.5">
                            <span className="font-medium text-base block">{t('settingsPage.showBudgets')}</span>
                            <p className="text-sm text-white/70">{t('settingsPage.showBudgetsHelp')}</p>
                        </div>
                        <div className="flex items-center h-6">
                            <button
                                onClick={toggleBudgets}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-300/60 focus:ring-offset-2 ${showBudgets ? 'bg-blue-600' : 'bg-white/10'
                                    }`}
                            >
                                <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white/80 transition-transform ${showBudgets ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                />
                            </button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border border-red-300/30 bg-red-500/5">
                <CardHeader>
                    <CardTitle className="text-red-600 flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5" />
                        {t('settingsPage.dangerZone')}
                    </CardTitle>
                    <CardDescription className="text-white/70">{t('settingsPage.dangerHelp')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between p-4 border border-red-300/30 rounded-lg bg-red-500/10">
                        <div className="space-y-0.5">
                            <p className="font-medium text-red-100">{t('settingsPage.deleteAllData')}</p>
                            <p className="text-sm text-red-100/80">{t('settingsPage.deleteAllDataHelp')}</p>
                        </div>
                        <Button
                            variant="destructive"
                            onClick={() => setResetDialogOpen(true)}
                            disabled={loading}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {t('settingsPage.deleteAllData')}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Dialog
                open={resetDialogOpen}
                onOpenChange={(open) => {
                    if (!loading) {
                        setResetDialogOpen(open);
                        if (!open) setResetPhrase('');
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('settingsPage.confirmDeleteTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('settingsPage.confirmDeleteHelp')}{' '}
                            <span className="font-semibold">{t('settingsPage.deleteKeyword')}</span>{' '}
                            {t('settingsPage.confirmDeleteHelpSuffix')}
                        </DialogDescription>
                    </DialogHeader>
                    <Input
                        value={resetPhrase}
                        onChange={(e) => setResetPhrase(e.target.value)}
                        placeholder={t('settingsPage.typeDelete')}
                        aria-label={t('settingsPage.typeDelete')}
                    />
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setResetDialogOpen(false);
                                setResetPhrase('');
                            }}
                            disabled={loading}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmReset}
                            disabled={loading || resetPhrase.trim().toUpperCase() !== 'DELETE'}
                        >
                            {loading ? t('settingsPage.deleting') : t('settingsPage.confirmDeleteAction')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
