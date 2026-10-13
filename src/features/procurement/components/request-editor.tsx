"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toNumber } from "@/lib/decimal";
import { formatMoney } from "@/lib/format";
import { useDocumentId } from "@/lib/idempotency";
import type { MaterialOption, Option } from "@/features/shared/lookups";

import { saveRequestDraft } from "../actions";
import { requestDraftSchema, type RequestDraftInput } from "../schemas";

const emptyLine = { materialId: "", quantity: "", supplierId: "", price: "", note: "" };

/** Черновик заявки: объект, строки (материал, количество, поставщик, цена). US-01. */
export function RequestEditor({
  initial,
  projects,
  materials,
  suppliers,
}: {
  initial?: RequestDraftInput;
  projects: Option[];
  materials: MaterialOption[];
  suppliers: Option[];
}) {
  const router = useRouter();
  const id = useDocumentId(initial?.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<RequestDraftInput>({
    resolver: zodResolver(requestDraftSchema),
    defaultValues: initial ?? {
      id,
      projectId: projects.length === 1 ? projects[0]!.id : "",
      neededBy: "",
      currency: "TJS",
      note: "",
      lines: [emptyLine],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const lines = useWatch({ control: form.control, name: "lines" });
  const { errors } = form.formState;
  const unitOf = new Map(materials.map((m) => [m.id, m.unit]));

  const total = lines.reduce((sum, l) => {
    const q = toNumber(l.quantity || "0");
    const p = toNumber(l.price || "0");
    return Number.isFinite(q * p) ? sum + q * p : sum;
  }, 0);

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await saveRequestDraft({ ...values, id });
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      toast.success("Черновик заявки сохранён");
      router.push(`/procurement/requests/${id}`);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field data-invalid={Boolean(errors.projectId)}>
            <FieldLabel htmlFor="projectId">Объект</FieldLabel>
            <NativeSelect
              id="projectId"
              placeholder="Выберите объект"
              options={projects.map((p) => ({ value: p.id, label: p.label }))}
              disabled={Boolean(initial)}
              {...form.register("projectId")}
            />
            <FieldError errors={[errors.projectId]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="neededBy">Нужно к</FieldLabel>
            <Input id="neededBy" type="date" {...form.register("neededBy")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="currency">Валюта</FieldLabel>
            <NativeSelect
              id="currency"
              options={["TJS", "USD", "RUB", "CNY"].map((c) => ({ value: c, label: c }))}
              {...form.register("currency")}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          <div className="hidden grid-cols-[1fr_7rem_1fr_7rem_2.5rem] gap-2 text-xs font-medium text-muted-foreground lg:grid">
            <span>Материал</span>
            <span>Количество</span>
            <span>Поставщик</span>
            <span>Цена за ед.</span>
            <span />
          </div>
          {fields.map((field, index) => {
            const lineErrors = errors.lines?.[index];
            return (
              <div
                key={field.id}
                className="grid gap-2 rounded-lg border p-3 lg:grid-cols-[1fr_7rem_1fr_7rem_2.5rem] lg:border-0 lg:p-0"
              >
                <NativeSelect
                  aria-label={`Материал, строка ${index + 1}`}
                  aria-invalid={Boolean(lineErrors?.materialId)}
                  placeholder="Материал"
                  options={materials.map((m) => ({ value: m.id, label: `${m.name} (${m.unit})` }))}
                  {...form.register(`lines.${index}.materialId`)}
                />
                <div className="flex items-center gap-1">
                  <Input
                    aria-label={`Количество, строка ${index + 1}`}
                    aria-invalid={Boolean(lineErrors?.quantity)}
                    inputMode="decimal"
                    placeholder="0"
                    {...form.register(`lines.${index}.quantity`)}
                  />
                  <span className="w-8 shrink-0 text-xs text-muted-foreground">
                    {unitOf.get(lines[index]?.materialId ?? "") ?? ""}
                  </span>
                </div>
                <NativeSelect
                  aria-label={`Поставщик, строка ${index + 1}`}
                  placeholder="Поставщик"
                  options={suppliers.map((s) => ({ value: s.id, label: s.label }))}
                  {...form.register(`lines.${index}.supplierId`)}
                />
                <Input
                  aria-label={`Цена, строка ${index + 1}`}
                  aria-invalid={Boolean(lineErrors?.price)}
                  inputMode="decimal"
                  placeholder="0,00"
                  {...form.register(`lines.${index}.price`)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label={`Удалить строку ${index + 1}`}
                  disabled={fields.length === 1}
                  onClick={() => remove(index)}
                >
                  <Trash2 />
                </Button>
                {lineErrors ? (
                  <p className="text-sm text-destructive lg:col-span-5">
                    {lineErrors.materialId?.message ??
                      lineErrors.quantity?.message ??
                      lineErrors.price?.message}
                  </p>
                ) : null}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => append(emptyLine)}>
              <Plus />
              Добавить строку
            </Button>
            <span className="text-sm">
              Итого: <b>{formatMoney(total, form.getValues("currency"))}</b>
            </span>
          </div>
          <FieldError
            errors={[errors.lines?.root ?? (errors.lines as { message?: string } | undefined)]}
          />
        </div>

        <Field>
          <FieldLabel htmlFor="note">Примечание</FieldLabel>
          <Input id="note" {...form.register("note")} />
        </Field>

        {serverError ? (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Сохранение…" : "Сохранить черновик"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Отмена
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
