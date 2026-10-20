"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import type { z } from "zod";

import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { saveExpenseCategory } from "../actions";
import { colorPill, EXPENSE_COLORS, type ExpenseColor } from "../expense-colors";
import type { ExpenseCategoryRow } from "../queries";
import { expenseCategorySchema, type ExpenseCategoryInput } from "../schemas";

import { useSave } from "./use-save";

export function ExpenseCategoryForm({
  category,
  onSaved,
}: {
  category?: ExpenseCategoryRow;
  onSaved: () => void;
}) {
  const { save, error, isPending } = useSave(saveExpenseCategory, onSaved);
  const form = useForm<z.input<typeof expenseCategorySchema>, unknown, ExpenseCategoryInput>({
    resolver: zodResolver(expenseCategorySchema),
    defaultValues: {
      id: category?.id,
      name: category?.name ?? "",
      color: (category?.color as ExpenseColor | undefined) ?? "gray",
      viaWarehouse: category?.viaWarehouse ?? false,
      sortOrder: category?.sortOrder ?? 100,
      isActive: category?.isActive ?? true,
    },
  });
  const { errors } = form.formState;
  const [name, color] = [
    useWatch({ control: form.control, name: "name" }),
    useWatch({ control: form.control, name: "color" }),
  ];

  return (
    <form onSubmit={form.handleSubmit(save)} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="category-name">Название</FieldLabel>
          <Input id="category-name" {...form.register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>
        <div className="grid grid-cols-[1fr_8rem] gap-4">
          <Field data-invalid={Boolean(errors.color)}>
            <FieldLabel htmlFor="category-color">Цвет</FieldLabel>
            <NativeSelect
              id="category-color"
              options={Object.entries(EXPENSE_COLORS).map(([value, c]) => ({
                value,
                label: c.label,
              }))}
              {...form.register("color")}
            />
            <FieldDescription>
              Так будет выглядеть:{" "}
              <span className={cn("rounded-full px-2 py-0.5 text-xs", colorPill(color))}>
                {name || "Категория"}
              </span>
            </FieldDescription>
          </Field>
          <Field data-invalid={Boolean(errors.sortOrder)}>
            <FieldLabel htmlFor="category-order">Порядок</FieldLabel>
            <Input id="category-order" inputMode="numeric" {...form.register("sortOrder")} />
          </Field>
        </div>
        <Controller
          control={form.control}
          name="viaWarehouse"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id="category-warehouse"
                checked={field.value}
                onCheckedChange={(on) => field.onChange(on === true)}
              />
              <FieldLabel htmlFor="category-warehouse" className="font-normal">
                Идёт через склад (сначала принимает заведующий складом)
              </FieldLabel>
            </Field>
          )}
        />
        <Controller
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id="category-active"
                checked={field.value}
                onCheckedChange={(on) => field.onChange(on === true)}
              />
              <FieldLabel htmlFor="category-active" className="font-normal">
                Используется (снимите, чтобы убрать в архив)
              </FieldLabel>
            </Field>
          )}
        />
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
