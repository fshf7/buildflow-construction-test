"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useDocumentId } from "@/lib/idempotency";

import { savePaymentRequest } from "../actions";
import { PURPOSE_LABELS } from "../labels";
import { paymentRequestSchema, type PaymentRequestInput } from "../schemas";

/** Счёт на оплату (§4.5): только расходы без накладной и вне актов (Д-13). */
export function PaymentRequestForm({
  initial,
  crews,
  projects,
}: {
  initial?: PaymentRequestInput;
  crews: { id: string; label: string }[];
  projects: { id: string; label: string }[];
}) {
  const router = useRouter();
  const id = useDocumentId(initial?.id);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<PaymentRequestInput>({
    resolver: zodResolver(paymentRequestSchema),
    defaultValues: initial ?? {
      id,
      projectId: "",
      purpose: "OTHER_EXPENSE",
      payeeCrewId: "",
      payeeName: "",
      amount: "",
      currency: "TJS",
      basis: "",
      note: "",
    },
  });
  const { errors } = form.formState;
  const purpose = useWatch({ control: form.control, name: "purpose" });

  const submit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await savePaymentRequest({ ...values, id });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Черновик счёта сохранён");
      router.push(`/finance/requests/${id}`);
    }),
  );

  return (
    <form onSubmit={submit} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="purpose">Назначение</FieldLabel>
          <NativeSelect
            id="purpose"
            className="h-11 text-base"
            {...form.register("purpose")}
            options={Object.entries(PURPOSE_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <FieldDescription>
            {purpose === "OTHER_EXPENSE"
              ? "Согласует бухгалтер."
              : "Согласует администратор организации (временно, ТЗ не определяет)."}
          </FieldDescription>
        </Field>
        {purpose === "CREW_EXTRA" ? (
          <Field>
            <FieldLabel htmlFor="payeeCrewId">Бригада</FieldLabel>
            <NativeSelect
              id="payeeCrewId"
              className="h-11 text-base"
              placeholder="Выберите"
              {...form.register("payeeCrewId")}
              options={crews.map((c) => ({ value: c.id, label: c.label }))}
            />
          </Field>
        ) : null}
        <Field data-invalid={Boolean(errors.payeeName)}>
          <FieldLabel htmlFor="payeeName">Получатель</FieldLabel>
          <Input id="payeeName" className="h-11 text-base" {...form.register("payeeName")} />
          <FieldError errors={[errors.payeeName]} />
        </Field>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field data-invalid={Boolean(errors.amount)}>
            <FieldLabel htmlFor="amount">Сумма</FieldLabel>
            <Input
              id="amount"
              inputMode="decimal"
              className="h-11 text-base"
              {...form.register("amount")}
            />
            <FieldError errors={[errors.amount]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="currency">Валюта</FieldLabel>
            <NativeSelect
              id="currency"
              className="h-11 text-base"
              {...form.register("currency")}
              options={["TJS", "USD", "RUB", "CNY"].map((c) => ({ value: c, label: c }))}
            />
          </Field>
        </div>
        <Field data-invalid={Boolean(errors.basis)}>
          <FieldLabel htmlFor="basis">Основание</FieldLabel>
          <Input id="basis" className="h-11 text-base" {...form.register("basis")} />
          <FieldError errors={[errors.basis]} />
        </Field>
        <Field>
          <FieldLabel htmlFor="projectId">Объект (необязательно)</FieldLabel>
          <NativeSelect
            id="projectId"
            className="h-11 text-base"
            placeholder="—"
            {...form.register("projectId")}
            options={projects.map((p) => ({ value: p.id, label: p.label }))}
          />
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? "Сохранение…" : "Сохранить черновик"}
        </Button>
      </FieldGroup>
    </form>
  );
}
