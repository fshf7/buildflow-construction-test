"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { saveSupplier } from "../actions";
import type { SupplierRow } from "../queries";
import { supplierSchema, type SupplierInput } from "../schemas";

import { useSave } from "./use-save";

export function SupplierForm({
  supplier,
  onSaved,
}: {
  supplier?: SupplierRow;
  onSaved: () => void;
}) {
  const { save, error, isPending } = useSave(saveSupplier, onSaved);
  const form = useForm<SupplierInput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      id: supplier?.id,
      name: supplier?.name ?? "",
      taxId: supplier?.taxId ?? "",
      phone: supplier?.phone ?? "",
      contactPerson: supplier?.contactPerson ?? "",
      address: supplier?.address ?? "",
      isActive: supplier?.isActive ?? true,
    },
  });
  const { errors } = form.formState;

  return (
    <form onSubmit={form.handleSubmit(save)} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="supplier-name">Название</FieldLabel>
          <Input id="supplier-name" {...form.register("name")} />
          <FieldError errors={[errors.name]} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="supplier-tax">ИНН</FieldLabel>
            <Input id="supplier-tax" inputMode="numeric" {...form.register("taxId")} />
          </Field>
          <Field>
            <FieldLabel htmlFor="supplier-phone">Телефон</FieldLabel>
            <Input id="supplier-phone" type="tel" inputMode="tel" {...form.register("phone")} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="supplier-contact">Контактное лицо</FieldLabel>
          <Input id="supplier-contact" {...form.register("contactPerson")} />
        </Field>
        <Field>
          <FieldLabel htmlFor="supplier-address">Адрес</FieldLabel>
          <Input id="supplier-address" {...form.register("address")} />
        </Field>
        <Controller
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id="supplier-active"
                checked={field.value}
                onCheckedChange={(on) => field.onChange(on === true)}
              />
              <FieldLabel htmlFor="supplier-active" className="font-normal">
                Работаем (снимите, чтобы убрать в архив)
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
