"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SubmitBar } from "@/features/warehouse/components/submit-bar";
import { toNumber } from "@/lib/decimal";
import { formatDate, formatMoney } from "@/lib/format";
import { useDocumentId, useIdempotencyKey } from "@/lib/idempotency";

import { useFinanceScope } from "./finance-scope";
import { quickCash } from "../actions";
import type { AccountRow, PayableRow } from "../queries";

import { MoneyInput } from "./money-input";

const cents = (v: number) => Math.round(v * 100);

/**
 * Оплата долгов поставщику или бригаде (US-06, BP-05): одна операция может гасить несколько
 * обязательств одного контрагента (Д-63), частично или полностью. Показываем сумму оплаты и сколько долга останется.
 */
export function PayDebtForm({
  counterparty,
  payables,
  accounts,
}: {
  counterparty: { kind: "SUPPLIER" | "CREW"; id: string };
  payables: PayableRow[];
  accounts: AccountRow[];
}) {
  const router = useRouter();
  const scope = useFinanceScope();
  const id = useDocumentId();
  const { key } = useIdempotencyKey();
  const currency = payables[0]?.currency ?? "TJS";
  const usable = accounts.filter((a) => a.currency === currency && a.isActive);
  const [accountId, setAccountId] = useState(usable.length === 1 ? usable[0]!.id : "");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Суммы — в копейках (целые), чтобы итог не страдал от двоичной арифметики.
  const payCents = payables.reduce(
    (s, p) => s + (amounts[p.id] ? cents(toNumber(amounts[p.id]!)) || 0 : 0),
    0,
  );
  const debtCents = payables.reduce((s, p) => s + cents(p.remaining), 0);
  const account = usable.find((a) => a.id === accountId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await quickCash({
        id,
        key,
        accountId,
        direction: "OUT",
        category: counterparty.kind === "CREW" ? "CREW_ACT" : "SUPPLIER",
        amount: (payCents / 100).toFixed(2),
        projectId: scope.projectId ?? "", // Д-95: долги только своей области
        supplierId: counterparty.kind === "SUPPLIER" ? counterparty.id : "",
        crewId: counterparty.kind === "CREW" ? counterparty.id : "",
        counterpartyName: "",
        basis: counterparty.kind === "CREW" ? "Оплата бригаде по актам" : "Оплата поставщику",
        allocations: payables.map((p) => ({
          payableId: p.id,
          paymentRequestId: "",
          amount: amounts[p.id] ?? "",
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Оплата ${result.data.number} проведена`);
      router.push(`${scope.base}/operations/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y rounded-lg border">
        {payables.map((p) => {
          const value = amounts[p.id] ?? "";
          const over = value !== "" && cents(toNumber(value)) > cents(p.remaining);
          return (
            <li key={p.id} className="flex flex-col gap-2 p-3">
              <span className="text-sm font-medium">{p.source}</span>
              <span className="text-xs text-muted-foreground">
                Сумма {formatMoney(p.amount, p.currency)} · оплачено{" "}
                {formatMoney(p.paid, p.currency)}
                {p.dueDate ? ` · срок ${formatDate(p.dueDate)}` : ""}
              </span>
              <span className={over ? "text-sm font-medium text-destructive" : "text-sm"}>
                Остаток долга: <b>{formatMoney(p.remaining, p.currency)}</b>
              </span>
              <div className="flex items-center gap-2">
                <MoneyInput
                  currency={p.currency}
                  aria-label={`Оплатить: ${p.source}`}
                  aria-invalid={over}
                  value={value}
                  onChange={(e) => setAmounts((s) => ({ ...s, [p.id]: e.target.value }))}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setAmounts((s) => ({ ...s, [p.id]: p.remaining.toFixed(2).replace(".", ",") }))
                  }
                >
                  Весь остаток
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-1">
        <Label htmlFor="account">Из кассы / со счёта</Label>
        <NativeSelect
          id="account"
          className="h-11 text-base"
          placeholder="Выберите"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          options={usable.map((a) => ({
            value: a.id,
            label: `${a.name} — ${formatMoney(a.balance, a.currency)}`,
          }))}
        />
        {usable.length === 0 ? (
          <p className="text-sm text-destructive">
            Нет активной кассы в {currency} — конвертации нет (Д-18).
          </p>
        ) : null}
      </div>

      {/* US-06: сумма оплаты и остаток долга после неё. */}
      <div className="rounded-lg bg-muted p-3 text-sm" aria-live="polite">
        <p>
          Оплата: <b data-testid="pay-total">{formatMoney(payCents / 100, currency)}</b>
        </p>
        <p>
          Останется долга:{" "}
          <b data-testid="debt-after">{formatMoney((debtCents - payCents) / 100, currency)}</b>
        </p>
        {account ? (
          <p className="text-muted-foreground">
            В кассе после оплаты: {formatMoney((cents(account.balance) - payCents) / 100, currency)}
          </p>
        ) : null}
      </div>

      <SubmitBar pending={isPending} label="Провести оплату" error={error} />
    </form>
  );
}
