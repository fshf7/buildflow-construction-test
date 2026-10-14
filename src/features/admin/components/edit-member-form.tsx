"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { updateMember } from "../actions";
import type { MemberRow, ProjectOption } from "../queries";
import { updateMemberSchema, type UpdateMemberInput } from "../schemas";

import { AccessFields } from "./access-fields";

export function EditMemberForm({
  member,
  projects,
}: {
  member: MemberRow;
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<UpdateMemberInput>({
    resolver: zodResolver(updateMemberSchema),
    defaultValues: {
      memberId: member.id,
      fullName: member.fullName,
      phone: member.phone ?? "",
      isActive: member.isActive,
      roles: member.roles,
      allProjects: member.allProjects,
      projectIds: member.projectIds,
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await updateMember(values);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      toast.success("Изменения сохранены");
      router.push("/admin/members");
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl">
      <FieldGroup>
        <Field>
          <FieldLabel>Логин</FieldLabel>
          <Input value={member.login ?? member.email ?? ""} disabled readOnly />
          <FieldDescription>
            Логин не меняется. Забыл пароль — «Сбросить пароль» выше.
          </FieldDescription>
        </Field>
        <Field data-invalid={Boolean(errors.fullName)}>
          <FieldLabel htmlFor="fullName">ФИО</FieldLabel>
          <Input
            id="fullName"
            aria-invalid={Boolean(errors.fullName)}
            {...form.register("fullName")}
          />
          <FieldError errors={[errors.fullName]} />
        </Field>
        <Field data-invalid={Boolean(errors.phone)}>
          <FieldLabel htmlFor="phone">Телефон</FieldLabel>
          <Input id="phone" type="tel" inputMode="tel" {...form.register("phone")} />
          <FieldError errors={[errors.phone]} />
        </Field>

        <AccessFields
          control={form.control}
          errors={errors}
          setValue={form.setValue}
          projects={projects}
        />

        <Controller
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id="isActive"
                checked={field.value}
                onCheckedChange={(on) => field.onChange(on === true)}
              />
              <FieldLabel htmlFor="isActive" className="font-normal">
                Доступ активен
              </FieldLabel>
            </Field>
          )}
        />

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
