"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/native-select";
import { Label } from "@/components/ui/label";
import { SubmitBar } from "@/features/warehouse/components/submit-bar";
import { formatMoney } from "@/lib/format";
import { useDocumentId, useIdempotencyKey } from "@/lib/idempotency";

import { useFinanceScope } from "./finance-scope";
import { quickCash } from "../actions";
import type { AccountRow, PaymentRequestRow } from "../queries";

import { MoneyInput } from "./money-input";

/** Расход по согласованному счёту на оплату (прочие расходы, зарплаты, выплаты вне актов — Д-13). */
export function ExpenseForm({
  request,
  accounts,
}: {
  request: PaymentRequestRow;
  accounts: AccountRow[];
}) {
  const router = useRouter();
  const scope = useFinanceScope();
  const id = useDocumentId();
  const { key } = useIdempotencyKey();
  const usable = accounts.filter((a) => a.currency === request.currency && a.isActive);
  const [accountId, setAccountId] = useState(usable.length === 1 ? usable[0]!.id : "");
  const [amount, setAmount] = useState(request.remaining.toFixed(2).replace(".", ","));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await quickCash({
        id,
        key,
        accountId,
        direction: "OUT",
        category: request.purpose,
        amount,
        projectId: scope.projectId ?? "",
        supplierId: "",
        counterpartyName: request.payee,
        basis: `${request.number ?? "Счёт"}: ${request.basis ?? ""}`,
        allocations: [{ payableId: "", paymentRequestId: request.id, amount }],
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Расход ${result.data.number} проведён`);
      router.push(`${scope.base}/operations/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="text-sm">
        К оплате по счёту: <b>{formatMoney(request.remaining, request.currency)}</b> из{" "}
        {formatMoney(request.amount, request.currency)}
      </p>
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
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="amount">Сумма</Label>
        <MoneyInput
          id="amount"
          currency={request.currency}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <SubmitBar pending={isPending} label="Провести расход" error={error} />
    </form>
  );
}
