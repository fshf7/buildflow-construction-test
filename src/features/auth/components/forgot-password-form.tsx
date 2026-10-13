"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { requestPasswordReset } from "../actions";
import { forgotPasswordSchema, type ForgotPasswordInput } from "../schemas";

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await requestPasswordReset(values);
      if (!result.ok) setServerError(result.error);
      else setSentTo(values.email);
    });
  });

  if (sentTo) {
    // Одинаковый ответ для любого адреса: не раскрываем, есть ли такая учётная запись.
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm">
          Если учётная запись <b>{sentTo}</b> существует, на неё отправлено письмо со ссылкой для
          смены пароля. Проверьте почту, в том числе папку «Спам».
        </p>
        <Link href="/login" className="text-sm underline underline-offset-4">
          Вернуться ко входу
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.email)}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            {...form.register("email")}
          />
          <FieldError errors={[errors.email]} />
        </Field>
        {serverError ? (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        ) : null}
        <Button type="submit" size="lg" className="w-full" disabled={isPending}>
          {isPending ? "Отправка…" : "Отправить ссылку"}
        </Button>
        <Link href="/login" className="text-center text-sm underline underline-offset-4">
          Вернуться ко входу
        </Link>
      </FieldGroup>
    </form>
  );
}
