import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function BudgetsPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Budgets</h1>
      <Card>
        <CardHeader>
          <CardTitle>Kommer snart</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-white/70">
            Budgets er ikke aktivert enda. Aktiver funksjonen i Settings nar
            budsjettflyten er klar.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
