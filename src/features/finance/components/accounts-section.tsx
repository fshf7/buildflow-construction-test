"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FormDialog } from "@/features/catalog/components/form-dialog";
import { formatMoney } from "@/lib/format";

import { saveCashAccount } from "../actions";
import type { AccountRow } from "../queries";
import { cashAccountSchema, type CashAccountInput } from "../schemas";

function AccountForm({
  account,
  projects,
  onSaved,
}: {
  account?: AccountRow;
  projects: { id: string; label: string }[];
  onSaved: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<CashAccountInput>({
    resolver: zodResolver(cashAccountSchema),
    defaultValues: {
      id: account?.id ?? crypto.randomUUID(),
      name: account?.name ?? "",
      kind: account?.kind ?? "CASH",
      currency: account?.currency ?? "TJS",
      bankName: account?.bankName ?? "",
      accountNumber: account?.accountNumber ?? "",
      projectId: account?.projectId ?? "",
      isActive: account?.isActive ?? true,
    },
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  const submit = form.handleSubmit((v) =>
    startTransition(async () => {
      const r = await saveCashAccount(v);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      toast.success("Сохранено");
      onSaved();
      router.refresh();
    }),
  );
  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(form.formState.errors.name)}>
          <FieldLabel htmlFor="acc-name">Название</FieldLabel>
          <Input id="acc-name" {...form.register("name")} />
          <FieldError errors={[form.formState.errors.name]} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="acc-kind">Вид</FieldLabel>
            <NativeSelect
              id="acc-kind"
              {...form.register("kind")}
              options={[
                { value: "CASH", label: "Касса" },
                { value: "BANK", label: "Банковский счёт" },
              ]}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="acc-currency">Валюта</FieldLabel>
            <NativeSelect
              id="acc-currency"
              {...form.register("currency")}
              options={["TJS", "USD", "RUB", "CNY"].map((c) => ({ value: c, label: c }))}
            />
          </Field>
        </div>
        {kind === "BANK" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="acc-bank">Банк</FieldLabel>
              <Input id="acc-bank" {...form.register("bankName")} />
            </Field>
            <Field>
              <FieldLabel htmlFor="acc-number">Номер счёта</FieldLabel>
              <Input id="acc-number" {...form.register("accountNumber")} />
            </Field>
          </div>
        ) : null}
        <Field>
          <FieldLabel htmlFor="acc-project">Касса объекта (необязательно)</FieldLabel>
          <NativeSelect
            id="acc-project"
            placeholder="Общая"
            {...form.register("projectId")}
            options={projects.map((p) => ({ value: p.id, label: p.label }))}
          />
        </Field>
        <Controller
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id="acc-active"
                checked={field.value}
                onCheckedChange={(on) => field.onChange(on === true)}
              />
              <FieldLabel htmlFor="acc-active" className="font-normal">
                Используется
              </FieldLabel>
            </Field>
          )}
        />
        <p className="text-sm text-muted-foreground">
          Начальный баланс вводится документом «Ввод остатков».
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={isPending}>
          {isPending ? "Сохранение…" : "Сохранить"}
        </Button>
      </FieldGroup>
    </form>
  );
}

export function AccountsSection({
  accounts,
  projects,
}: {
  accounts: AccountRow[];
  projects: { id: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <FormDialog
          trigger={
            <Button>
              <Plus />
              Добавить кассу или счёт
            </Button>
          }
          title="Новая касса"
        >
          {(close) => <AccountForm projects={projects} onSaved={close} />}
        </FormDialog>
      </div>
      <ul className="flex flex-col divide-y rounded-lg border">
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 p-3">
            <span className="flex flex-col">
              <span className="font-medium">
                {a.name}
                {a.isActive ? "" : " (архив)"}
              </span>
              <span className="text-xs text-muted-foreground">
                {a.kind === "BANK" ? `Банк ${a.bankName ?? ""} ${a.accountNumber ?? ""}` : "Касса"}{" "}
                · {formatMoney(a.balance, a.currency)}
              </span>
            </span>
            <FormDialog
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label={`Изменить: ${a.name}`}>
                  <Pencil />
                </Button>
              }
              title="Касса"
            >
              {(close) => <AccountForm account={a} projects={projects} onSaved={close} />}
            </FormDialog>
          </li>
        ))}
      </ul>
    </div>
  );
}
