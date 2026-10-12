"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

import { totpCodeSchema } from "../schemas";

type Enrollment = { factorId: string; qrCode: string; secret: string };

/**
 * Второй фактор (TOTP, Д-29). Режимы:
 * - verify: у пользователя уже есть подтверждённое приложение — вводит код;
 * - enroll: подключение приложения (QR-код или ключ вручную), затем код.
 * Работает через браузерный клиент Supabase: он сам обновляет cookie сессии до aal2.
 */
export function MfaForm({
  mode,
  factorId,
  next,
}: {
  mode: "enroll" | "verify";
  factorId?: string;
  next: string;
}) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const activeFactorId = mode === "verify" ? factorId : enrollment?.factorId;

  function startEnrollment() {
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      // Незавершённые попытки подключения мешают новой — удаляем их.
      const { data: factors } = await supabase.auth.mfa.listFactors();
      for (const f of factors?.all ?? []) {
        if (f.factor_type === "totp" && f.status === "unverified") {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `BuildFlow ${new Date().toISOString().slice(0, 10)}`,
      });
      if (enrollError || !data) {
        setError("Не удалось начать подключение. Обновите страницу и попробуйте снова.");
        return;
      }
      setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    });
  }

  function verify(event: React.FormEvent) {
    event.preventDefault();
    const parsed = totpCodeSchema.safeParse(code);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Неверный код");
      return;
    }
    if (!activeFactorId) return;
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: activeFactorId,
        code: parsed.data,
      });
      if (verifyError) {
        setError("Код не подошёл. Проверьте время на телефоне и введите новый код.");
        return;
      }
      // Полная перезагрузка: сервер должен увидеть новую сессию (aal2).
      window.location.assign(next);
    });
  }

  if (mode === "enroll" && !enrollment) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Установите на телефон приложение-аутентификатор (Google Authenticator, Microsoft
          Authenticator, «Яндекс Ключ» или аналог) и нажмите «Подключить».
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button size="lg" onClick={startEnrollment} disabled={isPending}>
          {isPending ? "Подготовка…" : "Подключить приложение"}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={verify} noValidate>
      <FieldGroup>
        {enrollment ? (
          <div className="flex flex-col items-center gap-3">
            {/* QR-код приходит от Supabase как SVG data URL */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enrollment.qrCode}
              alt="QR-код для приложения-аутентификатора"
              className="size-48"
            />
            <p className="text-center text-xs text-muted-foreground">
              Не сканируется? Введите ключ вручную:
              <br />
              <code
                data-testid="totp-secret"
                className="font-mono text-sm break-all text-foreground"
              >
                {enrollment.secret}
              </code>
            </p>
          </div>
        ) : null}
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="code">Код из приложения</FieldLabel>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-invalid={Boolean(error)}
          />
          <FieldDescription>6 цифр, обновляются каждые 30 секунд.</FieldDescription>
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={isPending}>
          {isPending ? "Проверка…" : "Подтвердить"}
        </Button>
      </FieldGroup>
    </form>
  );
}
