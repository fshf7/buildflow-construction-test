import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { listCrewsWithDebt, listSuppliersWithDebt } from "@/features/finance/queries";
import { requirePermission } from "@/lib/auth/access";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Оплата долга" };

function DebtLink({ href, name, text }: { href: string; name: string; text: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border p-4 hover:bg-muted/50">
      <span className="flex flex-1 flex-col">
        <span className="text-base font-semibold">{name}</span>
        <span className="text-sm">{text}</span>
      </span>
      <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
    </Link>
  );
}

// Шаг 1: кому платим — поставщики и бригады (по утверждённым актам) с открытыми долгами.
export default async function PayPage() {
  const org = await requirePermission("cash.post");
  const [suppliers, crews] = await Promise.all([
    listSuppliersWithDebt(org.id),
    listCrewsWithDebt(org.id),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <PageHeader
        title="Кому платим?"
        description="Поставщики и бригады с неоплаченными обязательствами."
      />
      {suppliers.length === 0 && crews.length === 0 ? (
        <p className="text-muted-foreground">Открытых долгов нет.</p>
      ) : null}
      {suppliers.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Поставщики</h2>
          <ul className="flex flex-col gap-2">
            {suppliers.map((s) => (
              <li key={`${s.supplierId}:${s.currency}`}>
                <DebtLink
                  href={`/finance/pay/${s.supplierId}`}
                  name={s.supplierName}
                  text={`Долг: ${formatMoney(s.remaining, s.currency)} · обязательств: ${s.count}`}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {crews.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Бригады (утверждённые акты)
          </h2>
          <ul className="flex flex-col gap-2">
            {crews.map((c) => (
              <li key={`${c.crewId}:${c.currency}`}>
                <DebtLink
                  href={`/finance/pay/crew/${c.crewId}`}
                  name={c.crewName}
                  text={`Долг: ${formatMoney(c.remaining, c.currency)} · актов: ${c.count}`}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
