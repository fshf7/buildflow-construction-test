import { ArrowDownToLine, ArrowUpFromLine, HandCoins, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { listAccounts } from "@/features/finance/queries";
import { hasPermission } from "@/lib/auth/access-model";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

import { financeScope, type ScopedParams } from "../scope";

export const metadata: Metadata = { title: "Кассы" };

const big = cn(buttonVariants({ size: "lg" }), "h-20 flex-col gap-1 text-base [&_svg]:size-6");

// Д-94: в объекте — его кассы и общие (ими платят за объект); в «Общем» — только общие кассы.
export default async function CashPage({ params }: { params: ScopedParams }) {
  const { org, scope } = await financeScope(params);
  const accounts = await listAccounts(org.id, false, scope.projectId);
  const canPost = hasPermission(org, "cash.post");
  const href = (path: string) => `${scope.base}${path}`;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {scope.projectId === null ? "Общие кассы и счета" : "Кассы и счета"}
        </h1>
        {hasPermission(org, "cash_accounts.manage") ? (
          <Link
            href="/finance/accounts"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <Settings />
            Настроить
          </Link>
        ) : null}
      </div>

      {canPost ? (
        <div className="grid grid-cols-3 gap-2">
          <Link href={href("/income")} className={big}>
            <ArrowDownToLine aria-hidden />
            Приход
          </Link>
          <Link href={href("/expense")} className={big}>
            <ArrowUpFromLine aria-hidden />
            Расход
          </Link>
          <Link href={href("/pay")} className={big}>
            <HandCoins aria-hidden />
            Оплатить долг
          </Link>
        </div>
      ) : null}

      {accounts.length === 0 ? (
        <p className="text-muted-foreground">
          Касс пока нет. Их заводит кассир или администратор в «Настроить».
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {accounts.map((a) => (
            <li key={a.id}>
              <Link
                href={href(`/operations?account=${a.id}`)}
                className={cn(
                  "flex flex-col gap-1 rounded-xl border p-4 hover:bg-muted/50",
                  !a.isActive && "opacity-60",
                )}
              >
                <span className="text-sm text-muted-foreground">
                  {a.kind === "BANK" ? "Банковский счёт" : "Касса"}
                  {scope.projectId !== null && a.projectId === null ? " · общая" : ""}
                  {a.isActive ? "" : " · архив"}
                </span>
                <span className="font-medium">{a.name}</span>
                <span className="text-2xl font-semibold tabular-nums">
                  {formatMoney(a.balance, a.currency)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
