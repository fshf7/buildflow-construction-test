"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { DraftRestoredNotice } from "@/components/draft-restored-notice";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toNumber } from "@/lib/decimal";
import { useFormDraft } from "@/lib/form-draft";
import { formatMoney } from "@/lib/format";
import { useDocumentId } from "@/lib/idempotency";
import type { MaterialOption, Option } from "@/features/shared/lookups";

import { saveInvoiceDraft } from "../actions";
import { invoiceDraftSchema, type InvoiceDraftInput } from "../schemas";

const emptyLine = {
  materialId: "",
  description: "",
  unitId: "",
  quantity: "",
  price: "",
  purchaseRequestItemId: "",
};

/**
 * Накладная поставщика: материалы и услуги (Д-13), связь со строками заявки для сверки.
 * Несохранённый ввод держится на устройстве (draftKey) — переход в другой раздел его не стирает.
 */
export function InvoiceEditor({
  initial,
  projects,
  suppliers,
  materials,
  units,
  requests,
  draftKey,
}: {
  initial: Partial<InvoiceDraftInput>;
  projects: Option[];
  suppliers: Option[];
  materials: MaterialOption[];
  units: Option[];
  requests: { id: string; projectId: string; label: string }[];
  draftKey: string;
}) {
  const router = useRouter();
  const id = useDocumentId(initial.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<InvoiceDraftInput>({
    resolver: zodResolver(invoiceDraftSchema),
    defaultValues: {
      id,
      projectId: initial.projectId ?? (projects.length === 1 ? projects[0]!.id : ""),
      supplierId: initial.supplierId ?? "",
      purchaseRequestId: initial.purchaseRequestId ?? "",
      supplierDocNumber: initial.supplierDocNumber ?? "",
      supplierDocDate: initial.supplierDocDate ?? "",
      currency: initial.currency ?? "TJS",
      note: initial.note ?? "",
      lines: initial.lines?.length ? initial.lines : [emptyLine],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const [projectId, lines] = [
    useWatch({ control: form.control, name: "projectId" }),
    useWatch({ control: form.control, name: "lines" }),
  ];
  const { errors } = form.formState;

  const total = lines.reduce((sum, l) => {
    const v = toNumber(l.quantity || "0") * toNumber(l.price || "0");
    return Number.isFinite(v) ? sum + Math.round(v * 100) / 100 : sum;
  }, 0);

  const draft = useFormDraft(form, draftKey);

  // id — из значений формы: у восстановленного ввода он прежний, повтор сохранения не создаст дубль.
  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await saveInvoiceDraft(values);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      draft.clear();
      toast.success("Накладная сохранена");
      router.push(`/procurement/invoices/${values.id}`);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        {draft.restoredAt ? (
          <DraftRestoredNotice
            savedAt={draft.restoredAt}
            onClear={() => {
              draft.clear();
              form.reset();
            }}
          />
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field data-invalid={Boolean(errors.projectId)}>
            <FieldLabel htmlFor="projectId">Объект</FieldLabel>
            <NativeSelect
              id="projectId"
              placeholder="Выберите объект"
              options={projects.map((p) => ({ value: p.id, label: p.label }))}
              {...form.register("projectId")}
            />
            <FieldError errors={[errors.projectId]} />
          </Field>
          <Field data-invalid={Boolean(errors.supplierId)}>
            <FieldLabel htmlFor="supplierId">Поставщик</FieldLabel>
            <NativeSelect
              id="supplierId"
              placeholder="Выберите поставщика"
              options={suppliers.map((s) => ({ value: s.id, label: s.label }))}
              {...form.register("supplierId")}
            />
            <FieldError errors={[errors.supplierId]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="purchaseRequestId">Заявка</FieldLabel>
            <NativeSelect
              id="purchaseRequestId"
              placeholder="Без заявки"
              options={requests
                .filter((r) => r.projectId === projectId)
                .map((r) => ({ value: r.id, label: r.label }))}
              {...form.register("purchaseRequestId")}
            />
          </Field>
          <Field data-invalid={Boolean(errors.supplierDocNumber)}>
            <FieldLabel htmlFor="supplierDocNumber">№ накладной поставщика</FieldLabel>
            <Input id="supplierDocNumber" {...form.register("supplierDocNumber")} />
            <FieldError errors={[errors.supplierDocNumber]} />
          </Field>
          <Field data-invalid={Boolean(errors.supplierDocDate)}>
            <FieldLabel htmlFor="supplierDocDate">Дата накладной</FieldLabel>
            <Input id="supplierDocDate" type="date" {...form.register("supplierDocDate")} />
            <FieldError errors={[errors.supplierDocDate]} />
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
          {fields.map((field, index) => {
            const lineErrors = errors.lines?.[index];
            const isService = !lines[index]?.materialId;
            return (
              <div
                key={field.id}
                className="grid gap-2 rounded-lg border p-3 lg:grid-cols-[1fr_7rem_7rem_2.5rem]"
              >
                <div className="flex flex-col gap-2">
                  <NativeSelect
                    aria-label={`Материал, строка ${index + 1}`}
                    placeholder="Услуга (без материала)"
                    options={materials.map((m) => ({
                      value: m.id,
                      label: `${m.name} (${m.unit})`,
                    }))}
                    {...form.register(`lines.${index}.materialId`)}
                  />
                  {isService ? (
                    <div className="grid grid-cols-[1fr_7rem] gap-2">
                      <Input
                        aria-label={`Описание услуги, строка ${index + 1}`}
                        placeholder="Описание услуги, напр. Доставка"
                        {...form.register(`lines.${index}.description`)}
                      />
                      <NativeSelect
                        aria-label={`Единица, строка ${index + 1}`}
                        placeholder="Ед."
                        options={units.map((u) => ({ value: u.id, label: u.label }))}
                        {...form.register(`lines.${index}.unitId`)}
                      />
                    </div>
                  ) : null}
                </div>
                <Input
                  aria-label={`Количество, строка ${index + 1}`}
                  inputMode="decimal"
                  placeholder="Кол-во"
                  {...form.register(`lines.${index}.quantity`)}
                />
                <Input
                  aria-label={`Цена, строка ${index + 1}`}
                  inputMode="decimal"
                  placeholder="Цена"
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
                  <p className="text-sm text-destructive lg:col-span-4">
                    {lineErrors.description?.message ??
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
            {isPending ? "Сохранение…" : "Сохранить"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Отмена
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
