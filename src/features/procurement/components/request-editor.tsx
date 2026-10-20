"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { DraftRestoredNotice } from "@/components/draft-restored-notice";
import { NativeSelect } from "@/components/native-select";
import { useObject, useObjectHref } from "@/components/object-context";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { MaterialOption } from "@/features/shared/lookups";
import { useFormDraft } from "@/lib/form-draft";
import { useDocumentId } from "@/lib/idempotency";

import { saveRequestDraft } from "../actions";
import { requestDraftSchema, type RequestDraftInput } from "../schemas";

const emptyLine = { materialId: "", quantity: "", note: "" };

/**
 * Черновик заявки склада для снабженца (US-01, Д-92): строки «материал + количество» по текущему
 * объекту (Д-94 — объект не выбирается, работа идёт внутри него).
 * Поставщика и цены в заявке нет — поставщика выбирает склад при приёмке, цены вносит бухгалтер из накладной.
 * Несохранённый ввод держится на устройстве (draftKey) — уход в «Склад» за остатком его не стирает.
 */
export function RequestEditor({
  initial,
  materials,
  draftKey,
}: {
  initial?: RequestDraftInput;
  materials: MaterialOption[];
  draftKey: string;
}) {
  const router = useRouter();
  const object = useObject();
  const href = useObjectHref();
  const id = useDocumentId(initial?.id);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<RequestDraftInput>({
    resolver: zodResolver(requestDraftSchema),
    defaultValues: initial ?? {
      id,
      projectId: object.id,
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
  const draft = useFormDraft(form, draftKey);

  // id — из значений формы: у восстановленного ввода он прежний, повтор сохранения не создаст дубль.
  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await saveRequestDraft({ ...values, projectId: object.id });
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      draft.clear();
      toast.success("Черновик заявки сохранён");
      router.push(href(`/warehouse/requests/${values.id}`));
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="neededBy">Нужно к</FieldLabel>
            <Input id="neededBy" type="date" {...form.register("neededBy")} />
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          <div className="hidden grid-cols-[1fr_9rem_1fr_2.5rem] gap-2 text-xs font-medium text-muted-foreground lg:grid">
            <span>Материал</span>
            <span>Количество</span>
            <span>Комментарий для снабженца</span>
            <span />
          </div>
          {fields.map((field, index) => {
            const lineErrors = errors.lines?.[index];
            return (
              <div
                key={field.id}
                className="grid gap-2 rounded-lg border p-3 lg:grid-cols-[1fr_9rem_1fr_2.5rem] lg:border-0 lg:p-0"
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
                <Input
                  aria-label={`Комментарий, строка ${index + 1}`}
                  placeholder="Марка, размер, срочность…"
                  {...form.register(`lines.${index}.note`)}
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
                    {lineErrors.materialId?.message ?? lineErrors.quantity?.message}
                  </p>
                ) : null}
              </div>
            );
          })}
          <div>
            <Button type="button" variant="outline" onClick={() => append(emptyLine)}>
              <Plus />
              Добавить строку
            </Button>
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
