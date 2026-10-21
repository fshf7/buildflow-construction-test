"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";

import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { saveService, saveWorkStage } from "../actions";
import type { ServiceRow, UnitRow, WorkStageRow } from "../queries";
import { serviceSchema, workStageSchema, type ServiceInput, type WorkStageInput } from "../schemas";

import { useSave } from "./use-save";

function ActiveCheckbox({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Field orientation="horizontal">
      <Checkbox id={id} checked={checked} onCheckedChange={(on) => onChange(on === true)} />
      <FieldLabel htmlFor={id} className="font-normal">
        Используется (снимите, чтобы убрать в архив)
      </FieldLabel>
    </Field>
  );
}

function SaveBar({ error, isPending }: { error: string | null; isPending: boolean }) {
  return (
    <>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Сохранение…" : "Сохранить"}
      </Button>
    </>
  );
}

/** Этап работ (Д-100). */
export function WorkStageForm({ stage, onSaved }: { stage?: WorkStageRow; onSaved: () => void }) {
  const { save, error, isPending } = useSave(saveWorkStage, onSaved);
  const form = useForm<z.input<typeof workStageSchema>, unknown, WorkStageInput>({
    resolver: zodResolver(workStageSchema),
    defaultValues: {
      id: stage?.id,
      name: stage?.name ?? "",
      sortOrder: stage?.sortOrder ?? 100,
      isActive: stage?.isActive ?? true,
    },
  });
  const { errors } = form.formState;
  return (
    <form onSubmit={form.handleSubmit(save)} noValidate>
      <FieldGroup>
        <div className="grid grid-cols-[1fr_8rem] gap-4">
          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel htmlFor="stage-name">Название</FieldLabel>
            <Input id="stage-name" {...form.register("name")} />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="stage-order">Порядок</FieldLabel>
            <Input id="stage-order" inputMode="numeric" {...form.register("sortOrder")} />
          </Field>
        </div>
        <Controller
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <ActiveCheckbox id="stage-active" checked={field.value} onChange={field.onChange} />
          )}
        />
        <SaveBar error={error} isPending={isPending} />
      </FieldGroup>
    </form>
  );
}

/** Услуга (Д-100): кран, экскаватор, питание … с единицей учёта. */
export function ServiceForm({
  service,
  units,
  onSaved,
}: {
  service?: ServiceRow;
  units: UnitRow[];
  onSaved: () => void;
}) {
  const { save, error, isPending } = useSave(saveService, onSaved);
  const form = useForm<ServiceInput>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      id: service?.id,
      name: service?.name ?? "",
      unitId: service?.unitId ?? "",
      isActive: service?.isActive ?? true,
    },
  });
  const { errors } = form.formState;
  return (
    <form onSubmit={form.handleSubmit(save)} noValidate>
      <FieldGroup>
        <div className="grid grid-cols-[1fr_8rem] gap-4">
          <Field data-invalid={Boolean(errors.name)}>
            <FieldLabel htmlFor="service-name">Название</FieldLabel>
            <Input id="service-name" {...form.register("name")} />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field data-invalid={Boolean(errors.unitId)}>
            <FieldLabel htmlFor="service-unit">Ед. изм.</FieldLabel>
            <NativeSelect
              id="service-unit"
              placeholder="—"
              options={units.map((u) => ({ value: u.id, label: u.code }))}
              {...form.register("unitId")}
            />
          </Field>
        </div>
        <Controller
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <ActiveCheckbox id="service-active" checked={field.value} onChange={field.onChange} />
          )}
        />
        <SaveBar error={error} isPending={isPending} />
      </FieldGroup>
    </form>
  );
}
