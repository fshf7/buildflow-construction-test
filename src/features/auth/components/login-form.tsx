"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { signIn } from "../actions";
import { loginSchema, type LoginInput } from "../schemas";

export function LoginForm({ next }: { next?: string }) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { login: "", password: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      // При успехе действие делает redirect и сюда не возвращается.
      const result = await signIn(values, next);
      if (!result.ok) setServerError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={Boolean(errors.login)}>
          <FieldLabel htmlFor="login">Логин</FieldLabel>
          <Input
            id="login"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="+992… или имя"
            aria-invalid={Boolean(errors.login)}
            {...form.register("login")}
          />
          <FieldError errors={[errors.login]} />
        </Field>

        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="password">Пароль</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            {...form.register("password")}
          />
          <FieldError errors={[errors.password]} />
        </Field>

        {serverError ? (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={isPending}>
          {isPending ? "Вход…" : "Войти"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Забыли пароль? Обратитесь к администратору.
        </p>
      </FieldGroup>
    </form>
  );
}
