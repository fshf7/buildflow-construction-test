"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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

import { resetMemberMfa } from "../actions";
import { resetMfaSchema, type ResetMfaInput } from "../schemas";

/** Статус второго фактора участника и сброс (Д-45). Себе — не показываем: только скриптом. */
export function MfaReset({
  memberId,
  memberName,
  hasMfa,
  isSelf,
}: {
  memberId: string;
  memberName: string;
  hasMfa: boolean | null;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const form = useForm<ResetMfaInput>({
    resolver: zodResolver(resetMfaSchema),
    defaultValues: { memberId, reason: "" },
  });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await resetMemberMfa(values);
      if (!result.ok) {
        setServerError(result.error);
        return;
      }
      toast.success(`Второй фактор сброшен. ${memberName} подключит его при следующем входе`);
      setOpen(false);
      form.reset({ memberId, reason: "" });
      router.refresh();
    });
  });

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm">
        Второй фактор:
        {hasMfa ? (
          <Badge variant="outline">Подключён</Badge>
        ) : (
          <Badge variant="secondary">Не подключён</Badge>
        )}
      </div>
      {isSelf ? (
        <p className="text-sm text-muted-foreground">
          Свой второй фактор сбрасывает другой администратор или серверный скрипт.
        </p>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" disabled={!hasMfa}>
              Сбросить второй фактор
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>Сбросить второй фактор?</DialogTitle>
                <DialogDescription>
                  {memberName} выйдет на всех устройствах и при следующем входе подключит
                  приложение-аутентификатор заново. Действие попадёт в журнал аудита.
                </DialogDescription>
              </DialogHeader>
              <Field data-invalid={Boolean(form.formState.errors.reason)}>
                <FieldLabel htmlFor="reason">Причина</FieldLabel>
                <Input
                  id="reason"
                  placeholder="Напр. потерян телефон"
                  {...form.register("reason")}
                />
                <FieldError errors={[form.formState.errors.reason]} />
              </Field>
              {serverError ? (
                <p role="alert" className="text-sm text-destructive">
                  {serverError}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="submit" variant="destructive" disabled={isPending}>
                  {isPending ? "Сброс…" : "Сбросить"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
