"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { saveUnit } from "../actions";
import type { UnitRow } from "../queries";
import { unitSchema, type UnitInput } from "../schemas";

import { useSave } from "./use-save";

export function UnitForm({ unit, onSaved }: { unit?: UnitRow; onSaved: () => void }) {
  const { save, error, isPending } = useSave(saveUnit, onSaved);
  // decimals приходит из <input type=number> строкой: вход и выход схемы различаются.
  const form = useForm<z.input<typeof unitSchema>, unknown, UnitInput>({
    resolver: zodResolver(unitSchema),
    defaultValues: {
      id: unit?.id,
      code: unit?.code ?? "",
      name: unit?.name ?? "",
      decimals: unit?.decimals ?? 3,
    },
  });
  const { errors } = form.formState;

  return (
    <form onSubmit={form.handleSubmit(save)} noValidate>
      <FieldGroup>
        <div className="grid grid-cols-[8rem_1fr] gap-4">
          <Field data-invalid={Boolean(errors.code)}>
            <FieldLabel htmlFor="unit-code">Обозначение</FieldLabel>
            <Input id="unit-code" {...form.register("code")} />
            <FieldError errors={[errors.code]} />
          </Field>
          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel htmlFor="unit-name">Название</FieldLabel>
            <Input id="unit-name" {...form.register("name")} />
            <FieldError errors={[errors.name]} />
          </Field>
        </div>
        <Field data-invalid={Boolean(errors.decimals)}>
          <FieldLabel htmlFor="unit-decimals">Знаков после запятой</FieldLabel>
          <Input
            id="unit-decimals"
            type="number"
            min={0}
            max={4}
            inputMode="numeric"
            {...form.register("decimals")}
          />
          <FieldDescription>0 — штуки и мешки, 3 — килограммы и кубометры.</FieldDescription>
          <FieldError errors={[errors.decimals]} />
        </Field>
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
