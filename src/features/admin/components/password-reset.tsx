"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { resetMemberPassword, type IssuedPassword as Issued } from "../actions";
import { resetPasswordSchema, type ResetPasswordInput } from "../schemas";

import { IssuedPassword } from "./issued-password";

/**
 * Сброс пароля участнику (Д-88): новый временный пароль показывается один раз, все сессии участника
 * завершаются, в аудит — причина. Себе — нельзя (только скрипт npm run password:reset).
 */
export function PasswordReset({
  memberId,
  memberName,
  isSelf,
}: {
  memberId: string;
  memberName: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { memberId, reason: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await resetMemberPassword(values);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      setIssued(result.data);
      setOpen(false);
      form.reset({ memberId, reason: "" });
      router.refresh();
    });
  });

  if (isSelf) {
    return (
      <p className="text-sm text-muted-foreground">
        Свой пароль сбрасывает другой администратор или серверный скрипт.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {issued ? (
        <IssuedPassword
          title={`Новый временный пароль: ${memberName}`}
          login={issued.login}
          password={issued.password}
        />
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="self-start">
            Сбросить пароль
          </Button>
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Сбросить пароль: {memberName}</DialogTitle>
              <DialogDescription>
                Сотрудник получит новый временный пароль от вас; все его сеансы завершатся. Событие
                запишется в журнал аудита.
              </DialogDescription>
            </DialogHeader>
            <Field data-invalid={Boolean(form.formState.errors.reason)}>
              <FieldLabel htmlFor="reset-reason">Причина</FieldLabel>
              <Input id="reset-reason" {...form.register("reason")} />
              <FieldError errors={[form.formState.errors.reason]} />
            </Field>
            {serverError ? (
              <p role="alert" className="text-sm text-destructive">
                {serverError}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Сброс…" : "Сбросить пароль"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
