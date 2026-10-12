"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { createProject, updateProject } from "../actions";
import type { ProjectDetail } from "../queries";
import { projectFormSchema, type ProjectFormInput } from "../schemas";

/** Создание (project не передан) или редактирование объекта. */
export function ProjectForm({
  project,
  canEdit = true,
}: {
  project?: ProjectDetail;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<ProjectFormInput>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      code: project?.code ?? "",
      name: project?.name ?? "",
      address: project?.address ?? "",
      startDate: project?.startDate ?? "",
      endDate: project?.endDate ?? "",
      archived: project?.status === "ARCHIVED",
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = project
        ? await updateProject({ ...values, id: project.id })
        : await createProject(values);
      if (!result.ok) {
        setServerError(result.error);
        if (result.fieldErrors?.code) form.setError("code", { message: result.fieldErrors.code });
        return;
      }
      toast.success("Объект сохранён");
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={!canEdit || isPending} className="contents">
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <Field data-invalid={Boolean(errors.code)}>
              <FieldLabel htmlFor="code">Код</FieldLabel>
              <Input id="code" aria-invalid={Boolean(errors.code)} {...form.register("code")} />
              <FieldError errors={[errors.code]} />
            </Field>
            <Field data-invalid={Boolean(errors.name)}>
              <FieldLabel htmlFor="name">Название</FieldLabel>
              <Input id="name" aria-invalid={Boolean(errors.name)} {...form.register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="address">Адрес</FieldLabel>
            <Input id="address" {...form.register("address")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.startDate)}>
              <FieldLabel htmlFor="startDate">Начало работ</FieldLabel>
              <Input id="startDate" type="date" {...form.register("startDate")} />
              <FieldError errors={[errors.startDate]} />
            </Field>
            <Field data-invalid={Boolean(errors.endDate)}>
              <FieldLabel htmlFor="endDate">Окончание</FieldLabel>
              <Input id="endDate" type="date" {...form.register("endDate")} />
              <FieldError errors={[errors.endDate]} />
            </Field>
          </div>
          {project ? (
            <Controller
              control={form.control}
              name="archived"
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id="archived"
                    checked={field.value}
                    onCheckedChange={(on) => field.onChange(on === true)}
                  />
                  <FieldLabel htmlFor="archived" className="font-normal">
                    Объект в архиве (работы завершены)
                  </FieldLabel>
                </Field>
              )}
            />
          ) : null}
          {serverError ? (
            <p role="alert" className="text-sm text-destructive">
              {serverError}
            </p>
          ) : null}
          {canEdit ? (
            <div>
              <Button type="submit">
                {isPending ? "Сохранение…" : project ? "Сохранить" : "Создать объект"}
              </Button>
            </div>
          ) : null}
        </FieldGroup>
      </fieldset>
    </form>
  );
}
