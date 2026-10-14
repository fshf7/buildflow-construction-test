"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { createMember, type IssuedPassword as Issued } from "../actions";
import type { ProjectOption } from "../queries";
import { createMemberSchema, type CreateMemberInput } from "../schemas";

import { AccessFields } from "./access-fields";
import { IssuedPassword } from "./issued-password";

/** «Добавить сотрудника» (Д-87): логин — телефон или имя латиницей; пароль выдаёт система. */
export function AddMemberForm({ projects }: { projects: ProjectOption[] }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [issued, setIssued] = useState<(Issued & { fullName: string }) | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<CreateMemberInput>({
    resolver: zodResolver(createMemberSchema),
    defaultValues: {
      login: "",
      email: "",
      fullName: "",
      roles: [],
      allProjects: false,
      projectIds: [],
    },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await createMember(values);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      setIssued({ ...result.data, fullName: values.fullName });
      toast.success(`${values.fullName} добавлен`);
      router.refresh();
    });
  });

  if (issued) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <IssuedPassword
          title={`Сотрудник ${issued.fullName} добавлен`}
          login={issued.login}
          password={issued.password}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => {
              setIssued(null);
              form.reset();
            }}
          >
            Добавить ещё
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/admin/members")}>
            К списку участников
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl">
      <FieldGroup>
        <Field data-invalid={Boolean(errors.fullName)}>
          <FieldLabel htmlFor="fullName">ФИО</FieldLabel>
          <Input
            id="fullName"
            aria-invalid={Boolean(errors.fullName)}
            {...form.register("fullName")}
          />
          <FieldError errors={[errors.fullName]} />
        </Field>
        <Field data-invalid={Boolean(errors.login)}>
          <FieldLabel htmlFor="login">Логин для входа</FieldLabel>
          <Input
            id="login"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="+992XXXXXXXXX или имя латиницей"
            aria-invalid={Boolean(errors.login)}
            {...form.register("login")}
          />
          <FieldError errors={[errors.login]} />
        </Field>
        <Field data-invalid={Boolean(errors.email)}>
          <FieldLabel htmlFor="email">Email (необязательно, для связи)</FieldLabel>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="off"
            aria-invalid={Boolean(errors.email)}
            {...form.register("email")}
          />
          <FieldError errors={[errors.email]} />
        </Field>

        <AccessFields
          control={form.control}
          errors={errors}
          setValue={form.setValue}
          projects={projects}
        />

        {serverError ? (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Создание…" : "Добавить сотрудника"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Отмена
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
