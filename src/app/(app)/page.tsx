import type { Metadata } from "next";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Главная" };

export default function DashboardPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Главная</h1>
        <p className="text-muted-foreground">
          Здесь появятся сводки по объектам: остатки, долги, акты и задачи.
        </p>
      </div>
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle>Пока пусто</CardTitle>
          <CardDescription>
            Разделы открываются по мере реализации: объекты и доступы → закупки и склад → финансы →
            бригады и задачи.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
