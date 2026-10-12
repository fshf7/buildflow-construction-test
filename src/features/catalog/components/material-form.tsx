"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { saveMaterial } from "../actions";
import type { MaterialRow, UnitRow } from "../queries";
import { materialSchema, type MaterialInput } from "../schemas";

import { useSave } from "./use-save";

export function MaterialForm({
  material,
  units,
  onSaved,
}: {
  material?: MaterialRow;
  units: UnitRow[];
  onSaved: () => void;
}) {
  const { save, error, isPending } = useSave(saveMaterial, onSaved);
  const form = useForm<MaterialInput>({
    resolver: zodResolver(materialSchema),
    defaultValues: {
      id: material?.id,
      code: material?.code ?? "",
      name: material?.name ?? "",
      unitId: material?.unitId ?? "",
      category: material?.category ?? "",
      isActive: material?.isActive ?? true,
    },
  });
  const { errors } = form.formState;

  return (
    <form onSubmit={form.handleSubmit(save)} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="material-name">Название</FieldLabel>
          <Input id="material-name" {...form.register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.unitId)}>
            <FieldLabel htmlFor="material-unit">Единица измерения</FieldLabel>
            <Controller
              control={form.control}
              name="unitId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="material-unit"
                    className="w-full"
                    aria-invalid={Boolean(errors.unitId)}
                  >
                    <SelectValue placeholder="Выберите" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.code} — {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[errors.unitId]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="material-code">Код (артикул)</FieldLabel>
            <Input id="material-code" {...form.register("code")} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="material-category">Категория</FieldLabel>
          <Input
            id="material-category"
            placeholder="Напр. Сыпучие, Арматура"
            {...form.register("category")}
          />
        </Field>
        <Controller
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id="material-active"
                checked={field.value}
                onCheckedChange={(on) => field.onChange(on === true)}
              />
              <FieldLabel htmlFor="material-active" className="font-normal">
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
