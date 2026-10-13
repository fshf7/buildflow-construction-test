"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { NativeSelect } from "@/components/native-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitBar } from "@/features/warehouse/components/submit-bar";
import { useDocumentId, useIdempotencyKey } from "@/lib/idempotency";

import { quickCash } from "../actions";
import { CATEGORY_LABELS, INCOME_CATEGORIES } from "../labels";
import type { AccountRow } from "../queries";

import { MoneyInput } from "./money-input";

/** Приход (BP-04): продажа квартир вручную, средства владельца, прочее — с основанием. */
export function IncomeForm({
  accounts,
  projects,
}: {
  accounts: AccountRow[];
  projects: { id: string; label: string }[];
}) {
  const router = useRouter();
  const id = useDocumentId();
  const { key } = useIdempotencyKey();
  const [accountId, setAccountId] = useState(accounts.length === 1 ? accounts[0]!.id : "");
  const [category, setCategory] = useState<(typeof INCOME_CATEGORIES)[number]>("APARTMENT_SALE");
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState("");
  const [basis, setBasis] = useState("");
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const currency = accounts.find((a) => a.id === accountId)?.currency ?? "TJS";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await quickCash({
        id,
        key,
        accountId,
        direction: "IN",
        category,
        amount,
        projectId,
        supplierId: "",
        counterpartyName: from,
        basis,
        allocations: [],
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Приход ${result.data.number} проведён`);
      router.push(`/finance/operations/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="account">Касса / счёт</Label>
        <NativeSelect
          id="account"
          className="h-11 text-base"
          placeholder="Выберите"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="category">Вид прихода</Label>
        <NativeSelect
          id="category"
          className="h-11 text-base"
          value={category}
          onChange={(e) => setCategory(e.target.value as typeof category)}
          options={INCOME_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="amount">Сумма</Label>
        <MoneyInput
          id="amount"
          currency={currency}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="from">От кого</Label>
        <Input
          id="from"
          className="h-11 text-base"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder={category === "APARTMENT_SALE" ? "Покупатель" : ""}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="basis">Основание</Label>
        <Input
          id="basis"
          className="h-11 text-base"
          value={basis}
          onChange={(e) => setBasis(e.target.value)}
          placeholder={category === "APARTMENT_SALE" ? "Договор, квартира" : ""}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="project">Объект (необязательно)</Label>
        <NativeSelect
          id="project"
          className="h-11 text-base"
          placeholder="—"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          options={projects.map((p) => ({ value: p.id, label: p.label }))}
        />
      </div>
      <SubmitBar pending={isPending} label="Провести приход" error={error} />
    </form>
  );
}
