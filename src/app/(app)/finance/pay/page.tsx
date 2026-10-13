import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { listSuppliersWithDebt } from "@/features/finance/queries";
import { requirePermission } from "@/lib/auth/access";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Оплата долга" };

// Шаг 1: кому платим — поставщики с открытыми долгами.
export default async function PayPage() {
  const org = await requirePermission("cash.post");
  const suppliers = await listSuppliersWithDebt(org.id);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <PageHeader title="Кому платим?" description="Поставщики с неоплаченными обязательствами." />
      {suppliers.length === 0 ? (
        <p className="text-muted-foreground">Открытых долгов нет.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {suppliers.map((s) => (
            <li key={`${s.supplierId}:${s.currency}`}>
              <Link
                href={`/finance/pay/${s.supplierId}`}
                className="flex items-center gap-3 rounded-xl border p-4 hover:bg-muted/50"
              >
                <span className="flex flex-1 flex-col">
                  <span className="text-base font-semibold">{s.supplierName}</span>
                  <span className="text-sm">
                    Долг: {formatMoney(s.remaining, s.currency)} · обязательств: {s.count}
                  </span>
                </span>
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
