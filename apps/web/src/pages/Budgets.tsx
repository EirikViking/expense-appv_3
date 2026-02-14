import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';

export function BudgetsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">{t('budgetsPage.title')}</h1>
      <Card>
        <CardHeader>
          <CardTitle>{t('budgetsPage.comingSoon')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-white/70">
            {t('budgetsPage.notReady')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
