"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { DraftRestoredNotice } from "@/components/draft-restored-notice";
import { NativeSelect } from "@/components/native-select";
import { useObject, useObjectHref } from "@/components/object-context";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { colorPill } from "@/features/catalog/expense-colors";
import type { MaterialOption, Option } from "@/features/shared/lookups";
import { toNumber } from "@/lib/decimal";
import { useFormDraft } from "@/lib/form-draft";
import { formatAmount } from "@/lib/format";
import { useDocumentId } from "@/lib/idempotency";
import { cn } from "@/lib/utils";

import { saveInvoice } from "../actions";
import { currencyLabel, EXPENSE_CURRENCIES, parsePastedLines } from "../expenses";
import { invoiceLineFields, type InvoiceLineInput } from "../schemas";

export type SheetCategory = { id: string; name: string; color: string };

type SheetLine = {
  description: string;
  materialId: string;
  categoryId: string;
  quantity: string;
  unitId: string;
  price: string;
  /** Что из вставки не нашлось в справочниках — подсветка строки. */
  unmatched?: string[];
};

export type SheetValues = {
  id: string;
  supplierId: string;
  docDate: string;
  docNumber: string;
  currency: string;
  note: string;
  lines: SheetLine[];
};

const emptyLine = (): SheetLine => ({
  description: "",
  materialId: "",
  categoryId: "",
  quantity: "",
  unitId: "",
  price: "",
});
const isBlank = (l: SheetLine) => !l.description.trim() && !l.categoryId && !l.quantity && !l.price;

const HEADER_LABELS: Record<string, string> = {
  supplierId: "поставщик",
  docDate: "дата",
  currency: "валюта",
};

const cell =
  "h-9 w-full min-w-0 border-0 bg-transparent px-2 text-sm outline-none focus:bg-background focus:ring-2 focus:ring-primary focus:ring-inset aria-invalid:bg-destructive/10";

/**
 * Накладная как таблица Excel (Д-99): шапка — поставщик, дата, № бумажной накладной, валюта;
 * строки — наименование, категория, кол-во, ед., цена, сумма. Внизу всегда пустая строка;
 * Tab/Enter/стрелки; вставка строк из Excel / Google Таблиц. «Сохранить накладную» — номер НК и
 * долг поставщику сразу; несохранённый ввод держится на устройстве (Д-93).
 */
export function InvoiceSheet({
  initial,
  number,
  suppliers,
  categories,
  units,
  materials,
  draftKey,
  today,
}: {
  initial?: SheetValues;
  number?: string | null;
  suppliers: Option[];
  categories: SheetCategory[];
  units: Option[];
  materials: MaterialOption[];
  draftKey: string;
  today: string;
}) {
  const router = useRouter();
  const object = useObject();
  const href = useObjectHref();
  const id = useDocumentId(initial?.id);
  const [isPending, startTransition] = useTransition();
  const [lineErrors, setLineErrors] = useState<Record<number, string[]>>({});
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<SheetValues>({
    defaultValues: initial
      ? { ...initial, lines: [...initial.lines, emptyLine()] }
      : {
          id,
          supplierId: "",
          docDate: today,
          docNumber: "",
          currency: "TJS",
          note: "",
          lines: [emptyLine()],
        },
  });
  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "lines",
  });
  const lines = useWatch({ control: form.control, name: "lines" });
  const currency = useWatch({ control: form.control, name: "currency" });
  const draft = useFormDraft(form, draftKey);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const materialByName = new Map(materials.map((m) => [m.name.toLocaleLowerCase("ru"), m]));
  const unitLabel = (u: Option) => u.label.split(" — ")[0]!;
  const amountOf = (l?: SheetLine) =>
    l?.quantity && l.price ? toNumber(l.quantity) * toNumber(l.price) : null;
  const totalCents = (lines ?? []).reduce((s, l) => {
    const a = amountOf(l);
    return a === null || !Number.isFinite(a) ? s : s + Math.round(a * 100);
  }, 0);

  /** Всегда одна пустая строка внизу — как в Excel. */
  function ensureTrailing() {
    const all = form.getValues("lines");
    const last = all[all.length - 1];
    if (!last || !isBlank(last)) append(emptyLine(), { shouldFocus: false });
  }

  function onDescription(i: number, value: string) {
    // Наименование совпало с материалом справочника — подставляем материал и его единицу.
    const m = materialByName.get(value.trim().toLocaleLowerCase("ru"));
    form.setValue(`lines.${i}.materialId`, m?.id ?? "");
    if (m) form.setValue(`lines.${i}.unitId`, m.unitId);
    form.setValue(`lines.${i}.unmatched`, []);
    ensureTrailing();
  }

  function paste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.trim().includes("\n")) return;
    e.preventDefault();
    const { lines: pasted, header } = parsePastedLines(text, {
      categories: categories.map((c) => ({ id: c.id, name: c.name })),
      units: units.map((u) => ({ id: u.id, name: unitLabel(u) })),
      suppliers: suppliers.map((s) => ({ id: s.id, name: s.label })),
    });
    if (pasted.length === 0) return;
    const filled = pasted.map((p) => {
      const m = materialByName.get(p.description.trim().toLocaleLowerCase("ru"));
      return { ...p, materialId: m?.id ?? "", unitId: p.unitId || m?.unitId || "" };
    });
    const kept = form.getValues("lines").filter((l) => !isBlank(l));
    replace([...kept, ...filled, emptyLine()]);
    if (header) {
      if (!form.getValues("supplierId") && header.supplierId)
        form.setValue("supplierId", header.supplierId);
      if (header.docDate) form.setValue("docDate", header.docDate);
      if (header.currency) form.setValue("currency", header.currency);
    }
    setLineErrors({});
  }

  /** Enter и стрелки — в ту же колонку соседней строки. */
  function navigate(e: React.KeyboardEvent<HTMLElement>) {
    const target = e.target as HTMLElement;
    const isSelect = target.tagName === "SELECT";
    const down = e.key === "Enter" || (!isSelect && e.key === "ArrowDown");
    const up = !isSelect && e.key === "ArrowUp";
    if (!down && !up) return;
    const td = target.closest<HTMLElement>("[data-col]");
    const tr = target.closest("tr");
    if (!td || !tr) return;
    const sibling = (
      down ? tr.nextElementSibling : tr.previousElementSibling
    ) as HTMLElement | null;
    const next = sibling?.querySelector<HTMLElement>(
      `[data-col="${td.dataset.col}"] input, [data-col="${td.dataset.col}"] select`,
    );
    e.preventDefault();
    next?.focus();
  }

  function submit() {
    setServerError(null);
    const v = form.getValues();
    const header: string[] = [];
    if (!v.supplierId) header.push("supplierId");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.docDate)) header.push("docDate");
    if (!v.currency) header.push("currency");
    const errors: Record<number, string[]> = {};
    const parsed: InvoiceLineInput[] = [];
    v.lines.forEach((l, i) => {
      if (isBlank(l)) return;
      const r = invoiceLineFields.safeParse(l);
      if (r.success) parsed.push(r.data);
      else errors[i] = r.error.issues.map((x) => String(x.path[0]));
    });
    setHeaderErrors(header);
    setLineErrors(errors);
    if (header.length > 0 || Object.keys(errors).length > 0 || parsed.length === 0) {
      const missing = [
        ...header.map((h) => HEADER_LABELS[h]),
        ...(Object.keys(errors).length > 0 ? ["строки (подсвечены)"] : []),
        ...(parsed.length === 0 && Object.keys(errors).length === 0 ? ["хотя бы одна строка"] : []),
      ];
      setServerError(`Заполните: ${missing.join(", ")}`);
      return;
    }
    startTransition(async () => {
      const result = await saveInvoice({
        id: v.id,
        key: crypto.randomUUID(),
        projectId: object.id,
        supplierId: v.supplierId,
        docDate: v.docDate,
        docNumber: v.docNumber,
        currency: v.currency,
        note: v.note,
        lines: parsed,
      });
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      draft.clear();
      toast.success(`Накладная ${result.data.number ?? ""} сохранена`);
      router.push(href("/procurement/invoices"));
    });
  }

  const hErr = (f: string) => headerErrors.includes(f);

  return (
    <div className="flex flex-col gap-5">
      {draft.restoredAt ? (
        <DraftRestoredNotice
          savedAt={draft.restoredAt}
          onClear={() => {
            draft.clear();
            form.reset();
          }}
        />
      ) : null}

      <div className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_8rem]">
        <Field data-invalid={hErr("supplierId")}>
          <FieldLabel htmlFor="sheet-supplier">Поставщик</FieldLabel>
          <NativeSelect
            id="sheet-supplier"
            placeholder="Выберите поставщика"
            aria-invalid={hErr("supplierId")}
            options={suppliers.map((s) => ({ value: s.id, label: s.label }))}
            {...form.register("supplierId")}
          />
        </Field>
        <Field data-invalid={hErr("docDate")}>
          <FieldLabel htmlFor="sheet-date">Дата</FieldLabel>
          <Input
            id="sheet-date"
            type="date"
            aria-invalid={hErr("docDate")}
            {...form.register("docDate")}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="sheet-doc">№ накладной поставщика</FieldLabel>
          <Input id="sheet-doc" placeholder="необязательно" {...form.register("docNumber")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="sheet-currency">Валюта</FieldLabel>
          <NativeSelect
            id="sheet-currency"
            options={EXPENSE_CURRENCIES.map((c) => ({ value: c.code, label: c.label }))}
            {...form.register("currency")}
          />
        </Field>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full border-collapse text-sm" onKeyDown={navigate}>
          <thead className="bg-muted/50">
            <tr className="border-b text-left">
              <th className="w-10 px-2 py-2 text-center font-medium text-muted-foreground">№</th>
              <th className="min-w-64 border-l px-2 py-2 font-medium">Наименование</th>
              <th className="w-44 border-l px-2 py-2 font-medium">Категория</th>
              <th className="w-28 border-l px-2 py-2 text-right font-medium">Кол-во</th>
              <th className="w-24 border-l px-2 py-2 font-medium">Ед. изм.</th>
              <th className="w-32 border-l px-2 py-2 text-right font-medium">Цена за ед.</th>
              <th className="w-36 border-l px-2 py-2 text-right font-medium">Сумма</th>
              <th className="w-10 border-l" />
            </tr>
          </thead>
          <tbody>
            {fields.map((field, i) => {
              const l = lines?.[i];
              const bad = (f: string) => Boolean(lineErrors[i]?.includes(f));
              const category = l?.categoryId ? categoryById.get(l.categoryId) : undefined;
              const amount = amountOf(l);
              const last = i === fields.length - 1;
              const unmatched = l?.unmatched ?? [];
              return (
                <tr
                  key={field.id}
                  className={cn(
                    "border-b last:border-b-0",
                    unmatched.length > 0 && "bg-amber-50 dark:bg-amber-950/40",
                  )}
                  title={unmatched.length > 0 ? `Не найдено: ${unmatched.join(", ")}` : undefined}
                >
                  <td className="px-2 text-center text-xs text-muted-foreground tabular-nums">
                    {last && l && isBlank(l) ? "" : i + 1}
                  </td>
                  <td data-col="description" className="border-l p-0">
                    <input
                      aria-label={`Наименование, строка ${i + 1}`}
                      aria-invalid={bad("description")}
                      list="sheet-materials"
                      className={cell}
                      placeholder={last ? "Новая строка — или вставьте из Excel (Ctrl+V)" : ""}
                      onPaste={paste}
                      {...form.register(`lines.${i}.description`, {
                        onChange: (e) => onDescription(i, e.target.value),
                      })}
                    />
                  </td>
                  <td data-col="category" className="border-l px-1.5">
                    <select
                      aria-label={`Категория, строка ${i + 1}`}
                      aria-invalid={bad("categoryId")}
                      className={cn(
                        "h-7 w-full rounded-full border-0 px-2 text-xs outline-none focus:ring-2 focus:ring-primary aria-invalid:ring-2 aria-invalid:ring-destructive",
                        category ? colorPill(category.color) : "bg-muted text-muted-foreground",
                      )}
                      {...form.register(`lines.${i}.categoryId`, { onChange: ensureTrailing })}
                    >
                      <option value="">Категория</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-col="quantity" className="border-l p-0">
                    <input
                      aria-label={`Количество, строка ${i + 1}`}
                      aria-invalid={bad("quantity")}
                      inputMode="decimal"
                      className={cn(cell, "text-right tabular-nums")}
                      {...form.register(`lines.${i}.quantity`, { onChange: ensureTrailing })}
                    />
                  </td>
                  <td data-col="unit" className="border-l p-0">
                    <select
                      aria-label={`Единица, строка ${i + 1}`}
                      aria-invalid={bad("unitId")}
                      className={cell}
                      disabled={Boolean(l?.materialId)}
                      {...form.register(`lines.${i}.unitId`)}
                    >
                      <option value="">—</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {unitLabel(u)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-col="price" className="border-l p-0">
                    <input
                      aria-label={`Цена, строка ${i + 1}`}
                      aria-invalid={bad("price")}
                      inputMode="decimal"
                      className={cn(cell, "text-right tabular-nums")}
                      {...form.register(`lines.${i}.price`, { onChange: ensureTrailing })}
                    />
                  </td>
                  <td className="border-l px-2 text-right font-medium tabular-nums">
                    {amount === null || !Number.isFinite(amount)
                      ? ""
                      : formatAmount(Math.round(amount * 100) / 100)}
                  </td>
                  <td className="border-l text-center">
                    {last && l && isBlank(l) ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Удалить строку ${i + 1}`}
                        onClick={() => {
                          remove(i);
                          setLineErrors({});
                          if (fields.length <= 1) append(emptyLine(), { shouldFocus: false });
                        }}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t bg-muted/30">
            <tr>
              <td colSpan={6} className="px-2 py-2 text-right font-medium">
                Итого
              </td>
              <td className="px-2 py-2 text-right font-semibold tabular-nums">
                {formatAmount(totalCents / 100)} {currencyLabel(currency)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <datalist id="sheet-materials">
        {materials.map((m) => (
          <option key={m.id} value={m.name} />
        ))}
      </datalist>

      <Field>
        <FieldLabel htmlFor="sheet-note">Примечание</FieldLabel>
        <Input id="sheet-note" {...form.register("note")} />
      </Field>

      {serverError ? (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={submit} disabled={isPending}>
          {isPending ? "Сохранение…" : number ? `Сохранить ${number}` : "Сохранить накладную"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Отмена
        </Button>
        <span className="text-xs text-muted-foreground">
          При сохранении накладная получает номер и сразу становится долгом поставщику у кассира.
        </span>
      </div>
    </div>
  );
}
